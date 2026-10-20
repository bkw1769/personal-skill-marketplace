# Topic scoring

Score each candidate 0-2 on five criteria (max 10). Make shorts from 7 and up; 5-6 only if the user wants it.

| Criterion | 0 | 1 | 2 |
|---|---|---|---|
| Everyday object | Distant or abstract | Known from news or travel | Viewers see or use it every day (apartment, bathroom, garage, subway, road) |
| Twist | No surprise | Mild "did you know" | A clear "X는 Y가 아닙니다" that flips a common belief |
| Number | None | Vague size | One concrete, surprising number for the title's second line |
| Primary source | Only blogs or news | Official or academic source likely | Already found a primary source with the number |
| Ending | Stops at the explanation | Has a limit or cost | Has a weakness, side effect or reversal that brings it back to the viewer's home |

Story fit (not scored, decides the script shape): can a viewer imagine removing or "fixing" the object, and does that break something research can show? Yes -> the four-step story in `story-structure.md`. No -> hook, explanation, twist.

Evidence from the reference channel (2026-10-19): everyday apartment and home topics drew 0.4-1M views (condensation mould 96만, bathroom vent 44만) while distant civil works mostly drew 5-15만.

## topic.md template

```markdown
# <object>

- Twist: <X는 Y가 아닙니다 one line>
- Title number candidate: <number and what it measures>
- Score: everyday 2, twist 2, number 1, source 1, ending 2 = 8
  - <one reason per criterion>
- Story (four steps, `story-structure.md`), or "plain" when it does not fit:
  1. Question: ...
  2. Fixed: ...
  3. Problem: <real> -> <worse> -> imagined extreme: ...
  4. Reason: ...
- Questions research must answer:
  1. ...
- Similar videos seen (titles only, do not reuse wording):
```
