# Sound design

All sound is synthesized by `Synth` in `js/audio.js` and scheduled on the picture clock. An event is `{ t, fn, a }`: at `t` seconds the player calls `synth[fn](audioTime, ...a)`. Storyboard cues map directly: `{ "t": 47.4, "sound": "boing", "args": [0.34] }`.

## Instruments (music)

Arguments after the time: frequency in Hz (use `nf('C5')`), velocity, sometimes duration.

| Name | Signature | Character |
|---|---|---|
| `marimba` | (f, v=0.3) | Bright, playful lead |
| `harp` | (f, v=0.18) | Arpeggios, romance, endings |
| `flute` | (f, v=0.14, dur=0.5) | Gentle melody, mornings, sadness |
| `box` | (f, v=0.16) | Music box: lullabies, wonder, hush |
| `pizz` | (f, v=0.25) | Pizzicato strings: sneaking, marches, mystery |
| `pluck` | (f, v=0.25, dur=0.4) | Soft bass line or guitar-like |
| `bell` | (f, v=0.2, dur=1.6) | Endings, magic |
| `pad` | (f, v=0.05, dur=2) | Sustained chords under everything |
| `bass` | (f, v=0.28, dur=0.4) | Low pulse |
| `kick`, `tom`, `shaker`, `tamb` | (f, v) | Percussion; `tom` uses f as pitch (about 110-180), the others ignore f (pass 0) |

Score helpers (import from audio.js inside score.js):

- `seq(ev, t0, bpm, 'C5 E5 G5/2 R/1 | F5 A5', 'marimba', 0.3)` notes with beat lengths after `/`, `R` = rest, `|` ignored, chords with `+`.
- `chords(ev, t0, bpm, beatsEach, ['C4+E4+G4', 'F3+A3+C4'], 'pad', 0.04)`.
- `arps(ev, t0, bpm, ['C3+G3+C4+E4'], beatsEach, 'harp', 0.1, div)`.
- `perc(ev, t0, t1, everySeconds, 'shaker', 0.05, offset)`.

## Effects

| Name | Signature | Use |
|---|---|---|
| `boing` | (v) | Bounces, bonks, comic recoil |
| `pop` | (v, f=520) | Appear/disappear, bubbles |
| `bloop` | (f, v) | Soft notes, title sparkle runs |
| `slide` | (f0, f1, dur, v) | Slide whistle up/down: surprise, falling, sneaking |
| `squeak` | (v) | Wheels, small creatures |
| `whoosh` | (v, dur) | Fast moves, transitions |
| `ding` | (v) | Idea, correct answer |
| `sparkle` | (v, n=7, base=1760) | Magic, reveal, stars |
| `hammer` | (v) | Building, knocking |
| `clank` | (v) | Metal, armour |
| `step` | (v) | Footsteps (schedule every 0.25-0.5 s while walking) |
| `creak` | (dur, v) | Doors, gates, wooden horse |
| `scratch` | (dur, v) | Writing, drawing, tally marks |
| `tick` | (v, f) | Clock, passing time |
| `waves` | (dur, v) | Sea bed for several seconds |
| `crickets` | (dur, v) | Night bed |
| `thunder`, `rumble` | (v) / (dur, v) | Drama, ground shaking |
| `gull`, `bird`, `owl`, `rooster` | (v) | Sea, morning, night, dawn |
| `cheer` | (dur, v) | Crowd joy |
| `horn` | (v, f=147, dur) | Distant horn call |
| `heart` | (v) | Heartbeat for tension (repeat every ~0.6-1.2 s) |
| `yawn`, `zzz`, `hmm` | (v) | Tired, sleeping, thinking |

Any other name is silent and reported once in the console. To add a sound, add a method to `Synth` (see the existing ones as recipes) or play a sample: decode an audio file once with `ctx.decodeAudioData`, then add a method that creates an `AudioBufferSourceNode`, connects it through `this.o(gain)` and calls `start(t)`.

## Mood recipes

| Mood | Tempo | Key | Instruments |
|---|---|---|---|
| playful | 110-120 | C or G major | marimba lead, pluck bass, pad, shaker |
| warm / romance | 80-90 | F major | harp arpeggios, flute melody, pad |
| tense (kid-safe) | 96-104 | D minor | pizzicato march, bass, tom on 1 and 3 |
| sad / tired | 60-70 | A minor | slow flute, pad |
| mysterious | 90-100 | A minor → C major on the idea | pizzicato, then marimba |
| festive | 128-150 | C major | main theme faster, kick on every pull/step, tambourine |
| sleepy / night | 66-72 | F major | music box, pad, crickets |
| wonder / morning | 60-76 | C major (maj7 chords) | music box, harp, birds |
| ending | 80-90 | home key | theme slowed on flute, harp, final bell chord |

## Levels and mixing for children

Children need speech clearly above everything else: toddlers learned words when speech was 10 dB above the background but not at 5 dB, and children need roughly +15 dB signal-to-noise where adults manage with +7-11 dB.

| Rule | Value | Grade |
|---|---|---|
| Music and ambience under narration | at least 15 dB below the voice, target 15-20 dB; side-chain duck during every narration line | evidence |
| Key sentences for 3-5 | music 20 dB+ down or off | inference |
| Music type under speech | instrumental only; songs with words in the same language hurt comprehension most | evidence |
| Sound effects | in the pauses between sentences, on the same frame as the action, never on top of a word | inference |
| 3-5 | no screams, no sudden loud hits; keep effects soft and short | inference |
| New vocabulary | drop the music for that sentence | evidence → inference |
| Final master | −14 LUFS integrated, true peak ≤ −1 dBTP | practitioner |

Animation, music and sound effects made storybooks more effective in a meta-analysis (43 studies) when they matched the story; interactive extras distracted. Use sound to mark events, not to decorate.

## Rules learned

- One clock: never schedule with `setTimeout`; let the player pump events.
- When seeking, the old session is faded and dropped, then events from the new time are scheduled. Long beds (`waves`, `crickets`) started before the seek point are not restarted; repeat them every few seconds in the cue list instead of one long event.
- Same effect, different scene, different volume: footsteps quieter at night.
- Silence is a tool: drop the music for a warning or a reveal and keep only a heartbeat or a single music-box line.
- Main theme returns at different tempos and instruments (title → festival → lullaby → dawn) to tie the story together.
