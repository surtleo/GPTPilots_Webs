import { Link } from 'react-router-dom'
import { ArrowRight, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TopNav } from '@/components/layout/top-nav'
import { MOCK_RFPS, type RfpSummary } from '@/lib/mock-data'

const FIT_TONE: Record<RfpSummary['fit'], string> = {
  상: 'text-success',
  중: 'text-warning',
  하: 'text-muted-foreground',
}

/** 화면 3 — 추천 결과 목록. 목업 데이터를 사용하며, 카드 클릭 시 화면 4(상세+채팅)로 이동. */
export function RecommendationsPage() {
  return (
    <div className="min-h-screen bg-secondary">
      <TopNav />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-heading text-h2 font-semibold tracking-tight">
            총 100건 중 <span className="text-primary underline underline-offset-4">18건</span>을
            추천합니다
          </h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              필터 ▾
            </Button>
            <Button variant="outline" size="sm">
              정렬: 적합도순 ▾
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {MOCK_RFPS.map((r) => (
            <RfpCard key={r.id} rfp={r} />
          ))}
        </div>
      </main>
    </div>
  )
}

function RfpCard({ rfp }: { rfp: RfpSummary }) {
  return (
    <Link
      to={`/rfp/${rfp.id}`}
      className="flex items-start gap-5 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="min-w-24 pt-0.5">
        <div className="flex gap-0.5 text-primary">
          {Array.from({ length: rfp.stars }).map((_, i) => (
            <Star key={i} className="size-4 fill-current" />
          ))}
        </div>
        <div className={`mt-1 font-mono text-xs font-medium ${FIT_TONE[rfp.fit]}`}>
          적합도 {rfp.fit}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-heading text-lg font-semibold">{rfp.title}</span>
          <Badge variant="outline">{rfp.dday}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {rfp.org} · {rfp.budget}
        </p>
        <p className="mt-2 text-sm text-foreground">{rfp.summary}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rfp.tags.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      </div>
      <span className="mt-1 flex shrink-0 items-center gap-1 self-center font-medium whitespace-nowrap text-muted-foreground">
        상세 <ArrowRight className="size-4" />
      </span>
    </Link>
  )
}
