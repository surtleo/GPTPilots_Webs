/**
 * hwp 추출 마크다운 정돈 — 원문 뷰어가 렌더하기 전의 전처리 (순수 함수).
 *
 * hwp→마크다운 변환본에는 세 종류의 잡음이 섞여 있다:
 *  1) 목차 페이지참조 필드 잔재 — "사업설명 \t銨ȃ\t1" 처럼 임의의 한자·범어 문자 뒤에
 *     라틴 확장 문자(Ā·ă·ȃ = U+0100대)가 붙은 2글자 꼴
 *  2) 전 셀이 빈 표 행 대량, 헤더를 잃고 구분선만 남은 표
 *  3) 장식용 제목표 — "| 1 |  | 사업목적 |" + 구분선이 실은 섹션 제목
 *
 * 원문을 날것 그대로 대조하는 대신 정돈해 보여주기로 한 설계 결정
 * (docs/superpowers/specs/2026-07-30-ux-round2-design.md §2)에 따라 여기서 걷어낸다.
 * 실제 RFP 문면은 NDA라 이 파일엔 패턴만 있고 원문 예시는 넣지 않는다.
 */

/**
 * hwp 페이지참조 잔재 문자.
 *
 * 진단 기준은 뒤쪽 마커(라틴 확장 U+0100–U+036F)다 — 정상 한국어 문서엔 나올 일이 없는
 * 문자라 이걸 기준으로 잡는다. 앞의 한 글자(임의 한자·범어·티베트 문자)는 한글·ASCII가
 * *아닐 때만* 같이 지운다: 본문엔 정상 한자(예: 법인명 한자 표기)도 있어서 한자를 통째로
 * 지우면 안 되지만, 마커 바로 앞에 붙은 비한글 문자는 항상 필드 잔재의 절반이었다.
 * PUA(U+E000–U+F8FF)는 글꼴 없이는 아예 표시가 안 되는 문자라 단독으로도 지운다.
 */
const PAGE_REF_GARBAGE_RE = /[^ -~\uAC00-\uD7A3\s]?[\u0100-\u036F]|[\uE000-\uF8FF]/g

/** `| a | b |` 꼴의 표 행인가. */
function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

/** 표 행을 셀 배열로 (양끝 파이프 제거·trim). 표 행이 아니면 null. */
function rowCells(line: string): string[] | null {
  if (!isTableRow(line)) return null
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

/** `| --- | :-: |` 같은 GFM 표 구분선 행인가. */
function isSeparatorRow(line: string): boolean {
  const cells = rowCells(line)
  return !!cells && cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))
}

/** 전 셀이 빈 표 행인가 — hwp 표의 빈 줄 맞춤이 이렇게 남는다. */
function isEmptyRow(line: string): boolean {
  const cells = rowCells(line)
  return !!cells && cells.every((c) => c === '')
}

/**
 * hwp 제목표 헤더 행이면 섹션 번호·제목을 돌려준다.
 *
 * hwp 문서는 섹션 제목을 "| 1 |  | 사업목적 |" 같은 3셀 장식표(번호 · 빈 칸 · 제목)로
 * 그린다 — 번호 자리는 아라비아·로마 숫자거나 아예 비어 있기도 하다. 표로 렌더하면
 * 제목이 표처럼 보이니 헤딩으로 승격하기 위해 여기서 식별한다.
 */
function titleTableHeading(line: string): string | null {
  const cells = rowCells(line)
  if (!cells || cells.length !== 3) return null
  const [num, mid, title] = cells
  if (mid !== '' || title === '') return null
  if (!/^(?:\d+|[ⅰ-ⅻⅠ-Ⅻ]|[IVXLC]+)?$/.test(num)) return null
  return num ? `## ${num}. ${title}` : `## ${title}`
}

/** hwp 추출 마크다운에서 변환 잡음을 걷어낸 마크다운을 돌려준다. */
export function cleanRfpMarkdown(markdown: string): string {
  const lines = markdown.replace(PAGE_REF_GARBAGE_RE, '').split('\n')

  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 제목표(헤더 + 구분선 2줄) → 헤딩. 구분선 줄은 건너뛴다.
    const heading = titleTableHeading(line)
    if (heading && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      out.push(heading)
      i++
      continue
    }

    // 데이터 행 없이 헤더+구분선뿐이고 채워진 셀도 하나뿐인 표("| 목차 |  | … |" 류의
    // hwp 장식 상자) → 표 껍데기를 벗기고 굵은 문단으로. 뒤따르는 전 셀 빈 행은 어차피
    // 지워지므로 건너뛰고 그다음 줄이 표 행인지로 데이터 행 유무를 판단한다.
    const cells = rowCells(line)
    if (cells && !isSeparatorRow(line) && !isEmptyRow(line) && i + 1 < lines.length) {
      const filled = cells.filter((c) => c !== '')
      if (filled.length === 1 && isSeparatorRow(lines[i + 1])) {
        let j = i + 2
        while (j < lines.length && isEmptyRow(lines[j])) j++
        if (j >= lines.length || !isTableRow(lines[j])) {
          out.push(`**${filled[0]}**`)
          i++
          continue
        }
      }
    }

    // 전 셀 빈 행은 버린다. 이 행이 표 헤더였다면 뒤따르는 구분선은
    // 아래 고아 구분선 규칙이 마저 치운다.
    if (isEmptyRow(line)) continue

    // 구분선은 바로 위에 살아남은 표 행(헤더)이 있을 때만 의미가 있다.
    // 헤더가 지워졌거나 원래 없던 고아 구분선은 "| --- |" 그대로 노출되므로 버린다.
    if (isSeparatorRow(line)) {
      const prev = out[out.length - 1]
      if (prev === undefined || !isTableRow(prev) || isSeparatorRow(prev)) continue
    }

    out.push(line)
  }

  // 행 삭제로 생긴 큰 공백 구멍을 메운다 — 빈 줄 2연속 이상은 1줄로.
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * "3. 제출서류" · "제3장 사업개요" · "Ⅲ. 평가기준" · "가. 일반사항" 같은 번호 매김 접두.
 * 순수 숫자는 "3." · "3)" · "3.1" 처럼 구분 기호를 요구한다 — 안 그러면 "2026년 …" 같은
 * 본문 줄이 전부 번호 매김으로 오인된다.
 */
