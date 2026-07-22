# bidmate-web

BidMate 웹 인터페이스 — RFP 대화형 Q&A 프론트엔드 (Phase 8 A층).

백엔드 FastAPI `/ask` 파이프라인(별도 비공개 레포)을 래핑하는 별도 제품 표면.
NDA 경계상 RFP 원문·Chroma 인덱스·답변 원문은 이 레포/공개 호스트에 저장하지 않는다.

## 스택

- React 19 + Vite + TypeScript(strict)
- Tailwind CSS v4
- oxlint + Prettier

## 개발

```bash
npm install
cp .env.example .env   # 백엔드 URL·토큰 채우기
npm run dev            # 개발 서버
npm run build          # 타입체크 + 프로덕션 빌드
npm run lint           # oxlint
npm run format         # prettier --write
```

## 환경 변수

`.env.example` 참고. `VITE_API_URL`(백엔드 `/ask`), `VITE_API_TOKEN`(공유 토큰),
`VITE_FIREBASE_*`(메타데이터 한정 이력).
