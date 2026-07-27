# CLAUDE.md

이 레포에서 작업하는 Claude Code(및 다른 에이전트)를 위한 안내.
**작업 시작 전 아래 "현재 상태 (인수인계)" 를 먼저 읽을 것** — 미해결 의존성이 있다.

## 프로젝트

`bidmate-web` — 입찰메이트(BidMate) RFP 분석 어시스턴트의 프론트엔드.
Vite + React 19 + TypeScript + Tailwind v4. 백엔드는 **별도 프라이빗 레포**
`surtleo/GPTPilots_Project` (FastAPI, 로컬 :8000 구동). 기동 절차는 `RUNBOOK.md`.

```bash
npm run dev          # :5173
npm run build        # tsc -b && vite build (타입체크 포함)
npm run lint         # oxlint
npm run format       # prettier --write .
```

---

## 현재 상태 (인수인계)

작성 시점 기준 브랜치 `feat/rfp-list-api` (base: `feature/wireframe-screens`).

### 화면별 연동 상태

| 경로               | 화면       | 상태                                          |
| ------------------ | ---------- | --------------------------------------------- |
| `/recommendations` | 공고 목록  | **실연동** `GET /rfps` — 100건·검색·마감일순  |
| `/rfp/:doc_id`     | 공고 상세  | **실연동** `GET /rfps/{doc_id}` + `POST /ask` |
| `/onboarding`      | 온보딩     | 목업 (`src/lib/mock-data.ts`)                 |
| `/questionnaire`   | 질문지     | 목업                                          |
| `/me`              | 마이페이지 | 목업                                          |

목록·상세는 브라우저에서 실데이터로 동작 확인 완료. 상세 화면은 해당 공고를
활성 문서로 고정하므로 사업명 없이 질문해도 반문 없이 근거 답변이 나온다.

### ✅ [해결됨] 백엔드 `/rfps` 머지 완료

프론트가 호출하는 `GET /rfps`·`GET /rfps/{doc_id}` 는 백엔드
`surtleo/GPTPilots_Project` **PR #20 (main `a9d917c`)** 로 머지됐다.
백엔드 main을 그대로 띄우면 동작한다 — 목록 100건·검색·상세·채팅 전부 브라우저 확인 완료.

**백엔드 요구 버전**: PR #20 이후. 그 이전으로 띄우면 목록·상세가 404가 된다(채팅은 정상).

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "X-API-Token: devtoken" http://localhost:8000/rfps
# 200 → 정상 / 404 → 백엔드가 구버전
```

### 🚧 [미해결] 이 레포에 push 권한이 없다 — 남은 유일한 블로커

`beomjinkim2000` 계정은 `surtleo/GPTPilots_Webs` 에 **pull만 가능**(`push: false`).
그래서 `feat/rfp-list-api` 브랜치를 push하지 못했고 PR도 못 올렸다 — 커밋은 로컬에만 있다.
소유자(`surtleo`)에게 write 권한을 받거나, fork 후 fork에서 PR을 올려야 한다.
(백엔드 레포는 push 권한이 있어 `feat/rfp-cards-api` 는 push까지 완료됐다.)

### 📋 [후속 1] `/rfps` 의 `q` 를 의미 검색으로 승격 — 백엔드 작업

현재 `q` 는 **문자열 부분일치**라 `"재난"` 은 찾지만 `"CCTV 영상분석 관련 사업"` 같은
자연어 질의는 0건이 된다. 백엔드 `src/api/cards.py` 의 `search_cards()` 에
`TODO(의미검색)` 주석으로 방법을 적어뒀다(기존 `_default_search_doc_cards` 재사용, 비용 0).
`/rfps` 계약은 안 바뀌므로 **프론트는 수정 불필요**.

### 📋 [후속 2] 추천 엔진 — 기준 미정, 착수 전 합의 필요

목업으로 남은 3화면(온보딩·질문지·마이페이지)이 여기 걸려 있다. 막힌 건 구현이 아니라
정의로, **"적합도 상/중/하"를 무엇으로 판정할지가 정해지지 않았다** (실적 도메인 매칭·
금액대·기관 유형 등). 기준을 합의한 뒤 착수할 것 — 임의 스코어링을 만들지 말 것.

이 때문에 공고 목록 카드에서 **별점·적합도·태그를 의도적으로 뺐다.** 실데이터 옆에
근거 없는 점수를 붙이면 사용자가 진짜 추천으로 오해한다. 추천 엔진이 생기기 전까지
되살리지 말 것.

---

## 규칙

- **`.env` 를 커밋하지 마라.** `VITE_API_TOKEN` 은 백엔드 `WEB_SHARED_TOKEN` 과 같은 값이어야
  한다(불일치 시 401). `.env.example` 만 추적된다.
- **OpenAI 키를 프론트에 넣지 마라** — 서버 전용이다 (spec §13-3). 이 레포는 **공개 저장소**다.
- **RFP 원문·사업명 등 NDA 데이터를 코드에 하드코딩하지 마라.** 전부 런타임에 로컬 백엔드에서만
  받아온다.
- 백엔드 응답의 한글 키(`사업명`·`발주기관`·`citations` 등)는 계약이다 — 임의로 영문화하지 말 것.
- `doc_id` 는 공백·슬래시를 포함할 수 있는 장문 한글 opaque id다. URL에 쓸 때 반드시
  `encodeURIComponent` 로 감쌀 것.
