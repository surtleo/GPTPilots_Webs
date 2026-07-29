import { useCallback, useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'

import { ChatPanel } from '@/components/chat/chat-panel'
import { DocPicker } from '@/components/doc-picker'
import { NavSidebar } from '@/components/layout/nav-sidebar'
import { DocsPanel, type PanelTab } from '@/components/panel/docs-panel'
import { Viewer } from '@/components/viewer/viewer'
import { ActiveDocsProvider } from '@/lib/active-docs-context'
import { ChatFlowsProvider } from '@/lib/chat-flows'
import { ChatSessionsProvider } from '@/lib/chat-sessions-context'
import { ProfileProvider } from '@/lib/profile-context'
import { RecommendationsProvider } from '@/lib/recommendations-context'
import { useWorkspace, WorkspaceProvider } from '@/lib/workspace-context'

const NAV_KEY = 'bidmate.nav.open'
const PANEL_KEY = 'bidmate.panel.open'
const THEME_KEY = 'bidmate.theme'

/**
 * 앱 셸 — 내비 · 공고/파일 · 뷰어 · 채팅의 4열.
 *
 * 라우터를 두지 않는 이유: 이 앱에서 화면을 옮겨 다니는 개념이 없다. 공고 원문·비교표·
 * 프로필은 전부 가운데 뷰어에 탭으로 쌓이고, 채팅은 그동안 옆에 계속 떠 있다. URL로
 * 이동시키면 그때마다 대화가 끊기거나 어느 탭이 열려 있었는지를 잃는다.
 *
 * 뷰어에 열린 게 하나도 없으면 뷰어 열 자체를 없애고 채팅이 전체 폭을 쓴다 — 첫 화면에서
 * 빈 패널 두 개를 보여줄 이유가 없다.
 */
function Shell() {
  const [navOpen, setNavOpen] = useState(() => localStorage.getItem(NAV_KEY) !== 'false')
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem(PANEL_KEY) !== 'false')
  const [panelTab, setPanelTab] = useState<PanelTab>('reco')
  const [chatOpen, setChatOpen] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { tabs, open } = useWorkspace()

  useEffect(() => {
    localStorage.setItem(NAV_KEY, String(navOpen))
  }, [navOpen])

  useEffect(() => {
    localStorage.setItem(PANEL_KEY, String(panelOpen))
  }, [panelOpen])

  const viewerVisible = tabs.length > 0
  // 뷰어가 없으면 채팅은 접을 수 없다 — 접는 순간 화면에 아무것도 안 남는다.
  const chatVisible = !viewerVisible || chatOpen

  const openProfile = useCallback(() => open('profile'), [open])

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <NavSidebar
        open={navOpen}
        onToggle={() => setNavOpen((v) => !v)}
        onOpenProfile={openProfile}
        onToggleTheme={toggleTheme}
      />

      <DocsPanel
        open={panelOpen}
        tab={panelTab}
        onTabChange={setPanelTab}
        onToggle={() => setPanelOpen((v) => !v)}
        onBrowseAll={() => setPickerOpen(true)}
      />

      {viewerVisible && <Viewer />}

      {chatVisible ? (
        <ChatPanel
          wide={!viewerVisible}
          onCollapse={() => setChatOpen(false)}
          onOpenProfile={openProfile}
        />
      ) : (
        <aside className="flex w-11 shrink-0 flex-col items-center border-l border-border bg-card pt-2.5">
          <button
            onClick={() => setChatOpen(true)}
            title="채팅 펼치기"
            aria-label="채팅 펼치기"
            className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground transition-[filter] hover:brightness-[1.03]"
          >
            <MessageSquare className="size-4" />
          </button>
        </aside>
      )}

      <DocPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  )
}

function toggleTheme() {
  const root = document.documentElement
  const next = root.classList.contains('dark') ? 'light' : 'dark'
  root.classList.toggle('dark', next === 'dark')
  localStorage.setItem(THEME_KEY, next)
}

/** 저장된 테마(없으면 OS 설정)를 적용한다. */
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
        <ChatSessionsProvider>
          <RecommendationsProvider>
            <WorkspaceProvider>
              <ChatFlowsProvider>
                <Shell />
              </ChatFlowsProvider>
            </WorkspaceProvider>
          </RecommendationsProvider>
        </ChatSessionsProvider>
      </ActiveDocsProvider>
    </ProfileProvider>
  )
}

export default App
