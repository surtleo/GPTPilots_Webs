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

/**
 * 표 행을 셀 배열로 (양끝 파이프 제거·trim). 표 행이 아니면 null.
 *
 * 백엔드 추출기가 셀 안 중첩 표를 `\|`(셀 구분)·`<br>`(행 구분)으로 직렬화해 넣으므로
 * (src/ingest/hwp5_nested_fix.py), 이스케이프된 파이프에서는 쪼개지 말고 표시용으로는
 * `|`와 줄바꿈으로 되돌린다 — 셀은 whitespace-pre-wrap이라 \n이 그대로 줄바꿈이 된다.
 */
function rowCells(line: string): string[] | null {
  if (!isTableRow(line)) return null
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) =>
      c
        .trim()
        .replace(/\\\|/g, '|')
        .replace(/<br\s*\/?>/gi, '\n'),
    )
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
 * 정돈된 원문을 렌더 블록으로 가른다 — 표 블록만 표로 그리고 나머지는 원문 줄 그대로.
 *
 * GFM 마크다운 렌더에 통째로 맡기지 않는 이유(둘 다 실사용에서 겪은 문제):
 *  1) GFM 파이프 표는 **헤더 열 수를 초과하는 셀을 버린다**. hwp 추출 표는 헤더 3열에
 *     본문 10열 같은 비정형이 흔해서 셀이 통째로 사라지거나 엉뚱한 열에 붙는다.
 *     여기서는 모든 행의 모든 셀을 보존하고, 짧은 행만 표 최대 열 수까지 빈 셀로
 *     패딩한다(내용 추가·삭제 없음) — 무손실이 최우선이고 그리드 정렬이 그다음이다.
 *  2) 문단·리스트 파싱이 원문 줄바꿈·번호를 재해석해 원문과 다르게 조판된다.
 *     표·헤딩이 아닌 줄은 전부 lines 블록으로 묶어 한 줄 = 한 줄로 그대로 그린다.
 */
export type RfpLine = { text: string; offset: number }

export type RfpBlock =
  | { type: 'table'; header: string[] | null; rows: string[][]; maxCols: number }
  | { type: 'heading'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'lines'; lines: RfpLine[] }

