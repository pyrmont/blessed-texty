/**
 * caret.js - caret element for text inout widgets in blessed
 * Public Domain
 * https://github.com/pyrmont/blessed-texty
 */

/**
 * Modules
 */

var blessed = require('blessed');
var unicode = blessed.unicode;

/**
 * Caret
 */

function Caret(owner) {
  this.owner = owner;
  this.linear = 0;
  this.absolute = coords(0, 0);
  this.relative = coords(0, 0);
};

Caret.prototype.moveDown = function() {
  var lines = this.owner.lines();
  if (this.absolute.y + 1 == lines.length) return; 
  
  var original = this.absolute;
  var width = this.owner.strWidth(lines[original.y].slice(0, original.x));
  
  var y = original.y + 1;
  var x = this._segmentLength(lines[y], width);
  
  this.absolute = coords(x, y);
  this._updateRelative();
  this._updateLinear();
};

Caret.prototype.moveLeft = function(len) {
  if (this.linear == 0) return;
  
  if (typeof len !== 'undefined') {
    this.linear -= len;
  } else {
    this.linear -= this.prevGlyphLength(this.owner.value, this.linear);
  }
  
  this._updateAbsolute();
  this._updateRelative();
};

Caret.prototype.moveRight = function() {
  if (this.linear + 1 > this.owner.value.length) return;

  this.linear += this.nextGlyphLength(this.owner.value, this.linear);

  this._updateAbsolute();
  this._updateRelative();
};

Caret.prototype.moveUp = function() {
  if (this.absolute.y == 0) return;
  
  var original = this.absolute;
  var lines = this.owner.lines();
  var width = this.owner.strWidth(lines[original.y].slice(0, original.x));
  
  var y = original.y - 1;
  var x = this._segmentLength(lines[y], width);

  this.absolute = coords(x, y);
  this._updateRelative();
  this._updateLinear();
};

Caret.prototype.nextGlyphLength = function(str, pos) {
  if (pos > str.length) throw 'Out of bounds';

  if (pos == str.length) return 0;
  if (pos == str.length - 1) return 1;
  
  return this._glyphLength(str.slice(pos, pos + 2));
};

Caret.prototype.prevGlyphLength = function(str, pos) {
  if (pos > str.length) throw 'Out of bounds';

  if (pos == 0) return 0;
  if (pos == 1) return 1;
  
  return this._glyphLength(str.slice(pos - 2, pos));
};

Caret.prototype._glyphLength = function(glyphs) {
  if (!this.owner.screen.fullUnicode) {
    return 1;
  } else if (unicode.isSurrogate(glyphs, 0)) {
    return 2;
  } else {
    return 1;
  }
};

Caret.prototype._segmentLength = function(line, width) {
  if (this.owner.strWidth(line) <= width) return line.length;

  var pos = 0;
  for (var i = 0; i < width; i++) {
    pos += this.nextGlyphLength(line, pos);
  }
  return pos;
};

Caret.prototype._updateAbsolute = function() {
  if (this.linear == 0) return this.absolute = coords(0, 0);

  var i, j, chars = 0, lines = this.owner.lines();
  for (i = 0; i < lines.length; i++) {
    for (j = 0; j < lines[i].length; j++) {
      if (chars == this.linear) return this.absolute = coords(j, i);
      if (lines[i].charAt(j) !== "\x03") chars++;
    }
    if (this.owner.value.charAt(chars) === "\n") chars++;
    if (chars == this.linear) return this.absolute = (i + 1 < lines.length) ? coords(0, i + 1) : coords(j, i);
    if (chars > this.linear) return this.absolute = coords(j, i);
  }
  
  throw 'Error in _updateAbsolute(): pos: ' + this.linear + ', coords: (' + j + ',' + i + '), lines: '  + lines;
};

Caret.prototype._updateLinear = function() {
  var agg_len = 0, lines = this.owner.lines();
  for (var i = 0; i < this.absolute.y; i++) {
    agg_len += lines[i].length;
    if (this.owner.value.charAt(agg_len) === "\n") agg_len += 1;
  }

  var pos = agg_len + this.absolute.x;
  this.linear = (this.owner.value.charAt(pos) === "\n") ? pos + 1 : pos;
};

Caret.prototype._updateRelative = function() {
  var lines = this.owner.lines();
  var x = this.owner.strWidth(lines[this.absolute.y].slice(0, this.absolute.x));
  var y = this.absolute.y - (this.owner.childBase || 0);
  this.relative = coords(x, y);
};

// Utility function to return an object literal representing two coordinates (
// x_coord and y_coord).
var coords = function(x_coord, y_coord) {
  return { x: x_coord, y: y_coord };
};

/**
 * Expose
 */

module.exports = Caret;
