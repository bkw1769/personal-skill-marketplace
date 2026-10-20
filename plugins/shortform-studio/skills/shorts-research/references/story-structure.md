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
3. **Extreme, imagined** (`imagine-extreme`): one shot that pushes it all the way (the miniature bridge collapsing), marked on screen as imagined and spoken as a **question**: "이대로 계속 버틴다면?" It asserts nothing, so it carries no number and no claim.

Then cut straight to step 4. The answer right after the most dramatic picture is the twist.

Rules (the shorts-motion checker enforces 1-3 on lines marked `"imagined": true`):

1. Every imagined line (steps 2 and 3-3) carries a `stamp` overlay ("상상 장면" by default) for its whole length.
2. An imagined line shows no digits: no number may sit next to a picture that did not happen.
3. The extreme line is phrased as a question (ends with "?").
4. Every problem stated as fact (3-1, 3-2) is a ledger claim like any other line. If research cannot support a stage, drop that stage rather than soften the wording around it.
5. Check whether the "fixed" version exists for real before scripting step 3. Example: jointless (integral) bridges are built on purpose for short spans, so "no joint means collapse" would be false; the script must say what the source says (long bridges, this design) and leave the collapse to the imagined shot.
6. The extreme shot is a miniature, never photo-real, so nobody mistakes it for real footage. Keep it bloodless: for a child-safety topic show a ball through the railing gap, not a child.

## Which topics fit

- **Fits:** objects that seem removable, annoying or wasteful, whose removal breaks something: expansion joints, railing gaps, fire doors held open, toilet stall gaps, speed bumps.
- **Does not fit:** "what is this?" objects with no removal to imagine (aircraft warning lights, platform door numbers). Use the plain hook - explanation - twist order there.
- In `topic.md`, write the four steps in one line each before research; the questions research must answer then include "what really happens without it" (for steps 3-1 and 3-2) and "does a version without it exist" (rule 5).

## Thumbnail

The extreme picture often makes the strongest thumbnail (the falling bridge + "이 틈이 없으면?"). Keep the "상상" stamp on it too, and phrase its text as a question.
