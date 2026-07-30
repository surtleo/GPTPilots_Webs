/**
 * BidMate 백엔드 API 클라이언트 — POST /ask 왕복 + 공고 카드 조회 (spec §13-2·§13-6).
 *
 * /ask 응답 계약: { answer, active_doc_id, citations[], cost }.
 * - cost는 열린 객체 → 관대 파싱(특정 키 하드가정 금지, spec §13-6).
 * - active_doc_id·citations[].doc_id는 장문 한글 opaque id → 렌더 시 truncate/tooltip.
 *
 * GET /rfps·/rfps/{doc_id}: 공고 카드 목록·단건. 한글 키 계약을 백엔드와 그대로 공유한다.
 */

/** 검색 0청크 고정 응답 (백엔드 spec §12-3, src/query/generate.py). */
export const NO_EVIDENCE_ANSWER = '해당 문서에서 근거를 찾지 못했습니다.'
const CLARIFY_PREFIX = '어느 문서에 대한 질문인지 특정하지'
const EXPLORE_PREFIX = '관련해 다음 사업 문서들이 검색되었습니다'

export type ChatRole = 'user' | 'assistant'

/** 응답 라우팅 3케이스 (spec §13-6). */
export type AnswerKind = 'answer' | 'clarify' | 'no_evidence'

export interface Citation {
  doc_id?: string | null
  사업명?: string | null
  섹션?: string | null
  [key: string]: unknown
}

export interface Cost {
  input_tokens?: number
  output_tokens?: number
  cost_usd?: number
  session_cost_usd?: number
  session_calls?: number
  [key: string]: unknown
}

export interface AskResponse {
  answer: string
  active_doc_id: string | null
  citations: Citation[]
  cost: Cost
}

export interface HistoryTurn {
  role: ChatRole
  content: string
}

export type ErrorKind =
  'auth' | 'notfound' | 'validation' | 'rate' | 'server' | 'network' | 'unknown'

/** 상태코드별로 UI에서 구분 표시하기 위한 에러 (401/422/429/503/네트워크). */
export class ApiError extends Error {
  readonly status: number
  readonly kind: ErrorKind

  constructor(status: number, kind: ErrorKind, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kind
  }
}

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? ''

function classifyStatus(status: number): ErrorKind {
  if (status === 401) return 'auth'
  if (status === 404) return 'notfound'
  if (status === 422) return 'validation'
  if (status === 429) return 'rate'
  if (status >= 500) return 'server'
  return 'unknown'
}

async function readDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown }
    if (typeof data?.detail === 'string') return data.detail
  } catch {
    // 본문이 JSON이 아니면 기본 메시지로 폴백
  }
  return `요청 실패 (HTTP ${res.status})`
}

/** 공통 요청 — URL 미설정·네트워크 단절·비 2xx를 전부 ApiError로 정규화한다. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, 'network', 'VITE_API_URL이 설정되지 않았습니다. .env를 확인하세요.')
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(API_TOKEN ? { 'X-API-Token': API_TOKEN } : {}),
        ...init?.headers,
      },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'network', '백엔드에 연결할 수 없습니다. 서버가 켜져 있는지 확인하세요.')
  }

  if (!res.ok) {
    throw new ApiError(res.status, classifyStatus(res.status), await readDetail(res))
  }
  return (await res.json()) as T
}

/** 단일 턴 요청. history는 이번 요청 전까지의 [{role, content}] 전체. */
export async function ask(
  question: string,
  history: HistoryTurn[],
  docId: string | null,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const data = await request<Partial<AskResponse>>('/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      history,
      ...(docId ? { doc_id: docId } : {}),
    }),
    signal,
  })
  return {
    answer: typeof data.answer === 'string' ? data.answer : '',
    active_doc_id: data.active_doc_id ?? null,
    citations: Array.isArray(data.citations) ? data.citations : [],
    cost: data.cost && typeof data.cost === 'object' ? data.cost : {},
  }
}

/**
 * 공고 카드 — GET /rfps 계약. 백엔드가 meta.json에서 뽑아주는 값이라 대부분 null 가능.
 * doc_id는 /ask의 active_doc_id와 동일한 opaque id로, 상세 화면 채팅의 활성 문서로 쓴다.
 *
 * 백엔드 요구 버전: `surtleo/GPTPilots_Project` main 의 PR #20 이후.
 * 그 이전 버전으로 띄우면 이 두 엔드포인트가 없어 목록·상세가 404가 된다(채팅은 정상).
 * 확인: `curl -s -o /dev/null -w '%{http_code}' -H "X-API-Token: $TOKEN" localhost:8000/rfps`
 */
export interface RfpCard {
  doc_id: string
  공고번호: string | null
  사업명: string | null
  발주기관: string | null
  금액: number | null
  공개일: string | null
  마감일: string | null
  사업요약: string | null
  파일형식: string | null
}

