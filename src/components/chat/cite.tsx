import { useState } from 'react'

import type { Citation } from '@/lib/api'
import { useWorkspace } from '@/lib/workspace-context'

/**
 * 답변 안 인용 각주.
 *
 * 백엔드가 문장별 인용 위치를 따로 주지는 않는다 — 대신 답변 본문에 프롬프트 규약대로
 * `(출처: 사업명, 섹션)`이 박혀 나오고(src/query/generate.py), 같은 정보가 citations[]에도
 * 온다. 그래서 본문의 그 표기를 찾아 citations의 항목과 맞춘 뒤 각주 칩으로 바꿔 단다.
 * 문장 끝에 각주가 붙는 모양은 디자인 그대로이면서, 각주가 가리키는 근거는 실제 응답값이다.
 *
 * 팝오버에 원문 발췌를 넣지 않은 이유: citations는 {doc_id, 사업명, 섹션}만 준다. 청크
 * 원문은 NDA 정책상 응답에서 의도적으로 빠져 있다(src/api/core.py `_citations_from_hits`).
 * 그래서 발췌 대신 섹션을 보여주고, 실제 문장은 원문 뷰어에서 그 섹션으로 점프해 확인한다.
 */
/** `(출처: 사업명, 섹션)` · `(출처: 동일)` 둘 다 잡는다 — 인자 하나짜리는 섹션이 undefined. */
const SOURCE_RE = /\(출처:\s*([^,()]+?)(?:\s*,\s*([^()]+?))?\)/g

/** 같은 근거를 반복 인용할 때 백엔드 프롬프트가 쓰는 표기(src/query/generate.py). */
const SAME_AS_ABOVE = '동일'

/**
 * 답변 본문의 `(출처: …)` 표기를 마크다운 링크 `[n](cite:n)`으로 바꾸고, 각주 번호 →
 * citation 매핑을 함께 돌려준다. 매칭되는 citation이 없으면 원문 표기를 그대로 둔다 —
 * 근거를 못 찾았는데 각주만 다는 건 없는 출처를 만들어내는 셈이다.
 */
export function linkifyCitations(
  answer: string,
  citations: Citation[],
): { text: string; refs: Map<number, Citation> } {
  const refs = new Map<number, Citation>()
  if (citations.length === 0) return { text: answer, refs }

  const indexOf = new Map<Citation, number>()
  let next = 1
  let lastHit: Citation | null = null

  const text = answer.replace(SOURCE_RE, (whole, rawName: string, rawSection?: string) => {
    const name = rawName.trim()
    const section = rawSection?.trim()

    // "(출처: 동일)"은 바로 앞에서 쓴 근거를 가리킨다 — 같은 각주 번호를 다시 단다.
    // 다만 "(출처: 동일, 3장)"처럼 섹션이 딸려 오면 그게 직전 근거의 섹션과 맞을 때만
    // 같은 근거로 본다. 어긋나면 다른 대목을 가리키는 것이라 각주를 달지 않는다.
    const sameAsAbove: Citation | undefined =
      lastHit && (!section || (lastHit.섹션 ?? '') === section) ? lastHit : undefined
    const hit =
      name === SAME_AS_ABOVE
        ? sameAsAbove
        : ((section
            ? citations.find((c) => (c.사업명 ?? '') === name && (c.섹션 ?? '') === section)
            : undefined) ?? citations.find((c) => (c.사업명 ?? '') === name))
    if (!hit) {
      // 이름이 안 맞아 근거를 못 찾았으면 직전 근거도 끊는다. 안 끊으면 바로 뒤따르는
      // "(출처: 동일)"이 방금 실패한 그 근거가 아니라 그 이전 근거를 집어간다 — 사용자가
      // 각주를 눌렀을 때 전혀 다른 공고 원문이 열린다. 모르는 채로 두는 게 낫다.
      lastHit = null
      return whole
    }
    lastHit = hit

    let n = indexOf.get(hit)
    if (n == null) {
      n = next++
      indexOf.set(hit, n)
      refs.set(n, hit)
    }
    // fragment(#)로 다는 이유: react-markdown은 기본 urlTransform이 알 수 없는 스킴을
    // 잘라낸다. `cite:1`로 달면 href가 통째로 비어 각주 렌더러가 못 알아본다(실측).
    return `[${n}](${CITE_HREF_PREFIX}${n})`
  })

  return { text, refs }
}

export const CITE_HREF_PREFIX = '#bidmate-cite-'

/** 마크다운 링크 href → 각주 번호. 각주가 아니면 null. */
export function citeIndexFromHref(href: string | undefined): number | null {
  if (!href?.startsWith(CITE_HREF_PREFIX)) return null
  const n = Number(href.slice(CITE_HREF_PREFIX.length))
  return Number.isInteger(n) ? n : null
}

export function CiteChip({ n, citation }: { n: number; citation: Citation }) {
  const { openCite } = useWorkspace()
  const [hover, setHover] = useState(false)
  const docId = citation.doc_id ?? null
  const section = citation.섹션 ?? null

  return (
    <span
      className="relative inline-block align-baseline"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={() => docId && openCite(docId, section, section)}
        disabled={!docId}
        title={docId ?? undefined}
        className="mx-0.5 inline-grid h-[15px] min-w-4 place-items-center rounded-[5px] border border-border bg-secondary px-1 align-text-top font-mono text-[9.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        {n}
      </button>
      {hover && (
        <span className="absolute bottom-[22px] -left-8 z-40 block w-[250px] rounded-[10px] border border-border bg-card px-3 py-2.5 shadow-xl">
          <span className="block text-[11.5px] font-bold">
            {citation.사업명 ?? '(사업명 미상)'}
            {section ? ` · ${section}` : ''}
          </span>
          {docId && (
            <span className="mt-0.5 block truncate font-mono text-[9.5px] text-muted-foreground">
              {docId}
            </span>
          )}
          <span className="mt-1.5 block text-[10px] text-muted-foreground">
            {docId ? '클릭하면 원문에서 이 대목을 보여드려요' : '문서를 특정하지 못한 출처예요'}
          </span>
        </span>
      )}
    </span>
  )
}
