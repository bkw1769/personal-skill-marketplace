# Story structure: question, fixed, problem, reason

The channel's default story for an object that looks pointless or annoying (decided by the user on 2026-10-21). The viewer's own thought, "why not just remove it?", becomes the middle of the video: the video removes it, shows what breaks, and only then gives the real reason.

| Step | Beat (`script.json`) | What it says | Share of a 61-75 s short |
|---|---|---|---|
| 1. Question | `question` | The object and the doubt. "다리 지날 때마다 덜컹, 이 쇠판 왜 있을까요?" | 0-8 s |
| 2. Fixed | `imagine` | The doubt "solved" the way a viewer would: remove it, smooth it, open it. "거슬리면 없애고 매끈하게 이어 붙이면?" | 8-20 s |
| 3. Problem | `problem`, then `imagine-extreme` | What goes wrong because of that, escalating (below). | 20-42 s |
| 4. Reason | `reason`, `ending` | Why it is built this way now, with the rule or number, and a line that sends the viewer back to the object at home or on the street. | 42-65 s+ |

## Step 3: real problems first, then one extreme picture

The user wants step 3 to go a little extreme (a bridge falling). The picture may exaggerate; the words may not. Three parts:

1. **Real problem** (`problem`): what happens, from the claim ledger. "여름엔 다리가 늘어나 밀어낼 곳이 없어집니다."
2. **Worse** (`problem`): the next documented stage, also from the ledger. "도로가 솟고 금이 갑니다."
3. **Extreme, imagined** (`imagine-extreme`): one shot that pushes it all the way (the miniature bridge collapsing), spoken as a **question**: "이대로 계속 버틴다면?" It asserts nothing, so it carries no number and no claim.

Then cut straight to step 4. The answer right after the most dramatic picture is the twist.

Rules (the shorts-motion checker enforces 1-3 on lines marked `"imagined": true`):

1. Mark every imagined line (steps 2 and 3-3) `"imagined": true`, but put **no badge or label text** on the picture (user, 2026-10-21: the "상상 장면" corner text was removed and must not come back). The words carry it: the "fixed" line asks ("거슬리면 없애고 이어 붙이면?"), the extreme line is a question, and the miniature style shows it is a model.
2. An imagined line shows no digits: no number may sit next to a picture that did not happen.
3. The extreme line is phrased as a question (ends with "?").
4. Every problem stated as fact (3-1, 3-2) is a ledger claim like any other line. If research cannot support a stage, drop that stage rather than soften the wording around it.
5. Check whether the "fixed" version exists for real before scripting step 3. Example: jointless (integral) bridges are built on purpose for short spans, so "no joint means collapse" would be false; the script must say what the source says (long bridges, this design) and leave the collapse to the imagined shot.
6. The extreme shot is a miniature, never photo-real, so nobody mistakes it for real footage. Keep it bloodless: for a child-safety topic show a ball through the railing gap, not a child.

## Tone: suggest, never command

The narration and the captions never give the viewer an order (user rule, 2026-10-21). The last line that sends the viewer back to the object is a suggestion or a question, not a command:

| Do not write | Write |
|---|---|
| 함 문에 붙은 사용법도, 미리 읽어 두시고요. | 함 문에 붙은 사용법도, 미리 읽어 보는 건 어떨까요? |
| 오늘 우리 층 소화전, 한번 찾아보세요. | 오늘 우리 층 소화전은 어디 있는지, 한번 찾아보면 좋겠습니다. |
| 다음 신호를 기다려 주세요. | 다음 신호를 기다리는 게 안전합니다. |

- Endings to avoid: -세요 (보세요, 주세요, 두세요, 마세요), -시고요, -십시오, -해라/-하라.
- Endings to use: -는 건 어떨까요?, -면 좋겠습니다, -는 게 안전합니다, -해 볼까요?
- Do not end two lines in a row with the same suggestion form ("어떨까요?" twice reads as a template).
- Keep one register: statements end in -ㅂ니다/-습니다, questions in -까요?. A casual "~죠" or "~거든요" among them makes the narrator voice drift lower and slower (hallway-hydrant l05, 2026-10-21).
- `motion.mjs check` (shorts-motion) warns about every line whose `say` or caption ends a sentence in a command, and every `say` with a casual ending. Rewrite it before recording.

## Which topics fit

- **Fits:** objects that seem removable, annoying or wasteful, whose removal breaks something: expansion joints, railing gaps, fire doors held open, toilet stall gaps, speed bumps.
- **Does not fit:** "what is this?" objects with no removal to imagine (aircraft warning lights, platform door numbers). Use the plain hook - explanation - twist order there.
- In `topic.md`, write the four steps in one line each before research; the questions research must answer then include "what really happens without it" (for steps 3-1 and 3-2) and "does a version without it exist" (rule 5).

## Thumbnail

The extreme picture often makes the strongest thumbnail (the falling bridge + "이 틈이 없으면?"). Phrase its text as a question; no "상상" badge.
