import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown, FileText, X } from 'lucide-react'

import { ApiError, fetchRfpContent, type RecommendationItem } from '@/lib/api'
import { QualificationTable } from '@/components/qualification-table'
import type { ReportItem } from '@/lib/chat-cards'
import { useRfp } from '@/hooks/use-rfps'
import {
  cleanRfpMarkdown,
  findSectionLine,
  normalizeAnchorText,
  squash,
} from '@/lib/clean-rfp-markdown'
import { markdownComponents } from '@/components/markdown'
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

  // 인용으로 들어오면 원문을 펼친다. quote가 아니라 인용 자체(citeForThisDoc) 유무로
  // 판단한다 — 실제로 검색할 발췌문(quote)이 없는 인용(섹션만 아는 경우)이 대부분이라,
  // quote 유무로 걸면 그런 인용은 원문이 안 펼쳐지는 채로 남는다. nonce를 의존성에 넣어
  // 같은 인용을 다시 눌러도 반응한다.
  useEffect(() => {
    if (citeForThisDoc) setFullOpen(true)
  }, [citeForThisDoc, citeForThisDoc?.nonce])

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
                  section={citeForThisDoc?.section ?? null}
                  nonce={citeForThisDoc?.nonce ?? 0}
                  scrollRef={scrollRef}
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

  // 요건·사유는 백엔드 판정을 그대로 표에 싣는다. 미확인은 개수만 오는 계약이라
  // "확인 못 한 요건 N건" 행 하나로 만든다 — 어떤 요건인지 지어내면 안 된다.
  const rows: ReportItem[] = [
    ...reco.met.map<ReportItem>((m) => ({ state: 'ok', text: m.requirement, why: m.reason })),
    ...reco.unmet.map<ReportItem>((m) => ({ state: 'miss', text: m.requirement, why: m.reason })),
    ...(reco.unclear_count > 0
      ? [
          {
            state: 'unclear' as const,
            text: `프로필에 언급이 없어 확인 못 한 요건 ${reco.unclear_count}건`,
            why: '참가자격상 문제로 세지는 않았어요',
          },
        ]
      : []),
  ]

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
      <div className="px-3 py-2.5">
        <QualificationTable
          rows={rows}
          counts={{
            total: reco.total,
            met: reco.met.length,
            unmet: reco.unmet.length,
            unclear: reco.unclear_count,
          }}
        />
      </div>
    </div>
  )
}

/**
 * 원문 뷰어 전용 마크다운 컴포넌트 — 채팅 렌더러(markdownComponents)를 그대로 쓰되
 * 문단만 whitespace-pre-line으로 바꾼다. hwp 추출본은 "□ 항목" 처럼 줄 하나하나가
 * 독립된 항목이라, 소프트 줄바꿈을 공백으로 접으면 문단이 한 덩어리로 뭉개진다.
 */
const viewerComponents: Components = {
  ...markdownComponents,
  p: ({ node: _node, ...props }) => (
    <p className="my-2 leading-relaxed whitespace-pre-line" {...props} />
  ),
}

/**
 * 렌더된 원문 DOM에서 앵커 텍스트를 가진 블록 요소를 찾는다.
 *
 * 마크다운으로 렌더한 뒤에는 원문 문자열 오프셋이 화면 위치와 연결되지 않아서,
 * findSectionLine이 고른 앵커 "줄"의 텍스트를 블록 요소 단위로 다시 찾는다.
 * 비교는 normalizeAnchorText로 양쪽을 정규화해서 한다 — 마크다운 쪽 "## " 접두나,
 * 정렬 리스트 번호가 CSS 마커로 빠져 DOM 텍스트에서 사라지는 차이를 흡수하기 위해서다.
 *
 * 같은 제목이 목차와 본문에 두 번 나오는 문서가 많아 findSectionLine과 같은 규칙을
 * DOM 좌표로 다시 적용한다: 렌더 높이 앞 10% 안의 매치는 목차로 보고 그 뒤 첫 매치를
 * 고르고, 전부 앞 10%에 있으면 마지막 것을 쓴다. 못 찾으면 null — 하이라이트 생략.
 */
