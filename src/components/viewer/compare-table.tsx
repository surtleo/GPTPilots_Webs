import { useEffect, useMemo, useState } from 'react'
import { Table2, X } from 'lucide-react'

import { ApiError, fetchRfp, type RecommendationItem, type RfpCard } from '@/lib/api'
import { useActiveDocs } from '@/lib/active-docs-context'
import {
  deadlineBadge,
  formatAmount,
  formatDate,
  VERDICT_TONE_CLASS,
  verdictBadge,
} from '@/lib/format'
import { useRecommendationsCache } from '@/lib/recommendations-context'
import { docKey, useWorkspace } from '@/lib/workspace-context'
import { cn } from '@/lib/utils'

/**
 * 비교표 — 체크한 공고를 항목별로 나란히 놓는다.
 *
 * 항목은 백엔드가 실제로 주는 값(GET /rfps/{doc_id} 카드 + 추천 판정)만 쓴다. 입찰방식·
 * 배점처럼 계약에 없는 항목은 넣지 않는다 — 표는 비어 있어도 되지만 틀리면 안 된다.
 * "차이" 표시는 값이 실제로 갈릴 때만 붙는다.
 */
export function CompareTable() {
  const { docs } = useActiveDocs()
  const { items } = useRecommendationsCache()
  const { close, open } = useWorkspace()
  const [cards, setCards] = useState<Record<string, RfpCard>>({})
  const [error, setError] = useState<string | null>(null)

  const docIds = useMemo(() => docs.map((d) => d.doc_id), [docs])

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    Promise.all(
      docIds.map((id) =>
        fetchRfp(id, controller.signal).then(
          (card) => [id, card] as const,
          // 한 건이 실패해도 나머지는 보여준다 — 전부 못 그리는 것보다 낫다.
          () => null,
        ),
      ),
    )
      .then((pairs) => {
        if (controller.signal.aborted) return
        const next: Record<string, RfpCard> = {}
        for (const pair of pairs) if (pair) next[pair[0]] = pair[1]
        setCards(next)
        if (Object.keys(next).length < docIds.length) {
          setError('일부 공고 정보를 불러오지 못했습니다.')
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof ApiError ? err.message : '공고 정보를 불러오지 못했습니다.')
      })
    return () => controller.abort()
  }, [docIds])

  const recoOf = (docId: string): RecommendationItem | undefined =>
    items.find((r) => r.doc_id === docId)

  if (docs.length < 2) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          비교하려면 왼쪽에서 공고를 2건 이상 체크해주세요.
        </p>
      </div>
    )
  }

  // markDiff는 "값이 갈리는 게 판단에 의미 있는" 항목에만 켠다. 발주기관·마감·예산·공개일은
  // 공고마다 다른 게 당연해서 표시해봐야 노이즈고, 정작 봐야 할 참가자격의 차이가 묻힌다.
  const rows: CompareRow[] = [
    {
      label: '발주기관',
      markDiff: false,
      values: docs.map((d) => cards[d.doc_id]?.발주기관 ?? '—'),
    },
    {
      label: '마감',
      markDiff: false,
      values: docs.map((d) => {
        const iso = cards[d.doc_id]?.마감일 ?? null
        return `${formatDate(iso)} (${deadlineBadge(iso).label})`
      }),
    },
    {
      label: '사업예산',
      markDiff: false,
      values: docs.map((d) => formatAmount(cards[d.doc_id]?.금액 ?? null)),
    },
    {
      label: '공개일',
      markDiff: false,
      values: docs.map((d) => formatDate(cards[d.doc_id]?.공개일 ?? null)),
    },
    {
      label: '참가자격',
      markDiff: true,
      values: docs.map((d) => {
        const r = recoOf(d.doc_id)
        if (!r) return '판정 없음 (추천으로 담은 공고가 아니에요)'
        const lines = [
          ...r.met.map((m) => `✓ ${m.requirement}`),
          ...r.unmet.map((m) => `✕ ${m.requirement}`),
        ]
        if (r.unclear_count > 0) lines.push(`? 확인 못 한 요건 ${r.unclear_count}건`)
        return lines.length ? lines.join('\n') : '확인된 요건 없음'
      }),
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[46px] shrink-0 items-center gap-2 border-b border-border bg-card px-4.5 py-2">
        <Table2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[13px] font-semibold">비교표 — 공고 {docs.length}건</span>
        <span className="rounded bg-secondary px-1.5 text-[10.5px] text-muted-foreground">
          체크한 공고 기준
        </span>
        <button
          onClick={() => close('compare')}
          title="닫기"
          aria-label="닫기"
          className="ml-auto grid size-6.5 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-auto p-5.5">
        <div className="mx-auto max-w-[52rem] min-w-[560px] [word-break:keep-all]">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex border-b border-border bg-secondary">
              <div className="w-26 shrink-0 px-3.5 py-3" />
              {docs.map((d) => {
                const r = recoOf(d.doc_id)
                const badge = r ? verdictBadge(r.verdict, r.unclear_count, r.missing_count) : null
                const iso = cards[d.doc_id]?.마감일 ?? null
                return (
                  <div key={d.doc_id} className="min-w-0 flex-1 border-l border-border px-3.5 py-3">
                    <div className="flex items-center gap-1.5">
                      {badge && (
                        <span
                          className={cn(
                            'rounded px-1.5 text-[10.5px] font-bold',
                            VERDICT_TONE_CLASS[badge.tone],
                          )}
                        >
                          {badge.label}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {deadlineBadge(iso).label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug font-bold">
                      {d.사업명 ?? d.doc_id}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {cards[d.doc_id]?.발주기관 ?? '—'}
                    </p>
                  </div>
                )
              })}
            </div>

            {rows.map((row) => {
              const diff = row.markDiff && new Set(row.values).size > 1
              return (
                <div key={row.label} className="flex border-b border-border">
                  <div className="flex w-26 shrink-0 items-start gap-1.5 px-3.5 py-3 text-xs font-semibold text-muted-foreground">
                    {row.label}
                    {diff && (
                      <span className="rounded bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                        차이
                      </span>
                    )}
                  </div>
                  {row.values.map((text, i) => (
                    <div
                      key={docs[i].doc_id}
                      className={cn(
                        'min-w-0 flex-1 border-l border-border px-3.5 py-3',
                        diff && 'bg-accent',
                      )}
                    >
                      <span className="text-[12.5px] leading-relaxed whitespace-pre-line">
                        {text}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}

            <div className="flex">
              <div className="w-26 shrink-0" />
              {docs.map((d) => (
                <div key={d.doc_id} className="min-w-0 flex-1 border-l border-border px-3.5 py-2.5">
                  <button
                    onClick={() => open(docKey(d.doc_id))}
                    title={d.doc_id}
                    className="text-xs text-primary underline underline-offset-2 transition-opacity hover:opacity-80"
                  >
                    원문에서 확인
                  </button>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 px-0.5 text-[11.5px] text-muted-foreground">
            공고 카드와 참가자격 판정에서 뽑은 항목별 비교예요. 값이 갈리는 항목엔 표시가 붙습니다.
          </p>
          {error && <p className="mt-1.5 px-0.5 text-[11.5px] text-danger">{error}</p>}
        </div>
      </div>
    </div>
  )
}

interface CompareRow {
  label: string
  /** 값이 갈릴 때 "차이" 표시를 붙일 항목인지. 당연히 다른 항목(마감·예산 등)은 false. */
  markDiff: boolean
  values: string[]
}
