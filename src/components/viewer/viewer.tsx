import { FileText, X } from 'lucide-react'

import { useActiveDocs } from '@/lib/active-docs-context'
import { parseKey, useWorkspace, type ViewerKey } from '@/lib/workspace-context'
import { CompareTable } from '@/components/viewer/compare-table'
import { DocViewer } from '@/components/viewer/doc-viewer'
import { GeneratedDoc } from '@/components/viewer/generated-doc'
import { ProfileView } from '@/components/viewer/profile-view'
import { cn } from '@/lib/utils'

/**
 * 가운데 뷰어 — 열린 것들을 탭으로 쌓고 활성 탭 하나를 그린다.
 * 아무 탭도 없으면 이 컴포넌트 자체가 렌더되지 않고(App에서 판단) 채팅이 전체 폭을 쓴다.
 */
export function Viewer() {
  const { tabs, active, close } = useWorkspace()

  return (
    <main className="flex min-h-0 min-w-[280px] flex-1 flex-col overflow-hidden bg-secondary">
      <div className="no-scrollbar flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border bg-card px-2.5 pt-1.5">
        {tabs.map((key) => (
          <Tab key={key} tabKey={key} active={key === active} onClose={() => close(key)} />
        ))}
      </div>
      {active && <Body tabKey={active} />}
    </main>
  )
}

function Tab({
  tabKey,
  active,
  onClose,
}: {
  tabKey: ViewerKey
  active: boolean
  onClose: () => void
}) {
  const { open } = useWorkspace()
  const label = useTabLabel(tabKey)

  return (
    <div
      className={cn(
        '-mb-px flex max-w-[13rem] shrink-0 items-center gap-1.5 rounded-t-lg border border-border px-2.5 pt-[7px] pb-2',
        active
          ? 'border-b-secondary bg-secondary font-semibold text-foreground'
          : 'text-muted-foreground',
      )}
    >
      <button
        onClick={() => open(tabKey)}
        title={label}
        className="flex min-w-0 items-center gap-1.5 text-xs font-[inherit] text-[inherit]"
      >
        <FileText className="size-3 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </button>
      <button
        onClick={onClose}
        aria-label="탭 닫기"
        className="grid size-4 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
      >
        <X className="size-2.5" />
      </button>
    </div>
  )
}

function useTabLabel(key: ViewerKey): string {
  const { files } = useWorkspace()
  const { docs } = useActiveDocs()
  const parsed = parseKey(key)

  if (parsed.kind === 'compare') return '비교표'
  if (parsed.kind === 'profile') return '내 회사 프로필'
  if (parsed.kind === 'gen') return files.find((f) => f.id === parsed.fileId)?.title ?? '문서'
  return docs.find((d) => d.doc_id === parsed.docId)?.사업명 ?? parsed.docId
}

function Body({ tabKey }: { tabKey: ViewerKey }) {
  const parsed = parseKey(tabKey)
  // key를 붙여 탭을 갈아탈 때 이전 문서의 스크롤·로딩 상태가 새 문서로 새지 않게 한다.
  if (parsed.kind === 'doc') return <DocViewer key={tabKey} docId={parsed.docId} />
  if (parsed.kind === 'compare') return <CompareTable />
  if (parsed.kind === 'gen') return <GeneratedDoc key={tabKey} fileId={parsed.fileId} />
  return <ProfileView />
}
