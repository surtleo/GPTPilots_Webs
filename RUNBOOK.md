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

### 5-1. 화면 흐름

| 경로               | 화면       | 데이터 출처                                  |
| ------------------ | ---------- | -------------------------------------------- |
| `/recommendations` | 공고 목록  | **실데이터** — `GET /rfps` (100건, 마감일순) |
| `/rfp/:doc_id`     | 공고 상세  | **실데이터** — `GET /rfps/{doc_id}` + `/ask` |
| `/onboarding`      | 온보딩     | 목업 (추천 엔진 미구현)                      |
| `/questionnaire`   | 질문지     | 목업 (추천 엔진 미구현)                      |
| `/me`              | 마이페이지 | 목업 (대화 이력 저장 백엔드 미구현)          |

목록 상단 검색창은 **사업명·발주기관 부분일치**로 백엔드 `q` 파라미터를 태운다.
목록·상세 조회는 LLM을 타지 않아 **비용 0**이다. 비용이 드는 건 채팅(`/ask`)뿐.

**상세 화면에서는 해당 공고가 활성 문서로 고정**되므로, 사업명을 적지 않고
`"주요 과업 내용은?"` 만 물어도 반문 없이 그 문서 근거로 답한다.

### 5-2. 라우팅 3케이스

- **근거 기반 답변**: 질문에 **사업명을 포함**(또는 상세 화면에서 질문)하면 해당 문서를
  근거(출처·인용)와 함께 답변.
  예) `"<사업명>의 주요 과업 내용 알려줘"`, `"<사업명>의 성능 요구사항은?"`
- **반문(clarify)**: 상세 화면 밖에서 사업명 없이 일반적으로 물으면 문서를 특정하지 못해
  **후보 목록으로 되물음**. 예) `"성능 요구사항이 뭐야?"`
- **NO_EVIDENCE**: 특정 문서에서 근거가 없으면 "근거 없음" 고정 응답.
- **멀티턴 · 문서 전환**: 이어서 **다른 사업명**을 언급하면 활성 문서가 바뀌고 이전 맥락은 절삭된다.
  상단 "활성 문서" 바에서 현재 문서를 확인.

답변 생성은 약 **~13초**(로딩 스켈레톤 표시). 답변 아래에 출처·토큰·비용이 표기된다.

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

| 증상                                                                                        | 원인                                         | 조치                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **공고 목록·상세가 404** ("존재하지 않는 공고" / "목록을 불러오지 못했습니다"). 채팅은 정상 | 백엔드가 구버전 — `/rfps` 없음 (PR #20 이전) | 백엔드를 최신 main으로 갱신 후 재기동. 확인: `curl -s -o /dev/null -w '%{http_code}' -H "X-API-Token: devtoken" http://localhost:8000/rfps` 가 `200` 이어야 함 |
| `curl /health` 가 안 뜸 / 연결 거부                                                         | warmup 미완료                                | 60~90초 대기 후 재시도. 터미널 A 로그의 `Application startup complete` 확인                                                                                    |
| 프론트에서 **401 인증 오류**                                                                | 토큰 불일치                                  | 백엔드 `WEB_SHARED_TOKEN` 과 프론트 `.env` 의 `VITE_API_TOKEN` 을 동일하게. `.env` 변경 후 dev 재시작                                                          |
| **CORS** 차단(콘솔 에러)                                                                    | 오리진 불일치                                | 백엔드 `WEB_ALLOWED_ORIGINS` 에 `http://localhost:5173` 포함 확인                                                                                              |
| 포트 충돌(`address already in use`)                                                         | 8000/5173 사용 중                            | 위 6절 kill 명령으로 정리 후 재기동                                                                                                                            |
| **429** 응답                                                                                | 요청 과다 · 세션 비용 상한                   | 잠시 후 재시도. 상한은 백엔드 설정값                                                                                                                           |
| **503** 응답                                                                                | LLM 호출 실패                                | 백엔드 `.env` 의 `OPENAI_API_KEY`·네트워크 확인                                                                                                                |
| 프론트가 "VITE_API_URL 미설정"                                                              | `.env` 누락                                  | `cp .env.example .env` 후 값 채우고 dev 재시작                                                                                                                 |
