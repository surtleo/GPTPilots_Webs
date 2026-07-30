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

/** 공고 등록정보(data_list.csv 유래 문서 헤더) 블록의 출처 라벨(src/query/retrieve.py). */
const REGISTRY_LABEL = '공고 등록정보'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * 사업명 매칭 — 정확 일치를 우선하되, 모델이 "사업명 (발주기관)" 꼬리를 떼고 쓰는 일이
 * 잦아 접두 일치도 허용한다. 접두 일치는 8자 이상일 때만 — 짧은 표기가 엉뚱한 공고에
 * 들러붙는 것을 막는다.
 */
function findByName(citations: Citation[], name: string): Citation | undefined {
  return (
    citations.find((c) => norm(c.사업명 ?? '') === name) ??
    (name.length >= 8
      ? citations.find((c) => {
          const n = norm(c.사업명 ?? '')
          return n !== '' && (n.startsWith(name) || name.startsWith(n))
        })
      : undefined)
  )
}

/**
 * 섹션 매칭 — 모델이 사업명 없이 `(출처: 4. 상세 요구사항)`처럼 섹션만 적을 때의 폴백.
 * 섹션은 `A > B` 경로일 수 있어 마지막까지 조각 단위로 대조한다. 서로 다른 문서에 같은
 * 섹션명이 있으면(문서가 여럿 섞인 답변) 어느 원문인지 확정할 수 없으므로 달지 않는다.
 */
function findBySection(citations: Citation[], label: string): Citation | undefined {
  if (!label) return undefined
  const hits = citations.filter((c) => {
    const sec = norm(c.섹션 ?? '')
    if (sec === '') return false
    if (sec === label) return true
    return sec
      .split('>')
      .map((seg) => seg.trim())
      .includes(label)
  })
  if (hits.length === 0) return undefined
  const docIds = new Set(hits.map((h) => h.doc_id ?? ''))
  return docIds.size === 1 ? hits[0] : undefined
}

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
  // "(출처: 공고 등록정보)"용 합성 근거 — 답변 하나에 하나만 만들어 각주 번호를 공유한다.
  let registryCite: Citation | null = null

  const text = answer.replace(SOURCE_RE, (whole, rawName: string, rawSection?: string) => {
    const name = norm(rawName)
    const section = rawSection ? norm(rawSection) : undefined

    // "(출처: 동일)"은 바로 앞에서 쓴 근거를 가리킨다 — 같은 각주 번호를 다시 단다.
    // 다만 "(출처: 동일, 3장)"처럼 섹션이 딸려 오면 그게 직전 근거의 섹션과 맞을 때만
    // 같은 근거로 본다. 어긋나면 다른 대목을 가리키는 것이라 각주를 달지 않는다.
    const sameAsAbove: Citation | undefined =
      lastHit && (!section || (lastHit.섹션 ?? '') === section) ? lastHit : undefined
    let hit: Citation | undefined
    if (name === SAME_AS_ABOVE) {
      hit = sameAsAbove
    } else {
      hit =
        (section
          ? citations.find((c) => (c.사업명 ?? '') === name && (c.섹션 ?? '') === section)
          : undefined) ?? findByName(citations, name)
      // 규약(사업명, 섹션)을 벗어난 표기 폴백 — 모델이 섹션명만 적거나 문서 헤더 라벨을
      // 그대로 옮겨 적는 경우가 실제로 잦다(프롬프트로는 다 못 막는다).
      if (!hit)
        hit =
          findBySection(citations, name) ??
          (section ? findBySection(citations, section) : undefined)
      if (!hit && name.includes(REGISTRY_LABEL)) {
        // 공고 등록정보는 문서 헤더 블록이라 대응하는 청크 섹션이 없다 — 답변의 근거가
        // 전부 한 문서라면 그 문서 자체(원문 최상단)를 근거로 단다. 여러 문서가 섞였으면
        // 어느 공고의 등록정보인지 알 수 없으니 달지 않는다.
        const docIds = new Set(citations.map((c) => c.doc_id ?? ''))
        if (docIds.size === 1 && citations[0].doc_id) {
          registryCite ??= { doc_id: citations[0].doc_id, 사업명: citations[0].사업명, 섹션: null }
          hit = registryCite
        }
      }
    }
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
      {/* quote로 section을 넘기면 안 된다 — 원문에 "제출서류" 같은 섹션명이 우연히
          다른 곳(목차 등)에도 있으면 그 엉뚱한 위치가 하이라이트·스크롤된다.
          여기선 실제 인용 발췌문이 없으니(위 주석 참고) 정직하게 null로 두고,
          섹션 위치 점프는 뷰어가 section으로 제목 줄만 골라 찾는다(doc-viewer.tsx
          findSectionLine). */}
      <button
        onClick={() => docId && openCite(docId, null, section)}
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
