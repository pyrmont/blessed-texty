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
  this.cursor = coords(0, 0);

  // The last key pressed, necessary because of how the caret and cursor are
  // updated.
  this.key_pressed = { key: null, length: null };

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
  // Update the position of the caret and cursor based on the key pressed.
  this._processKeyPress();

  if (this.screen.focused !== this) {
    return;
  }

  var lpos = get ? this.lpos : this._getCoords();
  if (!lpos) return;

  // Convert the coordinates to the appropriate offset.
  var offset = convertCoordsToOffset(this, this._clines, this.cursor);

  // Set the cursor x- and y-positions.
  var cy = lpos.yi + this.itop + offset.y;
  var cx = lpos.xi + this.ileft + offset.x;

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
    , fullUnicode = this.screen.fullUnicode
    , pressed = this.key_pressed
    , value = this.value
    , caret = this.caret;

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
    pressed.key = 'up';
    break;
  case 'down':
    if (!value.length) break;
    pressed.key = 'down';
    break;
  case 'left':
    if (!value.length) break;
    pressed.key = 'left';
    pressed.length = calculatePrevGlyphLength(fullUnicode, value, caret);
    break;
  case 'right':
    if (!value.length) break;
    pressed.key = 'right';
    pressed.length = calculateNextGlyphLength(fullUnicode, value, caret);
    break;
  case 'backspace':
    if (!value.length) break;
    // There's a bug here that means it's not handling multiple double width
    // characters properly if there are single width characters after the
    // double-width characters that are deleted.
    var len = calculatePrevGlyphLength(fullUnicode, value, caret);
    this.value = this._deleteString(value, len, caret);
    pressed.key = 'backspace';
    pressed.length = len;
    break;
  default:
    if (ch && !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(ch)) {
      this.value = this._insertString(value, ch, caret);
      pressed.key = 'character';
      pressed.length = ch.length;
    }
  }

  if (pressed.key !== null || this.value !== value) {
    this.screen.render();
  }
};

