# 로컬 데모 런북

BidMate(프론트) + RFP RAG 백엔드를 **로컬에서** 띄워 대화형 데모를 실행하는 절차.
비용은 실제 답변 생성 질문당 약 **$0.002**(반문/clarify는 $0). 공개 호스팅 없음 — 전부 로컬.

> **NDA 경계.** 백엔드(RFP 원문·Chroma 인덱스)는 별도 프라이빗 레포에서 **로컬로만** 구동한다.
> RFP 원문·답변 원문을 이 레포나 외부 호스트에 올리지 않는다 (spec §13-3).

---

## 1. 구성 개요

```
[브라우저 :5173]  ──GET /rfps (공고 카드, 비용 0)──▶  [FastAPI :8000]  ──▶  meta.json 100건
                  ──POST /ask (X-API-Token)───────▶                  ──▶  RAG 엔진(로컬 모델·Chroma)
   bidmate-web (이 레포)                          GPTPilots_Project (별도 프라이빗 레포)
```

- **프론트**: 이 레포(`bidmate-web`), Node + Vite dev 서버(:5173).
- **백엔드**: 형제 디렉토리 `../GPTPilots_Project`, `uv` + uvicorn(:8000).

---

## 2. 사전조건

- **Node** 20+ 와 **npm** (프론트).
- **uv** (백엔드 파이썬 러너) — https://docs.astral.sh/uv/
- 백엔드 레포 `../GPTPilots_Project` 가 준비되어 있고, 그쪽 `.env` 에 `OPENAI_API_KEY` 가 설정돼 있을 것.
  (OpenAI 키는 **백엔드 서버 전용** — 프론트에 절대 넣지 않는다. spec §13-3.)
- 공유 토큰 하나를 정한다(예: `devtoken`). 백엔드·프론트가 **같은 값**을 써야 한다.

---

## 2-1. 한 번에 기동 (권장)

터미널 하나에서 프론트를 띄운다. **백엔드는 "떠 있으면 붙고, 없으면 편의상 같이 띄운다"** —
백엔드를 직접 켜고 끄고 있다면(`:8000` 점유) 런처는 건드리지 않고 프론트만 붙는다.
`Ctrl+C` 한 번으로 이 런처가 띄운 것만 정리된다.

```bash
cd bidmate-web
cp .env.example .env         # 최초 1회 — VITE_API_TOKEN 을 채운다
./scripts/dev.sh
```

런처가 하는 일:

- `.env` 존재·`VITE_API_TOKEN` 채움 확인, 백엔드 토큰과 **불일치하면 기동 전에 중단**(401 예방)
- `node_modules` 없으면 `npm install`
- 백엔드 기동 후 `/health` 200 까지 대기(최대 180초), 이어서 `GET /rfps` 로 **백엔드 버전 확인**
  (200이 아니면 구버전 경고 — 목록·상세가 404 가 된다)
- 프론트 dev 서버 기동 → http://localhost:5173
- `:8000` 이 이미 떠 있거나 백엔드 레포를 못 찾으면 **백엔드는 건너뛰고 프론트만** 붙인다

옵션:

```bash
./scripts/dev.sh --front-only        # 백엔드는 절대 건드리지 않음
./scripts/dev.sh --back-only         # 백엔드만
WEB_SHARED_TOKEN=mytoken ./scripts/dev.sh
BACKEND_DIR=/path/to/GPTPilots_Project FRONT_PORT=5174 ./scripts/dev.sh
```

아래 3·4절은 터미널을 나눠 개별 기동하거나 트러블슈팅할 때의 절차다.

---

## 3. 백엔드 기동 (터미널 A)

warmup(모델·Chroma 로딩)에 **60~90초** 걸린다. `/health` 가 `200` 이면 준비 완료.

### 방법 A — 래퍼 스크립트(권장)

```bash
cd bidmate-web
WEB_SHARED_TOKEN=devtoken ./scripts/dev-backend.sh
```

기본값: 백엔드 경로 `../GPTPilots_Project`, 포트 `8000`, CORS 오리진 `http://localhost:5173`.
경로가 다르면 `BACKEND_DIR=/path/to/GPTPilots_Project` 로 지정한다.

### 방법 B — 직접 실행

