import { LoaderCircle, MessageSquareText } from 'lucide-react'

import type { MessageCard, ReportItem, StepItem } from '@/lib/chat-cards'
import { VERDICT_TONE_CLASS } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * 카드형 메시지 렌더러 — 프로토타입(v6)의 think · ask · report · clarify 네 가지를 옮겼다.
 * 값은 전부 백엔드 응답에서 온다(`chat-cards.ts` 주석 참고).
 */
export function MessageCardView({
  card,
  onAnswer,
}: {
  card: MessageCard
  onAnswer: (option: string) => void
}) {
  if (card.kind === 'steps') {
    return <StepsCard steps={card.steps} done={card.done} failed={card.failed} />
  }
  if (card.kind === 'ask') {
    return (
      <AskCard
        question={card.question}
        options={card.options}
        answered={card.answered}
        onAnswer={onAnswer}
      />
    )
  }
  return (
    <ReportCard
      title={card.title}
      verdict={card.verdict}
      tone={card.tone}
      items={card.items}
      note={card.note}
    />
  )
}

function StepsCard({
  steps,
  done,
  failed,
}: {
  steps: StepItem[]
  done: boolean
  failed?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className={cn(
          'flex items-center gap-1.5 text-[12.5px] font-semibold',
          failed ? 'text-danger' : 'text-muted-foreground',
        )}
      >
        {failed ? (
          '대조 중단됨'
        ) : done ? (
          '대조 완료'
        ) : (
          <>
            <LoaderCircle className="size-3 animate-spin text-primary" />
            참가자격을 대조하는 중…
          </>
        )}
      </p>
      <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2.5">
        {steps.map((s) => (
          <div
            key={s.label}
            className={cn(
              'flex items-center gap-2 text-xs',
              s.state === 'pending' && 'text-muted-foreground opacity-55',
              s.state === 'active' && 'font-semibold',
            )}
          >
            <span
              className={cn(
                'grid size-3.5 shrink-0 place-items-center rounded-full text-[9px] font-bold',
                s.state === 'done' && 'bg-success-soft text-success',
                s.state === 'active' && 'text-primary',
              )}
            >
              {s.state === 'done' ? (
                '✓'
              ) : s.state === 'active' ? (
                <LoaderCircle className="size-2.5 animate-spin" />
              ) : (
                '○'
              )}
            </span>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function AskCard({
  question,
  options,
  answered,
  onAnswer,
}: {
  question: string
  options: string[]
  answered?: string
  onAnswer: (option: string) => void
}) {
  return (
    <div className="rounded-xl border border-warning bg-warning-soft px-3.5 py-3">
      <p className="mb-1.5 text-[11px] font-bold text-warning">확인 질문</p>
      <p className="mb-2.5 text-[12.5px] leading-relaxed">{question}</p>
      {answered ? (
        <p className="text-[11.5px] text-muted-foreground">답변함 — {answered}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => onAnswer(o)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary hover:text-primary"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportCard({
  title,
  verdict,
  tone,
  items,
  note,
}: {
  title: string
  verdict: string
  tone: keyof typeof VERDICT_TONE_CLASS
  items: ReportItem[]
  note: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-secondary px-3.5 py-2.5">
        <span className={cn('rounded px-1.5 text-[10.5px] font-bold', VERDICT_TONE_CLASS[tone])}>
          {verdict}
        </span>
        <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">{title}</span>
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
        {items.map((q, i) => (
          <div
            key={`${q.text}-${i}`}
            className="flex items-start gap-2 text-[12.5px] leading-normal"
          >
            <span
              className={cn(
                'mt-px grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                q.state === 'ok' && 'bg-success-soft text-success',
                q.state === 'miss' && 'bg-danger-soft text-danger',
                q.state === 'unclear' && 'bg-warning-soft text-warning',
              )}
            >
              {q.state === 'ok' ? '✓' : q.state === 'miss' ? '✕' : '?'}
            </span>
            <span className="flex-1">
              {q.text} {q.why && <span className="text-muted-foreground">— {q.why}</span>}
            </span>
          </div>
        ))}
        {note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
      </div>
    </div>
  )
}

/**
 * 반문 — 백엔드가 문서를 특정하지 못했을 때. 후보 목록은 답변 본문에서 파싱한다.
 * 고르면 그 사업명을 붙여 다시 질문한다(백엔드 안내문이 지시하는 방식 그대로).
 */
export function ClarifyCard({
  content,
  candidates,
  onPick,
}: {
  content: string
  candidates: string[]
  onPick: (label: string) => void
}) {
  // 후보 목록은 버튼으로 다시 그리므로 본문에서는 걷어낸다 — 같은 목록이 두 번 나오면
  // 어느 쪽을 눌러야 하는지 헷갈린다.
  const intro = content
    .split('\n')
    .filter((l) => !/^\s*\d+\.\s+/.test(l))
    .join('\n')
    .trim()

  return (
    <div className="rounded-xl border border-warning bg-warning-soft px-3.5 py-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-warning">
        <MessageSquareText className="size-3" />
        어떤 공고인지 확인이 필요해요
      </p>
      <p className="mb-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap">{intro}</p>
      {candidates.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {candidates.map((c) => (
            <button
              key={c}
              onClick={() => onPick(c)}
              className="flex items-center gap-2 rounded-[9px] border border-border bg-card px-2.5 py-2 text-left text-xs transition-colors hover:border-primary"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1 truncate">{c}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] text-muted-foreground">
          왼쪽 맞춤 공고에서 체크하시면 그 공고를 근거로 답해드려요.
        </p>
      )}
    </div>
  )
}
