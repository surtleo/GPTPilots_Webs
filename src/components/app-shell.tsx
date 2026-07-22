import {
  ChevronDown,
  FileText,
  MessageSquareText,
  Quote,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/**
 * BidMate 앱 셸 (Phase 8.5) — 헤더 · 문서 선택 · 대화영역 플레이스홀더.
 * 실제 채팅 왕복(POST /ask, 라우팅 3케이스, 근거 렌더)은 8.6에서 연동한다.
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-secondary text-foreground">
      <AppHeader />
      <DocumentSelector />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-10">
        <ConversationPlaceholder />
      </main>
      <MessageComposer />
    </div>
  )
}

function AppHeader() {
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
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-warning" />
          백엔드 연결 대기
        </span>
      </div>
    </header>
  )
}

function DocumentSelector() {
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-6 py-3">
        <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          활성 문서
        </span>
        <Button
          variant="outline"
          size="lg"
          disabled
          className="justify-between gap-2 font-normal"
          aria-label="문서 선택 (연동 예정)"
        >
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            문서를 선택하세요
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
        <span className="text-xs text-muted-foreground">문서 목록·전환은 연동 시 활성화됩니다</span>
      </div>
    </div>
  )
}

function ConversationPlaceholder() {
  const routes: { icon: typeof Quote; title: string; body: string; tone: string }[] = [
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
  ]

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div className="max-w-xl space-y-3">
        <h2 className="font-heading text-h2 font-semibold tracking-tight">
          입찰 문서에 대해 물어보세요
        </h2>
        <p className="text-base text-muted-foreground">
          문서를 선택하고 질문하면, 근거(출처·인용)와 함께 답변합니다. 답변 생성에는 약 15초가 걸릴
          수 있습니다.
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

function MessageComposer() {
  return (
    <div className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl items-end gap-3 px-6 py-4">
        <Textarea
          rows={1}
          disabled
          placeholder="질문을 입력하세요… (실시간 응답 연동은 8.6에서)"
          className="min-h-11 resize-none"
          aria-label="질문 입력"
        />
        <Button size="lg" disabled className="gap-2">
          <SendHorizontal className="size-4" />
          전송
        </Button>
      </div>
    </div>
  )
}