export const NUMBERING_RE =
  /^(?:제\s*\d+\s*[장절조항편]|\d+(?:\.\d+)+\.?|\d+[.)]|[ⅰ-ⅻⅠ-Ⅻ]+\s*[.)]|[IVXLC]+\s*[.)]|[가-힣][.)]|[①-⑳])\s*/

/** 공백 차이("사업 개요" vs "사업개요")로 매칭이 어긋나지 않게 비교용으로만 공백을 걷어낸다. */
export function squash(s: string): string {
  return s.replace(/\s+/g, '')
}

/**
 * 마크다운 앵커 줄과 렌더된 DOM 요소 텍스트를 같은 잣대로 비교하기 위한 정규화.
 *
 * 마크다운 쪽엔 "## "·"| |" 같은 문법 기호가 있고, DOM 쪽은 정렬 리스트의 "1." 이
 * CSS 마커로 빠져나가 텍스트에서 사라진다 — 양쪽 다 문법 접두·번호 매김을 걷어내고
 * 공백을 눌러야 같은 제목이 같은 문자열이 된다.
 */
export function normalizeAnchorText(text: string): string {
  let t = text.replace(/\|/g, ' ').trimStart()
  const heading = t.match(/^#{1,6}\s+/)
  if (heading) t = t.slice(heading[0].length)
  const numbering = t.match(NUMBERING_RE)
  if (numbering) t = t.slice(numbering[0].length)
  return squash(t)
}

/**
 * 마크다운에서 "섹션 제목처럼 보이는 줄"을 찾아 그 줄 전체의 범위를 돌려준다.
 *
 * 백엔드 citations엔 발췌문(quote)이 없고 섹션명만 온다(NDA 정책, src/api/core.py) —
 * 그래서 섹션명을 원문 전체에서 검색하는 대신 **제목 줄만** 앵커로 삼는다. 본문 문장이나
 * 다른 대목에 섹션명이 우연히 등장해도 밝히지 않기 위해서다.
 *
 * "제목처럼 보이는" 판정: 줄 머리에 마크다운 헤딩(#…)이나 번호 매김(NUMBERING_RE)이 있고
 * 바로 뒤에 섹션명이 이어지는 줄, 또는 줄 내용이 섹션명 그 자체인 줄만 인정한다.
 * 여러 줄이 걸리면 문서 앞 10% 안의 매치는 목차일 가능성이 높으니, 그 뒤에 다른 매치가
 * 있으면 건너뛰고 목차 이후 첫 매치(=실제 본문 제목)를 고른다. 전부 앞 10%에 있으면
 * 그중 마지막 것을 쓴다(짧은 문서는 목차가 없거나 본문이 바로 시작하는 경우).
 * 하나도 못 찾으면 null — 억지 근사 매칭으로 엉뚱한 곳을 밝히는 것보다 낫다.
 */
export function findSectionLine(
  markdown: string,
  section: string,
): { start: number; end: number } | null {
  const target = squash(section)
  if (!target) return null

  const candidates: { start: number; end: number }[] = []
  let offset = 0
  for (const line of markdown.split('\n')) {
    const lineStart = offset
    offset += line.length + 1 // 개행 포함

    let rest = line.trimStart()
    const heading = rest.match(/^#{1,6}\s+/)
    if (heading) rest = rest.slice(heading[0].length)
    const numbering = rest.match(NUMBERING_RE)
    if (numbering) rest = rest.slice(numbering[0].length)

    // 헤딩·번호 매김 뒤에 섹션명이 이어지면 제목 줄로 본다. 목차 줄("3. 제출서류 … 12")도
    // 여기 걸리는데, 그건 아래 10% 규칙이 걸러낸다. 접두가 아무것도 없으면 줄 전체가
    // 섹션명과 일치할 때만 인정한다 — 본문 문장 속 우연한 등장을 제목으로 오인하지 않게.
    const titled =
      heading || numbering ? squash(rest).startsWith(target) : squash(line.trim()) === target
    if (titled) candidates.push({ start: lineStart, end: lineStart + line.length })
  }

  if (candidates.length === 0) return null
  const tocCutoff = markdown.length * 0.1
  const afterToc = candidates.find((c) => c.start >= tocCutoff)
  return afterToc ?? candidates[candidates.length - 1]
}
