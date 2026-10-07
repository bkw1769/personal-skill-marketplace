# Writing and timing rules

Learned while turning a four-beat synopsis into the 3-minute Troy storybook, and revised with the age research of 2026-10-08. Numbers that depend on the audience band (speed, pauses, sentence length, cast, scene length, questions) are in `audience-profiles.md`; this file holds the craft rules behind them.

## Facts first

- Check every proper noun and relation in the synopsis before timing. The Troy synopsis said "그리스의 왕자 파리스"; Paris is a prince of Troy. Fix it, and record the fix in `notes.fact_checks` so the user sees it.
- Keep the plot beats the user gave, in their order and roughly their time ranges. Ask before dropping or reordering a beat.

## Adapting for children

- War, injury, death: show cause and result without harm. Soldiers bonk off a wall with a comic "통!" instead of fighting; the end of the war is a gate opening and torches coming in, then dawn.
- Romance or adult motives: name the event, not the details ("파리스와 헬레네를 둘러싼 사건").
- Give the child viewer a point-of-view character (in Troy, a girl who doubts the gift) and end with a one-sentence lesson as a `quote` caption.
- Fear depends on age. Under 7, looks and transformations frighten even when the child knows it is pretend: keep transformations off screen, no teeth or claw close-ups, give a safety cue before a threat and resolve it in the same scene. From 8, realistic threats frighten more: classic villains are fine, but a realistic danger (getting lost, strangers) should come with what to do.
- Repetition is the strongest learning lever: a refrain or a three-times pattern (삼세번) in every story; 3-year-olds learned new words only after hearing the same story three times.
- Record every such change in `notes.adaptations`.

## Captions and bubbles

- Reading speed is set per band: about 4 syllables per second for 3-5, 5 for 6-8, 5.5 for 9-10 (whitespace not counted). The old single rule of 7 per second was faster than a news anchor (~5.9) and too fast for every band. TTS narration takes about the same time, so the rule also keeps voice and caption in step.
- At most two lines; break at a natural pause. Prefer two short sentences to one long one: one clause of 8-15 syllables for 3-5, 15-25 for 6-8.
- Narration in the style of 동화구연: turn description into dialogue, use onomatopoeia and mimetic words (의성어·의태어), keep a rhythm that is pleasant to read aloud.
- Leave air between consecutive captions (band pauses in `audience-profiles.md`); after a question to the viewer leave 2-4 s of silence for 3-5, about 2 s for 6-8, then let a character show the answer.
- Questions: 2-4 per episode for 3-5 (naming, predicting), 2-3 for 6-8 (why, inference), one reflection question for 9-10. Before the ending ask "왜 그랬을까?" and then confirm the moral in one sentence.
- Captions for early readers (6-8): full narration captions highlighted word by word in sync work best; for 3-5 captions are optional (refrain only, large).
- Bubbles are for what a character would actually say in the moment; keep them short and in-character. Use `think` for inner thoughts and set `narrate: false` for interjections like "쉿!" or "...".
- Do not put a caption and a bubble with long text on screen at the same time; the eye can follow one.

## Scenes

- Scene length by band: 8-20 s for 3-5 (one picture per narration sentence, held a second after it ends), 5-15 s for 6-8. The validator warns below 8 s / 5 s / 4 s. Never cut in the middle of a sentence.
- Cast and scenes by band: 3-5 = one hero and 1-2 others, 3-5 scenes, one problem, no flashback; 6-8 = 3-5 named characters, 6-10 scenes, goal-try-fail-retry-result with simple foreshadowing.
- Story clarity matters more than cut count: young children watch longer what they can follow, and fantastical, hard-to-follow content hurts 4-year-olds' attention even when it is short.
- Change scenes on a story beat, not in the middle of a sentence.
- Use `cut` for a sudden mood change (war starts, the party ignores the warning) and `blot` (paint bleed) as the default soft transition.

## Music and sound

- One music mood per scene; change the tempo and instruments when the mood changes. Silence is a tool: the warning scene dropped the music and kept only a heartbeat.
- Cue sounds on visible action: footsteps on steps, a boing on each bonk, a hammer hit on each blow, a ding when an idea lands.
- Repeated actions share one list of times between animation and sound (Troy: `HAMMERS`, `PULLS`, `BONKS`). Write those times into `cues` and mention them in `notes.timing` so the video code can read the same list.
- Volume follows the scene: the same footstep is quieter at night.
- Place effects in the pauses between sentences, never over a word; under narration keep music instrumental and at least 15 dB below the voice.
