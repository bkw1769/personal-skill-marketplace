# assets — 공통 자산 창고

동화마다 다시 쓰는 그림, 배경, 소품, 음악, 효과음, 악기 샘플을 한곳에 모으고 라벨을 붙여 둔다. 새 작업은 여기서 먼저 찾고, 없을 때만 새로 만들거나 내려받는다.

## 찾기

```bash
npm run assets:find -- --kind sfx --tag mood:playful
```

```bash
npm run assets:find -- --tag era:ancient-greece --kind background
```

```bash
npm run assets:find -- --text 파도 --json
```

전체 목록은 `catalog/INDEX.md`(사람용 표, build 후 생성)와 `catalog/index.json`(도구용, 라이선스 포함)이다. 둘 다 자동 생성 파일이라 직접 고치지 않는다.

## 폴더 규칙

```text
assets/
├── catalog/          taxonomy.json(라벨 사전) · sources.json(출처·라이선스 대장) · index.json/INDEX.md(자동 생성)
├── licenses/         CREDITS.md(자동 생성: 출처 표기가 필요한 자산 목록)
├── _vendor/          내려받은 원본 묶음 그대로 (Git 제외, 직접 쓰지 않음)
├── art/
│   ├── style-refs/<style>/              그림체 참고 이미지 (예: watercolor-ink)
│   ├── characters/<story>/<set>/        작품별 캐릭터 시트 + prompts.json
│   │   └── sprites/                     시트에서 잘라낸 투명 PNG
│   ├── backgrounds/<era>/               배경 (ancient-greece, medieval-europe, any …)
│   ├── props/<era>/                     소품·효과 (배, 천막, 구름, 종이 질감 …)
│   └── <kind>/procedural/               코드로 그리는 원본 함수 (파일 없음, impl 경로만)
└── audio/
    ├── music/<category>/                배경음악
    ├── jingles/<category>/              10초 미만 짧은 음악
    ├── sfx/<category>/                  효과음 (cartoon, nature, animal, crowd, foley …)
    ├── ambience/<category>/             반복 재생용 배경 소리
    ├── instruments/<instrument>/        악기 샘플 (VCSL 등)
    └── <kind>/procedural/               Web Audio로 합성하는 소리 (impl 경로만)
```

- 종류(kind) 폴더 바로 아래 첫 단계는 가장 많이 고르는 기준이다: 효과음은 분류, 배경·소품은 시대, 캐릭터는 작품, 악기는 악기 이름.
- 파일 이름은 소문자 kebab-case (`city-wall-front.png`, `boing-01.wav`).
- 파일이 있는 폴더마다 `manifest.json`이 하나 있다. 라벨은 전부 여기에 적는다.

## 라벨 (manifest.json)

```json
{
  "schema": "fairytale-asset-manifest/1",
  "defaults": { "kind": "sfx", "category": "cartoon", "status": "candidate", "scope": "shared", "source": "kenney-audio", "tags": ["style:cartoon"] },
  "items": [
    { "id": "sfx.cartoon.boing-01", "title": "Boing (spring)", "file": "boing-01.wav", "tags": ["mood:playful", "use:comedy-beat"], "origin_url": "https://..." }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `id` | `<kind>.<category>.<slug>`, 전체에서 유일. 다른 문서·코드에서 이 ID로 부른다. |
| `kind`, `category` | `catalog/taxonomy.json`에 있는 값만. |
| `tags` | `facet:value` 형식. `mood`, `era`, `style`, `use`, `tempo`, `loop`는 정해진 값만. `story`, `character`, `instrument`는 kebab-case 자유값. |
| `status` | `candidate`(등록만 함) → 사람이 보고 들은 뒤 `approved`. `reference-only`는 결과물에 넣지 않음. `rejected`는 기록만. |
| `scope` | `shared`(어느 작품에나) 또는 `story`(그 작품 전용, `story:` 태그 필수). |
| `source` | `catalog/sources.json`의 id. 라이선스는 출처에서 자동으로 합쳐진다. 소리마다 라이선스가 다른 출처(Freesound 등)는 항목에 `license`, `attribution`, `origin_url`을 직접 적는다. |
| `file` 또는 `impl` | 둘 중 하나만. `impl`은 `경로#심볼` (예: `prototypes/troy-video/js/audio.js#Synth.boing`). |
| `sha256`, `bytes`, `duration_s` | `npm run assets:fill`이 채운다. 파일을 바꾸면 검증이 실패하므로 다시 fill 한다. |

라벨 값을 새로 쓰고 싶으면 `taxonomy.json`에 먼저 추가한다. 검증기가 사전에 없는 값을 거부한다.

## 새 자산 추가 순서

1. 출처가 `sources.json`에 있는지 확인한다. 없으면 라이선스를 확인해 추가한다. `policy: blocked` 출처는 쓰지 않는다.
2. 내려받은 원본은 `_vendor/<source-id>/<pack>/`에 그대로 둔다.
3. 쓸 파일만 골라 알맞은 폴더에 kebab-case 이름으로 복사하고 `manifest.json`에 항목을 추가한다.
4. 아래 순서로 실행한다.

```bash
npm run assets:fill
```

```bash
npm run assets:build
```

5. 사람이 확인한 항목만 `status`를 `approved`로 바꾸고 다시 build 한다.

## 라이선스 원칙

- 상업 이용 가능 여부가 아직 정해지지 않았으므로(FT-001) 상업 이용 가능한 출처만 승인한다. 비상업(NC) 라이선스는 검증기가 승인을 막는다.
- 출처 표기가 필요한 자산은 `licenses/CREDITS.md`에 자동으로 모인다. 작품을 공개할 때 쓴 자산의 줄을 엔딩 크레딧에 옮긴다.
- `redistribute_ok: false`인 자산(Sonniss, Pixabay 등)은 공개 저장소에 올리지 않는다. 확인: `npm run assets:find -- --json`에서 `redistribute_ok`를 본다.
