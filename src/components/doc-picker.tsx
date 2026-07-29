import { useDeferredValue, useEffect, useState } from 'react'
import { Check, Plus, Search, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { useActiveDocs, MAX_ACTIVE_DOCS } from '@/lib/active-docs-context'
import { useRfps } from '@/hooks/use-rfps'
import { formatAmount } from '@/lib/format'

/**
 * 활성 문서 담기 팝업 — 사이드바 ＋, 대화 상단 ＋, 문서 패널 ＋ 어디서 열어도 같은 화면.
 * 화면 중앙 모달로 띄우는 이유: 트리거가 세 군데라 각각에 앵커를 맞추면 위치 계산만
 * 늘고, 어디서 열든 같은 자리에 뜨는 편이 오히려 예측 가능하다.
 */
export function DocPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const { docs, add, has, isFull } = useActiveDocs()
  // 팝업이 닫혀 있을 땐 조회하지 않는다 — 빈 q를 넘겨 훅이 요청을 건너뛰게 한다.
  const { items, loading } = useRfps(open ? { q: deferred, limit: 30 } : { limit: 0 })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="활성 문서 담기"
        className="fixed top-[12vh] left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-border bg-popover p-3 shadow-2xl"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">활성 문서로 담을 공고</p>
          <span className="font-mono text-xs text-muted-foreground">
            {docs.length} / {MAX_ACTIVE_DOCS}
          </span>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative mb-2">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="사업명·발주기관으로 찾기"
            className="pl-9"
          />
        </div>

        {isFull && (
          <p className="mb-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning">
            {MAX_ACTIVE_DOCS}개까지 나란히 볼 수 있어요. 더 담으려면 하나를 비워주세요.
          </p>
        )}

        <div className="flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto">
          {loading && items.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">불러오는 중…</p>
          )}
          {!loading && items.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </p>
          )}
          {items.map((rfp) => {
            const already = has(rfp.doc_id)
            const disabled = already || isFull
            return (
              <button
                key={rfp.doc_id}
                disabled={disabled}
                onClick={() => {
                  if (add({ doc_id: rfp.doc_id, 사업명: rfp.사업명 })) onClose()
                }}
                className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2 text-left transition-colors enabled:hover:border-primary disabled:opacity-55"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">
                    {rfp.사업명 ?? rfp.doc_id}
                  </span>
                  <span className="block truncate font-mono text-[0.68rem] text-muted-foreground">
                    {rfp.발주기관 ?? '발주기관 미상'} · {formatAmount(rfp.금액)}
                  </span>
                </span>
                {already ? (
                  <Check className="size-4 shrink-0 text-success" />
                ) : (
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
