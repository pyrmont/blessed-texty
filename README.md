## blessed-texty

Texty provides text input widgets (`textarea`, `textbox`) that are navigable via the cursor keys.

The [blessed](https://github.com/chjj/blessed) library left navigable text input widgets as a feature for future development. Texty provides minimal drop-in replacements with no additional dependencies.

## Installation 

    npm install blessed blessed-texty

## Usage

`````javascript
   var blessed = require('blessed');
     , texty = require('blessed-texty');
     , screen = blessed.screen();
     , textyarea = texty.textarea(
         { style:
           { bg: "blue"
           , fg: "white" }
       );
   screen.append(textyarea); 

   screen.key(['escape', 'q', 'C-c'], function(ch, key) {
     return process.exit(0);
   });

   screen.render();
`````

## Widgets

- [Textarea](#textarea)
- [Textbox](#textbox)

## License

This library is licensed under the [MIT License](http://opensource.org/licenses/MIT).
