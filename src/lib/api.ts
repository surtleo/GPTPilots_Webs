/**
 * BidMate 백엔드 API 클라이언트 — POST /ask 왕복 (spec §13-2·§13-6).
 *
 * 응답 계약: { answer, active_doc_id, citations[], cost }.
 * - cost는 열린 객체 → 관대 파싱(특정 키 하드가정 금지, spec §13-6).
 * - active_doc_id·citations[].doc_id는 장문 한글 opaque id → 렌더 시 truncate/tooltip.
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

export type ErrorKind = 'auth' | 'validation' | 'rate' | 'server' | 'network' | 'unknown'

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

/** 단일 턴 요청. history는 이번 요청 전까지의 [{role, content}] 전체. */
export async function ask(
  question: string,
  history: HistoryTurn[],
  docId: string | null,
  signal?: AbortSignal,
): Promise<AskResponse> {
  if (!API_URL) {
    throw new ApiError(0, 'network', 'VITE_API_URL이 설정되지 않았습니다. .env를 확인하세요.')
  }

  let res: Response
  try {
    res = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_TOKEN ? { 'X-API-Token': API_TOKEN } : {}),
      },
      body: JSON.stringify({
        question,
        history,
        ...(docId ? { doc_id: docId } : {}),
      }),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'network', '백엔드에 연결할 수 없습니다. 서버가 켜져 있는지 확인하세요.')
  }

  if (!res.ok) {
    throw new ApiError(res.status, classifyStatus(res.status), await readDetail(res))
  }

  const data = (await res.json()) as Partial<AskResponse>
  return {
    answer: typeof data.answer === 'string' ? data.answer : '',
    active_doc_id: data.active_doc_id ?? null,
    citations: Array.isArray(data.citations) ? data.citations : [],
    cost: data.cost && typeof data.cost === 'object' ? data.cost : {},
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
