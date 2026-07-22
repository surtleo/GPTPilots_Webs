import { useState, type KeyboardEvent } from 'react'
import { FileText, RotateCcw, SendHorizontal, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatView } from '@/components/chat-view'
import { useChat } from '@/hooks/use-chat'

/**
 * BidMate 앱 셸 (Phase 8.6) — 헤더 · 문서 상태 · 대화영역 · 입력 dock.
 * useChat 훅으로 로컬 백엔드 POST /ask와 멀티턴 왕복한다 (spec §13-2·§13-6).
 */
export function AppShell() {
  const chat = useChat()

  return (
    <div className="flex h-screen flex-col bg-secondary text-foreground">
      <AppHeader hasMessages={chat.messages.length > 0} onReset={chat.reset} />
      <ActiveDocBar activeDocId={chat.activeDocId} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col overflow-y-auto px-6 py-8">
        <ChatView messages={chat.messages} loading={chat.loading} error={chat.error} />
      </main>
      <MessageComposer onSend={chat.send} loading={chat.loading} />
    </div>
  )
}

function AppHeader({ hasMessages, onReset }: { hasMessages: boolean; onReset: () => void }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-h3 leading-none font-semibold tracking-tight">
              BidMate
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">RFP 입찰 분석 어시스턴트</p>
          </div>
        </div>
        {hasMessages && (
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5">
            <RotateCcw className="size-3.5" />새 대화
          </Button>
        )}
      </div>
    </header>
  )
}

function ActiveDocBar({ activeDocId }: { activeDocId: string | null }) {
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-2.5">
        <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          활성 문서
        </span>
        {activeDocId ? (
          <span
            title={activeDocId}
            className="inline-flex min-w-0 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1 text-xs"
          >
            <FileText className="size-3.5 shrink-0 text-primary" />
            <span className="truncate font-mono text-muted-foreground">{activeDocId}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            미선택 — 질문에 사업명을 포함하면 라우터가 문서를 특정합니다
          </span>
        )}
      </div>
    </div>
  )
}

function MessageComposer({
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
    <div className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-end gap-3 px-6 py-4">
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
