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
- **Undo** and **Redo** (Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z) step back and forward through your edits. Quick edits, like typing
  a number, count as one step.
- **Play previous** plays the sound created before the latest one, so you can compare an edit. Tick **Loop** to repeat
  the sound until you press **Stop**.
- **Vary** nudges every number you typed in (not connected inputs) by up to ±5%, and gives Noise and Granular Synth new
  seeds. Undo goes back. **Variations…** exports several varied versions as WAV files in one `.zip`, for sets of
  similar sounds such as footsteps. You choose how many and by how much, and Vary uses the same amount.
- **Save** and **Open** store patches as JSON. The current patch is also kept in your browser between visits.
- **Open** also imports patch maps (`.pm`) saved by the original Quack. It reads Sine, Square, Sawtooth, Noise, Mixer,
  Modulator, Sequencer, Sample and Hold, Sweep, ADSR, Envelope, Echo, Fuzz and Mono to Stereo Pan. A file that uses
  any other component is refused with a message naming it.
- **Export** saves the last render as WAV, FLAC, MP3 or OGG, named after the Recorder's **File name**:
  - WAV and FLAC are built in. FLAC is lossless but stored uncompressed.
  - MP3 uses [lamejs](https://github.com/zhuker/lamejs) and needs a standard MP3 sample rate, such as 22050 or 44100.
  - OGG (Opus) uses the browser's own recorder, where the browser supports it (Firefox does), and takes as long as the sound plays.

## Components

| Group | Components |
|-------|------------|
| Sources | Sine, Sawtooth, Square, Noise, Fourier Wave, WAV Sample, Granular Synth, Math Function, Wave Function, Patch |
| Mixers | Mixer, Modulator, Merger, Sequencer, Music Modulator, Sample and Hold, Switch, Counter |
| Envelopes | Sweep, ADSR, Envelope |
| Filters | Comb Filter, Echo, Fuzz, Moving Average, Filter |
| Stereo | Mono to Stereo Splitter, Mono to Stereo Pan, Stereo to Mono Merger, Stereo to Mono Pan, Stereo to Stereo Cross |

They follow the formulas in the original help file. A few are worth knowing about:

- **Noise** and **Granular Synth** have their own **Seed**, saved with the patch, so a patch renders the same sound every time.
- **Math Function** and **Wave Function** take an expression such as `sin(2*pi*440*t)*(1-x)`. The variables are `t` (seconds),
  `x` (t as a fraction of the duration), `p` (the wave's phase, Wave Function only) and the inputs `a` to `d`. The operators are
  `+ - * / ^ == != < <= > >= ! && ||`, and the functions are `sin cos tan asin acos atan ln exp log abs sign floor frac sinh cosh tanh
  asinh acosh atanh`, plus the constant `pi`.
- **Fourier Wave** builds a wave from up to 4095 harmonics. **Normalise**, **Add series** (`a/n^b`) and **Import** (a text file
  of `order amplitude phase` lines) edit the list.
- **WAV Sample** plays an uncompressed WAV file. Unlike the original, the file is stored inside the patch, so saved patches stay portable.
- **Patch** plays another saved patch as a source. Load a `.json` file into it and the patch is stored inside the current one.
  It renders at the outer patch's sample rate and length, and keeps its own Recorder volume. Patches can nest up to 16 levels deep.
- **Switch** outputs `In k`, where `k = floor(Select)`. It has 2–64 inputs, and Select can change on any sample, so it can
  switch as often as you like. With **Wrap around**, `k` cycles back to `In 0` past the last input.
- **Counter** adds **Step** each time **Trigger** rises from 0 or below to above 0, and a rising **Reset** returns it to its
  start value. Counter into Switch steps through a list of signals (see the *Arpeggio* example).
- **Filter** is a resonant low-pass, high-pass, band-pass or notch filter. Cutoff (Hz) and Resonance are inputs, so a
  Sweep or an oscillator can move them. The original Quack had no such filter.
- **Stereo**: tick **Stereo** on the Recorder for a stereo file. Mono signals play in both channels, and a stereo signal going
  into a mono input is averaged. Stereo connections are drawn as double lines.

The examples menu has patches built from techniques in the original help file: a siren, wood block, tom-tom, whoosh, musical
sweep, echoing beeps, arpeggio, a Fourier note, a spinning coin and a grain cloud (granular), stereo ping-pong and a math chirp.

## Tests

```sh
npm test            # everything
npm run test:unit   # the core and each module
npm run test:e2e    # whole patches, exports and the browser UI
```

Each module in `src/modules/` has its own unit tests in `test/modules/`. The end-to-end tests render patches built from the
original help file's techniques, check that ffmpeg decodes the WAV and FLAC exports to the same samples (skipped without
ffmpeg), and drive the page in headless Chromium with Playwright (skipped unless you `npm install` it).

## Layout

- `index.html`: the page. It loads every file below with plain `<script>` tags.
- `src/core/engine.js`: the component registry, patch rules, rendering, save and load. Its header documents how to write a component.
- `src/core/wav.js`, `src/core/flac.js`: WAV encoding and decoding, FLAC encoding
- `src/core/expr.js`: the expression language for Math Function and Wave Function
- `src/modules/`: one file per component. Each registers itself with the engine.
- `src/quack.js`: the Node entry point, which lists the modules
- `src/examples.js`: built-in example patches
- `src/app.js`, `src/styles.css`: the patch-board UI
- `test/`: unit tests (`core/`, `modules/`) and end-to-end tests (`e2e/`)

### Adding a component

Create `src/modules/<name>.js` (copy `sine.js`), add its name to `MODULES` in `src/quack.js` and a matching `<script>` tag in
`index.html`, and add `test/modules/<name>.test.js`. A test fails if the module list and the script tags disagree.

## License

The app's source code is licensed under the [GNU Affero General Public License v3.0](LICENSE). If you
run a modified version for others, including as a hosted webpage, you must offer them its source code.
The page links to this repository for that reason.

Sound effects you render and patches you create are yours. The license puts no restrictions on them, and
you can use, sell or license them however you like.
