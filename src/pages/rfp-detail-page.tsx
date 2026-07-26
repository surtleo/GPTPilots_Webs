import { useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FileText, Paperclip, RotateCcw, SendHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TopNav } from '@/components/layout/top-nav'
import { ChatView } from '@/components/chat-view'
import { useChat } from '@/hooks/use-chat'
import { MOCK_RFP_DETAILS, MOCK_RFPS } from '@/lib/mock-data'

/**
 * 화면 4 — RFP 상세(좌측, 목업) + AI 상담 채팅(우측).
 * 채팅 패널만 실제 백엔드(useChat → POST /ask)와 연동된다 (spec §13-2·§13-6).
 * 좌측 사업 상세는 추천 백엔드가 없어 목업 데이터를 사용한다.
 */
export function RfpDetailPage() {
  const { id } = useParams<{ id: string }>()
  const detail = (id && MOCK_RFP_DETAILS[id]) || MOCK_RFP_DETAILS[MOCK_RFPS[0].id]
  const chat = useChat()

  return (
    <div className="flex min-h-screen flex-col bg-secondary">
      <TopNav />
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-2.5">
          <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            활성 문서
          </span>
          {chat.activeDocId ? (
            <span
              title={chat.activeDocId}
              className="inline-flex min-w-0 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs"
            >
              <FileText className="size-3.5 shrink-0 text-primary" />
              <span className="truncate font-mono text-muted-foreground">{chat.activeDocId}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              미선택 — 질문에 사업명을 포함하면 라우터가 문서를 특정합니다
            </span>
          )}
          {chat.messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={chat.reset} className="ml-auto gap-1.5">
              <RotateCcw className="size-3.5" />새 대화
            </Button>
          )}
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-6 py-6">
        <RfpPanel detail={detail} />

        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background">
          <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{detail.title}</span>에 대해 질문하면
            근거(출처·인용)와 함께 답합니다
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <ChatView messages={chat.messages} loading={chat.loading} error={chat.error} />
          </div>
          {chat.messages.length === 0 && (
            <div className="flex flex-wrap gap-2 px-5 pb-1">
              {detail.suggestedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void chat.send(`${detail.title} ${q}`)}
                  className="rounded-full border border-border px-3.5 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <Composer onSend={chat.send} loading={chat.loading} />
        </div>
      </main>
    </div>
  )
}

function RfpPanel({ detail }: { detail: (typeof MOCK_RFP_DETAILS)[string] }) {
  return (
    <aside className="w-[380px] shrink-0 overflow-y-auto rounded-xl border border-border bg-background p-6">
      <h1 className="font-heading text-h3 leading-snug font-semibold tracking-tight">
        {detail.title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{detail.org}</p>

      <h2 className="mt-6 mb-2 text-sm font-semibold">사업 개요</h2>
      <p className="text-sm leading-relaxed text-foreground">{detail.overview}</p>

      <h2 className="mt-6 mb-2 text-sm font-semibold">주요 조건</h2>
      <div className="overflow-hidden rounded-md border border-border">
        {detail.conditions.map((c, i) => (
          <div key={c.label} className={`flex text-sm ${i > 0 ? 'border-t border-border' : ''}`}>
            <span className="w-28 shrink-0 bg-muted px-3 py-2 text-muted-foreground">
              {c.label}
            </span>
            <span className="flex-1 px-3 py-2">{c.value}</span>
          </div>
        ))}
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold">첨부파일</h2>
      <div className="flex flex-col gap-2">
        {detail.attachments.map((a) => (
          <div
            key={a.name}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{a.name}</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">{a.size}</span>
          </div>
        ))}
      </div>

      <Link
        to="/recommendations"
        className="mt-6 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        ← 추천 목록으로
      </Link>
    </aside>
  )
}

function Composer({
  onSend,
  loading,
}: {
  onSend: (text: string) => void | Promise<void>
  loading: boolean
}) {
  const [text, setText] = useState('')

  const submit = () => {
    const value = text.trim()
    if (!value || loading) return
    void onSend(value)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-end gap-3">
        <Textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading}
          placeholder="질문을 입력하세요… (Enter 전송 · Shift+Enter 줄바꿈)"
          className="max-h-40 min-h-11 resize-none"
          aria-label="질문 입력"
        />
        <Button
          size="lg"
          onClick={submit}
          disabled={loading || text.trim().length === 0}
          className="gap-2"
        >
          <SendHorizontal className="size-4" />
          전송
        </Button>
      </div>
    </div>
  )
}