function findAnchorElement(
  body: HTMLElement,
  anchorText: string,
  kind: 'quote' | 'section',
): HTMLElement | null {
  const blocks = Array.from(body.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,li,td,th'))

  if (kind === 'quote') {
    // 발췌문은 제목이 아니라 본문 문장이므로 포함 매치로 찾고, 매치 중 텍스트가 가장
    // 짧은(=가장 안쪽) 블록을 고른다 — li 전체보다 그 안의 p가 더 정확한 위치다.
    const target = squash(anchorText)
    if (!target) return null
    let best: HTMLElement | null = null
    for (const el of blocks) {
      const t = squash(el.textContent ?? '')
      if (t.includes(target) && (!best || t.length < squash(best.textContent ?? '').length)) {
        best = el
      }
    }
    return best
  }

  const target = normalizeAnchorText(anchorText)
  if (!target) return null
  const exact: HTMLElement[] = []
  const loose: HTMLElement[] = []
  let last: HTMLElement | null = null
  for (const el of blocks) {
    // li 안의 p처럼 부모·자식이 같은 텍스트로 겹치면 부모만 후보로 남긴다.
    if (last && last.contains(el)) continue
    const t = normalizeAnchorText(el.textContent ?? '')
    if (!t) continue
    if (t === target) {
      exact.push(el)
      last = el
    } else if (t.startsWith(target)) {
      // 목차 줄("제출서류 … 12")처럼 제목 뒤에 페이지 번호가 붙은 경우 — 정확 일치가
      // 하나도 없을 때만 차선으로 쓴다.
      loose.push(el)
      last = el
    }
  }
  const pool = exact.length > 0 ? exact : loose
  if (pool.length === 0) return null

  const bodyTop = body.getBoundingClientRect().top
  const tocCutoff = body.scrollHeight * 0.1
  const afterToc = pool.find((el) => el.getBoundingClientRect().top - bodyTop >= tocCutoff)
  return afterToc ?? pool[pool.length - 1]
}

/**
 * 원문 전문 + 인용 하이라이트.
 *
 * 예전엔 "원문 대조" 목적으로 <pre>에 날것 그대로 냈지만, hwp 추출 잡음(깨진 페이지참조
 * 문자·빈 표 행·장식 제목표) 때문에 오히려 원문을 읽을 수가 없었다. 그래서 정돈 렌더링으로
 * 바꿨다(사용자 결정, docs/superpowers/specs/2026-07-30-ux-round2-design.md §2) —
 * cleanRfpMarkdown으로 잡음을 걷어낸 뒤 GFM 마크다운으로 렌더해 표가 진짜 표로 보인다.
 * 인용 하이라이트도 텍스트 분할 대신 렌더된 DOM에서 앵커 요소를 찾아 밝히는 방식으로 바꿨다.
 */
function FullText({
  docId,
  quote,
  section,
  nonce,
  scrollRef,
}: {
  docId: string
  quote: string | null
  section: string | null
  nonce: number
  scrollRef: React.RefObject<HTMLDivElement | null>
}) {
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

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

  const cleaned = useMemo(() => (markdown ? cleanRfpMarkdown(markdown) : null), [markdown])

  // 앵커 텍스트. quote(진짜 발췌문)가 있으면 최우선 — 지금 백엔드는 안 주지만 계약이
  // 바뀌어 주기 시작하면 자동으로 더 정확한 쪽을 쓴다. 없으면 섹션 제목 줄을 앵커로
  // 삼는다(findSectionLine 주석 참고). 제목 줄을 못 찾으면 null — 조용히 하이라이트
  // 없이 원문만 보여준다. 억지로 근사 매칭해서 엉뚱한 곳을 밝히면 더 나쁘다.
  const anchor = useMemo(() => {
    if (!cleaned) return null
    if (quote) return { text: quote, kind: 'quote' as const }
    if (!section) return null
    const range = findSectionLine(cleaned, section)
    return range ? { text: cleaned.slice(range.start, range.end), kind: 'section' as const } : null
  }, [cleaned, quote, section])

  // 렌더된 DOM에서 앵커 요소를 찾아 플래시하고, 다음 프레임에 스크롤한다(하이라이트가
  // 그려진 뒤에야 위치가 잡힌다). nonce가 의존성에 있어 같은 인용을 다시 눌러도 다시 돈다.
  useLayoutEffect(() => {
    const body = bodyRef.current
    const box = scrollRef.current
    if (!anchor || !body || !box) return
    const el = findAnchorElement(body, anchor.text, anchor.kind)
    if (!el) return
    // 재클릭 시 애니메이션이 다시 돌게: 이전 플래시를 지우고 리플로를 강제한 뒤 다시 단다.
    for (const prev of body.querySelectorAll('.cite-flash')) prev.classList.remove('cite-flash')
    void el.offsetWidth
    el.classList.add('cite-flash')
    const id = requestAnimationFrame(() => {
      const top =
        el.getBoundingClientRect().top -
        box.getBoundingClientRect().top +
        box.scrollTop -
        box.clientHeight * 0.35
      box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [anchor, nonce, scrollRef])

  if (error) return <p className="text-xs text-danger">{error}</p>

  if (!cleaned) {
    return (
      <div className="space-y-2">
        <div className="h-3 w-11/12 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
      </div>
    )
  }

  return (
    <div
      ref={bodyRef}
      className="text-[13px] leading-relaxed text-foreground [word-break:keep-all]"
    >
      <Markdown remarkPlugins={[remarkGfm]} components={viewerComponents}>
        {cleaned}
      </Markdown>
    </div>
  )
}
