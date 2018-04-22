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

  // The offset object.
  this.offset = { x_val : 0,
                  get x() { return this.x_val; },
                  set x(val) { this.x_val = val; },
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
  var visible, val;
  if (value == null) {
    value = this.value;
  }
  if (this._value !== value) {
    value = value.replace(/\n/g, '');
    this.value = value;
    this._value = value;
    if (this.secret) {
      this.setContent('');
    } else if (this.censor) {
      this.setContent(Array(this.value.length + 1).join('*'));
    } else {
      visible = -(this.width - this.iwidth - 1);
      val = this.value.replace(/\t/g, this.screen.tabc);
      this.setContent(val.slice(this.offset.x, this.offset.x + this.width));
    }
  }
  this._processKeyPress();
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
    if (this.offset.x > 0) this.offset.x -= this.pressed.len;
    break;
  case 'character':
    this.caret.moveRight();
    if (this.value.length >= this.width) this.offset.x += this.pressed.len;
    break;
  }

  // Reset the pressed object.
  this.pressed.key = null;
  this.pressed.len = null;
};

Textbox.prototype.lines = function() {
  return [this.value];
};

/**
 * Expose
 */

module.exports = Textbox;