export function parseRfpBlocks(cleaned: string): RfpBlock[] {
  const lines = cleaned.split('\n')
  const blocks: RfpBlock[] = []
  let textRun: RfpLine[] = []

  const flushText = () => {
    // 앞뒤 빈 줄은 블록 간 마진이 대신하므로 걷어낸다(내용 줄은 그대로).
    while (textRun.length > 0 && textRun[0].text.trim() === '') textRun.shift()
    while (textRun.length > 0 && textRun[textRun.length - 1].text.trim() === '') textRun.pop()
    if (textRun.length > 0) blocks.push({ type: 'lines', lines: textRun })
    textRun = []
  }

  // 각 줄의 cleaned 내 문자 오프셋 — findSectionLine이 돌려주는 범위와 같은 좌표계라
  // "이 줄이 문서 앞 10%(목차 영역)인가" 같은 판정에 그대로 쓴다.
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineOffset = offset
    offset += line.length + 1

    if (isTableRow(line)) {
      flushText()
      // 연속한 표 행을 한 블록으로. 구분선은 렌더하지 않지만, 첫 행 바로 뒤의
      // 구분선은 "첫 행이 헤더"라는 신호로만 쓴다.
      const raw: string[] = [line]
      while (i + 1 < lines.length && isTableRow(lines[i + 1])) {
        i++
        raw.push(lines[i])
        offset += lines[i].length + 1
      }
      const hasHeader = raw.length >= 2 && !isSeparatorRow(raw[0]) && isSeparatorRow(raw[1])
      const cells = raw.filter((r) => !isSeparatorRow(r)).map((r) => rowCells(r) ?? [])
      // hwp 병합셀 손실로 행마다 셀 수가 제각각이다(헤더 3셀에 데이터 행 28셀 같은 표도
      // 실재한다). 짧은 행을 그대로 그리면 뒤쪽 열에 td가 아예 없어 테두리가 끊긴 채
      // 매달린 셀로 보이므로 maxCols를 함께 넘긴다. 빈 문자열 셀로 패딩하지 않는 이유:
      // 패딩하면 hwp에서 병합 셀이던 자리마다 "이름 없는 빈 열"이 표 전체에 생긴다(실사용
      // 불만). 렌더 쪽에서 짧은 행의 마지막 셀을 colspan으로 늘여 원본 병합처럼 그린다.
      // 셀 내용은 건드리지 않는다 — 무손실 원칙 그대로.
      const maxCols = Math.max(0, ...cells.map((r) => r.length))
      if (hasHeader) blocks.push({ type: 'table', header: cells[0], rows: cells.slice(1), maxCols })
      else blocks.push({ type: 'table', header: null, rows: cells, maxCols })
      continue
    }

    const heading = line.match(/^\s*#{1,6}\s+(.*)$/)
    if (heading) {
      flushText()
      blocks.push({ type: 'heading', text: heading[1].trim() })
      continue
    }

    // cleanRfpMarkdown이 장식 상자를 눌러 만든 "**제목**" 한 줄짜리 굵은 문단.
    const bold = line.match(/^\s*\*\*(.+)\*\*\s*$/)
    if (bold) {
      flushText()
      blocks.push({ type: 'bold', text: bold[1].trim() })
      continue
    }

    textRun.push({ text: line, offset: lineOffset })
  }
  flushText()
  return blocks
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
  // 섹션명 쪽에도 "Ⅲ. "·"3. " 같은 번호 매김이 붙어 온다(브레드크럼 세그먼트·목차 줄).
  // 본문 줄은 아래에서 번호를 벗겨 비교하므로 타깃도 같은 잣대로 벗긴다 — 안 벗기면
  // 번호 달린 제목은 영원히 안 맞는다.
  const target = normalizeAnchorText(section)
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

/**
 * 인용 섹션명 → 앵커 줄. findSectionLine에 브레드크럼 처리를 얹은 진입점.
 *
 * 백엔드 citations의 `섹션`은 "Ⅲ. 사업자 선정 > □ 입찰참가 자격"처럼 상위 제목까지 이어
 * 붙인 브레드크럼으로 오는 경우가 많다 — 통짜 문자열은 본문 어느 한 줄과도 일치하지 않아
 * 그대로는 앵커를 못 찾는다. 구분자(>)로 쪼개 **가장 구체적인 마지막 세그먼트부터 역순으로**
 * 제목 줄 매칭을 시도하고, 처음 맞는 세그먼트의 줄을 앵커로 쓴다. 전부 실패하면 null —
 * 억지 근사 매칭으로 엉뚱한 곳을 밝히지 않는다.
 */
export function findSectionAnchor(
  markdown: string,
  section: string,
): { start: number; end: number } | null {
  const segments = section
    .split('>')
    .map((s) => s.trim())
    .filter((s) => s !== '')
  for (let i = segments.length - 1; i >= 0; i--) {
    const range = findSectionLine(markdown, segments[i])
    if (range) return range
  }
  return null
}

/**
 * 목차 줄 꼬리 페이지 번호 — "제목<탭><탭>12" · "제목 ···· 3" 의 뒤쪽.
 * findTocTargets의 매칭과 뷰어의 목차 줄 표시가 같은 패턴을 써야 한다 — 매칭용으로만
 * 벗기고 화면엔 그대로 두면 목차 줄이 페이지 번호를 단 채 렌더된다.
 */
export const TOC_PAGE_TAIL_RE = /[\s.·…]*\d+\s*$/

/** 목차 줄 꼬리 페이지 번호를 뗀 표시용 텍스트. */
export function stripTocPageTail(text: string): string {
  return text.replace(TOC_PAGE_TAIL_RE, '')
}

/**
 * 본문 매칭에 실패한(=클릭 불가) 목차 영역 줄이 그래도 목차 항목처럼 보이는가.
 * 탭 또는 점선 리더(·…. 2개 이상) 뒤에 꼬리 숫자가 붙은 꼴만 인정한다 — 일반 공백만
 * 요구하면 목차 영역에 섞인 본문 줄("… 2026" 같은)의 숫자까지 지워버린다.
 */
export function looksLikeTocLine(text: string): boolean {
  return /(?:\t|[.·…]{2,})[\s.·…]*\d+\s*$/.test(text)
}

/**
 * 목차 줄 → 본문 제목 줄 매핑.
 *
 * 문서 앞 10%(findSectionLine의 목차 컷오프와 같은 기준) 안의 줄 중, 꼬리 페이지 번호를
 * 뗀 나머지를 섹션명 삼아 본문에서 제목 줄이 찾아지는 줄만 골라 {목차 줄 오프셋 → 본문
 * 제목 줄 범위}로 돌려준다. 뷰어는 이 맵에 있는 줄만 클릭 가능하게 만든다 — 본문에서
 * 못 찾는 목차 항목은 클릭돼도 갈 곳이 없으니 평문 그대로 둔다.
 *
 * 자기 자신(목차 줄)만 매칭된 경우는 제외한다 — 눌러도 제자리인 링크는 링크가 아니다.
 */
export function findTocTargets(markdown: string): Map<number, { start: number; end: number }> {
  const targets = new Map<number, { start: number; end: number }>()
  const tocCutoff = markdown.length * 0.1

  let offset = 0
  for (const line of markdown.split('\n')) {
    const lineOffset = offset
    offset += line.length + 1
    if (lineOffset >= tocCutoff) break

    // 목차 줄 꼴: 내용이 있고, 꼬리에 페이지 번호가 붙어 있을 수 있다.
    // 페이지참조 잔재는 cleanRfpMarkdown이 이미 지웠으므로 "제목 [탭·공백] 숫자"만 남는다.
    const title = line.replace(TOC_PAGE_TAIL_RE, '').trim()
    if (title === '') continue

    const range = findSectionLine(markdown, title)
    if (range && range.start !== lineOffset) targets.set(lineOffset, range)
  }
  return targets
}
