import { useDeferredValue, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle2, CircleHelp, FileText, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRecommendations, useRfps, type LoadError } from '@/hooks/use-rfps'
import { deadlineBadge, formatAmount } from '@/lib/format'
import { useProfile } from '@/lib/profile-context'
import { useActiveDocs } from '@/lib/active-docs-context'
import type { RecommendationItem, RfpCard } from '@/lib/api'

const PAGE_SIZE = 20

/**
 * 화면 3 — 공고 목록.
 * 온보딩(화면1~2)을 거쳐 회사 프로필이 있으면 POST /recommendations로 🟢적격·🟡확인필요
 * 문서만 적합도 순으로 보여준다(ELIGIBILITY_MATCH_PLAN.md Phase 3). 프로필이 없으면(온보딩을
 * 건너뛰고 바로 들어온 경우) 예전처럼 GET /rfps 전체 열람+검색으로 폴백한다.
 * 적합도(fit_distance)는 실제 임베딩 유사도이지만 화면엔 숫자로 노출하지 않고 정렬에만
 * 쓴다 — 이 레포 CLAUDE.md의 "근거 없는 점수를 붙이지 마라" 경고를 존중.
 */
export function RecommendationsPage() {
  const { combinedText } = useProfile()
  const hasProfile = combinedText.trim().length > 0

  return hasProfile ? <RecommendedList profileText={combinedText} /> : <BrowseAllList />
}

function RecommendedList({ profileText }: { profileText: string }) {
  const { items, loading, error, reload } = useRecommendations(profileText)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <main className="mx-auto w-full max-w-4xl px-7 py-7 pb-16">
        <h1 className="font-heading text-h2 font-semibold tracking-tight">
          {loading ? '참가자격을 확인하는 중…' : `참가 가능한 공고 ${items.length}건`}
        </h1>
        <p className="mb-5 text-sm text-muted-foreground">
          작성하신 회사 프로필로 참가자격을 대조했습니다. 자격이 안 되는 공고는 목록에서
          제외됩니다.
        </p>

        {loading && (
          <div className="mb-5 rounded-md border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            문서별로 참가자격을 하나씩 대조하고 있어 1~2분 정도 걸릴 수 있어요.
          </div>
        )}

        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !loading && items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <FileText className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">참가 가능한 공고를 찾지 못했습니다</p>
            <p className="mt-1 text-sm text-muted-foreground">
              회사 소개를 더 구체적으로 적으면 더 정확해질 수 있어요.
            </p>
          </div>
        ) : (
          <div className={`flex flex-col gap-4 ${loading ? 'opacity-60' : ''}`}>
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
              : items.map((r) => <RecommendationCard key={r.doc_id} item={r} />)}
          </div>
        )}
      </main>
    </div>
  )
}

function RecommendationCard({ item }: { item: RecommendationItem }) {
  const { add, has, isFull } = useActiveDocs()
  const navigate = useNavigate()
  const already = has(item.doc_id)
  const addDoc = (d: { doc_id: string; 사업명: string | null; verdict?: string }) => add(d)
  const openInChat = (d: { doc_id: string; 사업명: string | null; verdict?: string }) => {
    add(d)
    navigate('/chat')
  }
  const deadline = deadlineBadge(item.마감일)
  const ok = item.verdict === '적격'
  // met=0인 적격은 "충족 확인됨"이 아니라 "반박하는 것도 없음"에 가깝다(2026-07-27 실측 —
  // 프로필에 자격·신고사항을 안 적으면 요건 대부분이 불명으로 빠져 이 케이스가 흔함).
  // 배지를 다르게 보여줘 회원님이 지적한 "왜 적격인지 모르겠다"를 정직하게 반영한다.
  const confirmed = ok && item.met.length > 0

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-heading text-lg font-semibold">
            {item.사업명 ?? item.doc_id}
          </span>
          {confirmed ? (
            <Badge variant="accent" className="gap-1">
              <CheckCircle2 className="size-3.5" /> 적격
            </Badge>
          ) : ok ? (
            <Badge variant="outline" className="gap-1">
              <CircleHelp className="size-3.5" /> 적격 · 근거 부족
            </Badge>
          ) : (
            <Badge variant="outline">확인필요 · {item.missing_count}/{item.total} 부족</Badge>
          )}
          <Badge variant={deadline.past ? 'secondary' : 'outline'}>{deadline.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.발주기관 ?? '발주기관 미상'} · {formatAmount(item.금액)} · 마감{' '}
          {item.마감일 ?? '미상'}
        </p>

        {item.chips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {item.chips.map((c) => (
              <Badge key={c} variant="secondary" className="text-xs">
                {c}
              </Badge>
            ))}
          </div>
        )}

        {/* 왜 적격/확인필요인지 근거 — met은 충족 확인된 것, unmet은 부족한 것.
            unclear_count는 "적격 = 다 확인됨"이 아니라 "명백히 걸리는 게 없음"에 가깝다는
            걸 드러낸다(ELIGIBILITY_MATCH_PLAN.md §3 신뢰도 캐벗). */}
        {(item.met.length > 0 || item.unmet.length > 0) && (
          <div className="mt-3 rounded-md border border-dashed border-border bg-muted/40 px-3.5 py-2.5">
            {item.met.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground">확인된 충족 요건</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {item.met.map((m) => (
                    <li key={m.requirement} className="text-xs text-foreground">
                      ✓ {m.requirement}
                      {m.reason && <span className="text-muted-foreground"> — {m.reason}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {item.unmet.length > 0 && (
              <>
                <p className="mt-2 text-xs font-medium text-muted-foreground">부족한 항목</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {item.unmet.map((u) => (
                    <li key={u.requirement} className="text-xs text-foreground">
                      · {u.requirement}
                      {u.reason && <span className="text-muted-foreground"> — {u.reason}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {item.unclear_count > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                프로필에 언급이 없어 확인 못 한 항목 {item.unclear_count}건 (참가자격상
                문제로 세지는 않았어요)
              </p>
            )}
          </div>
        )}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <button
            onClick={() => openInChat({ doc_id: item.doc_id, 사업명: item.사업명, verdict: item.verdict })}
            className="flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
          >
            이 공고로 대화하기 <ArrowRight className="size-3.5" />
          </button>
          <button
            onClick={() => addDoc({ doc_id: item.doc_id, 사업명: item.사업명, verdict: item.verdict })}
            disabled={already || isFull}
            className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-50"
          >
            {already ? '활성 문서에 담김' : '＋ 활성 문서로 담기'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 온보딩을 건너뛴 경우의 폴백 — 예전 화면3 그대로(GET /rfps 전체 열람+검색). */
function BrowseAllList() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { items, total, loading, error, reload } = useRfps({
    q: deferredQuery,
    limit: PAGE_SIZE,
  })

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <main className="mx-auto w-full max-w-4xl px-7 py-7 pb-16">
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
          <Link to="/onboarding" className="underline underline-offset-2">
            회사 소개를 작성
          </Link>
          하면 참가자격이 되는 공고만 골라 보여드려요. 지금은 전체 목록입니다.
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