```bash
cd /path/to/GPTPilots_Project
WEB_SHARED_TOKEN=devtoken \
WEB_ALLOWED_ORIGINS=http://localhost:5173 \
uv run uvicorn src.api.server:app --port 8000
```

### 준비 확인(터미널 C 또는 새 창)

```bash
curl -s http://localhost:8000/health      # {"status":"ok"} 나오면 준비 완료
```

---

## 4. 프론트 기동 (터미널 B)

```bash
cd bidmate-web
cp .env.example .env         # 최초 1회
```

`.env` 를 열어 채운다(백엔드와 **같은 토큰**):

```
VITE_API_URL=http://localhost:8000
VITE_API_TOKEN=devtoken
```

이어서:

```bash
npm install                  # 최초 1회
npm run dev                  # http://localhost:5173
```

브라우저에서 **http://localhost:5173** 접속.

> `.env` 는 gitignore 대상 — 커밋되지 않는다. 값 변경 시 dev 서버를 재시작해야 반영된다.

---

## 5. 사용법

### 5-1. 화면 구조 (2026-07-28 사이드바 개편)

기존 마법사(온보딩→질문지→추천→상세→마이페이지) 구조를 버리고, **사이드바 + 자유
대화 + 문서 원문 패널** 3단 구조로 바뀌었다. 메인이 채팅형 자유 대화가 기본이고,
좌측 사이드바로 다른 기능을 전환한다.

| 경로               | 화면           | 데이터 출처                                                                                       |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------- |
| `/chat` (기본)     | 자유 대화      | **실데이터** — `POST /ask`. 활성 문서 있으면 그 문서 근거로 답변                                  |
| `/profile`         | 내 회사 프로필 | 로컬 저장(localStorage) + `POST /profile/infer`(분야·키워드 추론)                                 |
| `/recommendations` | 공고 추천      | **실데이터** — `POST /recommendations`(프로필 있을 때) 또는 `GET /rfps` 전체 열람(프로필 없을 때) |
| `/rfp/:doc_id`     | (레거시 링크)  | 그 공고를 활성 문서로 담고 `/chat`으로 리다이렉트                                                 |

옛 화면(`onboarding-page` `questionnaire-page` `rfp-detail-page` `my-page` `top-nav`)은
더 이상 라우트에서 쓰지 않지만 삭제하지 않고 파일로 남아있다.

### 5-2. 활성 문서 A·B·C — 담기·원문 보기·나란히 비교

사이드바·대화 상단·문서 패널, **어디서든 ＋** 를 누르면 공고 검색 모달이 뜬다.
문서를 고르면 화면 우측에 **원문 패널**(공고 markdown 원문, `GET /rfps/{doc_id}/content`)이
열린다. 최대 **3개**(A·B·C)까지 동시에 담을 수 있고, 2개 이상이면 문서 패널 상단
`⇹` 버튼으로 **나란히 비교**(열 분할)할 수 있다.

**대화는 활성 문서 중 첫 번째(A)만 근거로 삼는다** — 백엔드 `/ask`가 `doc_id`
하나만 받기 때문. B·C를 담아도 원문은 볼 수 있지만, "두 공고 차이가 뭐야?" 같은
비교 질문은 아직 A 문서 기준으로만 답한다(백엔드 확장 필요, 백엔드 README §13 참고).

### 5-3. 라우팅 3케이스 (백엔드 `/ask` 동작, 화면 무관하게 동일)

- **근거 기반 답변**: 질문에 **사업명을 포함**(또는 활성 문서가 있는 상태에서 질문)하면
  해당 문서를 근거(출처·인용)와 함께 답변.
  예) `"<사업명>의 주요 과업 내용 알려줘"`, `"<사업명>의 성능 요구사항은?"`
- **반문(clarify)**: 활성 문서 없이 사업명도 없이 일반적으로 물으면 문서를 특정하지
  못해 **후보 목록으로 되물음**. 예) `"성능 요구사항이 뭐야?"`
- **NO_EVIDENCE**: 특정 문서에서 근거가 없으면 "근거 없음" 고정 응답.
- **멀티턴 · 문서 전환**: 이어서 **다른 사업명**을 언급하면 활성 문서가 바뀌고 이전
  맥락은 절삭된다. 대화 상단 "활성 문서" 바에서 현재 문서를 확인.

