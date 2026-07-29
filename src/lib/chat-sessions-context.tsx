import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  ApiError,
  ask,
  classifyAnswer,
  type AnswerKind,
  type ChatRole,
  type Citation,
  type Cost,
  type ErrorKind,
  type HistoryTurn,
} from '@/lib/api'

const STORAGE_KEY = 'bidmate.chat-sessions.v1'
const MAX_SESSIONS = 30 // 무한정 쌓이지 않게 상한 — 넘으면 제일 오래된 것부터 버림
const TITLE_MAX_LEN = 28

export interface AssistantMeta {
  kind: AnswerKind
  citations: Citation[]
  cost: Cost
  activeDocId: string | null
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  meta?: AssistantMeta
}

export interface ChatError {
  kind: ErrorKind
  status: number
  message: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  activeDocId: string | null
  updatedAt: number
}

interface ChatSessionsValue {
  /** updatedAt 내림차순(최신 먼저) — 사이드바 "최근 대화" 목록이 그대로 이 순서를 쓴다. */
  sessions: ChatSession[]
  currentId: string | null
  current: ChatSession | null
  loading: boolean
  error: ChatError | null
  /** 사이드바 "새 대화" — 빈 세션을 즉시 만들어 현재로 전환한다(문서 미지정). */
  startNew: () => void
  /** 사이드바 "최근 대화" 항목 클릭 — 그 세션으로 전환. */
  select: (id: string) => void
  /** 대화 삭제. 지금 보고 있던 대화를 지우면 그다음으로 최근인 대화로 자동 전환하고,
   *  그마저 없으면 빈 상태(currentId: null)로 둔다 — chat-page.tsx가 첫 화면을 보여준다. */
  remove: (id: string) => void
  send: (text: string) => Promise<void>
  /**
   * 활성 문서(사이드바 A 슬롯)가 바뀌었을 때 chat-page.tsx가 호출한다.
   * 지금 세션이 아직 빈 상태면 그냥 문서만 얹고, 이미 대화가 진행 중이면 그 대화는
   * 히스토리에 그대로 남기고 새 문서로 새 세션을 시작한다(예전엔 그냥 덮어썼음).
   */
  setActiveDoc: (docId: string | null, title: string | null) => void
}

const ChatSessionsContext = createContext<ChatSessionsValue | null>(null)

interface Persisted {
  sessions: ChatSession[]
  currentId: string | null
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { sessions: [], currentId: null }
    const parsed = JSON.parse(raw) as Persisted
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      currentId: parsed.currentId ?? null,
    }
  } catch {
    return { sessions: [], currentId: null }
  }
}

function save(data: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // 저장 용량 초과 등 — 히스토리는 있으면 좋은 것일 뿐이라 조용히 무시한다.
  }
}

function makeTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > TITLE_MAX_LEN ? `${t.slice(0, TITLE_MAX_LEN)}…` : t
}

function emptySession(activeDocId: string | null, title: string | null): ChatSession {
  return {
    id: `s${Date.now()}${Math.floor(Math.random() * 1000)}`,
    title: title ?? '새 대화',
    messages: [],
    activeDocId,
    updatedAt: Date.now(),
  }
}

/**
 * 대화 히스토리 — 클로드처럼 "새 대화"와 "최근 대화" 목록을 실제로 구분한다.
 * 예전엔 사이드바에 큰 "새 대화" 버튼과 "대화" 탭이 사실상 같은 동작(그냥 /chat 이동)
 * 이라 중복이었다(2026-07-29 피드백). 이제 세션 여러 개를 실제로 저장·전환할 수 있어
 * 두 버튼의 역할이 진짜로 달라진다 — "대화"는 지금 보던 세션 그대로, "새 대화"는
 * 진짜 빈 세션을 새로 만든다.
 */