export interface RfpListResponse {
  /** 필터 적용 후 전체 건수 — 페이지 크기와 무관. */
  total: number
  items: RfpCard[]
}

export interface RfpListParams {
  /** 사업명·발주기관 부분일치. */
  q?: string
  limit?: number
  offset?: number
}

/** 공고 카드 목록. LLM을 타지 않는 정적 열람이라 비용 0. */
export async function fetchRfps(
  { q, limit, offset }: RfpListParams = {},
  signal?: AbortSignal,
): Promise<RfpListResponse> {
  const params = new URLSearchParams()
  if (q?.trim()) params.set('q', q.trim())
  if (limit != null) params.set('limit', String(limit))
  if (offset != null) params.set('offset', String(offset))
  const query = params.toString()

  const data = await request<Partial<RfpListResponse>>(`/rfps${query ? `?${query}` : ''}`, {
    signal,
  })
  return {
    total: typeof data.total === 'number' ? data.total : 0,
    items: Array.isArray(data.items) ? data.items : [],
  }
}

/** 공고 카드 단건. 없는 doc_id는 404 → ApiError(kind: 'notfound'). */
export async function fetchRfp(docId: string, signal?: AbortSignal): Promise<RfpCard> {
  // doc_id는 슬래시·공백을 포함할 수 있는 장문 한글 id → 세그먼트 인코딩 필수.
  return request<RfpCard>(`/rfps/${encodeURIComponent(docId)}`, { signal })
}

/** 공고 원문(markdown) — 문서 뷰어용. 마스킹본이며 LLM을 타지 않아 비용 0. */
export interface RfpContent {
  doc_id: string
  사업명: string | null
  markdown: string
}

export async function fetchRfpContent(docId: string, signal?: AbortSignal): Promise<RfpContent> {
  return request<RfpContent>(`/rfps/${encodeURIComponent(docId)}/content`, { signal })
}

/**
 * 참가자격 매칭 (ELIGIBILITY_MATCH_PLAN.md).
 * verdict는 "적격"|"확인필요"|"미달"|"확인불가" 중 하나인데, /recommendations 응답에는
 * "적격"·"확인필요"만 온다(백엔드가 미리 걸러줌). **"확인필요"는 미충족 요건이 1건 이상
 * 있다는 뜻**이므로, 목록에 실렸다는 이유로 "참가 가능"이라고 바꿔 말하면 안 된다.
 */
export interface UnmetItem {
  requirement: string
  reason: string
}

export interface RecommendationItem {
  doc_id: string
  verdict: string
  사업명: string | null
  발주기관: string | null
  금액: number | null
  마감일: string | null
  /** 문서 사업요약에서 뽑은 키워드 — 회사 프로필 chips와 같은 방식. */
  chips: string[]
  /** 충족 확인된 요건 + 사유 — "왜 적격인지" 근거로 화면에 보여준다. */
  met: UnmetItem[]
  unmet: UnmetItem[]
  /** 확인 못 한 요건 목록 — 개수만 보여주면 무엇을 채워야 할지 알 수 없어서 목록까지 받는다. */
  unclear: UnmetItem[]
  /** 프로필에 언급이 없어 확인 못 한 요건 수 — "적격 = 다 확인됨"이 아님을 표시하는 용도. */
  unclear_count: number
  /** 참가불가 판정의 근거 조항. 추천 목록엔 참가불가가 안 실리므로 보통 비어 있다. */
  blocking: UnmetItem[]
  missing_count: number | null
  total: number
}

/**
 * 참가자격 판정 단건 — POST /eligibility/{doc_id}.
 *
 * 추천 목록(POST /recommendations)이 주는 판정과 같은 모양이지만, 이쪽은 문서를 직접
 * 지정한다. 전체 100건에서 담은 공고처럼 추천을 거치지 않은 문서도 판정할 수 있어서
 * "입찰 준비 점검"이 추천 여부와 무관하게 동작한다.
 */
export interface EligibilityResult {
  /** "적격"|"확인필요"|"미달"|"참가불가"|"확인불가".
   *  "참가불가"는 미충족 개수와 무관하게 그 자체로 참여가 막히는 요건(대기업집단 제한·
   *  부정당업자 제재)이 미충족일 때 온다 — 근거는 blocking에 실린다. */
  verdict: string
  met: UnmetItem[]
  unmet: UnmetItem[]
  /** 프로필에 언급이 없어 확인 못 한 요건 목록. 되묻는 질문을 이 문서에서 실제로
   *  불명확했던 항목으로 만들기 위해 필요하다(예전엔 개수만 와서 알 수 없었다). */
  unclear: UnmetItem[]
  unclear_count: number
  /** 참가불가 판정의 근거 조항. 비어 있으면 즉시 탈락 사유가 없다는 뜻. */
  blocking: UnmetItem[]
  missing_count: number | null
  total: number
}

