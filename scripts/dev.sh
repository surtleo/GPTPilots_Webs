#!/usr/bin/env bash
#
# BidMate 로컬 데모 — 프론트(Vite :5173) 기동 런처.
# 백엔드(FastAPI :8000)는 "떠 있으면 붙고, 없으면 편의상 같이 띄운다".
# :8000 이 이미 물려 있거나 백엔드 레포를 못 찾으면 프론트만 띄우므로,
# 백엔드를 따로 켜고 끄는 워크플로우를 방해하지 않는다.
# 개별 기동·트러블슈팅 절차는 RUNBOOK.md 참고.
#
# 사용:
#   ./scripts/dev.sh                                   # 프론트 (+ 필요하면 백엔드)
#   ./scripts/dev.sh --front-only                      # 백엔드는 절대 건드리지 않음
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

# 따옴표·줄끝 주석까지 벗겨야 실제 값과 비교가 맞는다.
ENV_TOKEN="$(
  grep -E '^[[:space:]]*VITE_API_TOKEN=' "$ROOT_DIR/.env" | head -1 |
    cut -d= -f2- | sed -e 's/[[:space:]]*#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
      -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
)"
if [ -z "$ENV_TOKEN" ]; then
  die ".env 의 VITE_API_TOKEN 이 비어 있습니다 (백엔드 WEB_SHARED_TOKEN 과 같은 값이어야 함)."
fi
port_busy() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# 백엔드는 "이 런처가 켜는 것"이 아니라 "떠 있으면 붙는 것"에 가깝다.
# 이미 :PORT 가 물려 있거나(직접 켜둔 경우) 백엔드 레포가 없으면 프론트만 띄운다.
BACKEND_DIR="${BACKEND_DIR:-$(cd "$ROOT_DIR/.." && pwd)/GPTPilots_Project}"

if [ "$RUN_BACK" -eq 1 ] && port_busy "$PORT"; then
  log ":$PORT 이 이미 사용 중 — 백엔드는 직접 띄운 것으로 보고 건너뜁니다."
  RUN_BACK=0
elif [ "$RUN_BACK" -eq 1 ] && [ ! -d "$BACKEND_DIR" ]; then
  log "백엔드 레포가 없어 프론트만 띄웁니다: $BACKEND_DIR"
  log "  백엔드를 따로 띄우고 있다면 그대로 두면 되고, 여기서 같이 띄우려면"
  log "  BACKEND_DIR=/path/to/GPTPilots_Project ./scripts/dev.sh"
  RUN_BACK=0
fi

if [ "$RUN_BACK" -eq 1 ] && [ "$ENV_TOKEN" != "$TOKEN" ]; then
  die "토큰 불일치 — .env 의 VITE_API_TOKEN='$ENV_TOKEN' vs 백엔드 '$TOKEN'. 그대로 두면 401 이 납니다.
     해결: WEB_SHARED_TOKEN=$ENV_TOKEN ./scripts/dev.sh"
fi

if [ "$RUN_FRONT" -eq 1 ] && port_busy "$FRONT_PORT"; then
  die ":$FRONT_PORT 이 이미 사용 중입니다. 기존 dev 서버를 끄거나 FRONT_PORT 를 지정하세요."
fi

if [ "$RUN_BACK" -eq 0 ] && [ "$RUN_FRONT" -eq 0 ]; then
  log "띄울 게 없습니다 — 이미 다 떠 있거나 옵션이 서로 상쇄됐습니다."
  exit 0
fi

[ -d "$ROOT_DIR/node_modules" ] || {
  log "node_modules 가 없어 npm install 을 먼저 실행합니다."
  (cd "$ROOT_DIR" && npm install)
}

# --- 정리 훅 ---------------------------------------------------------------

BACK_PID=""
FRONT_PID=""
# npm run dev 는 서브셸 → npm → vite 로 이어져서, 최상위만 kill 하면 vite 가 :5173 을
# 물고 살아남는다. 자식부터 재귀로 내려가며 정리한다.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  trap - INT TERM EXIT
  log "종료 중..."
  [ -n "$FRONT_PID" ] && kill_tree "$FRONT_PID"
  [ -n "$BACK_PID" ] && kill_tree "$BACK_PID"
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# --- 백엔드 ----------------------------------------------------------------

if [ "$RUN_BACK" -eq 1 ]; then
  log "백엔드 기동 — warmup 에 60~90초 걸립니다."
  WEB_SHARED_TOKEN="$TOKEN" PORT="$PORT" BACKEND_DIR="$BACKEND_DIR" "$SCRIPT_DIR/dev-backend.sh" &
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

# `wait` 로 막으면 bash 가 트랩 실행을 그 자식이 끝날 때까지 미룬다 — Ctrl+C 가 먹지 않는다.
# 짧은 sleep 으로 폴링하면 최대 1초 안에 트랩이 돈다.
alive() { [ -n "$1" ] && kill -0 "$1" 2>/dev/null; }
while alive "$FRONT_PID" || alive "$BACK_PID"; do sleep 1; done
