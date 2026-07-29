import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, FileText, X } from 'lucide-react'

import { ApiError, fetchRfpContent, type RecommendationItem } from '@/lib/api'
import { useRfp } from '@/hooks/use-rfps'
import {
  deadlineBadge,
  formatAmount,
  formatDate,
  VERDICT_TONE_CLASS,
  verdictBadge,
} from '@/lib/format'
import { useRecommendationsCache } from '@/lib/recommendations-context'
import { useWorkspace } from '@/lib/workspace-context'
import { cn } from '@/lib/utils'

/**
 * 공고 원문 뷰어 — 메타 요약 · 참가자격 판정 · 원문 전문.
 *
 * 원문을 기본으로 접어두는 이유: hwp 추출본이라 문서 하나가 수만 자다. 열자마자 원문이
 * 쏟아지면 정작 필요한 마감·예산·자격 판정이 화면 밖으로 밀린다. 다만 인용 각주를 눌러
 * 들어온 경우엔 원문을 펼친 채로 열고 그 대목까지 스크롤한다.
 */
export function DocViewer({ docId }: { docId: string }) {
  const { card, loading } = useRfp(docId)
  const { items } = useRecommendationsCache()
  const { cite, close } = useWorkspace()
  const reco = useMemo(() => items.find((r) => r.doc_id === docId) ?? null, [items, docId])

  const citeForThisDoc = cite?.docId === docId ? cite : null
  const [fullOpen, setFullOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLSpanElement>(null)

  // 인용으로 들어오면 원문을 펼친다. nonce를 의존성에 넣어 같은 인용을 다시 눌러도 반응한다.
  useEffect(() => {
    if (citeForThisDoc?.quote) setFullOpen(true)
  }, [citeForThisDoc?.quote, citeForThisDoc?.nonce])

  const badge = reco ? verdictBadge(reco.verdict, reco.unclear_count, reco.missing_count) : null
  const due = deadlineBadge(card?.마감일 ?? null)
  const title = card?.사업명 ?? docId

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[46px] shrink-0 items-center gap-2 border-b border-border bg-card px-4.5 py-2">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span title={docId} className="min-w-0 truncate text-[13px] font-semibold">
          {title}
        </span>
        {badge && (
          <span
            className={cn(
              'shrink-0 rounded px-1.5 text-[10.5px] font-bold',
              VERDICT_TONE_CLASS[badge.tone],
            )}
          >
            {badge.label}
          </span>
        )}
        <button
          onClick={() => close(`doc:${docId}`)}
          title="문서 닫기"
          aria-label="문서 닫기"
          className="ml-auto grid size-6.5 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5.5">
        <div className="mx-auto max-w-[44rem] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="px-6.5 pt-5.5 pb-2">
            <h1 className="font-heading text-[22px] leading-snug font-bold">{title}</h1>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              {card?.발주기관 ?? '발주기관 미상'}
              {card?.공고번호 ? ` · 공고 ${card.공고번호}` : ''}
            </p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2 px-6.5 py-3.5 [word-break:keep-all]">
            <MetaCell label="마감">
              {formatDate(card?.마감일 ?? null)}{' '}
              <span className="font-mono text-[10.5px] text-primary">{due.label}</span>
            </MetaCell>
            <MetaCell label="사업예산">{formatAmount(card?.금액 ?? null)}</MetaCell>
            <MetaCell label="공개일">{formatDate(card?.공개일 ?? null)}</MetaCell>
            <MetaCell label="원문 형식">{card?.파일형식 ?? '—'}</MetaCell>
          </div>

          {reco && <QualificationBlock reco={reco} />}

          <div className="border-t border-border px-6.5 pt-3.5 pb-5.5">
            {fullOpen ? (
              <>
                <p className="mb-2.5 text-[11.5px] font-bold text-muted-foreground">원문</p>
                <FullText
                  docId={docId}
                  quote={citeForThisDoc?.quote ?? null}
                  nonce={citeForThisDoc?.nonce ?? 0}
                  scrollRef={scrollRef}
                  flashRef={flashRef}
                />
                <button
                  onClick={() => setFullOpen(false)}
                  className="mt-3 text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  원문 접기
                </button>
              </>
            ) : (
              <button
                onClick={() => setFullOpen(true)}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-input px-3 py-2.5 text-[12.5px] text-muted-foreground transition-colors hover:border-solid hover:border-primary hover:text-primary"
              >
                <ChevronDown className="size-3.5" />
                원문 전체 펼치기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-border px-3 py-2.5">
      <p className="text-[10.5px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold">{children}</p>
    </div>
  )
}

/**
 * 참가자격 판정 — 추천에서 온 문서일 때만 보여준다.
 *
 * 충족(met)·미충족(unmet)은 백엔드가 요건 원문과 사유를 함께 주므로 그대로 쓰고,
 * 확인 못 한 요건은 개수만 온다(unclear_count) — 어떤 요건인지는 계약에 없어서
 * 개수만 적는다. 여기서 임의로 "아마 이것들일 것"이라고 지어내면 안 된다.
 */
function QualificationBlock({ reco }: { reco: RecommendationItem }) {
  const badge = verdictBadge(reco.verdict, reco.unclear_count, reco.missing_count)

  return (
    <div className="mx-6.5 mb-4 overflow-hidden rounded-[10px] border border-border">
      <div className="flex items-center gap-2 bg-secondary px-3 py-2">
        <span
          className={cn('rounded px-1.5 text-[10.5px] font-bold', VERDICT_TONE_CLASS[badge.tone])}
        >
          {badge.label}
        </span>
        <span className="text-[11.5px] text-muted-foreground">회사 프로필 기준 참가자격 판정</span>
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        {reco.met.map((m) => (
          <QualRow key={`met-${m.requirement}`} state="ok" text={m.requirement} why={m.reason} />
        ))}
        {reco.unmet.map((m) => (
          <QualRow
            key={`unmet-${m.requirement}`}
            state="miss"
            text={m.requirement}
            why={m.reason}
          />
        ))}
        {reco.unclear_count > 0 && (
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            프로필에 언급이 없어 확인 못 한 항목 {reco.unclear_count}건 (참가자격상 문제로 세지는
            않았어요)
          </p>
        )}
      </div>
    </div>
  )
}

function QualRow({ state, text, why }: { state: 'ok' | 'miss'; text: string; why: string }) {
  return (
    <div className="flex items-start gap-2 text-[12.5px] leading-normal">
      <span
        className={cn(
          'mt-px grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold',
          state === 'ok' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
        )}
      >
        {state === 'ok' ? '✓' : '✕'}
      </span>
      <span className="flex-1">
        {text} <span className="text-muted-foreground">— {why}</span>
      </span>
    </div>
  )
}

/**
 * 원문 전문 + 인용 하이라이트.
 *
 * 원문을 마크다운으로 렌더하지 않고 그대로 내는 건 의도적이다 — hwp 추출본이라 표·기호가
 * 원본 배치를 담고 있어서, 예쁘게 다시 그리면 "원문 대조"라는 이 화면의 목적이 깨진다.
 */
function FullText({
  docId,
  quote,
  nonce,
  scrollRef,
  flashRef,
}: {
  docId: string
  quote: string | null
  nonce: number
  scrollRef: React.RefObject<HTMLDivElement | null>
  flashRef: React.RefObject<HTMLSpanElement | null>
}) {
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

  const parts = useMemo(() => {
    if (!markdown) return null
    const at = quote ? markdown.indexOf(quote) : -1
    // 인용문이 원문에 그대로 없을 수도 있다(LLM이 다듬어 인용한 경우) — 그땐 조용히
    // 하이라이트 없이 원문만 보여준다. 억지로 근사 매칭해서 엉뚱한 곳을 밝히면 더 나쁘다.
    if (at < 0) return { before: markdown, match: '', after: '' }
    return {
      before: markdown.slice(0, at),
      match: quote!,
      after: markdown.slice(at + quote!.length),
    }
  }, [markdown, quote])

  // 하이라이트가 그려진 다음 프레임에 스크롤해야 위치가 잡힌다.
  useLayoutEffect(() => {
    if (!parts?.match) return
    const el = flashRef.current
    const box = scrollRef.current
    if (!el || !box) return
    const id = requestAnimationFrame(() => {
      const top =
        el.getBoundingClientRect().top -
        box.getBoundingClientRect().top +
        box.scrollTop -
        box.clientHeight * 0.35
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [parts?.match, nonce, flashRef, scrollRef])

  if (error) return <p className="text-xs text-danger">{error}</p>

  if (!parts) {
    return (
      <div className="space-y-2">
        <div className="h-3 w-11/12 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
      </div>
    )
  }

  return (
    <pre className="font-sans text-[13px] leading-[1.8] whitespace-pre-wrap text-foreground">
      {parts.before}
      {parts.match && (
        <span key={nonce} ref={flashRef} className="cite-flash">
          {parts.match}
        </span>
      )}
      {parts.after}
    </pre>
  )
}