답변 생성은 약 **~13초**(로딩 스켈레톤 표시). 답변 아래에 출처·토큰·비용이 표기된다.

### 5-4. 참가자격 매칭 (`/profile` · `/recommendations`)

1. `/profile`에서 회사 소개(자유서술)·보유 자격 체크리스트·주력 분야·3년 실적을 입력.
   입력 즉시 자동 저장(localStorage), 서버 저장은 없음.
2. `/recommendations`로 이동하면 프로필 텍스트로 `POST /recommendations`를 호출 —
   **실측 레이턴시 약 1분 20초**(15개 후보를 4건씩 배치로 LLM 참가자격 대조).
3. 결과 카드는 🟢적격(충족 근거 확인됨) · 🟢적격·근거 부족(반박은 없지만 확인된 것도
   없음, met=0) · 🟡확인필요(부족 항목 N건)로 구분해 표시. 🔴미달·확인불가는 목록에서
   제외된다.
4. 카드의 "이 공고로 대화하기"를 누르면 그 공고가 활성 문서로 담기며 `/chat`으로 이동.

---

## 6. 종료

- 터미널 A(백엔드)·B(프론트)에서 각각 `Ctrl+C`.
- 포트가 남아있으면:

```bash
lsof -tiTCP:8000 -sTCP:LISTEN | xargs -r kill    # 백엔드
lsof -tiTCP:5173 -sTCP:LISTEN | xargs -r kill    # 프론트
```

---

## 7. 트러블슈팅

| 증상                                                                                        | 원인                                             | 조치                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **공고 목록·상세가 404** ("존재하지 않는 공고" / "목록을 불러오지 못했습니다"). 채팅은 정상 | 백엔드가 구버전 — `/rfps` 없음 (PR #20 이전)     | 백엔드를 최신 main으로 갱신 후 재기동. 확인: `curl -s -o /dev/null -w '%{http_code}' -H "X-API-Token: devtoken" http://localhost:8000/rfps` 가 `200` 이어야 함        |
| `curl /health` 가 안 뜸 / 연결 거부                                                         | warmup 미완료                                    | 60~90초 대기 후 재시도. 터미널 A 로그의 `Application startup complete` 확인                                                                                           |
| 프론트에서 **401 인증 오류**                                                                | 토큰 불일치                                      | 백엔드 `WEB_SHARED_TOKEN` 과 프론트 `.env` 의 `VITE_API_TOKEN` 을 동일하게. `.env` 변경 후 dev 재시작                                                                 |
| **CORS** 차단(콘솔 에러)                                                                    | 오리진 불일치                                    | 백엔드 `WEB_ALLOWED_ORIGINS` 에 `http://localhost:5173` 포함 확인                                                                                                     |
| 포트 충돌(`address already in use`)                                                         | 8000/5173 사용 중                                | 위 6절 kill 명령으로 정리 후 재기동                                                                                                                                   |
| **429** 응답                                                                                | 요청 과다 · 세션 비용 상한                       | 잠시 후 재시도. 상한은 백엔드 설정값                                                                                                                                  |
| **503** 응답                                                                                | LLM 호출 실패                                    | 백엔드 `.env` 의 `OPENAI_API_KEY`·네트워크 확인                                                                                                                       |
| 프론트가 "VITE_API_URL 미설정"                                                              | `.env` 누락                                      | `cp .env.example .env` 후 값 채우고 dev 재시작                                                                                                                        |
| **원문 패널이 안 뜸** / 문서 담아도 오른쪽이 비어있음                                       | 백엔드가 구버전 — `/rfps/{id}/content` 없음      | 백엔드를 `/rfps/{doc_id}/content` 포함 버전으로 갱신. 확인: `curl -s -o /dev/null -w '%{http_code}' "http://localhost:8000/rfps/<doc_id>/content"` 가 `200` 이어야 함 |
| **추천 목록이 1~2분씩 안 끝남**                                                             | `/recommendations` 정상 소요시간(15건 배치 매칭) | 실측 ~1분 20초가 정상. 그보다 훨씬 오래 걸리면 백엔드 로그에 요청이 찍혔는지 먼저 확인(포워딩·터널 문제일 수 있음)                                                    |
