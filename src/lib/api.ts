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

/** 응답을 라우팅 3케이스로 분류 (계약 4필드만으로 추론). */
export function classifyAnswer(res: AskResponse): AnswerKind {
  const answer = res.answer.trim()
  if (answer === NO_EVIDENCE_ANSWER) return 'no_evidence'
  if (answer.startsWith(CLARIFY_PREFIX) || answer.startsWith(EXPLORE_PREFIX)) return 'clarify'
  if (res.active_doc_id === null && res.citations.length === 0) return 'clarify'
  return 'answer'
}
