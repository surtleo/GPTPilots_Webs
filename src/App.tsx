import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'

import { AppSidebar } from '@/components/layout/app-sidebar'
import { DocPicker } from '@/components/doc-picker'
import { ActiveDocsProvider, useActiveDocs } from '@/lib/active-docs-context'
import { ProfileProvider } from '@/lib/profile-context'
import { ChatPage } from '@/pages/chat-page'
import { RecommendationsPage } from '@/pages/recommendations-page'
import { ProfilePage } from '@/pages/profile-page'

const COLLAPSE_KEY = 'bidmate.sidebar.collapsed'
const THEME_KEY = 'bidmate.theme'

/**
 * 앱 셸 — 좌측 사이드바(기능 전환 + 활성 문서) + 우측 메인.
 * 라우트는 /chat(기본) · /profile · /recommendations 세 개이며,
 * 문서 원문 패널·비교 모드는 대화 화면 안에서 셸 상태로 제어한다.
 */
function Shell() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [docPanelOpen, setDocPanelOpen] = useState(true)
  const [compare, setCompare] = useState(false)
  const { docs } = useActiveDocs()
  const navigate = useNavigate()

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  // 문서가 2개 미만이면 비교 모드를 유지할 수 없다(열이 하나뿐이라 비교가 성립 안 함).
  useEffect(() => {
    if (docs.length < 2 && compare) setCompare(false)
  }, [docs.length, compare])

  // 문서를 새로 담으면 패널을 다시 연다 — 닫아둔 상태에서 담았는데 아무 반응이
  // 없으면 담긴 건지 알 수 없다.
  useEffect(() => {
    if (docs.length > 0) setDocPanelOpen(true)
  }, [docs.length])

  const goCompare = useCallback(() => {
    setCompare(true)
    setDocPanelOpen(true)
    navigate('/chat')
  }, [navigate])

  return (
    <div
      className="grid h-screen transition-[grid-template-columns] duration-200"
      style={{ gridTemplateColumns: collapsed ? '3.875rem 1fr' : '15.5rem 1fr' }}
    >
      <AppSidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onAddDoc={() => setPickerOpen(true)}
        onCompare={goCompare}
        onToggleTheme={toggleTheme}
      />

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route
            path="/chat"
            element={
              <ChatPage
                docPanelOpen={docPanelOpen}
                compare={compare}
                onToggleCompare={() => setCompare((v) => !v)}
                onCloseDocPanel={() => {
                  setDocPanelOpen(false)
                  setCompare(false)
                }}
                onAddDoc={() => setPickerOpen(true)}
              />
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          {/* 기존 상세 링크 호환 — 그 문서를 활성으로 담고 대화로 보낸다. */}
          <Route path="/rfp/:id" element={<LegacyRfpRedirect />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>

      <DocPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  )
}

/** `/rfp/:id` 로 들어오면 그 공고를 활성 문서로 담고 대화 화면으로 넘긴다. */
function LegacyRfpRedirect() {
  const { id } = useParams<{ id: string }>()
  const { add, has } = useActiveDocs()

  useEffect(() => {
    if (id && !has(id)) add({ doc_id: id, 사업명: null })
  }, [id, add, has])

  return <Navigate to="/chat" replace />
}

function toggleTheme() {
  const root = document.documentElement
  const next = root.classList.contains('dark') ? 'light' : 'dark'
  root.classList.toggle('dark', next === 'dark')
  localStorage.setItem(THEME_KEY, next)
}

/** 저장된 테마(없으면 OS 설정)를 첫 렌더 전에 적용한다. */
function useInitialTheme() {
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY)
    const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', dark)
  }, [])
}

function App() {
  useInitialTheme()
  return (
    <ProfileProvider>
      <ActiveDocsProvider>
        <Shell />
      </ActiveDocsProvider>
    </ProfileProvider>
  )
}

export default App
