import { useEffect, useState } from 'react'
import { Columns2, Plus, X } from 'lucide-react'

import { ApiError, fetchRfpContent } from '@/lib/api'
import { useActiveDocs, SLOT_KEYS, type ActiveDoc } from '@/lib/active-docs-context'
import { cn } from '@/lib/utils'

/**
 * 오른쪽 문서 원문 패널 — 활성 문서의 공고 원문을 그대로 보여준다.
 * 단일 모드: 탭으로 문서 전환. 비교 모드: 활성 문서를 열로 나란히.
 * 원문은 GET /rfps/{doc_id}/content (마스킹본, LLM 미경유)에서 받는다.
 */
export function DocPanel({
  compare,
  onToggleCompare,
  onClose,
  onAdd,
}: {
  compare: boolean
  onToggleCompare: () => void
  onClose: () => void
  onAdd: () => void
}) {
  const { docs, remove, isFull } = useActiveDocs()
  const [activeTab, setActiveTab] = useState(0)

  // 문서를 비우면 탭 인덱스가 범위를 벗어날 수 있다 — 항상 유효한 범위로 되돌린다.
  useEffect(() => {
    if (activeTab > docs.length - 1) setActiveTab(Math.max(0, docs.length - 1))
  }, [docs.length, activeTab])

  if (docs.length === 0) return null

  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-l border-border bg-card">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border p-2">
        {docs.map((doc, i) => (
          <button
            key={doc.doc_id}
            onClick={() => setActiveTab(i)}
            aria-selected={!compare && activeTab === i}
            title={doc.사업명 ?? doc.doc_id}
            className={cn(
              'flex max-w-[13rem] items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary',
              !compare &&
                activeTab === i &&
                'border-border bg-secondary font-semibold text-foreground',
            )}
          >
            <SlotKey k={SLOT_KEYS[i]} />
            <span className="truncate">{doc.사업명 ?? doc.doc_id}</span>
            <span
              role="button"
              tabIndex={-1}
              aria-label={`${SLOT_KEYS[i]} 비우기`}
              onClick={(e) => {
                e.stopPropagation()
                remove(doc.doc_id)
              }}
              className="grid shrink-0 place-items-center text-muted-foreground hover:text-danger"
            >
              <X className="size-3.5" />
            </span>
          </button>
        ))}
        <div className="ml-auto flex shrink-0 gap-1">
          <ToolButton onClick={onAdd} title="문서 담기" disabled={isFull}>
            <Plus className="size-3.5" />
          </ToolButton>
          <ToolButton
            onClick={onToggleCompare}
            title="나란히 비교"
            pressed={compare}
            disabled={docs.length < 2}
          >
            <Columns2 className="size-3.5" />
          </ToolButton>
          <ToolButton onClick={onClose} title="문서 패널 닫기">
            <X className="size-3.5" />
          </ToolButton>
        </div>
      </div>

      {compare ? (
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateColumns: `repeat(${docs.length}, minmax(0, 1fr))` }}
        >
          {docs.map((doc, i) => (
            <div
              key={doc.doc_id}
              className="flex min-h-0 min-w-0 flex-col border-r border-border last:border-r-0"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-accent px-3 py-2 text-xs text-accent-foreground">
                <SlotKey k={SLOT_KEYS[i]} />
                <span className="truncate font-medium">{doc.사업명 ?? doc.doc_id}</span>
              </div>
              <DocBody docId={doc.doc_id} />
            </div>
          ))}
        </div>
      ) : (
        <DocBody
          docId={docs[Math.min(activeTab, docs.length - 1)].doc_id}
          withMeta={docs[Math.min(activeTab, docs.length - 1)]}
        />
      )}
    </aside>
  )
}

function ToolButton({
  children,
  title,
  onClick,
  pressed,
  disabled,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        'grid size-[26px] place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-40',
        pressed && 'border-primary bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SlotKey({ k }: { k: string }) {
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded bg-primary font-mono text-[0.6rem] font-bold text-primary-foreground">
      {k}
    </span>
  )
}

/** 원문 본문 — doc_id가 바뀌면 새로 받아온다. 원문은 캐시하지 않는다(문서당 수만 자). */
function DocBody({ docId, withMeta }: { docId: string; withMeta?: ActiveDoc }) {
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setMarkdown(null)
    setError(null)
    fetchRfpContent(docId, controller.signal)
      .then((res) => setMarkdown(res.markdown))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof ApiError ? err.message : '원문을 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [docId])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {withMeta && (
        <div className="shrink-0 border-b border-border bg-secondary px-4 py-2.5">
          <p className="font-heading text-sm font-semibold">{withMeta.사업명 ?? withMeta.doc_id}</p>
          <p className="mt-0.5 truncate font-mono text-[0.68rem] text-muted-foreground">
            {withMeta.doc_id}
          </p>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error && <p className="text-xs text-danger">{error}</p>}
        {!markdown && !error && (
          <div className="space-y-2">
            <div className="h-3 w-11/12 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
          </div>
        )}
        {markdown && (
          // 원문은 hwp 추출 결과라 마크다운 표·기호가 섞여 있다. 렌더링해서 예쁘게
          // 바꾸지 않고 원문 그대로 보여주는 게 이 화면의 목적이라 pre로 낸다.
          <pre className="font-sans text-[0.72rem] leading-relaxed whitespace-pre-wrap text-foreground">
            {markdown}
          </pre>
        )}
      </div>
    </div>
  )
}
