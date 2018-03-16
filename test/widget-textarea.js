var blessed = require('blessed')
  , texty = require('../')
  , screen = blessed.screen({
               dump: __dirname + '/../logs/textarea.log'
             , fullUnicode: true
             , warnings: true
             })
  , textarea = texty.textarea({  
                 parent: screen
               , style: { 
                   bg: "blue"
                 , fg: "white" }
               , height: 'half'
               , width: 'half'
               , top: 'center'
               , left: 'center'
               , tags: true
               });
    
screen.render()

screen.key('q', function() {
    screen.destroy();
});

screen.key('i', function() {
    textarea.readInput(function() {});
});

screen.key('e', function() {
    textarea.readEditor(function() {});
});

