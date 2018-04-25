var blessed = require('blessed')
  , texty = require('../')
  , screen;

screen = blessed.screen({
  dump: __dirname + '/../log/textbox.log',
  fullUnicode: true,
  warnings: true
});

var box = texty.textbox({
  parent: screen,
  // Possibly support:
  // align: 'center',
  style: {
    bg: 'blue',
    fg: 'white'
  },
  height: 1,
  width: 5,
  top: 'center',
  left: 'center',
  tags: true
});

screen.render();

screen.key('q', function() {
  screen.destroy();
});

screen.key('i', function() {
  box.readInput(function() {});
});

screen.key('e', function() {
  box.readEditor(function() {});
});
