import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, X } from 'lucide-react'

import { ApiError, fetchRfpContent, type RecommendationItem } from '@/lib/api'
import { QualificationTable } from '@/components/qualification-table'
import type { ReportItem } from '@/lib/chat-cards'
import { useRfp } from '@/hooks/use-rfps'
import {
  cleanRfpMarkdown,
  findSectionAnchor,
  findTocTargets,
  looksLikeTocLine,
  normalizeAnchorText,
  parseRfpBlocks,
  squash,
  stripTocPageTail,
  type RfpBlock,
} from '@/lib/clean-rfp-markdown'
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
            {/* 전역 font-heading은 라틴 전용 세리프라 한글 제목이 시스템 세리프로 폴백돼
                깨져 보인다 — 문서 제목은 한글이므로 본문 sans로 그린다. */}
            <h1 className="font-sans text-[22px] leading-snug font-bold">{title}</h1>
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
                {/* 접기 버튼을 위·아래 양쪽에 둔다 — 수만 자 원문을 읽다 접으려고
                    맨 아래까지 내려가야 하는 불편을 없앤다. */}
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-[11.5px] font-bold text-muted-foreground">원문</p>
                  <button
                    onClick={() => setFullOpen(false)}
                    className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronUp className="size-3.5" />
                    원문 접기
                  </button>
                </div>
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
 * 앵커 요소에 형광펜 플래시를 달고 다음 프레임에 스크롤한다(하이라이트가 그려진
 * 뒤에야 위치가 잡힌다). 인용 점프와 목차 클릭이 같은 동작을 공유한다.
 * 반환한 cancel 함수는 effect cleanup용 — 클릭 핸들러에선 무시해도 된다.
 */
function flashAndScroll(el: HTMLElement, body: HTMLElement, box: HTMLElement): () => void {
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
 * 원문 전문 + 인용 하이라이트 + 목차 점프.
 *
 * 렌더는 마크다운 엔진에 맡기지 않는다. 한 번 GFM으로 렌더해 봤더니 실사용에서
 * ① 파이프 표가 헤더 열 수를 초과하는 셀을 버려 비정형 hwp 표의 내용이 유실·오정렬됐고
 * ② 문단·리스트 파싱이 원문 줄바꿈·번호를 재조판해 원문과 다르게 보였다.
 * 그래서 cleanRfpMarkdown(잡음 제거) → parseRfpBlocks(표·헤딩·본문 블록 분리) 뒤,
 * 표 블록만 자체 <table>로(모든 행의 모든 셀 보존 — 짧은 행은 빈 셀 패딩으로 그리드 정렬),
 * 나머지 본문은 원문 줄바꿈 그대로 pre-wrap 한 줄 = 한 줄로 그린다.
 * 인용 하이라이트는 렌더된 DOM에서 앵커 요소를 찾아 밝힌다.
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
  const blocks = useMemo(() => (cleaned ? parseRfpBlocks(cleaned) : null), [cleaned])
  // 목차 줄 오프셋 → 본문 제목 줄 범위. 맵에 있는 목차 줄만 클릭 가능하게 그린다.
  const tocTargets = useMemo(() => (cleaned ? findTocTargets(cleaned) : null), [cleaned])

  // 앵커 텍스트. quote(진짜 발췌문)가 있으면 최우선 — 지금 백엔드는 안 주지만 계약이
  // 바뀌어 주기 시작하면 자동으로 더 정확한 쪽을 쓴다. 없으면 섹션 제목 줄을 앵커로
  // 삼는다(findSectionAnchor 주석 참고 — 브레드크럼 섹션은 세그먼트별 역순 매칭).
  // 제목 줄을 못 찾으면 null — 조용히 하이라이트 없이 원문만 보여준다. 억지로 근사
  // 매칭해서 엉뚱한 곳을 밝히면 더 나쁘다.
  const anchor = useMemo(() => {
    if (!cleaned) return null
    if (quote) return { text: quote, kind: 'quote' as const }
    if (!section) return null
    const range = findSectionAnchor(cleaned, section)
    return range ? { text: cleaned.slice(range.start, range.end), kind: 'section' as const } : null
  }, [cleaned, quote, section])

  // 렌더된 DOM에서 앵커 요소를 찾아 플래시+스크롤. nonce가 의존성에 있어 같은 인용을
  // 다시 눌러도 다시 돈다.
  useLayoutEffect(() => {
    const body = bodyRef.current
    const box = scrollRef.current
    if (!anchor || !body || !box) return
    const el = findAnchorElement(body, anchor.text, anchor.kind)
    if (!el) return
    return flashAndScroll(el, body, box)
  }, [anchor, nonce, scrollRef])

  // 목차 클릭 → 본문 제목 줄로 점프. 인용 점프와 같은 스크롤+형광펜 동작을 재사용한다.
  const jumpToRange = useCallback(
    (range: { start: number; end: number }) => {
      const body = bodyRef.current
      const box = scrollRef.current
      if (!cleaned || !body || !box) return
      const el = findAnchorElement(body, cleaned.slice(range.start, range.end), 'section')
      if (el) flashAndScroll(el, body, box)
    },
    [cleaned, scrollRef],
  )

  if (error) return <p className="text-xs text-danger">{error}</p>

  if (!blocks || !tocTargets) {
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
      {blocks.map((block, i) => (
        <RfpBlockView
          key={i}
          block={block}
          tocTargets={tocTargets}
          // findTocTargets와 같은 좌표계·같은 컷오프 — 이 안의 줄만 목차 영역으로 본다.
          tocCutoff={cleaned ? cleaned.length * 0.1 : 0}
          onJump={jumpToRange}
        />
      ))}
    </div>
  )
}

