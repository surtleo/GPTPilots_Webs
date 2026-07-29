import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // VSCode Remote-SSH 포트포워딩이 불안정해 cloudflared quick tunnel로 우회 —
    // 터널마다 랜덤 서브도메인이 발급되므로 도메인 전체를 허용(각 접속마다 값 안 바꿔도 됨).
    allowedHosts: ['.trycloudflare.com'],
  },
})
