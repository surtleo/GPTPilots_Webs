import { useEffect, useRef } from 'react'
import { LoaderCircle, MessageSquareText, Quote, ShieldAlert, Sparkles } from 'lucide-react'

import type { Cost } from '@/lib/api'
import type { AssistantMeta, ChatError, ChatMessage } from '@/hooks/use-chat'
import { MarkdownMessage } from '@/components/markdown'

interface ChatViewProps {
  messages: ChatMessage[]
  loading: boolean
  error: ChatError | null
  /** 빈 상태 안내 문구. 문서가 이미 고정된 화면에서는 "사업명을 포함하라"가 틀린 안내가 된다. */
  emptyHint?: string
}

export function ChatView({ messages, loading, error, emptyHint }: ChatViewProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, error])

  if (messages.length === 0 && !loading && !error) {
    return <EmptyState hint={emptyHint} />
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      {messages.map((m) =>
        m.role === 'user' ? (
          <UserBubble key={m.id} content={m.content} />
        ) : (
          <AssistantBubble key={m.id} content={m.content} meta={m.meta} />
        ),
      )}
      {loading && <LoadingBubble />}
      {error && <ErrorBanner error={error} />}
      <div ref={endRef} />
    </div>
  )
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-md rounded-tr-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
        {content}
      </div>
    </div>
  )
}

function AssistantBubble({ content, meta }: { content: string; meta?: AssistantMeta }) {
  const kind = meta?.kind ?? 'answer'
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {kind === 'clarify' && <ClarifyCard content={content} />}
        {kind === 'no_evidence' && <NoEvidenceCard content={content} />}
        {kind === 'answer' && (
          <div className="rounded-md rounded-tl-sm border border-border bg-card px-4 py-3 shadow-sm">
            <MarkdownMessage content={content} />
            {meta && meta.citations.length > 0 && <Citations meta={meta} />}
          </div>
        )}
        {meta && <CostLine cost={meta.cost} />}
      </div>
    </div>
  )
}

function ClarifyCard({ content }: { content: string }) {
  return (
    <div className="rounded-md rounded-tl-sm border border-warning/40 bg-warning/5 px-4 py-3">
      <p className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wide text-warning uppercase">
        <MessageSquareText className="size-3.5" />
        반문 · 문서 특정 필요
      </p>
      <p className="text-sm whitespace-pre-wrap text-foreground">{content}</p>
    </div>
  )
}

function NoEvidenceCard({ content }: { content: string }) {
  return (
    <div className="rounded-md rounded-tl-sm border border-danger/40 bg-danger/5 px-4 py-3">
      <p className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wide text-danger uppercase">
        <ShieldAlert className="size-3.5" />
        NO_EVIDENCE · 근거 없음
      </p>
      <p className="text-sm text-foreground">{content}</p>
    </div>
  )
}

function Citations({ meta }: { meta: AssistantMeta }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 inline-flex items-center gap-1.5 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        <Quote className="size-3.5" />
        출처 {meta.citations.length}건
      </p>
      <ul className="space-y-1.5">
        {meta.citations.map((c, i) => (
          <li
            key={`${c.doc_id ?? 'doc'}-${c.섹션 ?? i}`}
            className="flex flex-wrap items-baseline gap-x-2 text-xs"
          >
            <span className="font-medium text-foreground">{c.사업명 ?? '(사업명 미상)'}</span>
            {c.섹션 && <span className="text-muted-foreground">· {c.섹션}</span>}
            {c.doc_id && (
              <span
                title={c.doc_id}
                className="block max-w-full truncate font-mono text-[0.7rem] text-muted-foreground/80"
              >
                {c.doc_id}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CostLine({ cost }: { cost: Cost }) {
  const parts: string[] = []
  if (typeof cost.cost_usd === 'number') parts.push(`$${cost.cost_usd.toFixed(4)}`)
  if (typeof cost.input_tokens === 'number' && typeof cost.output_tokens === 'number') {
    parts.push(`${cost.input_tokens}→${cost.output_tokens} tok`)
  }
  if (typeof cost.session_cost_usd === 'number') {
    parts.push(`세션 $${cost.session_cost_usd.toFixed(4)}`)
  }
  if (typeof cost.session_calls === 'number') parts.push(`${cost.session_calls}콜`)
  if (parts.length === 0) return null
  return (
    <p className="mt-1.5 font-mono text-[0.7rem] text-muted-foreground/70">{parts.join(' · ')}</p>
  )
}

function LoadingBubble() {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
        <Sparkles className="size-4" />
      </span>
      <div className="flex-1 rounded-md rounded-tl-sm border border-border bg-card px-4 py-3 shadow-sm">
        <p className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          근거를 검색하고 답변을 생성 중입니다… (최대 ~15초)
        </p>
        <div className="space-y-2">
          <div className="h-3 w-11/12 animate-pulse rounded-sm bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded-sm bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded-sm bg-muted" />
        </div>
      </div>
    </div>
  )
}

const ERROR_LABEL: Record<ChatError['kind'], string> = {
  auth: '인증 오류 (401)',
  notfound: '대상을 찾을 수 없음 (404)',
  validation: '입력 오류 (422)',
  rate: '요청 제한 · 비용 상한 (429)',
  server: '백엔드 처리 실패 (503)',
  network: '네트워크 오류',
  unknown: '오류',
}

function ErrorBanner({ error }: { error: ChatError }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-danger/10 text-danger">
        <ShieldAlert className="size-4" />
      </span>
      <div className="flex-1 rounded-md rounded-tl-sm border border-danger/40 bg-danger/5 px-4 py-3">
        <p className="font-mono text-xs font-semibold tracking-wide text-danger uppercase">
          {ERROR_LABEL[error.kind]}
        </p>
        <p className="mt-1 text-sm text-foreground">{error.message}</p>
      </div>
    </div>
  )
}

function EmptyState({ hint }: { hint?: string }) {
  const routes = [
    {
      icon: Quote,
      title: '근거 기반 답변',
      body: 'markdown 표 · 출처(doc_id·인용)와 함께 생성',
      tone: 'text-primary',
    },
    {
      icon: MessageSquareText,
      title: '반문(clarify)',
      body: '문서 미특정 시 번호형 후보 목록으로 되물음',
      tone: 'text-warning',
    },
    {
      icon: ShieldAlert,
      title: 'NO_EVIDENCE',
      body: '근거 없음 — 고정 응답으로 구분 표기',
      tone: 'text-danger',
    },
  ] as const

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div className="max-w-xl space-y-3">
        <h2 className="font-heading text-h2 font-semibold tracking-tight">
          입찰 문서에 대해 물어보세요
        </h2>
        <p className="text-base text-muted-foreground">
          {hint ?? '질문에 사업명을 포함하면 해당 문서를 근거(출처·인용)와 함께 답변합니다.'} 답변
          생성에는 약 15초가 걸릴 수 있습니다.
        </p>
      </div>
      <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {routes.map((r) => (
          <div
            key={r.title}
            className="rounded-md border border-border bg-card p-4 text-left shadow-sm"
          >
            <r.icon className={`size-5 ${r.tone}`} />
            <p className="mt-2 font-mono text-xs font-medium tracking-wide uppercase">{r.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
