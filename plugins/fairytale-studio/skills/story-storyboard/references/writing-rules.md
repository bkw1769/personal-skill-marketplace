# Writing and timing rules

Learned while turning a four-beat synopsis into the 3-minute Troy storybook (ages 6-10).

## Facts first

- Check every proper noun and relation in the synopsis before timing. The Troy synopsis said "그리스의 왕자 파리스"; Paris is a prince of Troy. Fix it, and record the fix in `notes.fact_checks` so the user sees it.
- Keep the plot beats the user gave, in their order and roughly their time ranges. Ask before dropping or reordering a beat.

## Adapting for children

- War, injury, death: show cause and result without harm. Soldiers bonk off a wall with a comic "통!" instead of fighting; the end of the war is a gate opening and torches coming in, then dawn.
- Romance or adult motives: name the event, not the details ("파리스와 헬레네를 둘러싼 사건").
- Give the child viewer a point-of-view character (in Troy, a girl who doubts the gift) and end with a one-sentence lesson as a `quote` caption.
- Record every such change in `notes.adaptations`.

## Captions and bubbles

- Reading speed: at least `characters / 7` seconds on screen (Korean, whitespace not counted). Narration read aloud by TTS takes about the same time, so the rule also keeps voice and caption in step.
- At most two lines; break at a natural pause. Prefer two short sentences to one long one.
- Leave about 0.3-1.0 s between consecutive captions so they do not flicker into each other.
- Bubbles are for what a character would actually say in the moment; keep them short and in-character. Use `think` for inner thoughts and set `narrate: false` for interjections like "쉿!" or "...".
- Do not put a caption and a bubble with long text on screen at the same time; the eye can follow one.

## Scenes

- 12-20 scenes for 3 minutes; 5-15 s each. A scene shorter than 4 s rarely reads unless it is a gag beat.
- Change scenes on a story beat, not in the middle of a sentence.
- Use `cut` for a sudden mood change (war starts, the party ignores the warning) and `blot` (paint bleed) as the default soft transition.

## Music and sound

- One music mood per scene; change the tempo and instruments when the mood changes. Silence is a tool: the warning scene dropped the music and kept only a heartbeat.
- Cue sounds on visible action: footsteps on steps, a boing on each bonk, a hammer hit on each blow, a ding when an idea lands.
- Repeated actions share one list of times between animation and sound (Troy: `HAMMERS`, `PULLS`, `BONKS`). Write those times into `cues` and mention them in `notes.timing` so the video code can read the same list.
- Volume follows the scene: the same footstep is quieter at night.
