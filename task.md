Go thru the current repo. 
I want to design a plugin system for block rendering and some functionality. Identitify places where plugin system can hook into. some examples of plugins.

- a pdf renderer that reads thru all text blocks to see if there are any md links that reference that block. if it references the block, check if parameters are encoded in link as ?type=annotation&from=12&to=34&page=3 or something of that sorts. if annotation of something is encoded that link when clicked should open to that page and show the annotation.
- previewable link. if a link is an are.na block (it currently becomes a button, this should also be a plugin) if the text says clip: or some keyword, it shoudl have a preview of that block.
- table editor. if the block is titled something specific, or if the content is just a table and nothing else, it should become a table editor...
- a cut paste plugin. when blocks are selected and cmd+x is pressed, it will put them in a "clipboard" the clipboard is previewable on bottom left as miniature square versions of the copied blocks and whenever it is pasted, it just transforms the blocks to new position.

I want you to create an md file with
- places where plugin system should hook into. (block rendering, keypress, etc)
- what parameters does the callback function get. I'm thinking there is a block parameter and a controller. controller gives access to taking actions.