export async function fetchEligibility(
  docId: string,
  profileText: string,
  signal?: AbortSignal,
): Promise<EligibilityResult> {
  const data = await request<Partial<EligibilityResult>>(
    // doc_id는 슬래시·공백을 포함할 수 있는 장문 한글 id → 세그먼트 인코딩 필수.
    `/eligibility/${encodeURIComponent(docId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_text: profileText }),
      signal,
    },
  )
  return {
    verdict: typeof data.verdict === 'string' ? data.verdict : '확인불가',
    met: Array.isArray(data.met) ? data.met : [],
    unmet: Array.isArray(data.unmet) ? data.unmet : [],
    unclear: Array.isArray(data.unclear) ? data.unclear : [],
    unclear_count: typeof data.unclear_count === 'number' ? data.unclear_count : 0,
    blocking: Array.isArray(data.blocking) ? data.blocking : [],
    missing_count: typeof data.missing_count === 'number' ? data.missing_count : null,
    total: typeof data.total === 'number' ? data.total : 0,
  }
}

/**
 * POST /recommendations/stream의 진행 이벤트 (NDJSON 한 줄 = 이벤트 하나).
 * "무진행 로딩"이 고통스럽다는 피드백으로 만듦(2026-07-29) — 후보 추림·배치별 매칭
 * 완료·최종 결과를 실시간으로 받아 화면에 단계별로 보여줄 수 있다.
 */
export type RecommendationProgressEvent =
  | { type: 'candidates'; count: number }
  | { type: 'matching'; done: number; total: number }
  | { type: 'heartbeat' }
  | { type: 'enriching' }
  | { type: 'done'; items: RecommendationItem[] }
  | { type: 'error'; message: string }

/**
 * 회사 프로필 → 추천 목록을 스트리밍으로 받는다. onEvent는 각 NDJSON 줄이 도착할 때마다
 * 호출된다 — "done"·"error"가 오면 그 시점에 함수가 끝난다(별도 반환값 없음, 호출부가
 * onEvent 안에서 items/error를 받아 상태에 반영할 것).
 * fetch의 body ReadableStream을 직접 읽는 이유: EventSource(SSE)는 GET만 지원해서
 * POST 바디(프로필 텍스트)를 못 보낸다.
 */
export async function streamRecommendations(
  profileText: string,
  onEvent: (event: RecommendationProgressEvent) => void,
  signal?: AbortSignal,
  /**
   * 공고 후보를 고를 때만 쓸 짧은 텍스트(자유서술 + 주력 분야). 참가자격 대조에는
   * profileText 전체가 쓰인다. 생략하면 백엔드가 profileText로 둘 다 한다(기존 동작).
   * 자격 체크리스트를 검색에 섞으면 회사별 구분이 희석된다 — 근거는
   * profile-context.tsx의 searchText 주석 참고.
   */
  searchText?: string,
): Promise<void> {
  if (!API_URL) {
    onEvent({ type: 'error', message: 'VITE_API_URL이 설정되지 않았습니다. .env를 확인하세요.' })
    return
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/recommendations/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_TOKEN ? { 'X-API-Token': API_TOKEN } : {}),
      },
      body: JSON.stringify({
        profile_text: profileText,
        ...(searchText?.trim() ? { search_text: searchText.trim() } : {}),
      }),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    onEvent({
      type: 'error',
      message: '백엔드에 연결할 수 없습니다. 서버가 켜져 있는지 확인하세요.',
    })
    return
  }

  if (!res.ok || !res.body) {
    onEvent({ type: 'error', message: await readDetail(res) })
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    for (let newlineAt = buffer.indexOf('\n'); newlineAt !== -1; newlineAt = buffer.indexOf('\n')) {
      const line = buffer.slice(0, newlineAt).trim()
      buffer = buffer.slice(newlineAt + 1)
      if (!line) continue
      try {
        onEvent(JSON.parse(line) as RecommendationProgressEvent)
      } catch {
        // 한 줄이 깨져 파싱 실패해도 스트림 자체는 계속 읽는다 — 다음 줄에서 복구될 수 있다.
      }
    }
  }
}

/** 응답을 라우팅 3케이스로 분류 (계약 4필드만으로 추론). */
export function classifyAnswer(res: AskResponse): AnswerKind {
  const answer = res.answer.trim()
  if (answer === NO_EVIDENCE_ANSWER) return 'no_evidence'
  if (answer.startsWith(CLARIFY_PREFIX) || answer.startsWith(EXPLORE_PREFIX)) return 'clarify'
  if (res.active_doc_id === null && res.citations.length === 0) return 'clarify'
  return 'answer'
}
