/**
 * textarea.js - textarea element for blessed
 * Copyright (c) 2013-2015, Christopher Jeffrey and contributors (MIT License).
 * https://github.com/chjj/blessed
 */

/**
 * Modules
 */

var blessed = require('blessed');
var unicode = blessed.unicode;

var nextTick = global.setImmediate || process.nextTick.bind(process);

var Node = blessed.Node;
var Input = blessed.Input;
var Caret = require('../caret');

/**
 * Textarea
 */

function Textarea(options) {
  var self = this;

  if (!(this instanceof Node)) {
    return new Textarea(options);
  }

  options = options || {};

  options.scrollable = options.scrollable !== false;

  // The caret represents the location of the cursor within the text.
  this.caret = new Caret(this);

  // The last key pressed, necessary because of how the caret is updated.
  this.pressed = { key: null, len: null };

  // The offset object.
  this.offset = { get x() { return 0; },
                  get y() { return self.childOffset; } };

  Input.call(this, options);

  this.screen._listenKeys(this);

  this.value = options.value || '';

  this.__updateCursor = this._updateCursor.bind(this);
  this.on('resize', this.__updateCursor);
  this.on('move', this.__updateCursor);

  if (options.inputOnFocus) {
    this.on('focus', this.readInput.bind(this, null));
  }

  if (!options.inputOnFocus && options.keys) {
    this.on('keypress', function(ch, key) {
      if (self._reading) return;
      if (key.name === 'enter' || (options.vi && key.name === 'i')) {
        return self.readInput();
      }
      if (key.name === 'e') {
        return self.readEditor();
      }
    });
  }

  if (options.mouse) {
    this.on('click', function(data) {
      if (self._reading) return;
      if (data.button !== 'right') return;
      self.readEditor();
    });
  }
}

Textarea.prototype.__proto__ = Input.prototype;

Textarea.prototype.type = 'textarea';

Textarea.prototype._updateCursor = function(get) {
  if (this.screen.focused !== this) {
    return;
  }

  var lpos = get ? this.lpos : this._getCoords();
  if (!lpos) return;

  // Set the cursor x- and y-positions.
  var cy = lpos.yi + this.itop + this.caret.relative.y;
  var cx = lpos.xi + this.ileft + this.caret.relative.x;

  // Create a convenience variable.
  var program = this.screen.program;

  // XXX Not sure, but this may still sometimes
  // cause problems when leaving editor.
  if (cy === program.y && cx === program.x) {
    return;
  }

  if (cy === program.y) {
    if (cx > program.x) {
      program.cuf(cx - program.x);
    } else if (cx < program.x) {
      program.cub(program.x - cx);
    }
  } else if (cx === program.x) {
    if (cy > program.y) {
      program.cud(cy - program.y);
    } else if (cy < program.y) {
      program.cuu(program.y - cy);
    }
  } else {
    program.cup(cy, cx);
  }
};

Textarea.prototype.input =
Textarea.prototype.setInput =
Textarea.prototype.readInput = function(callback) {
  var self = this
    , focused = this.screen.focused === this;

  if (this._reading) return;
  this._reading = true;

  this._callback = callback;

  if (!focused) {
    this.screen.saveFocus();
    this.focus();
  }

  this.screen.grabKeys = true;

  this._updateCursor();
  this.screen.program.showCursor();
  //this.screen.program.sgr('normal');

  this._done = function fn(err, value) {
    if (!self._reading) return;

    if (fn.done) return;
    fn.done = true;

    self._reading = false;

    delete self._callback;
    delete self._done;

    self.removeListener('keypress', self.__listener);
    delete self.__listener;

    self.removeListener('blur', self.__done);
    delete self.__done;

    self.screen.program.hideCursor();
    self.screen.grabKeys = false;

    if (!focused) {
      self.screen.restoreFocus();
    }

    if (self.options.inputOnFocus) {
      self.screen.rewindFocus();
    }

    // Ugly
    if (err === 'stop') return;

    if (err) {
      self.emit('error', err);
    } else if (value != null) {
      self.emit('submit', value);
    } else {
      self.emit('cancel', value);
    }
    self.emit('action', value);

    if (!callback) return;

    return err
      ? callback(err)
      : callback(null, value);
  };

  // Put this in a nextTick so the current
  // key event doesn't trigger any keys input.
  nextTick(function() {
    self.__listener = self._listener.bind(self);
    self.on('keypress', self.__listener);
  });

  this.__done = this._done.bind(this, null, null);
  this.on('blur', this.__done);
};

