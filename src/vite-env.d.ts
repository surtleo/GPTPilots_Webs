/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 FastAPI 오리진 (예: http://localhost:8000 또는 cloudflared 터널 URL). */
  readonly VITE_API_URL?: string
  /** 공유 토큰 — X-API-Token 헤더로 전송 (spec §13-3). */
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
