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

  Input.call(this, options);

  this.screen._listenKeys(this);

  this.value = options.value || '';

  this.CURSOR = '\uFEFF';
  this.cpos = 0;
  this.ccoords = { x: 0, y: 0 };

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

  var program = this.screen.program
    , x_offset
    , y_offset
    , cx
    , cy;
  
//  this.ccoords = this._findCoords(this._clines, this.cpos);
//  ix = this.ccoords.x;
//  iy = this.ccoords.y;
//
//  if (ix === this._clines[iy].length && iy < (this._clines.length - 1)) {
//    ix = 0;
//    iy = iy + 1;
//  }

  this.ccoords = this._findCursor(this._clines);
  x_offset = this.strWidth(this._clines[this.ccoords.y].slice(0, this.ccoords.x));
  y_offset = this.ccoords.y - (this.childBase || 0);

  cy = lpos.yi + this.itop + y_offset;
  cx = lpos.xi + this.ileft + x_offset;
  
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
    , value = this.value
    , cpos = this.cpos;

  if (key.name === 'return') return;
  if (key.name === 'enter') {
    ch = '\n';
  }

  // TODO: Handle directional keys.
  if (key.name === 'left' || key.name === 'right') {
    var char_width = (this._isDoubleWidth(this.value, this.cpos - 2)) ? 2 : 1;  
    if (key.name === 'left' && this.cpos > 0) {
      this.cpos = this.cpos - char_width;
    } else if (key.name === 'right' && this.cpos < this.value.length) {
      this.cpos = this.cpos + char_width;
    }
  }

  if (key.name === 'up' || key.name === 'down') {
    var max_y = this._clines.length - 1;
    if (key.name === 'up' && this.ccoords.y === 0) {
      this.cpos = 0;
    } else if (key.name === 'up' && this.ccoords.y !== 0) {
      var cl_pos = this.ccoords.x;
      var cl_num = this.ccoords.y;
      var cl_txt = this._clines[cl_num].slice(0, cl_pos);
      var pl_txt = this._clines[cl_num - 1].slice(cl_pos);
      var distance = cl_txt.length + pl_txt.length;
      this.cpos = this.cpos - distance;
    } else if (key.name === 'down' && this.ccoords.y === max_y) {
      this.cpos = this.value.length;
    } else if (key.name === 'down' && this.ccoords.y !== max_y) {
      var cl_pos = this.ccoords.x;
      var cl_num = this.ccoords.y;
      var cl_txt = this._clines[cl_num].slice(cl_pos);
      var nl_txt = this._clines[cl_num + 1].slice(0, cl_pos);
      var distance = cl_txt.length + nl_txt.length;
      this.cpos = this.cpos + distance;
    } 
  }

  if (this.options.keys && key.ctrl && key.name === 'e') {
    return this.readEditor();
  }

  // TODO: Optimize typing by writing directly
  // to the screen and screen buffer here.
  if (key.name === 'escape') {
    done(null, null);
  } else if (key.name === 'backspace') {
    if (this.cpos > 0) {
      var char_width = (this._isDoubleWidth(this.value, this.cpos - 2)) ? 2 : 1;
      this.value = this.value.slice(0, this.cpos - char_width) + this.value.slice(this.cpos);
      this.cpos = this.cpos - char_width;
    }
  } else if (ch) {
    if (!/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)) {
      // TODO Not sure if this is testing the width correctly.
      var char_width = (this._isDoubleWidth(ch, 0)) ? 2 : 1;
      this.value = this.value.slice(0, this.cpos) + ch + this.value.slice(this.cpos)
      this.cpos = this.cpos + char_width;
    }
  }

  if (this.value !== value || this.cpos !== cpos) {
    this.screen.render();
  }
};

Textarea.prototype._typeScroll = function() {
  if (this.ccoords.y - this.childBase < 0) {
    this.scrollTo(this.ccoords.y);
  } else if (this.ccoords.y - this.childBase > this.iheight) {
    this.scrollTo(this.ccoords.y);
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
  }
  this._updateCursor();
  this._typeScroll();
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

Textarea.prototype._isDoubleWidth = function(str, pos) {
  if (this.screen.fullUnicode && unicode.isSurrogate(str, pos)) {
    return true;
  } else {
    return false;
  }
};

Textarea.prototype._findCursor = function(lines) {
  var res = { x: 0, y: 0 };

  // There's no content so cursor must be at the beginning.
  if (lines.length === 0) {
    return res;
  }

  // The cursor will usually be at the end of the content so check that.
  var last_line = lines[lines.length - 1];
  var last_char = last_line.slice(-(this.CURSOR.length));
  if (last_char === this.CURSOR) {
    res.x = last_line.length - 1;
    return res;
  }

  // Check where in the content the cursor is located.
  var line_num = lines.findIndex(function(el) { return el.includes(this.CURSOR); });
  if (line_num !== -1) {
    res.x = lines[line_num].indexOf(this.CURSOR);
    res.y = line_num;
  }

  return res;
}

Textarea.prototype._findCoords = function(matrix, cpos) {
  var total = 0
    , prev_total = 0
    , res = { x: 0, y: 0 }
  
  for (var i = 0; i < matrix.length; i++ ) {
    total = prev_total + matrix[i].length;
    if (cpos <= total) {
      res.x = cpos - prev_total;
      break;
    }
    res.y = res.y + 1;
    prev_total = total;
  }
  return res;
};
  

/**
 * Expose
 */

module.exports = Textarea;
