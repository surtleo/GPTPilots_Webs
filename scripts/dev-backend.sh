#!/usr/bin/env bash
#
# BidMate 로컬 데모 — 백엔드(FastAPI POST /ask) 기동 래퍼.
# 프론트엔드는 별도 터미널에서 `npm run dev`로 띄운다. 전체 절차는 RUNBOOK.md 참고.
#
# 사용:
#   ./scripts/dev-backend.sh
#   WEB_SHARED_TOKEN=mytoken ./scripts/dev-backend.sh          # 토큰 지정
#   BACKEND_DIR=/path/to/GPTPilots_Project ./scripts/dev-backend.sh   # 백엔드 경로 override
#
# 주의: 여기서 쓰는 토큰은 프론트 .env 의 VITE_API_TOKEN 과 반드시 동일해야 한다(불일치 시 401).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 기본값: bidmate-web 과 형제 디렉토리인 GPTPilots_Project (별도 프라이빗 레포).
# 위치가 다르면 BACKEND_DIR 환경변수로 지정한다.
BACKEND_DIR="${BACKEND_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)/GPTPilots_Project}"
TOKEN="${WEB_SHARED_TOKEN:-devtoken}"
PORT="${PORT:-8000}"
ORIGIN="${WEB_ALLOWED_ORIGINS:-http://localhost:5173}"

if [ ! -d "$BACKEND_DIR" ]; then
  echo "[dev-backend] 백엔드 디렉토리를 찾을 수 없습니다: $BACKEND_DIR" >&2
  echo "[dev-backend] BACKEND_DIR=/path/to/GPTPilots_Project 로 지정하세요." >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "[dev-backend] 'uv' 가 설치되어 있지 않습니다. https://docs.astral.sh/uv/ 참고." >&2
  exit 1
fi

echo "[dev-backend] backend : $BACKEND_DIR"
echo "[dev-backend] listen  : http://localhost:$PORT   (CORS origin: $ORIGIN)"
echo "[dev-backend] token   : $TOKEN   (프론트 .env 의 VITE_API_TOKEN 과 동일해야 함)"
echo "[dev-backend] warmup(모델·Chroma 로딩)에 약 60~90초 소요 — /health 가 200이면 준비 완료."

cd "$BACKEND_DIR"
exec env \
  WEB_SHARED_TOKEN="$TOKEN" \
  WEB_ALLOWED_ORIGINS="$ORIGIN" \
  uv run uvicorn src.api.server:app --port "$PORT"
