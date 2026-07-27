import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, FileText, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TopNav } from '@/components/layout/top-nav'
import { useRfps, type LoadError } from '@/hooks/use-rfps'
import { deadlineBadge, formatAmount } from '@/lib/format'
import type { RfpCard } from '@/lib/api'

const PAGE_SIZE = 20

/**
 * 화면 3 — 공고 목록. 백엔드 GET /rfps의 실데이터(100건)를 마감일 최신순으로 보여준다.
 * 적합도·추천 사유는 추천 엔진이 아직 없어 표시하지 않는다 — 가짜 점수를 붙이지 않는다.
 */
export function RecommendationsPage() {
  const [query, setQuery] = useState('')
  // 타이핑마다 요청하지 않도록 지연값으로 조회 — 입력 반응성은 그대로 유지된다.
  const deferredQuery = useDeferredValue(query)
  const { items, total, loading, error, reload } = useRfps({
    q: deferredQuery,
    limit: PAGE_SIZE,
  })

  return (
    <div className="min-h-screen bg-secondary">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-heading text-h2 font-semibold tracking-tight">
            {loading && items.length === 0 ? (
              '공고를 불러오는 중…'
            ) : (
              <>
                공고 <span className="text-primary underline underline-offset-4">{total}건</span>
                {deferredQuery.trim() ? ' 검색됨' : ''}
              </>
            )}
          </h1>
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="사업명·발주기관 검색"
              aria-label="공고 검색"
              className="pl-9"
            />
          </div>
        </div>

        <p className="mb-5 text-sm text-muted-foreground">
          마감일 최신순으로 정렬됩니다. 적합도 추천은 준비 중이라 아직 표시하지 않습니다.
        </p>

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : items.length === 0 && !loading ? (
          <EmptyState query={deferredQuery} />
        ) : (
          <div className={`flex flex-col gap-4 ${loading ? 'opacity-60' : ''}`}>
            {loading && items.length === 0
              ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
              : items.map((rfp) => <RfpListCard key={rfp.doc_id} rfp={rfp} />)}
          </div>
        )}

        {total > items.length && !loading && !error && (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {total}건 중 {items.length}건 표시 — 검색어로 좁혀보세요
          </p>
        )}
      </main>
    </div>
  )
}

function RfpListCard({ rfp }: { rfp: RfpCard }) {
  const deadline = deadlineBadge(rfp.마감일)

  return (
    <Link
      to={`/rfp/${encodeURIComponent(rfp.doc_id)}`}
      className="flex items-start gap-5 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-heading text-lg font-semibold">{rfp.사업명 ?? rfp.doc_id}</span>
          <Badge variant={deadline.past ? 'secondary' : 'outline'}>{deadline.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {rfp.발주기관 ?? '발주기관 미상'} · {formatAmount(rfp.금액)} · 마감 {rfp.마감일 ?? '미상'}
        </p>
        {rfp.사업요약 && (
          <p className="mt-2 line-clamp-3 text-sm whitespace-pre-line text-foreground">
            {rfp.사업요약}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rfp.공고번호 && <Badge variant="secondary">공고 {rfp.공고번호}</Badge>}
          {rfp.파일형식 && <Badge variant="secondary">{rfp.파일형식.toUpperCase()}</Badge>}
        </div>
      </div>
      <span className="mt-1 flex shrink-0 items-center gap-1 self-center font-medium whitespace-nowrap text-muted-foreground">
        상세 <ArrowRight className="size-4" />
      </span>
    </Link>
  )
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
    </div>
  )
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <FileText className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 font-medium">
        {query.trim() ? `'${query.trim()}'에 해당하는 공고가 없습니다` : '표시할 공고가 없습니다'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        사업명이나 발주기관의 일부만 입력해도 검색됩니다.
      </p>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: LoadError; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertCircle className="mx-auto size-8 text-destructive" />
      <p className="mt-3 font-medium">공고 목록을 불러오지 못했습니다</p>
      <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        다시 시도
      </Button>
    </div>
  )
}
