# Designing and freezing voices

A frozen reference clip decides everything a character sounds like: timbre, pace, delivery and even accent. Spend the effort here and the lines take care of themselves.

## 1. The description (`--instruct`)

**Write it in English, even for a Korean voice.**
- Qwen's documentation supports voice descriptions in Chinese and English only.
- The spoken language comes from `--lang`.
- In this project, an English description for the Korean narrator gave a calmer, slower take than a Korean description: 4.0-4.9 syllables/s against 5.2-6.4.
- `tts/bin/tts design` prints a note when the description contains Hangul.

**Structure.** Use one or two sentences, 20-45 words, covering these dimensions in this order. Leave out what does not matter.

| Dimension | Words that work |
|---|---|
| Gender | male, female, neutral |
| Age | child (5-12) "a 7-year-old boy", teenager, young adult, "in her 30s", middle-aged, elderly "around 70" |
| Pitch | high, slightly high, medium, medium-low, low |
| Timbre | warm, bright, soft, crisp, husky, mellow, deep, resonant, breathy, raspy, nasal |
| Pace | slow relaxed, unhurried, moderate, quick lively |
| Emotional baseline | gentle, kind, reassuring, cheerful, playful, calm, serious, mischievous, grumpy |
| Use case | "suited for bedtime fairy-tale narration", "for an animation character", "for a grandmother in a children's story" |

**Rules:**
- **Be concrete and objective.** Vague words ("nice", "normal", "good") give random results.
- **No real people.** "Sounds like <actor>" is both unreliable and a rights problem.
- **One standout trait per character.** A villain is "raspy", a fox is "slightly nasal and sly". Five quirks blur together.
- **Pace in the description is the only speed control.** The clone has no speed setting and keeps the reference pace. For young children, ask for "slow relaxed pace".
- **These have no effect:** accent requests (British, Australian, Korean dialects) and duration instructions ("finish in 5 seconds"). Leave them out.

**Examples:**

```text
narrator  Warm, gentle female storyteller in her early 30s, medium-low pitch, soft and clear articulation, slow relaxed pace, kind and reassuring tone, suited for bedtime fairy-tale narration for young children.
grandma   Elderly woman around 70, low-medium pitch, slightly husky and mellow, slow measured pace, warm and wise, suited for a grandmother character in a children's story.
boy       Bright, playful voice of a 7-year-old boy, high pitch, light and slightly breathy, quick lively pace, curious and cheerful, suited for an animation character.
girl      Sweet, clear voice of an 8-year-old girl, high pitch, slightly childish speech, moderate pace, brave and cheerful, suited for an animation character.
king      Middle-aged man, low pitch, deep and resonant, moderate dignified pace, calm and authoritative but kind, suited for a king in a children's story.
fox       Young adult male, medium pitch, slightly nasal and sly, quick playful pace, mischievous and charming, suited for a cunning fox in an animated fairy tale.
tiger     Middle-aged male, low pitch, raspy and powerful, slow heavy pace, grumpy but not frightening, suited for a tiger in a children's folk tale.
```

**Child voices** are the hardest; the model sometimes gives an adult imitating a child. Use `--takes 6` to `8` and judge the apparent age by ear.

## 2. The sample line (`--text`)

The sample line becomes the reference transcript, and its delivery becomes the character's default. Guidelines:

- **Length: 2-3 complete sentences, 8-15 seconds** (Korean about 40-70 syllables, English about 25-40 words).
  - Shorter references give weaker timbre.
  - Much longer ones raise the risk of stalls.
  - `pick` warns outside 8-20 s.
- **Language: the target channel.** Write a Korean sample for `-ko` voices and an English sample for `-en` voices. Cloning across languages keeps the reference accent and reads numbers in the reference language. Design both language voices from the same English description.
- **Delivery: the character's normal register.** Do not use the most emotional moment. A calm narrator reference gives calm narration; an excited reference makes every line excited.
- **Text rules:**
  - End every sentence with `.`, `?` or `!`.
  - No digits, Latin letters inside Korean, quotes or brackets (see `script-writing.md`).
  - Words typical of the role help: story openings for a narrator, the character's catchphrase for a character.
- **Never edit the text after picking.** `ref_text` must be the exact transcript of the whole clip. A partial transcript makes the clone produce long garbage.

Examples:

```text
narrator-ko  옛날 옛적, 깊은 산속 작은 마을에 마음씨 착한 나무꾼이 살고 있었어요. 나무꾼은 날마다 숲에 가서 나무를 했답니다. 어느 날, 나무꾼은 숲속에서 아주 이상한 소리를 들었어요.
narrator-en  Once upon a time, in a small village deep in the mountains, there lived a kind woodcutter. Every day he went into the forest to gather wood. One morning, he heard a very strange sound.
grandma-ko   얘야, 이리 와서 앉아 보렴. 할머니가 아주 오래된 이야기를 하나 들려줄게. 옛날에는 호랑이도 말을 했단다.
fox-en       Well, well, what do we have here? A lost little rabbit, all alone in my forest. Don't worry, I know a very good shortcut.
```

## 3. Choosing a take

1. Generate 4 takes (the default). Use 6-8 for children's voices.
2. Run the QA command on each take to catch clipped, cut-off or stalled takes before listening:

   ```bash
   tts/bin/tts check assets/audio/voices/<id>/candidates/take-<n>.wav --text "<sample line>" --lang ko
   ```

   - A long internal pause or leading silence is a warning, not a dealbreaker.
   - The pace number tells you how fast the character will speak.
3. Send the takes to the user and let them choose. Points to listen for:
   - right age and gender
   - stable timbre from start to end
   - clean last word
   - no breath noise or hum at the end
   - pace suitable for the audience
4. Freeze the chosen take:

   ```bash
   tts/bin/tts pick --voice <id> --take <n>
   ```

   - `pick` trims the clip to 0.15 s of silence before speech and 0.4 s after. A clean tail stops the clone from echoing the reference's last words at the start of new lines.
   - It warns if the take fails QA or falls outside 8-20 s.

Re-picking another take later is fine. Every line generated with the old reference regenerates on the next `batch`, because the cache key includes `ref.wav`.

## 4. Emotion variants

The clone model ignores emotion instructions, but it copies the delivery of its reference. To give a character a clearly different state, make a **variant** cloned from the master. Cloning from the master keeps the timbre; designing again would change who the character is.

```bash
tts/bin/tts variant --from fox-ko --voice fox-ko-scared --note "scared, trembling" --text "으, 으악! 저기 뭐가 움직였어! 나, 나는 하나도 안 무서워. 정말이야." --takes 4
```

```bash
tts/bin/tts pick --voice fox-ko-scared --take 2
```

How to write and use the variant:
- Write the variant's text so that the words themselves carry the emotion: exclamations, hesitation, short broken phrases.
- Listen for both the emotion and the same timbre as the master.
- Assign the variant voice id only to the lines that need it.
- Keep variants few, typically:
  - happy or excited
  - sad
  - scared
  - angry (mild, for children's content)
  - whisper or soft

The line text itself also moves delivery: "!", "?", "…" and emotional wording shift the tone even with the master reference.

## 5. Channel consistency

The narrator is the voice of the channel. Design it once per language and reuse it across every story. `tts/bin/tts voices` lists what exists. Characters that recur across stories, such as a mascot, also keep their frozen voices. Only design new voices for new characters.
