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

  // The caret represents the insertion point in this.value. The cursor
  // represents the cursor location in this._clines.
  this.caret = 0;
  this.cursor = { x: 0, y: 0 };

  // The last key pressed, necessary because of how the caret and cursor are
  // updated.
  this.key_pressed = { key: null, width: null };

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
  if (this.key_pressed.key === 'backspace') {
    this.caret -= this.key_pressed.width;
  } else if (this.key_pressed.key === 'character') {
    this.caret += this.key_pressed.width;
  }

  this.key_pressed.key = null;
  this.key_pressed.width = null;

  if (this.screen.focused !== this) {
    return;
  }

  var lpos = get ? this.lpos : this._getCoords();
  if (!lpos) return;

  var last = this._clines[this._clines.length - 1]
    , program = this.screen.program
    , line
    , cx
    , cy;

  // Stop a situation where the textarea begins scrolling
  // and the last cline appears to always be empty from the
  // _typeScroll `+ '\n'` thing.
  // Maybe not necessary anymore?
  if (last === '' && this.value[this.value.length - 1] !== '\n') {
    last = this._clines[this._clines.length - 2] || '';
  }

  line = Math.min(
    this._clines.length - 1 - (this.childBase || 0),
    (lpos.yl - lpos.yi) - this.iheight - 1);

  // When calling clearValue() on a full textarea with a border, the first
  // argument in the above Math.min call ends up being -2. Make sure we stay
  // positive.
  line = Math.max(0, line);

  cy = lpos.yi + this.itop + line;
  cx = lpos.xi + this.ileft + this.strWidth(last);

  // Get the coordinates of the position in this._clines equivalent to the 
  // position of the caret in this.value.
  var cc = this._getCoordsForPosition(this._clines, this.value, this.caret);
  var offset = this._normaliseCoords(cc);

  cy = lpos.yi + this.itop + offset.y;
  cx = lpos.xi + this.ileft + offset.x;

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

  // TODO: Handle directional keys.
  if (key.name === 'left' || key.name === 'right'
      || key.name === 'up' || key.name === 'down') {
    ;
  }

  if (this.options.keys && key.ctrl && key.name === 'e') {
    return this.readEditor();
  }

  // TODO: Optimize typing by writing directly
  // to the screen and screen buffer here.
  if (key.name === 'escape') {
    done(null, null);
  } else if (key.name === 'backspace') {
    if (this.value.length) {
      var width = 1;

      // There's a bug here that means it's not handling multiple double width
      // characters properly if there are single width characters after the
      // double-width characters that are deleted.
      if (this.screen.fullUnicode && unicode.isSurrogate(this.value, this.value.length - 2)) {
      // || unicode.isCombining(this.value, this.value.length - 1)) {
        width = 2;
      }
    
      this.value = this._deleteString(this.value, width, this.caret);
      this.key_pressed.key = 'backspace';
      this.key_pressed.width = width;
    }
  } else if (ch) {
    if (!/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)) {
      this.value = this._insertString(value, ch, this.caret);
      this.key_pressed.key = 'character';
      this.key_pressed.width = ch.length;
    }
  }

  if (this.value !== value) {
    this.screen.render();
  }
};

Textarea.prototype._typeScroll = function() {
  // XXX Workaround
  var height = this.height - this.iheight;
  if (this._clines.length - this.childBase > height) {
    this.scroll(this._clines.length);
  }
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
    this._typeScroll();
    this._updateCursor();
  }
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

Textarea.prototype._deleteString = function(text, len, pos) {
  var start;
  var end = Math.abs(pos);
  if (pos < 0) {
    start = (end  > text.length) ? 0 : text.length - end;
  } else if (len > end) {
    start = 0;
  } else {
    start = end - len;
  }
  
  return text.slice(0, start) + text.slice(end);
}

// Utility function to insert a string (str) into another string (text) at a
// particular position (pos).
Textarea.prototype._insertString = function(text, str, pos) {
  return text.slice(0, pos) + str + text.slice(pos);
}

// Utility function to get the number of characters from the beginning of a
// string (text) to a position (pos). Newline characters are omitted.
Textarea.prototype._getLengthToPosition = function(text, pos) {
  var textToPosition = text.slice(0, pos);
  return textToPosition.length - (textToPosition.split("\n").length - 1);
}

// Utility function to get the coordinates in a 2D array (lines) that are
// equivalent to the position (pos) in a string (text). 
Textarea.prototype._getCoordsForPosition = function(lines, text, pos) {
  var pos_len = this._getLengthToPosition(text, pos)
    , agg_len = 0
    , prev_agg_len = 0
    , coords = { x: null, y: null };

  for (var i = 0; i < lines.length; i++) {
    prev_agg_len = agg_len;
    agg_len += lines[i].length;
    if (agg_len === pos_len) {
      if (i+1 === lines.length) {
        coords.y = i;
        coords.x = this.strWidth(lines[i].slice(0, pos_len - prev_agg_len));
      } else {
        coords.y = i + 1;
        coords.x = 0;
      }
    } else if (agg_len > pos_len) {
      coords.y = i;
      coords.x = this.strWidth(lines[i].slice(0, pos_len - prev_agg_len));
      break;
    }
  }
  
  return coords;
}

Textarea.prototype._normaliseCoords = function(coords) {
  coords.y = coords.y - (this.childBase || 0);
  return coords;
}

/**
 * Expose
 */

module.exports = Textarea;
