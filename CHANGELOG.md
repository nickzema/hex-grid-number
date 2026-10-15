# Changelog

## 0.3.0 - Players, pickers and centering
Players: SHOW (everyone, shared, locked on), HIDE (hidden until a player turns it on for themselves, needs the extension) and OFF (players get nothing). The GM gets an eye button for a personal show/hide in HIDE and OFF. Players with the extension get a one-button panel. Colors: fill and border pickers in the style of Owlbear's, with border sizes and a custom hex picker. Rotate and resize handles now look like Owlbear's. The label snaps lightly to the center line and five heights. Negative starts like -7.-3 count up through zero. The popover is square, has a ? help, and the preview shows pointy-top or flat-top from the Owlbear grid. Labels are now centered using Owlbear's own measurement of where text items sit, which fixes labels landing northwest of center; the saved label offset resets once. Removed the white box around the preview.

## 0.2.0 - Template hex and toolbar
The popover now shows a preview hex. Type the first hex's key into it (A.01, AA 01, 01.01) and every hex follows that style; separators are , . ; : ' - _ ` / \ | or a space. Drag the label to place it, click it to type, resize or rotate. Toolbar has text color, the seven Owlbear fonts, size, bold and italic. ALL / GM / OFF sets who sees labels. Labels redraw on any change. Set asks before moving the first hex; Reset asks before clearing. Start col, Start row and Size % are gone (the template and resize handle replace them). Adds .gitignore for .DS_Store.

## 0.1.4 - Label styling
Columns run A-Z then AA. Start column defaults to A. Adds label font, size and position (top, middle, bottom).

## 0.1.3 - Single Set button
Set and Reset now use the selected token. Removed the map-click mode that did nothing.

## 0.1.2 - First hex from selection
Adds Use selected to set the first hex from a selected token, plus error messages when setting it fails.

## 0.1.1 - Manifest fix
Renamed `manifest` to `manifest_version` so Owlbear accepts the extension.

## 0.1.0
First version: hex numbering in AA.01 style.
- Set the first hex; set columns, rows, start column and row.
- Labels placed as locked items, GM-only or visible to players.
- Click any hex with the tool to read its key.
