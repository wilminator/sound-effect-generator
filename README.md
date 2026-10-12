# Sound Effect Generator

A quack sound effect generator. Every quack is synthesized live in the browser
with the Web Audio API, so there are no sample files.

## Run it

- **Locally:** open `index.html` in a browser by double-clicking it. No server or install is needed.
- **As a webpage:** host the folder on any static host, such as GitHub Pages.

## Controls

| Control  | What it does |
|----------|--------------|
| Pitch    | Base pitch of the voice |
| Duration | Length of each quack |
| Nasal    | How strongly the formant filters shape the sound |
| Buzz     | Narrower pulse and more noise for a raspier voice |
| Wobble   | Vibrato and the fast rattle of a real quack |
| Quacks   | Number of quacks in a row |
| Volume   | Peak level |

Press **Space** or **Q** to quack. The presets are Mallard, Rubber duck, Duckling
and Angry goose. **Randomize** picks new settings, and **Download WAV** saves the
current quack.

## Tests

The synthesis core (`src/quack.js`) has no browser dependencies and is tested with
Node's built-in test runner. No install is needed:

```sh
npm test
```

## Layout

- `index.html`: the page
- `src/quack.js`: synthesis, presets and WAV encoding (works in the browser and in Node)
- `src/app.js`: UI wiring
- `src/styles.css`: styles
- `test/`: unit tests
