/**
 * textbox.js - textbox element for blessed
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
var Textarea = require('./textarea');

/**
 * Textbox
 */

function Textbox(options) {
  if (!(this instanceof Node)) {
    return new Textbox(options);
  }

  options = options || {};

  options.scrollable = false;

  Textarea.call(this, options);

  // The usuable width.
  this.viewable = { width: this.width - this.iwidth - 1 };

  // The offset object.
  this.offset = { _x: 0,
                  get x() { return this._x; },
                  set x(val) { this._x = val; },
                  get y() { return 0; } };

  this.secret = options.secret;
  this.censor = options.censor;
}

Textbox.prototype.__proto__ = Textarea.prototype;

Textbox.prototype.type = 'textbox';

Textbox.prototype.__olistener = Textbox.prototype._listener;
Textbox.prototype._listener = function(ch, key) {
  if (key.name === 'enter') {
    this._done(null, this.value);
    return;
  }
  return this.__olistener(ch, key);
};

Textbox.prototype.setValue = function(value) {
  if (value == null) value = this.value;

  // Because textbox widgets use a hack to 'scroll' the content, the key press
  // must be processed before the content is set in case this.offset.x changes.
  var key_pressed = this.pressed.key;
  this._processKeyPress();
  
  if (this._value !== value || key_pressed) {
    value = value.replace(/\n/g, '');
    this.value = value;
    this._value = value;
    if (this.secret) {
      this.setContent('');
    } else if (this.censor) {
      this.setContent(Array(this.value.length + 1).join('*'));
    } else {
      var val = this.value.replace(/\t/g, this.screen.tabc);
      this.setContent(this._visibleContent(val));
    }
  }

  this._updateCursor();
};

Textbox.prototype.submit = function() {
  if (!this.__listener) return;
  return this.__listener('\r', { name: 'enter' });
};

// Utility function to process a particular key press.
Textbox.prototype._processKeyPress = function() {
  if (this.pressed.key === null) return;

  switch (this.pressed.key) {
  case 'up':
    return;
  case 'down':
    return;
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

  // Update the horizontal offset.
  this._updateOffset();

  // Reset the pressed object.
  this.pressed.key = null;
  this.pressed.len = null;
};

Textbox.prototype._updateOffset = function() {
  if (this.caret.absolute == 0) return this.offset.x = 0;

  var shift_left = this.caret.absolute.x <= this.offset.x;
  var shift_right = this.caret.relative.x > this.viewable.width;
  if (!shift_left && !shift_right) return;

  if (shift_left) {
    // this.offset.x -= this.caret.prevGlyphLength(this.offset.x);
    var shift_amount = this.offset.x - 1; 
    this.offset.x = (shift_amount < 0) ? 0 : shift_amount;
  } else if (shift_right) {
    this.offset.x += 1;
  }
};

Textbox.prototype._visibleContent = function(val) { 
  return val.slice(this.offset.x, this.offset.x + this.viewable.width);
}

// Utility function to return the value of the content as a single-element
// array. This is necessary because of how setContent() is hacked in the
// original code to 'scroll' the content (thereby making the _clines array
// nonsensical).
Textbox.prototype.lines = function() {
  return [this.value];
};

/**
 * Expose
 */

module.exports = Textbox;