Textarea.prototype._listener = function(ch, key) {
  var done = this._done
    , value = this.value;

  if (key.name === 'return') return;
  if (key.name === 'enter') {
    ch = '\n';
  }

  if (this.options.keys && key.ctrl && key.name === 'e') {
    return this.readEditor();
  }

  switch(key.name) {
  case 'escape':
    done(null, null);
    break;
  case 'up':
    if (!value.length) break;
    this.pressed.key = 'up';
    break;
  case 'down':
    if (!value.length) break;
    this.pressed.key = 'down';
    break;
  case 'left':
    if (!value.length) break;
    this.pressed.key = 'left';
    break;
  case 'right':
    if (!value.length) break;
    this.pressed.key = 'right';
    break;
  case 'backspace':
    if (!value.length) break;
    var len = this.caret.prevGlyphLength(value, this.caret.linear);
    this.value = editStringDelete(value, len, this.caret.linear);
    this.pressed.key = 'backspace';
    this.pressed.len = len;
    break;
  default:
    if (ch && !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)) {
      this.value = editStringInsert(value, ch, this.caret.linear);
      this.pressed.key = 'character';
      this.pressed.len = ch.length;
    }
  }

  if (this.pressed.key !== null || this.value !== value) {
    this.screen.render();
  }
};

Textarea.prototype._typeScroll = function() {
  this.scrollTo(this.caret.absolute.y);
};

Textarea.prototype.getValue = function() {
  return this.value;
};

Textarea.prototype.setValue = function(value) {
  if (value == null) {
    value = this.value;
  }
  if (this._value !== value) {
    this.value = value;
    this._value = value;
    this.setContent(this.value);
  }

  // Because the cursor can move without changing the value, these functions
  // should be called regardless of whether the value has changed. It might
  // make sense to move these functions entirely out from this function and
  // called from render() directly.
  this._processKeyPress();
  this._typeScroll();
  this._updateCursor();
};

Textarea.prototype.clearInput =
Textarea.prototype.clearValue = function() {
  return this.setValue('');
};

Textarea.prototype.submit = function() {
  if (!this.__listener) return;
  return this.__listener('\x1b', { name: 'escape' });
};

Textarea.prototype.cancel = function() {
  if (!this.__listener) return;
  return this.__listener('\x1b', { name: 'escape' });
};

Textarea.prototype.render = function() {
  this.setValue();
  return this._render();
};

Textarea.prototype.editor =
Textarea.prototype.setEditor =
Textarea.prototype.readEditor = function(callback) {
  var self = this;

  if (this._reading) {
    var _cb = this._callback
      , cb = callback;

    this._done('stop');

    callback = function(err, value) {
      if (_cb) _cb(err, value);
      if (cb) cb(err, value);
    };
  }

  if (!callback) {
    callback = function() {};
  }

  return this.screen.readEditor({ value: this.value }, function(err, value) {
    if (err) {
      if (err.message === 'Unsuccessful.') {
        self.screen.render();
        return self.readInput(callback);
      }
      self.screen.render();
      self.readInput(callback);
      return callback(err);
    }
    self.setValue(value);
    self.screen.render();
    return self.readInput(callback);
  });
};

// Utility function to process a particular key press.
Textarea.prototype._processKeyPress = function() {
  if (this.pressed.key === null) return;

  switch (this.pressed.key) {
  case 'up':
    this.caret.moveUp();
    break;
  case 'down':
    this.caret.moveDown();
    break;
  case 'left':
    this.caret.moveLeft();
    break;
  case 'right':
    this.caret.moveRight();
    break;
  case 'backspace':
    this.caret.moveLeft(this.pressed.len);
    break;
  case 'character':
    this.caret.moveRight();
    break;
  }

  // Reset the pressed object.
  this.pressed.key = null;
  this.pressed.len = null;
};

Textarea.prototype.lines = function() {
  return this._clines;
};

/**
 * Helpers
 */

// Utility function to delete a portion (len) from a string (str) at a
// particular position (pos).
var editStringDelete = function(str, len, pos) {
  if (len == 0) return String(str);

  var start;
  var end = Math.abs(pos);
  if (pos < 0) {
    start = (end  > str.length) ? 0 : str.length - end;
  } else if (len > end) {
    start = 0;
  } else {
    start = end - len;
  }

  return str.slice(0, start) + str.slice(end);
};

// Utility function to insert a string (str1) into another string (str2) at a
// particular position (pos).
var editStringInsert = function(str1, str2, pos) {
  return str1.slice(0, pos) + str2 + str1.slice(pos);
};

/**
 * Expose
 */

module.exports = Textarea;
