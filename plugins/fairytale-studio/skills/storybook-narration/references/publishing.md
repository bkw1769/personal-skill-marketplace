# Publishing checklist (AI voices)

General information collected in October 2026, not legal advice. Have a lawyer check anything that matters commercially.

## Model and voice rights

- **Weights.** Qwen3-TTS code and weights are Apache-2.0, so commercial use of the generated audio is allowed. Ship the LICENSE/NOTICE only if the model itself is redistributed, for example inside an app. Publishing audio does not require it.
- **Preset speakers.** Do not use the CustomVoice preset speakers (for example the Korean preset "Sohee") in monetized output. Whether the original speaker's rights were cleared for commercial use is unanswered upstream (QwenLM/Qwen3-TTS issue #353, open since 2026-08). Voices designed from a text description avoid that question.
- **Real people.** Clone a real person only with a written, specific consent covering:
  - AI training and cloning
  - commercial use, channels and duration
  - withdrawal and compensation
  - personal-information processing

  This applies to voice actors, family and friends; for anyone under 14, a guardian must consent. In Korea, a well-known voice is protected under the Unfair Competition Prevention Act (item (타)), and voice data is personal information under PIPA. A standard buy-out contract with a voice actor does not clearly cover AI cloning.
- **Non-commercial models.** Do not mix in output from models whose weights are non-commercial, such as OmniVoice (CC-BY-NC), Fish Audio S2, F5-TTS or XTTS-v2. Comparison listening is fine; publishing is not.

## What the tools enforce

| Check | Where | Effect |
|---|---|---|
| Model license is Apache-2.0 or MIT | `tts` engine | Refuses to load any other model. |
| Description names or imitates a real person | `tts/bin/tts design` | Refuses. |
| Variant from an unapproved master | `tts/bin/tts variant` | Refuses. |
| Source is blocked or `commercial_ok: false` (preset speakers, OmniVoice, Fish S2, F5-TTS, XTTS-v2, Higgs TTS 3) | Asset catalog validator | Refuses approval. |
| Voice without provenance (model, revision, model license, description, reference text), or with a non-commercial model license | Asset catalog validator | Refuses approval. |
| Real-person recording without a consent file | Asset catalog validator | Refuses approval. |
| Line uses a voice that is not approved | `tts/bin/tts batch` | Warns. |

### Using a real person's voice (only if the user insists)

1. Get a signed consent covering the points above.
2. Store it in `docs/consent/<name>.pdf`. That folder is gitignored and must never be published.
3. Register the recording as a voice item with `source: voice-recording-consented`, the tag `voice-origin:recorded` and `consent: docs/consent/<name>.pdf`.
4. Only then can it be approved.

The tool's `design` command never takes a real recording, so this is a manual, deliberate step.

## Disclosure

- **Korea AI Basic Act** (in force 2026-01-22). The labeling duty falls on "AI business operators" who provide AI products or services to users. A creator who uses TTS as a tool for their own videos is generally read as a user, not an operator. An app that synthesizes speech for its users at runtime can be an operator. Fines (up to KRW 30M) have a grace period of at least one year.
- **Default anyway.** Say near the start of the audio or video, and in the description, that the voices are AI-generated (for example "이 동화의 목소리는 AI로 만들었습니다." / "Voices in this story are AI-generated."). It costs nothing and covers the stricter readings.
- **YouTube altered/synthetic content.** Disclosure is required when content makes a real person appear to say something. A fictional narrator voice does not need the label, but the description note above is still recommended.

## Platform risks

- **YouTube monetization.** Since 2025-07-15, mass-produced or template-like content ("inauthentic content") is excluded from the Partner Program. Channels of AI-narrated kids' stories are a known target, and in 2026 YouTube said it limits AI content in YouTube Kids to a few high-quality channels. Show human creative work in every video: original or rewritten story text, chosen voices, edited timing, drawn art. Avoid uploading near-identical videos at volume.
- **Made for kids.** Mark children's videos as made for kids (COPPA). This disables personalized ads and comments.
- **Audiobook stores.**
  - ACX/Audible requires human narration, except through Amazon's own Virtual Voice program.
  - Google Play Books and Spotify (Findaway) accept AI narration.
  - Check each store's current rules before submitting.

## Story text

- **Classic tales.** Grimm, Andersen, Aesop and Korean folk tales are in the public domain, but a specific modern translation or retelling is not.
- **Your own text.** Write your own retelling.
- **Reading others' books.** Reading someone else's book aloud with TTS needs the rights holder's permission. A Korean court case between Millie's Library (밀리의서재) and Welaaa (윌라) treated unlicensed TTS reading as infringement.
- **Copyright in the audio.** In Korea, AI-only output is not protected by copyright. The human-written text and the edits are.