/**
 * 정돈된 원문 블록 하나의 렌더.
 *
 * - table: 모든 행의 모든 셀을 <table>에 싣는다. GFM처럼 헤더 열 수에 맞춰 셀을 버리지
 *   않고, 짧은 행은 마지막 셀 colspan으로 표 최대 열 수 그리드에 정렬된다(병합 셀처럼).
 * - heading: 정리 단계가 만든 섹션 제목. 전역 h1–h3엔 라틴 전용 세리프(font-heading)가
 *   걸려 있어 한글이 시스템 세리프로 폴백돼 깨져 보인다 — 원문 뷰어 범위에선 font-sans를
 *   명시해 본문 폰트로 그린다.
 * - lines: 원문 줄바꿈 그대로 한 줄 = 한 <p>, pre-wrap. 마크다운 재조판 없음.
 *   목차 줄(tocTargets에 있는 줄)만 클릭 가능하게 만들어 본문 제목으로 점프시킨다.
 */
function RfpBlockView({
  block,
  tocTargets,
  tocCutoff,
  onJump,
}: {
  block: RfpBlock
  tocTargets: Map<number, { start: number; end: number }>
  /** 이 오프셋 미만의 줄만 목차 영역 — findTocTargets의 10% 컷오프와 같은 값. */
  tocCutoff: number
  onJump: (range: { start: number; end: number }) => void
}) {
  const cellClass = 'border border-border px-2 py-1.5 whitespace-pre-wrap align-top'

  switch (block.type) {
    case 'heading':
      return <h2 className="mt-5 mb-2 font-sans text-[15px] font-bold">{block.text}</h2>
    case 'bold':
      return <p className="my-2 font-bold">{block.text}</p>
    case 'table': {
      // 짧은 행(hwp 병합 셀 손실) 처리는 표의 생김새에 따라 가른다:
      //  - 격자형(월별 추진일정 등 — 최대 열 수를 꽉 채운 행이 절반 이상): 빈 셀을
      //    패딩해 균일한 격자로. 여기에 colspan을 쓰면 행마다 통짜/격자가 섞여
      //    "깨진 표"로 보인다(실사용 불만).
      //  - 양식형(요구사항 명세 등 — 대부분의 행이 짧다): 마지막 셀 colspan으로
      //    원본 병합 셀처럼. 여기에 패딩을 쓰면 표 전체에 이름 없는 빈 열이 생긴다.
      const fullRows = block.rows.filter((r) => r.length === block.maxCols).length
      const gridLike = block.rows.length > 0 && fullRows * 2 >= block.rows.length
      const span = (row: string[], i: number) =>
        !gridLike && i === row.length - 1 && row.length < block.maxCols
          ? block.maxCols - row.length + 1
          : undefined
      const pad = (row: string[]) =>
        gridLike && row.length < block.maxCols
          ? Array<string>(block.maxCols - row.length).fill('')
          : []
      return (
        <div className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            {block.header && (
              <thead>
                <tr>
                  {[...block.header, ...pad(block.header)].map((cell, i) => (
                    <th
                      key={i}
                      colSpan={span(block.header!, i)}
                      className={cn(cellClass, 'bg-secondary text-left font-semibold')}
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {[...row, ...pad(row)].map((cell, ci) => (
                    <td key={ci} colSpan={span(row, ci)} className={cellClass}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case 'span-table':
      // 백엔드가 셀 레코드에서 실측한 colspan·rowspan 그대로 — 여기엔 격자/양식
      // 휴리스틱이 필요 없다(그 휴리스틱은 병합 정보가 없는 구 마크다운 표 전용).
      return (
        <div className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      className={cellClass}
                    >
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'lines':
      return (
        <>
          {block.lines.map((line) => {
            if (line.text.trim() === '') return <p key={line.offset} className="h-3" />
            const target = tocTargets.get(line.offset)
            // 목차 줄은 꼬리 페이지 번호를 떼고 보여준다 — 렌더에선 페이지 개념이 없어
            // "제목<탭><탭>12"의 12는 아무 데도 못 가는 숫자다. 클릭 가능한 목차 줄
            // (tocTargets 매칭)은 항상, 매칭 실패한 평문 줄은 목차 영역 안에서 목차 꼴
            // (탭·점선 리더 + 꼬리 숫자)일 때만 뗀다. 본문 줄엔 적용하지 않는다.
            const inTocArea = line.offset < tocCutoff
            const text =
              target || (inTocArea && looksLikeTocLine(line.text))
                ? stripTocPageTail(line.text)
                : line.text
            return (
              <p key={line.offset} className="my-0.5 whitespace-pre-wrap">
                {target ? (
                  <button
                    onClick={() => onJump(target)}
                    title="본문의 이 섹션으로 이동"
                    className="cursor-pointer text-left text-primary underline underline-offset-3 transition-opacity hover:opacity-75"
                  >
                    {text}
                  </button>
                ) : (
                  text
                )}
              </p>
            )
          })}
        </>
      )
  }
}