Textarea.prototype._typeScroll = function() {
  // I don't really understand why this works but it fixed the scrolling back
  // up problem.
  this.scroll(this.cursor.y - (this.childBase || 0) - 1);
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
  // called from render() directly. In addition, the widget should be scrolled
  // after the cursor has been updated and so the order of these functions
  // has been swapped from how they are in the original code.
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

// Utility function to delete a portion (len) from a string (text) at a
// particular position (pos).
Textarea.prototype._deleteString = function(text, len, pos) {
  if (len == 0) return text;

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
};

// Utility function to insert a string (str) into another string (text) at a
// particular position (pos).
Textarea.prototype._insertString = function(text, str, pos) {
  return text.slice(0, pos) + str + text.slice(pos);
};

// Utility function to get the number of characters from the beginning of a
// string (text) to a position (pos). Newline characters are omitted.
Textarea.prototype._getLengthToPosition = function(text, pos) {
  var textToPosition = text.slice(0, pos);
  return textToPosition.length - (textToPosition.split("\n").length - 1);
};

Textarea.prototype._getCoordForWidth = function(line, width) {
  if (this.strWidth(line) <= width) return line.length;

  var x = 0;
  for (var i = 0; i < width; i++) {
    x += calculateNextGlyphLength(this.screen.fullUnicode, line, x);
  }
  return x;
}

// Utility function to process a particular key press.
Textarea.prototype._processKeyPress = function() {
  if (this.key_pressed.key === null) return;

  switch (this.key_pressed.key) {
  case 'up':
    this.cursor = moveCoordsUp(this, this._clines, this.cursor);
    this.caret = convertCoordsToPosition(this._clines, this.value, this.cursor);
    break;
  case 'down':
    this.cursor = moveCoordsDown(this, this._clines, this.cursor);
    this.caret = convertCoordsToPosition(this._clines, this.value, this.cursor);
    break;
  case 'left':
    this.caret -= this.key_pressed.length;
    this.cursor = convertPositionToCoords(this._clines, this.value, this.caret);
    break;
  case 'right':
    this.caret += this.key_pressed.length;
    this.cursor = convertPositionToCoords(this._clines, this.value, this.caret);
    break;
  case 'backspace':
    this.caret -= this.key_pressed.length;
    this.cursor = convertPositionToCoords(this._clines, this.value, this.caret);
    break;
  case 'character':
    this.caret += this.key_pressed.length;
    this.cursor = convertPositionToCoords(this._clines, this.value, this.caret);
    break;
  }

  // Reset the key_pressed object in case we need to test if it's been updated.
  this.key_pressed.key = null;
  this.key_pressed.length = null;
};

// Utility function to return an object literal representing two coordinates (
// x_coord and y_coord).
var coords = function(x_coord, y_coord) {
  return { x: x_coord, y: y_coord };
};

// Utility function to calculate the width of a potential two-character glyph
// (two_chars).
var calculateGlyphLength = function(is_unicode, two_chars) {
  if (!is_unicode) {
    return 1;
  } else if (unicode.isSurrogate(two_chars, 0)) {
    return 2;
  } else {
    return 1;
  }
};

// Utility function to calculate the width of the next glyph.
var calculateNextGlyphLength = function(is_unicode, text, pos) {
  if (pos > text.length) throw 'Out of bounds';

  if (pos == text.length) return 0;
  if (pos == text.length - 1) return 1;
  
  return calculateGlyphLength(is_unicode, text.slice(pos, pos + 2));
};

// Utility function to calculate the width of the previous glyph.
var calculatePrevGlyphLength = function(is_unicode, text, pos) {
  if (pos > text.length) throw 'Out of bounds';

  if (pos == 0) return 0;
  if (pos == 1) return 1;
  
  return calculateGlyphLength(is_unicode, text.slice(pos - 2, pos));
};

// Utility function for converting coordinates (coords) into offsets.
var convertCoordsToOffset = function(widget, lines, original) {
  var x = widget.strWidth(lines[original.y].slice(0, original.x));
  var y = original.y - (widget.childBase || 0);
  return coords(x, y);
};

// Utility function to determine the position of a cursor within a string
// (text) if the cursor is located at a particular set of coordinates (coords)
// within a 2D array containing the data from the string (lines).
var convertCoordsToPosition = function(lines, text, coords) {
  var agg_len = 0;
  for (var i = 0; i < coords.y; i++) {
    agg_len += lines[i].length;
    if (text.charAt(agg_len) === "\n") agg_len += 1;
  }

  var pos = agg_len + coords.x;
  return (text.charAt(pos) === "\n") ? pos + 1 : pos;
};

// Utility function to find the coordinates for a given position (pos) in an
// array of lines (lines). Blessed adds a Unicode control character to double-
// width characters. The easiest way to convert a position to its coordinates
// is to iterate over the array, adding the control characters when they
// appear. It's also necessary to skip over the newlines in the original string
// (str) as these are not included in the array.
var convertPositionToCoords = function(lines, text, pos) {
  if (pos == 0) return coords(0, 0);

  var i, j, chars = 0;
  for (i = 0; i < lines.length; i++) {
    for (j = 0; j < lines[i].length; j++) {
      if (chars == pos) return coords(j, i);
      if (lines[i].charAt(j) !== "\x03") chars++;
    }
    if (text.charAt(chars) === "\n") chars++;
    if (chars == pos) return (i + 1 < lines.length) ? coords(0, i + 1) : coords(j, i);
    if (chars > pos) return coords(j, i);
  }
  
  throw 'You should not be here';
};

// Utility function to get the coordinates in a 2D array (lines) after the
// 'down' key is pressed with the initial coordinates (coords).
var moveCoordsDown = function(widget, lines, original) {
  if (original.y + 1 == lines.length) return coords(original.x, original.y);
  
  var y = original.y + 1;
  var width = widget.strWidth(lines[original.y].slice(0, original.x));
  var x = widget._getCoordForWidth(lines[y], width);
  return coords(x, y);
};

// Utility function to get the coordinates in a 2D array (lines) after the 'up'
// key is pressed with the initial coordinates (coords).
var moveCoordsUp = function(widget, lines, original) {
  if (original.y == 0) return coords(original.x, original.y);
  
  var y = original.y - 1;
  var width = widget.strWidth(lines[original.y].slice(0, original.x));
  var x = widget._getCoordForWidth(lines[y], width);
  return coords(x, y);
};

/**
 * Expose
 */

module.exports = Textarea;
