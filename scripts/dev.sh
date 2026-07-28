#!/usr/bin/env bash
#
# BidMate 로컬 데모 — 한 번에 기동하는 런처.
# 백엔드(FastAPI :8000)와 프론트(Vite :5173)를 함께 띄우고, Ctrl+C 한 번으로 둘 다 정리한다.
# 개별 기동·트러블슈팅 절차는 RUNBOOK.md 참고.
#
# 사용:
#   ./scripts/dev.sh                                   # 백엔드 + 프론트
#   ./scripts/dev.sh --front-only                      # 프론트만 (백엔드는 이미 떠 있음)
#   ./scripts/dev.sh --back-only                       # 백엔드만
#   WEB_SHARED_TOKEN=mytoken ./scripts/dev.sh          # 토큰 지정 (프론트 .env 와 동일해야 함)
#   BACKEND_DIR=/path/to/GPTPilots_Project ./scripts/dev.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TOKEN="${WEB_SHARED_TOKEN:-devtoken}"
PORT="${PORT:-8000}"
FRONT_PORT="${FRONT_PORT:-5173}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"   # warmup(모델·Chroma 로딩)은 보통 60~90초

RUN_BACK=1
RUN_FRONT=1
for arg in "$@"; do
  case "$arg" in
    --front-only) RUN_BACK=0 ;;
    --back-only) RUN_FRONT=0 ;;
    -h | --help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "[dev] 알 수 없는 옵션: $arg (사용법은 --help)" >&2
      exit 1
      ;;
  esac
done

log() { echo "[dev] $*"; }
die() {
  echo "[dev] $*" >&2
  exit 1
}

# --- 사전 점검 -------------------------------------------------------------

[ -f "$ROOT_DIR/.env" ] || die ".env 가 없습니다. 'cp .env.example .env' 후 VITE_API_TOKEN 을 채우세요."

ENV_TOKEN="$(grep -E '^VITE_API_TOKEN=' "$ROOT_DIR/.env" | head -1 | cut -d= -f2- | tr -d '[:space:]')"
if [ -z "$ENV_TOKEN" ]; then
  die ".env 의 VITE_API_TOKEN 이 비어 있습니다 (백엔드 WEB_SHARED_TOKEN 과 같은 값이어야 함)."
fi
if [ "$RUN_BACK" -eq 1 ] && [ "$ENV_TOKEN" != "$TOKEN" ]; then
  die "토큰 불일치 — .env 의 VITE_API_TOKEN='$ENV_TOKEN' vs 백엔드 '$TOKEN'. 그대로 두면 401 이 납니다.
     해결: WEB_SHARED_TOKEN=$ENV_TOKEN ./scripts/dev.sh"
fi

port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

if [ "$RUN_BACK" -eq 1 ] && port_busy "$PORT"; then
  log ":$PORT 이 이미 사용 중 — 백엔드는 이미 떠 있는 것으로 보고 건너뜁니다."
  RUN_BACK=0
fi
if [ "$RUN_FRONT" -eq 1 ] && port_busy "$FRONT_PORT"; then
  die ":$FRONT_PORT 이 이미 사용 중입니다. 기존 dev 서버를 끄거나 FRONT_PORT 를 지정하세요."
fi

[ -d "$ROOT_DIR/node_modules" ] || {
  log "node_modules 가 없어 npm install 을 먼저 실행합니다."
  (cd "$ROOT_DIR" && npm install)
}

# --- 정리 훅 ---------------------------------------------------------------

BACK_PID=""
FRONT_PID=""
cleanup() {
  trap - INT TERM EXIT
  log "종료 중..."
  [ -n "$FRONT_PID" ] && kill "$FRONT_PID" 2>/dev/null || true
  [ -n "$BACK_PID" ] && kill "$BACK_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# --- 백엔드 ----------------------------------------------------------------

if [ "$RUN_BACK" -eq 1 ]; then
  log "백엔드 기동 — warmup 에 60~90초 걸립니다."
  WEB_SHARED_TOKEN="$TOKEN" PORT="$PORT" "$SCRIPT_DIR/dev-backend.sh" &
  BACK_PID=$!

  waited=0
  until curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; do
    kill -0 "$BACK_PID" 2>/dev/null || die "백엔드가 기동 중 종료됐습니다. 위 로그를 확인하세요."
    [ "$waited" -ge "$HEALTH_TIMEOUT" ] && die "백엔드 /health 가 ${HEALTH_TIMEOUT}초 안에 200을 주지 않았습니다."
    sleep 3
    waited=$((waited + 3))
  done
  log "백엔드 준비 완료 (/health 200, ${waited}초)"

  # 공고 목록 API 는 백엔드 PR #20 이후에만 존재한다. 없으면 목록·상세 화면이 404 가 된다.
  rfps_code="$(curl -s -o /dev/null -w '%{http_code}' -H "X-API-Token: $TOKEN" "http://localhost:$PORT/rfps" || true)"
  if [ "$rfps_code" = "200" ]; then
    log "GET /rfps 200 — 공고 목록·상세 실연동 가능"
  else
    log "경고: GET /rfps 가 $rfps_code — 백엔드가 구버전이면 목록·상세가 404 가 됩니다 (채팅은 정상)."
  fi
fi

# --- 프론트 ----------------------------------------------------------------

if [ "$RUN_FRONT" -eq 1 ]; then
  log "프론트 기동 — http://localhost:$FRONT_PORT"
  (cd "$ROOT_DIR" && npm run dev -- --port "$FRONT_PORT") &
  FRONT_PID=$!
fi

log "Ctrl+C 로 전부 종료합니다."
wait