export function ChatSessionsProvider({ children }: { children: ReactNode }) {
  const initial = useRef(load())
  const [sessions, setSessions] = useState<ChatSession[]>(initial.current.sessions)
  const [currentId, setCurrentId] = useState<string | null>(initial.current.currentId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ChatError | null>(null)
  const idRef = useRef(0)
  const nextMsgId = () => `m${(idRef.current += 1)}`

  const persist = useCallback((next: ChatSession[], nextCurrentId: string | null) => {
    save({ sessions: next, currentId: nextCurrentId })
  }, [])

  const current = useMemo(
    () => sessions.find((s) => s.id === currentId) ?? null,
    [sessions, currentId],
  )

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  )

  const startNew = useCallback(() => {
    setSessions((prev) => {
      const fresh = emptySession(null, null)
      const next = [fresh, ...prev].slice(0, MAX_SESSIONS)
      setCurrentId(fresh.id)
      persist(next, fresh.id)
      return next
    })
    setError(null)
  }, [persist])

  const select = useCallback(
    (id: string) => {
      setCurrentId(id)
      setError(null)
      persist(sessions, id)
    },
    [sessions, persist],
  )

  const remove = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        setCurrentId((prevCurrentId) => {
          if (prevCurrentId !== id) {
            persist(next, prevCurrentId)
            return prevCurrentId // 지금 보던 게 아니면 currentId는 그대로
          }
          // 지금 보던 대화를 지운 경우 — 남은 것 중 제일 최근 것으로, 없으면 빈 상태.
          const nextCurrent = next.length
            ? next.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b)).id
            : null
          persist(next, nextCurrent)
          return nextCurrent
        })
        return next
      })
    },
    [persist],
  )

  const setActiveDoc = useCallback(
    (docId: string | null, title: string | null) => {
      setSessions((prev) => {
        const cur = prev.find((s) => s.id === currentId)
        // 세션이 아직 없거나, 있어도 비어있으면(대화 시작 전) 그냥 문서만 얹는다 —
        // 잃을 대화 내용이 없으니 새 세션을 만들 필요가 없다.
        if (!cur || cur.messages.length === 0) {
          if (cur && cur.activeDocId === docId) return prev // 이미 같음
          const patched: ChatSession = cur
            ? { ...cur, activeDocId: docId, title: title ?? cur.title, updatedAt: Date.now() }
            : emptySession(docId, title)
          const rest = prev.filter((s) => s.id !== patched.id)
          const next = [patched, ...rest].slice(0, MAX_SESSIONS)
          setCurrentId(patched.id)
          persist(next, patched.id)
          return next
        }
        // 이미 대화가 있는데 문서가 바뀌면 — 그 대화는 히스토리에 남기고 새 세션 시작.
        if (cur.activeDocId === docId) return prev
        const fresh = emptySession(docId, title)
        const next = [fresh, ...prev].slice(0, MAX_SESSIONS)
        setCurrentId(fresh.id)
        persist(next, fresh.id)
        return next
      })
    },
    [currentId, persist],
  )

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || loading) return
      setError(null)

      let sessionId = currentId
      let base = current
      if (!base) {
        base = emptySession(null, null)
        sessionId = base.id
      }
      const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', content: text }
      const historyForRequest: HistoryTurn[] = base.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const activeDocId = base.activeDocId
      const isFirstMessage = base.messages.length === 0

      setSessions((prev) => {
        const exists = prev.some((s) => s.id === sessionId)
        const withUser: ChatSession = {
          ...base!,
          id: sessionId!,
          title: isFirstMessage ? makeTitle(text) : base!.title,
          messages: [...base!.messages, userMsg],
          updatedAt: Date.now(),
        }
        const next = exists
          ? prev.map((s) => (s.id === sessionId ? withUser : s))
          : [withUser, ...prev].slice(0, MAX_SESSIONS)
        persist(next, sessionId)
        return next
      })
      setCurrentId(sessionId)
      setLoading(true)

      try {
        const res = await ask(text, historyForRequest, activeDocId)
        setSessions((prev) => {
          const next = prev.map((s) => {
            if (s.id !== sessionId) return s
            return {
              ...s,
              activeDocId: res.active_doc_id,
              updatedAt: Date.now(),
              messages: [
                ...s.messages,
                {
                  id: nextMsgId(),
                  role: 'assistant' as ChatRole,
                  content: res.answer,
                  meta: {
                    kind: classifyAnswer(res),
                    citations: res.citations,
                    cost: res.cost,
                    activeDocId: res.active_doc_id,
                  },
                },
              ],
            }
          })
          persist(next, sessionId)
          return next
        })
      } catch (err) {
        if (err instanceof ApiError) {
          setError({ kind: err.kind, status: err.status, message: err.message })
        } else {
          setError({ kind: 'unknown', status: 0, message: '알 수 없는 오류가 발생했습니다.' })
        }
      } finally {
        setLoading(false)
      }
    },
    [current, currentId, loading, persist],
  )

  return (
    <ChatSessionsContext.Provider
      value={{
        sessions: sortedSessions,
        currentId,
        current,
        loading,
        error,
        startNew,
        select,
        remove,
        send,
        setActiveDoc,
      }}
    >
      {children}
    </ChatSessionsContext.Provider>
  )
}

export function useChatSessions(): ChatSessionsValue {
  const ctx = useContext(ChatSessionsContext)
  if (!ctx) throw new Error('useChatSessions는 ChatSessionsProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
