# Darkroom (plain HTML + JavaScript)

A retro photo lab that runs entirely in the browser: camera-brand and film looks (Fujifilm and Sony first), a Lightroom-style developer, frames, date stamps and full-resolution export. Photos never leave the device.

This is the standalone version of [darkroom-photo-lab](https://github.com/jasoonl/darkroom-photo-lab). The look, behaviour and features are the same, but it has no dependency on the Claude Design runtime (`support.js`), so all of it is covered by the MIT license in `LICENSE`.

Open `index.html` through any static server (for example `python3 -m http.server`). `/lab` (`lab.html`) is the test bench that runs every look on openly licensed Wikimedia Commons photos.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell plus the app markup in `<template id="dc-template">` (`{{holes}}`, `<sc-for>`, `<sc-if>`). |
| `styles.css` | All styling. |
| `darkroom-ui.js` | Small template renderer (about 190 lines, no dependencies): compiles the template, calls `renderVals()`, patches the DOM. |
| `app.js` | The app logic: `class Component extends DCLogic`. State, editing, undo/redo, export. |
| `darkroom-engine.js` | WebGL2 develop pipeline, crop geometry, frames, date stamps, EXIF and RAW-preview reading, tiled export, ZIP. `window.Darkroom`. |
| `darkroom-looks.js` | The look library (110 looks): `p` = colour science, `fx` = effect sliders the look sets. |
| `lab.html` | Test bench. `?per=N` sets photos per source (default 4). |

## Deploying

Static site, no build step. On Vercel, import the repo with the "Other" framework preset and no build command.
