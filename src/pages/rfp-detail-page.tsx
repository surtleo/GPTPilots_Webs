import { useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertCircle, FileText, RotateCcw, SendHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TopNav } from '@/components/layout/top-nav'
import { ChatView } from '@/components/chat-view'
import { useChat } from '@/hooks/use-chat'
import { useRfp, type LoadError } from '@/hooks/use-rfps'
import { deadlineBadge, formatAmount, formatDate } from '@/lib/format'
import type { RfpCard } from '@/lib/api'

/** 문서를 특정한 상태에서 바로 던질 수 있는 정적 프롬프트 (사업명은 백엔드 doc_id로 고정된다). */
const SUGGESTED_QUESTIONS = ['주요 과업 내용은?', '참가 자격 요건은?', '평가 기준이 어떻게 되나요?']

/**
 * 화면 4 — RFP 상세(좌측) + AI 상담 채팅(우측). 둘 다 실제 백엔드 연동이다.
 * 좌측은 GET /rfps/{doc_id}, 우측은 POST /ask (spec §13-2·§13-6).
 * URL의 :id는 인코딩된 doc_id — 그대로 카드 조회와 채팅의 활성 문서로 쓴다.
 */
export function RfpDetailPage() {
  const { id } = useParams<{ id: string }>()
  const docId = id ? decodeURIComponent(id) : undefined
  const { card, loading, error } = useRfp(docId)
  const chat = useChat(card?.doc_id ?? null)

  const title = card?.사업명 ?? docId ?? '공고'

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
        <RfpPanel card={card} loading={loading} error={error} />

        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-background">
          <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
            {card ? (
              <>
                <span className="font-medium text-foreground">{title}</span>에 대해 질문하면
                근거(출처·인용)와 함께 답합니다
              </>
            ) : (
              '공고를 확인한 뒤 질문할 수 있습니다'
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <ChatView
              messages={chat.messages}
              loading={chat.loading}
              error={chat.error}
              emptyHint={
                card
                  ? '이 공고가 활성 문서로 지정돼 있어, 사업명을 적지 않아도 이 문서를 근거로 답변합니다.'
                  : '공고를 불러오지 못해 질문을 받을 수 없습니다.'
              }
            />
          </div>
          {chat.messages.length === 0 && card && (
            <div className="flex flex-wrap gap-2 px-5 pb-1">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void chat.send(q)}
                  className="rounded-full border border-border px-3.5 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <Composer onSend={chat.send} loading={chat.loading} disabled={!card} />
        </div>
      </main>
    </div>
  )
}

function RfpPanel({
  card,
  loading,
  error,
}: {
  card: RfpCard | null
  loading: boolean
  error: LoadError | null
}) {
  return (
    <aside className="w-[380px] shrink-0 overflow-y-auto rounded-xl border border-border bg-background p-6">
      {loading ? (
        <PanelSkeleton />
      ) : error || !card ? (
        <PanelError error={error} />
      ) : (
        <PanelBody card={card} />
      )}
      <Link
        to="/recommendations"
        className="mt-6 inline-block text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        ← 공고 목록으로
      </Link>
    </aside>
  )
}

function PanelBody({ card }: { card: RfpCard }) {
  const deadline = deadlineBadge(card.마감일)
  const conditions = [
    { label: '사업 규모', value: formatAmount(card.금액) },
    { label: '공고번호', value: card.공고번호 ?? '—' },
    { label: '공개일', value: formatDate(card.공개일) },
    { label: '마감일', value: `${formatDate(card.마감일)} · ${deadline.label}` },
    { label: '원문 형식', value: card.파일형식?.toUpperCase() ?? '—' },
  ]

  return (
    <>
      <h1 className="font-heading text-h3 leading-snug font-semibold tracking-tight">
        {card.사업명 ?? card.doc_id}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{card.발주기관 ?? '발주기관 미상'}</p>

      <h2 className="mt-6 mb-2 text-sm font-semibold">사업 개요</h2>
      {card.사업요약 ? (
        <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
          {card.사업요약}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">요약이 제공되지 않는 공고입니다.</p>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold">주요 조건</h2>
      <div className="overflow-hidden rounded-md border border-border">
        {conditions.map((c, i) => (
          <div key={c.label} className={`flex text-sm ${i > 0 ? 'border-t border-border' : ''}`}>
            <span className="w-28 shrink-0 bg-muted px-3 py-2 text-muted-foreground">
              {c.label}
            </span>
            <span className="flex-1 px-3 py-2">{c.value}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        RFP 원문은 내려받을 수 없습니다. 세부 요건은 오른쪽 채팅으로 물어보면 근거와 함께 답합니다.
      </p>
    </>
  )
}

function PanelSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-6 w-4/5 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-24 w-full animate-pulse rounded bg-muted" />
      <div className="h-32 w-full animate-pulse rounded bg-muted" />
    </div>
  )
}

function PanelError({ error }: { error: LoadError | null }) {
  const notFound = error?.kind === 'notfound'
  return (
    <div className="py-6 text-center">
      <AlertCircle className="mx-auto size-8 text-destructive" />
      <p className="mt-3 font-medium">
        {notFound ? '존재하지 않는 공고입니다' : '공고를 불러오지 못했습니다'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error?.message ?? '잠시 후 다시 시도해 주세요.'}
      </p>
    </div>
  )
}

function Composer({
  onSend,
  loading,
  disabled,
}: {
  onSend: (text: string) => void | Promise<void>
  loading: boolean
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const blocked = loading || disabled

  const submit = () => {
    const value = text.trim()
    if (!value || blocked) return
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
          disabled={blocked}
          placeholder="질문을 입력하세요… (Enter 전송 · Shift+Enter 줄바꿈)"
          className="max-h-40 min-h-11 resize-none"
          aria-label="질문 입력"
        />
        <Button
          size="lg"
          onClick={submit}
          disabled={blocked || text.trim().length === 0}
          className="gap-2"
        >
          <SendHorizontal className="size-4" />
          전송
        </Button>
      </div>
    </div>
  )
}
