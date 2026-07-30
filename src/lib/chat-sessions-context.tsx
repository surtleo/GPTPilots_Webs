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
  type AskResponse,
  type ChatRole,
  type Citation,
  type Cost,
  type ErrorKind,
  type HistoryTurn,
} from '@/lib/api'
import type { MessageCard } from '@/lib/chat-cards'

const STORAGE_KEY = 'bidmate.chat-sessions.v1'
const MAX_SESSIONS = 30 // 무한정 쌓이지 않게 상한 — 넘으면 제일 오래된 것부터 버림
const TITLE_MAX_LEN = 28

export interface AssistantMeta {
  kind: AnswerKind
  citations: Citation[]
  cost: Cost
  activeDocId: string | null
  /** 이 답변이 만들어낸 파일(비교표·핵심 정리) — 답변 아래 열기 카드로 붙는다. */
  fileIds?: string[]
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  meta?: AssistantMeta
  /** 카드형 메시지(진행 단계·확인 질문·점검 결과·반문 후보). 없으면 평범한 말풍선. */
  card?: MessageCard
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
  /** 사이드바 목록 두 번째 줄에 쓰는 사업명 — doc_id는 장문 opaque id라 그대로는 못 읽는다. */
  activeDocTitle: string | null
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
  /**
   * 성공하면 응답을, 실패·중복호출이면 null을 준다 — 호출부가 답변을 파일로도 저장할 수 있게.
   *
   * displayText는 대화에 남길 사용자 발화. 지시문을 덧붙여 물어야 하는 흐름(핵심 정리 등)에서
   * 백엔드로 보내는 질문과 화면에 남길 말을 분리하려고 있다 — 사용자가 하지도 않은 문장을
   * 사용자 말풍선에 남기지 않기 위해서다.
   */
  send: (text: string, opts?: { displayText?: string }) => Promise<AskResponse | null>
  /**
   * API를 태우지 않고 메시지만 대화에 남긴다.
   * "맞춤 공고 3건 찾았어요" 같은, 대화 흐름을 잇지만 LLM을 부를 이유는 없는 안내용.
   * 만든 메시지 id를 돌려준다 — 카드는 나중에 갱신해야 해서(진행 단계·질문 답변) 필요하다.
   *
   * sessionId를 주면 그 세션에 쓰고, 지금 보고 있는 세션으로 화면을 튕기지 않는다 —
   * 추천 대조처럼 1~2분 걸리는 흐름이 끝났을 때, 그사이 사용자가 다른 대화로 넘어갔다면
   * 결과는 흐름을 시작한 세션에 남아야지 지금 보고 있는 엉뚱한 세션에 끼어들면 안 된다.
   * 생략하면 기존처럼 지금 보고 있는 세션에 쓰고 그쪽으로 전환한다(사용자가 직접 친 말 등).
   */
  pushLocal: (
    role: ChatRole,
    content: string,
    opts?: { meta?: Partial<AssistantMeta>; card?: MessageCard; sessionId?: string },
  ) => string
  /** 이미 띄운 카드를 갱신한다 — 진행 단계 완료 표시, 확인 질문에 답한 표시 등.
   *  sessionId를 주면 그 세션의 카드를 갱신한다(생략하면 지금 보고 있는 세션). */
  patchCard: (messageId: string, patch: Partial<MessageCard>, sessionId?: string) => void
  /**
   * 활성 문서(사이드바 A 슬롯)가 바뀌었을 때 chat-page.tsx가 호출한다.
   * 지금 세션이 아직 빈 상태면 그냥 문서만 얹고, 이미 대화가 진행 중이면 그 대화는
   * 히스토리에 그대로 남기고 새 문서로 새 세션을 시작한다(예전엔 그냥 덮어썼음).
   */
  setActiveDoc: (docId: string | null, title: string | null) => void
  /**
   * 지금 이 순간의 currentId를 동기적으로 읽는다. currentId(state)는 리액트 리렌더를
   * 거쳐야 갱신되는데, 배경에서 도는 흐름(추천 대조 등)이 "자신이 어느 세션에서 시작했는지"를
   * 정확히 잡아둬야 할 때는 그 텀도 위험하다 — ref로 즉시 값을 준다.
   */
  peekCurrentId: () => string | null
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
    activeDocTitle: title,
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
  // currentId(state)를 그대로 미러링하되 항상 동기적으로 최신이다 — setCurrentId를 부르는
  // 모든 자리에서 같이 갱신한다. pushLocal/patchCard가 "지금 세션"을 판단할 때 state 대신
  // 이 ref를 쓰면, 같은 틱 안에서 세션이 막 만들어진 직후에도(리렌더 전) 정확한 값을 읽는다.
  const currentIdRef = useRef<string | null>(initial.current.currentId)
  // 메시지 id에 이 탭에서만 쓰는 접두사를 붙인다. 카운터만 쓰면 새로고침 때 0으로 되돌아가는데
  // 세션은 localStorage에 남아 있어서, 같은 대화 안에 m1이 두 개 생긴다 — React key가 겹치는
  // 것도 문제지만, 카드 갱신(patchCard)·확인 질문 답변이 id로 대상을 찾기 때문에 새로 띄운
  // 카드를 건드리면 복원된 옛 카드까지 같이 바뀐다.
  const idPrefix = useRef(
    `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
  )
  const nextMsgId = () => `m${idPrefix.current}-${(idRef.current += 1).toString(36)}`

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
      currentIdRef.current = fresh.id
      setCurrentId(fresh.id)
      persist(next, fresh.id)
      return next
    })
    setError(null)
  }, [persist])

  const select = useCallback(
    (id: string) => {
      currentIdRef.current = id
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
        if (currentIdRef.current !== id) {
          persist(next, currentIdRef.current) // 지금 보던 게 아니면 currentId는 그대로
          return next
        }
        // 지금 보던 대화를 지운 경우 — 남은 것 중 제일 최근 것으로, 없으면 빈 상태.
        const nextCurrent = next.length
          ? next.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b)).id
          : null
        currentIdRef.current = nextCurrent
        setCurrentId(nextCurrent)
        persist(next, nextCurrent)
        return next
      })
    },
    [persist],
  )

  const setActiveDoc = useCallback(
    (docId: string | null, title: string | null) => {
      setSessions((prev) => {
        const cur = prev.find((s) => s.id === currentIdRef.current)
        // 세션이 아직 없거나, 있어도 비어있으면(대화 시작 전) 그냥 문서만 얹는다 —
        // 잃을 대화 내용이 없으니 새 세션을 만들 필요가 없다.
        if (!cur || cur.messages.length === 0) {
          if (cur && cur.activeDocId === docId) return prev // 이미 같음
          const patched: ChatSession = cur
            ? {
                ...cur,
                activeDocId: docId,
                activeDocTitle: title,
                title: title ?? cur.title,
                updatedAt: Date.now(),
              }
            : emptySession(docId, title)
          const rest = prev.filter((s) => s.id !== patched.id)
          const next = [patched, ...rest].slice(0, MAX_SESSIONS)
          currentIdRef.current = patched.id
          setCurrentId(patched.id)
          persist(next, patched.id)
          return next
        }
        // 이미 대화가 있는데 문서가 바뀌면 — 그 대화는 히스토리에 남기고 새 세션 시작.
        if (cur.activeDocId === docId) return prev
        const fresh = emptySession(docId, title)
        const next = [fresh, ...prev].slice(0, MAX_SESSIONS)
        currentIdRef.current = fresh.id
        setCurrentId(fresh.id)
        persist(next, fresh.id)
        return next
      })
    },
    [persist],
  )

  const pushLocal = useCallback(
    (
      role: ChatRole,
      content: string,
      opts?: { meta?: Partial<AssistantMeta>; card?: MessageCard; sessionId?: string },
    ) => {
      // id는 updater 밖에서 만든다 — StrictMode에서 updater가 두 번 돌면 id가 중복된다.
      const id = nextMsgId()
      const targetId = opts?.sessionId ?? currentIdRef.current
      setSessions((prev) => {
        const cur = prev.find((s) => s.id === targetId)
        const base = cur ?? emptySession(null, null)
        const msg: ChatMessage = {
          id,
          role,
          content,
          card: opts?.card,
          meta:
            role === 'assistant'
              ? {
                  kind: 'answer',
                  citations: [],
                  cost: {},
                  activeDocId: base.activeDocId,
                  ...opts?.meta,
                }
              : undefined,
        }
        const patched: ChatSession = {
          ...base,
          title: base.messages.length === 0 && role === 'user' ? makeTitle(content) : base.title,
          messages: [...base.messages, msg],
          updatedAt: Date.now(),
        }
        const next = cur
          ? prev.map((s) => (s.id === patched.id ? patched : s))
          : [patched, ...prev].slice(0, MAX_SESSIONS)
        // sessionId를 명시했는데 그게 지금 보고 있는 세션이 아니면, 화면을 그쪽으로 튕기지
        // 않는다 — 배경 흐름(추천 대조 등)이 끝났을 때 다른 대화를 보고 있던 화면이
        // 갑자기 바뀌면 안 된다. 명시하지 않았으면(사용자가 직접 친 말 등) 기존처럼 전환.
        const shouldFollow = !opts?.sessionId || opts.sessionId === currentIdRef.current
        const nextCurrentId = shouldFollow ? patched.id : currentIdRef.current
        if (shouldFollow) currentIdRef.current = nextCurrentId
        setCurrentId(nextCurrentId)
        persist(next, nextCurrentId)
        return next
      })
      return id
    },
    [persist],
  )

  const patchCard = useCallback(
    (messageId: string, patch: Partial<MessageCard>, sessionId?: string) => {
      setSessions((prev) => {
        const targetId = sessionId ?? currentIdRef.current
        const next = prev.map((s) =>
          s.id === targetId
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === messageId && m.card
                    ? { ...m, card: { ...m.card, ...patch } as MessageCard }
                    : m,
                ),
              }
            : s,
        )
        persist(next, currentIdRef.current)
        return next
      })
    },
    [persist],
  )

  const peekCurrentId = useCallback(() => currentIdRef.current, [])

  const send = useCallback(
    async (raw: string, opts?: { displayText?: string }): Promise<AskResponse | null> => {
      const text = raw.trim()
      if (!text || loading) return null
      const shown = opts?.displayText?.trim() || text
      setError(null)

      let sessionId = currentId
      let base = current
      if (!base) {
        base = emptySession(null, null)
        sessionId = base.id
      }
      const userMsg: ChatMessage = { id: nextMsgId(), role: 'user', content: shown }
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
          title: isFirstMessage ? makeTitle(shown) : base!.title,
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
        return res
      } catch (err) {
        if (err instanceof ApiError) {
          setError({ kind: err.kind, status: err.status, message: err.message })
        } else {
          setError({ kind: 'unknown', status: 0, message: '알 수 없는 오류가 발생했습니다.' })
        }
        return null
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
        pushLocal,
        patchCard,
        setActiveDoc,
        peekCurrentId,
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
