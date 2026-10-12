# Sound Effect Generator

A modular sound effect synthesizer that runs in the browser, modelled on the classic
Windows program *Quack Sound Effects Studio*. You place components on a patch board,
wire them together, and render the result offline to a sound file.

## Run it

- **Locally:** open `index.html` in a browser by double-clicking it. No server or install is needed.
- **As a webpage:** host the folder on any static host, such as GitHub Pages.

MP3 export downloads its encoder from a CDN the first time you use it, so it needs a network connection.
Everything else works offline.

## How it works

- Every patch has exactly one **Recorder**. Its properties set the duration, sample rate, bit depth and volume.
- Drag from a red **output** dot to a green **input** dot to connect. Each output feeds exactly one input,
  and each input has one source. A new connection replaces any that conflicts with it. Use **Duplicate**
  when you need the same signal in two places.
- An input with nothing connected uses the value you type for it in the side panel.
- **Create and Play** renders the patch, plays it and draws it on the scope. If the peak is outside
  0.5–1, the status bar suggests a Recorder volume.
- **Save** and **Open** store patches as JSON. The current patch is also kept in your browser between visits.
- **Export** saves the last render as WAV, FLAC, MP3 or OGG:
  - WAV and FLAC are built in. FLAC is lossless but stored uncompressed.
  - MP3 uses [lamejs](https://github.com/zhuker/lamejs) and needs a standard MP3 sample rate, such as 22050 or 44100.
  - OGG (Opus) uses the browser's own recorder, where the browser supports it (Firefox does), and takes as long as the sound plays.

## Components

| Group | Components |
|-------|------------|
| Sources | Sine, Sawtooth, Square, Noise, Patch |
| Mixers | Mixer, Modulator, Merger, Sequencer, Music Modulator, Switch, Counter |
| Envelopes | Sweep, ADSR |
| Filters | Comb Filter, Echo, Fuzz, Moving Average |

A few of these behave in ways worth knowing:

- **Noise** has its own **Seed**, saved with the patch, so a patch renders the same sound every time.
- **Patch** plays another saved patch as a source. Load a `.json` file into it and the patch is stored
  inside the current one. It renders at the outer patch's sample rate and length, and keeps its own
  Recorder volume. Patches can nest up to 16 levels deep.
- **Switch** outputs `In k`, where `k = floor(Select)`. It has 2–64 inputs, and Select can change on any
  sample, so it can switch as often as you like. With **Wrap around**, `k` cycles back to `In 0` past the last input.
- **Counter** adds **Step** each time **Trigger** rises from 0 or below to above 0, and a rising **Reset**
  returns it to its start value. A Trigger that starts above 0 counts once at the start.
  Counter into Switch steps through a list of signals (see the *Arpeggio* example).

The examples menu has patches built from techniques in the original help file: a siren, wood block,
tom-tom, whoosh, musical sweep, echoing beeps and an arpeggio.

## Tests

The engine (`src/engine.js`, `src/flac.js`, `src/examples.js`) has no browser dependencies and is tested
with Node's built-in test runner. No install is needed:

```sh
npm test
```

## Layout

- `index.html`: the page
- `src/engine.js`: components, patch rules, rendering, WAV encoding, save and load
- `src/flac.js`: FLAC encoder
- `src/examples.js`: built-in example patches
- `src/app.js`: patch-board UI and export
- `src/styles.css`: styles
- `test/`: unit tests

## License

The app's source code is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you
run a modified version for others, including as a hosted webpage, you must offer them its source code.
The page links to this repository for that reason.

Sound effects you render and patches you create are yours. The license puts no restrictions on them, and
you can use, sell or license them however you like.
