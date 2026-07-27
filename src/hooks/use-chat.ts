import { useCallback, useEffect, useRef, useState } from 'react'

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

export interface UseChat {
  messages: ChatMessage[]
  activeDocId: string | null
  loading: boolean
  error: ChatError | null
  send: (text: string) => Promise<void>
  reset: () => void
}

/**
 * 멀티턴 채팅 상태 + /ask 왕복. history는 매 요청 전 전체 턴을 전달한다.
 *
 * initialDocId를 주면 첫 질문부터 그 문서로 고정되어, 사업명을 말하지 않아도
 * 반문 없이 바로 근거 기반 답변을 받는다 (상세 화면에서 사용).
 */
export function useChat(initialDocId: string | null = null): UseChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(initialDocId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ChatError | null>(null)
  const idRef = useRef(0)

  const nextId = () => `m${(idRef.current += 1)}`

  // initialDocId는 카드 조회가 끝난 뒤에야 도착한다. 대화가 시작되기 전까지만 반영해
  // 진행 중인 대화의 활성 문서(백엔드가 전환해준 값)를 덮어쓰지 않는다.
  useEffect(() => {
    if (initialDocId && messages.length === 0) setActiveDocId(initialDocId)
  }, [initialDocId, messages.length])

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || loading) return
      setError(null)

      // 이번 요청 전까지의 대화 전체를 history로 전달 (백엔드가 doc 전환 시 내부 절삭).
      const history: HistoryTurn[] = messages.map((m) => ({ role: m.role, content: m.content }))
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: text }])
      setLoading(true)

      try {
        const res = await ask(text, history, activeDocId)
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: res.answer,
            meta: {
              kind: classifyAnswer(res),
              citations: res.citations,
              cost: res.cost,
              activeDocId: res.active_doc_id,
            },
          },
        ])
        setActiveDocId(res.active_doc_id)
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
    [messages, activeDocId, loading],
  )

  const reset = useCallback(() => {
    setMessages([])
    setActiveDocId(initialDocId) // 새 대화도 같은 문서 맥락에서 다시 시작한다
    setError(null)
  }, [initialDocId])

  return { messages, activeDocId, loading, error, send, reset }
}
