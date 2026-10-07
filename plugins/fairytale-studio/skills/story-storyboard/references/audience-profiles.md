# Audience profiles

Production parameters per age band, from a research survey made on 2026-10-08 (report "동화 대상 연령과 영상 제작법" in the fairytale project's `docs/research/reports/`). Grades: **[E]** peer-reviewed evidence, **[O]** official guidance (WHO, AAP, YouTube, Korean government), **[S]** observed on YouTube samples (2026-10-08), **[P]** practitioner rule of thumb, **[I]** inference from the above that still needs checking against real retention data. Korean: 1 character = 1 syllable.

## Contents

- Which band
- Shared rules
- Band A: 3-5
- Band B: 6-8
- Band C: 9-10
- Key sources

## Which band

- Core audience of classic fairy tales (전래·명작동화) is **3-8**, split in two: **A 3-5** and **B 6-8**. C 9-10 is an optional extension line. Under 2 is not a target. [O][S]
- The boundaries match YouTube Kids content settings (Preschool ≤4, Younger 5-8, Older 9-12) [O], Korean picture-book sets sold as "4~7세" [S], and the jump in story comprehension between 4 and 5-6 [E].
- Fear changes around age 7: younger children fear looks and transformations, older ones fear realistic threats. [E]
- One story can ship as an A "soft version" and a B "full version" from the same art: change the cast size, villain staging, narration speed, captions and how the moral is told. [I]
- Set `"audience": "3-5" | "6-8" | "9-10"` in storyboard.json. Without it the validator reads the lower bound of `audience_age`, else uses 6-8.

## Shared rules (all bands)

1. Plan for YouTube "made for kids": no end screens, cards, comments or bell. [O]
2. State "만 3세 이상" in the channel description; do not target under 2. [O]
3. Each story needs its own art, adaptation and editorial voice; vary structure between episodes. Template-stamped mass production is demonetized (YouTube inauthentic-content clarification, 2026-07). [O]
4. Watercolor animation needs no AI label; realistic synthetic people or scenes do. [O]
5. Move only what the current narration sentence talks about; keep backgrounds still or nearly still. [E→I]
6. No on-screen "tap here" prompts or decorative sparkles that compete with the story. [E→I]
7. Music and ambience at least 15 dB (target 15-20 dB) under the voice, side-chain ducked. [E]
8. Instrumental music only under narration; songs with words hurt comprehension. [E]
9. Put sound effects in the pauses between sentences, on the same frame as the action, never over a word. [I]
10. Master at −14 LUFS integrated, true peak ≤ −1 dBTP. [P]
11. On-screen text matches the narration word for word with correct spelling and spacing; at most 2 lines. [I]
12. When a sentence introduces a new word, hold the picture 1-2 s and drop the music. [E→I]
13. Just before the ending, ask a "why" question ("왜 그랬을까?"), then confirm the moral in one sentence. [E→I]
14. Publish single stories first; regroup them into themed compilations later. [S]

## Band A: 3-5 (유아)

| Parameter | Value | Grade |
|---|---|---|
| Single episode | 3-7 min, aim 4-6 | [S][I] |
| Compilation | up to 20-30 min (5-6 stories); 60+ min bedtime sets as a separate audio product | [O][I] |
| Narration speed | 3.5-4.5 syllables/s, aim 4.0 → `audience: 3-5` (max 4) | [I] |
| TTS | render at 0.75-0.85× default speed, then measure syllables ÷ seconds | [I] |
| Pauses | 0.5-0.8 s between sentences, 1.0-1.5 s at scene change, 2-4 s silence after a question | [I] |
| Sentence | one clause, 8-15 syllables; turn description into dialogue | [I][P] |
| Language | lots of 의성어·의태어; a refrain repeated 3+ times per episode | [E][I] |
| Structure | 1 hero + 1-2 others, one problem, linear time, 3-5 scenes, three similar tries, no flashback or subplot | [E][I] |
| Scenes | 8-20 s; one picture per narration sentence; hold = sentence + ~1 s; never cut mid-sentence | [I] |
| Magic and transformation | rare, and announced by the narrator before it happens | [E][I] |
| Feelings | the narrator names them ("곰이 슬펐어요") | [I] |
| Questions | 2-4 per episode, naming or predicting ("누가 문을 두드렸을까?") → 2-4 s silence → a character shows the answer | [E][I] |
| Captions | optional; if used, refrain only, large, highlighted word by word as spoken | [E][I] |
| Voices | warm adult narrator + clearly different pitch per character, fixed across episodes; TTS is low-risk at this age | [E][P] |
| Sound | music 20 dB+ down or off under key sentences; no screams or sudden loud effects | [I] |
| Fear | never show a transformation on screen (use the paint-blot transition), no teeth or claw close-ups, a safety cue before a threat, resolve the threat in the same scene, soften abandonment and death | [E][I] |
| Ending | show the moral as an action, one short question + one-sentence confirmation, calm close ("끝! 이제 놀러 가자"), no "keep watching" | [E][O][I] |

## Band B: 6-8 (초등 저학년), default

| Parameter | Value | Grade |
|---|---|---|
| Single episode | 6-12 min, aim 7-10 (one picture book read aloud) | [S][E][P] |
| Compilation | 30-60 min | [S][I] |
| Narration speed | 4.5-5.0 syllables/s → `audience: 6-8` (max 5) | [I] |
| Pauses | 0.4-0.6 s between sentences, ~1 s at scene change, ~2 s after a question | [I] |
| Sentence | 1-2 clauses, 15-25 syllables | [I] |
| Structure | goal → try → fail → try again → result; 3-5 named characters with a clear villain; 6-10 scenes; simple foreshadowing (an object that matters later) | [E][I] |
| Feelings | shown through action and faces; let the child infer; simple tricks (a disguised wolf) are fine | [I] |
| Questions | 2-3, mostly "why" and inference | [E][I] |
| Captions | full narration captions, highlighted word by word in sync, kept until the sentence ends, max 2 lines: the most valuable caption investment for early readers | [E][I] |
| Scenes | 5-15 s; clarity of plot first; never cut mid-sentence | [O][I] |
| Fear | classic villains are fine; keep danger short and resolve or reassure right after | [E][I] |
| Voices | natural-sounding adult narrator first, distinct character voices; use only the most natural TTS voices | [E] |
| Moral | show it, ask a "why" question, then sum up in one short sentence | [E] |

## Band C: 9-10 (optional)

| Parameter | Value | Grade |
|---|---|---|
| Single episode | 10-18 min, or long classics as 2-4 parts of 8-15 min; full compilations 30-90 min | [S][I] |
| Narration speed | 5.0-5.5 syllables/s (stay below a news anchor's ~5.9) → `audience: 9-10` (max 5.5) | [I] |
| Sentence | up to 30-40 syllables, connectives (그래서, 하지만) | [I] |
| Structure | subplots, point-of-view changes, flashbacks, foreshadowing, ambiguous motives allowed; the moral can stay implicit or become a reflection question | [I] |
| Questions | about one reflection question at the end | [E][I] |
| Captions | ordinary captions, no highlighting | [I] |
| Fear | original Grimm-level tension is fine, no realistic violence; when a danger is realistic (getting lost, strangers), include what to do | [E][I] |
| Voices | strongest preference for natural voices: best TTS or human recording, no hoarse or noisy audio | [E] |
| Sound | denser music is fine, but keep the 15 dB gap under speech | [E][O] |
| Positioning | this age drifts to games, music and science content; run it as an extension line, not the channel's core | [O][I] |

## Key sources

- YouTube Kids content settings by age; YouTube "made for kids" and quality principles for children and family content; YouTube inauthentic-content clarification (2026-07).
- 한국언론진흥재단 2023 어린이 미디어 이용조사 (3-9세 daily media 185.9 min; YouTube used by 97.5% of video-platform users).
- WHO 2019 and AAP: under 2 none, 2-5 at most 1 hour a day of high-quality content, co-viewing.
- Takacs, Swart & Bus 2015 meta-analysis (technology-enhanced storybooks: animation, music and sound help; hotspots and games distract).
- Lillard & Peterson 2011, Lillard 2015, Kostyrka-Allchorne 2019 (fantastical content, not editing pace alone, lowers 4-year-olds' executive function).
- Cantor (children's fright reactions by age), Horst et al. 2011 (repeated stories and word learning), Walker & Lombrozo 2017 (explaining morals), dialogic reading meta-analysis, word-highlighting eye-tracking studies, Veneziano et al. 2026 (children's preference for natural vs synthetic voices), speech-in-noise studies with toddlers (+10 dB works, +5 dB does not).
- Observed lengths: Pinkfong single stories median ~3:40; EBS 그림책 뿡뿡뿡 median ~7:16; Storyline Online median ~9:08; Little Fox 3-4.5 min parts.

Most numeric speed, sentence, cast and scene values are inferences. After the first episodes are public, compare average view duration and retention curves between A and B versions and recalibrate this file.
