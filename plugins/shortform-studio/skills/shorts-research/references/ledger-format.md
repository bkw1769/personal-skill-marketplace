# Ledger format

Two JSON files in `src/shorts/episodes/<id>/research/`. `facts.mjs init` writes empty ones.

## sources.json (`shorts-sources/1`)

```json
{
  "schema": "shorts-sources/1",
  "sources": [
    {
      "id": "molit-defect-2025",
      "title": "공동주택 하자 판정 현황",
      "publisher": "국토교통부 하자심사분쟁조정위원회",
      "url": "https://www.molit.go.kr/...",
      "type": "official",
      "published": "2025-10",
      "accessed": "2026-10-19",
      "archive_url": "https://web.archive.org/web/2026.../https://www.molit.go.kr/...",
      "language": "ko",
      "notes": "Table 3 has the defect categories"
    }
  ]
}
```

| Field | Required | Rule |
|---|---|---|
| `id` | yes | lower-case letters, digits, hyphens; unique. Suggest `<publisher>-<topic>-<year>`. |
| `title`, `publisher` | yes | Publisher = the organisation responsible (ministry, agency, journal, newspaper), not the website host. |
| `url` | yes | http(s). For a PDF, the PDF itself. |
| `type` | yes | `law`, `official`, `standard`, `academic`, `company` (primary) or `news`, `encyclopedia`, `other` (secondary). |
| `accessed` | yes | YYYY-MM-DD, the day you read it. A future date warns. |
| `published` | no | YYYY, YYYY-MM or YYYY-MM-DD. |
| `archive_url` | warned if missing | A saved copy (web.archive.org "Save Page Now"). |
| `archive_failed` | no | When saving failed: when and how ("2026-10-19 web.archive.org HTTP 523"). Silences the missing-archive warning; must be non-empty text. |
| `in_force` | no | `law` and `standard` only: YYYY-MM-DD, the day you confirmed this text is still the version in force. A claim citing it counts as current from that year, so the stale `as_of` warning stops. Re-check before each publish. |
| `language`, `notes` | no | Free. |

A source that no claim cites is warned about: delete it or cite it.

## facts.json (`shorts-facts/1`)

```json
{
  "schema": "shorts-facts/1",
  "review": { "by": "ian", "on": "2026-10-20" },
  "claims": [
    {
      "id": "c-condensation-rank",
      "text": "공동주택 하자 판정에서 결로가 누수보다 약 두 배 많았다",
      "numbers": [{ "value": 2, "say": "두 배" }],
      "sources": [{ "id": "molit-defect-2025", "locator": "표 3", "excerpt": "결로 ... 누수 ..." }],
      "as_of": "2024",
      "status": "verified",
      "caveat": "판정 기준 연도에 따라 비율이 바뀜"
    }
  ]
}
```

| Field | Required | Rule |
|---|---|---|
| `id` | yes | Same id rule; suggest `c-<short-name>`. Unique. |
| `text` | yes | The statement as you would defend it. Every number in it must be listed in `numbers` (warning otherwise). |
| `numbers[]` | no | `value` (finite number, the real magnitude: 2.5e12 for 2조 5,000억), optional `say` (word form that appears in text or on screen, e.g. "두 배", "절반"), optional `unit`, `note`. Each value must appear in `text` (warning). |
| `sources[]` | yes unless `rejected` | `id` of a source, `locator` (warned if missing), `excerpt` (warned over 300 characters). When a claim has excerpts, each of its numbers (value, a date's year/month/day, or its `say` form) must occur in at least one of them (warning otherwise). |
| `as_of` | warned if missing when there are numbers | YYYY, YYYY-MM or YYYY-MM-DD: when the figure was true. Warned when older than `--max-age` years (default 3). |
| `historical` | no | `true` silences the age warning for figures that describe the past on purpose. For a rule that is still current, use `in_force` on its law or standard source instead. |
| `status` | yes | See below. |
| `caveat` | no | Limits a careful script should respect. |
| `review` (top level) | warned in trace if missing | `by` and `on` once a person has read the whole ledger. `init` does not write it. |

### Status

| Status | Meaning | Checker |
|---|---|---|
| `verified` | One primary source, or secondary sources from two different publishers (encyclopedias excluded). | Error if the sources do not meet that. |
| `single-source` | Only one secondary source so far. | Allowed on screen with a warning. |
| `disputed` | Sources disagree, or the figure depends on a definition we cannot pin down. | Error if used on screen. |
| `rejected` | Checked and false (often a popular myth). Kept so it is not re-researched. | Error if used on screen; may have no sources. |

## How trace reads numbers

`trace` collects every item a viewer reads: `captions`, `bubbles` and `overlays` in the storyboard (their `text` and `label`), both at the top level and inside each `scenes[]` entry (reported as `scene <id> caption <n>`), then the publish.json `title` (string or list of lines), `description` (string or list) and `hashtags` (string or list). For each item:

1. Phrases in the item's `not_facts` are blanked (warning if a phrase is not in the text, and warning if the phrase is itself a number of the item's claims: trace it instead of hiding it).
2. The `say` forms of the item's claims are blanked (they count as matched).
3. Remaining numbers are extracted and each must equal a `value` of one of the item's claims.

Recognised: digits with thousands commas and decimals; full-width digits (`１９９２`); a minus sign at the start of a word (`-9mm`, `(-5도)`, but `3-4호기` is 3 and 4); Korean units directly after digits (`3천`, `2,700만`, `2천억`, and groups such as `1만 5천`, `1천 2백` or `2조 5,000억` that add up); `할` after digits as tenths (`9할` = 90, compared with a percent value); full dates (`1992.10.26`, `1992. 10. 26`, `2026-10-06`, `2026/10/06`), which match when the year, month and day are each a number of the item's claims; native counts followed by a space and a counter (`두 배`, `세 번`, `열 개`, `스무 채`; ordinals like `세 번째` are skipped); `절반` = 0.5. Not recognised: Sino-Korean words (`이천칠백만`), `한` (one) and year-month pairs such as `2014.12` (read as a decimal) — write numbers on screen as digits, and dates in full or as `2014년 12월`. Messages show the number with its unit and without a trailing particle (`1978년에서` is shown as `1978년`).

Units are not compared: "76cm" matches a claim value 76 whatever its unit. Read units yourself.

Claims for the description and hashtags: every claim already used by the storyboard or title (except blocked ones), plus `publish.description_claims`. Title items use `publish.title_claims`. `publish.not_facts` applies to the title, description and hashtags; a phrase needs to occur in only one of them.

The `cite` source list is not part of `publish.description`. It is appended after the description when uploading, so its dates and article numbers are not traced.
