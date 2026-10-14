# Verifying a recorded video

Recording is real time, so a 3-minute story takes about 3 minutes. Do not call the video done until every check below has a result.

## 1. Container, size, duration, frame rate

```bash
node <skill-dir>/scripts/probe-mp4.mjs out/<name>.mp4 --expect-duration <storyboard duration> --tolerance 1 --expect-size 1920x1080 --require-audio
```

- Reads fragmented MP4 from MediaRecorder (Chrome) without ffprobe. Exit code 1 on any failed expectation; `--json` for machine-readable output.
- Duration is usually 0.1-0.6 s longer than the storyboard (the recorder stops 0.6 s after the end).
- `fps` is the average. 30 means no drops; below 24 means the scenes are too heavy for real-time capture (see animation-patterns.md) and motion will look jerky.
- WebM files (Firefox, older Chrome) are not parsed; check them in the browser (step 2).
- If ffprobe is installed, `ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,avg_frame_rate out/<name>.mp4` is an independent second opinion.

## 2. In the browser (same server)

Serve the output folder with HTTP Range support. Without Range, `<video>` reports a wrong duration (a 180 s file showed 3.37 s) and cannot seek.

Audio is not silent, per 10-second window:

```js
const buf = await (await fetch('/out/<name>.mp4')).arrayBuffer();
const audio = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(buf);
const d = audio.getChannelData(0), win = audio.sampleRate * 10, peaks = [];
for (let i = 0; i < d.length; i += win) { let p = 0; for (let j = i; j < Math.min(d.length, i + win); j++) p = Math.max(p, Math.abs(d[j])); peaks.push(+p.toFixed(2)); }
peaks; // every window should be above ~0.02 unless the storyboard asks for silence there
```

Frames match the storyboard: load the file in a `<video>`, seek to the middle of each scene, draw each frame into a canvas grid and look at it (or screenshot it). Use canvas capture rather than screenshots of a hidden or background tab, which do not repaint.

## 2b. Picture against sound

`probe-mp4` passed a take whose picture ended about 1 s behind its sound (recorded at load about 20). In the page, `await __sync(url, times)` decodes frames of the saved video and matches each to frames drawn by `renderFrame` within ±1 s; `ok` means the best offset is 0 (±0.1 s) everywhere. Pick times spread over the whole story, including the last 20 s, and avoid stills with no motion (they match any offset). The frame-by-frame export (`__export`) cannot drift; check it anyway after engine changes.

## 3. People

Peak levels only prove there is sound. Ask the user to watch and listen once: caption timing against narration, effects landing on the action, overall loudness (the master compressor keeps peaks under about 0.9).

## Report template

- File: path, size, container and codecs.
- Duration vs storyboard, frame size, average fps.
- Audio: present, peak range, any silent windows and whether they are intended.
- What the user still needs to check by ear.
