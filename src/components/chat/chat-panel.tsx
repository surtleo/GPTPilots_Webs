import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { ChevronRight, FileText, LoaderCircle, SendHorizontal, ShieldAlert, X } from 'lucide-react'

import type { Cost } from '@/lib/api'
import { ClarifyCard, MessageCardView } from '@/components/chat/cards'
import { MarkdownMessage } from '@/components/markdown'
import { useActiveDocs } from '@/lib/active-docs-context'
import { candidateTitle, parseClarifyCandidates } from '@/lib/chat-cards'
import { useChatFlows } from '@/lib/chat-flows'
import {
  useChatSessions,
  type AssistantMeta,
  type ChatError,
  type ChatMessage,
} from '@/lib/chat-sessions-context'
import { useProfile } from '@/lib/profile-context'
import { useRecommendationsCache } from '@/lib/recommendations-context'
import { docKey, genKey, useWorkspace } from '@/lib/workspace-context'
import { cn } from '@/lib/utils'

const CHAT_WIDTH_KEY = 'bidmate.chat.width'
// 최소 320px: 이보다 좁으면 제안 칩·첨부칩이 줄바꿈으로 뭉개진다.
// 최대는 화면의 60%: 채팅이 뷰어를 다 밀어내면 원문 근거를 볼 수 없게 된다.
const CHAT_MIN_WIDTH = 320
const CHAT_MAX_RATIO = 0.6

function clampChatWidth(w: number): number {
  const max = Math.max(CHAT_MIN_WIDTH, Math.round(window.innerWidth * CHAT_MAX_RATIO))
  return Math.min(Math.max(Math.round(w), CHAT_MIN_WIDTH), max)
}

/**
 * 왼쪽 경계 드래그로 채팅 폭을 조절한다. 폭은 localStorage에 남겨 재방문 시 복원하고,
 * 더블클릭이면 저장값을 지워 기본 폭(clamp CSS)으로 돌아간다.
 *
 * width가 null이면 "사용자가 만진 적 없음" — 이때는 인라인 width를 주지 않고 기존
 * 반응형 clamp 클래스를 그대로 쓴다. 고정 px를 항상 박아버리면 창 크기를 줄였을 때
 * 채팅이 화면을 다 먹는 문제가 생겨서, 조절한 사람에게만 고정 폭을 준다.
 */
function useChatResize(enabled: boolean) {
  const [width, setWidth] = useState<number | null>(() => {
    const n = Number(localStorage.getItem(CHAT_WIDTH_KEY))
    return Number.isFinite(n) && n > 0 ? clampChatWidth(n) : null
  })
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const widthRef = useRef(width)
  widthRef.current = width

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled) return
      e.preventDefault() // 드래그 중 텍스트 선택 방지
      e.currentTarget.setPointerCapture(e.pointerId)
      // 시작 폭은 실제 렌더 폭에서 잰다 — width가 null(기본 clamp 폭)이어도 이어서 끌 수 있게.
      const aside = e.currentTarget.parentElement
      drag.current = { startX: e.clientX, startWidth: aside?.offsetWidth ?? CHAT_MIN_WIDTH }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [enabled],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    // 왼쪽 경계라 왼쪽으로 끌수록(clientX 감소) 폭이 커진다.
    setWidth(clampChatWidth(d.startWidth + (d.startX - e.clientX)))
  }, [])

  const onPointerUp = useCallback(() => {
    if (!drag.current) return
    drag.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (widthRef.current != null) {
      localStorage.setItem(CHAT_WIDTH_KEY, String(widthRef.current))
    }
  }, [])

  const reset = useCallback(() => {
    setWidth(null)
    localStorage.removeItem(CHAT_WIDTH_KEY)
  }, [])

  return { width, onPointerDown, onPointerMove, onPointerUp, reset }
}

/**
 * 채팅 — 이 앱에서 뭔가를 시작하는 자리는 전부 여기다.
 *
 * 맞춤 공고 찾기·비교표·핵심 정리를 별도 화면이 아니라 채팅 명령으로 받는 이유: 사용자가
 * 하려는 일은 "이 공고들에 대해 뭘 좀 알아보는 것" 하나인데, 화면을 나눠두면 매번 어디로
 * 가야 하는지를 먼저 풀어야 한다. 왼쪽에서 공고를 체크하고 여기서 말하면 끝나게 뒀다.
 */
export function ChatPanel({
  wide,
  onCollapse,
  onOpenProfile,
}: {
  /** 가운데 뷰어가 없을 때 — 채팅이 전체 폭을 쓰고 본문을 가운데 정렬한다. */
  wide: boolean
  onCollapse: () => void
  onOpenProfile: () => void
}) {
  const { docs } = useActiveDocs()
  const { current, loading, error, send, setActiveDoc } = useChatSessions()
  const messages = current?.messages ?? []
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { runReco, runCompare, runSummary, runReady, busy } = useChatFlows()

  const primaryDocId = docs[0]?.doc_id ?? null
  const primaryDocTitle = docs[0]?.사업명 ?? null

  // 첫 번째 활성 문서가 바뀌면 세션의 근거 문서를 갈아끼운다. 백엔드 /ask 계약이 doc_id를
  // 하나만 받기 때문에, 여러 건을 체크해도 질문의 근거로 넘어가는 건 첫 번째다.
  const prevPrimary = useRef(primaryDocId)
  useEffect(() => {
    if (prevPrimary.current !== primaryDocId) {
      prevPrimary.current = primaryDocId
      setActiveDoc(primaryDocId, primaryDocTitle)
    }
  }, [primaryDocId, primaryDocTitle, setActiveDoc])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, loading, busy])

  const submit = useCallback(
    async (raw?: string) => {
      const text = (raw ?? draft).trim()
      if (!text || loading || busy) return
      setDraft('')

      // 채팅으로 들어온 요청 중 백엔드 흐름이 따로 있는 것들을 먼저 걷어낸다.
      if (/맞춤|추천/.test(text)) return runReco(text)
      if (/비교/.test(text) && docs.length >= 2) return runCompare(text)
      if (/(준비|점검)/.test(text) && docs.length >= 1) return runReady(text)
      if (/정리/.test(text) && docs.length >= 1) return runSummary()
      await send(text)
    },
    [draft, loading, busy, docs.length, runReco, runCompare, runSummary, runReady, send],
  )

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void submit()
    }
  }

  const inner = wide ? 'mx-auto w-full max-w-[44rem] px-3' : 'px-3'

  // wide(뷰어 없음)면 어차피 전체 폭이라 리사이즈가 의미 없다 — 핸들도 안 그린다.
  const resize = useChatResize(!wide)
  const resized = !wide && resize.width != null

  return (
    <aside
      className={cn(
        'relative flex min-h-0 flex-col bg-card',
        wide
          ? 'min-w-0 flex-1'
          : cn(
              'shrink-0 border-l border-border',
              // 사용자가 폭을 만진 적 없으면 기존 반응형 clamp 폭 유지
              !resized && 'w-[clamp(15.625rem,26vw,24rem)]',
            ),
      )}
      style={resized ? { width: resize.width! } : undefined}
    >
      {!wide && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="채팅 폭 조절"
          title="드래그로 폭 조절 · 더블클릭으로 기본 폭"
          onPointerDown={resize.onPointerDown}
          onPointerMove={resize.onPointerMove}
          onPointerUp={resize.onPointerUp}
          onPointerCancel={resize.onPointerUp}
          onDoubleClick={resize.reset}
          className="absolute inset-y-0 -left-0.5 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
        />
      )}
      <div className="flex min-h-[46px] shrink-0 items-center gap-2 border-b border-border px-3.5 py-2">
        <p className="text-[13px] font-bold">채팅</p>
        {!wide && (
          <button
            onClick={onCollapse}
            title="채팅 접기"
            aria-label="채팅 접기"
            className="ml-auto grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className={inner}>
          {messages.length === 0 && !loading && !error && (
            <EmptyState onOpenProfile={onOpenProfile} />
          )}
          <div className="flex flex-col gap-4 py-4">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {(loading || busy) && <Thinking label={busy ?? '근거를 찾아 답변을 만드는 중…'} />}
            {error && <ErrorBanner error={error} />}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-3 pb-3.5">
        <div className={inner}>
          <Suggestions
            onPick={(q) => {
              setDraft(q)
              taRef.current?.focus()
            }}
            onRun={(q) => void submit(q)}
          />
          <div className="flex flex-col gap-1.5 rounded-xl border border-input bg-background py-2 pr-2 pl-3 focus-within:border-primary">
            <AttachedDocs />
            <div className="flex items-end gap-1.5">
              <textarea
                ref={taRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="무엇이든 물어보세요"
                className="max-h-28 min-h-7.5 flex-1 resize-none bg-transparent py-1 text-[13px] outline-none"
              />
              <button
                onClick={() => void submit()}
                disabled={!draft.trim() || loading || !!busy}
                aria-label="보내기"
                className="grid size-7.5 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground transition-[filter] hover:brightness-105 disabled:opacity-40"
              >
                <SendHorizontal className="size-3.5" />
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[0.66rem] text-muted-foreground">
            근거가 없으면 “확인되지 않습니다”라고 답해요
          </p>
        </div>
      </div>
    </aside>
  )
}

/** 입력창 위 첨부칩 — 지금 이 대화가 무엇을 근거로 삼는지 항상 눈에 보이게 둔다. */
function AttachedDocs() {
  const { docs, remove } = useActiveDocs()
  const { open } = useWorkspace()
  if (docs.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {docs.map((d) => (
        <span
          key={d.doc_id}
          className="flex min-w-0 max-w-[13rem] items-center gap-1.5 rounded-lg border border-border bg-secondary py-0.5 pr-1 pl-2 text-[11.5px] font-semibold"
        >
          <button
            onClick={() => open(docKey(d.doc_id))}
            title={d.doc_id}
            className="flex min-w-0 items-center gap-1.5"
          >
            <FileText className="size-2.5 shrink-0 opacity-70" />
            <span className="truncate">{d.사업명 ?? d.doc_id}</span>
          </button>
          <button
            onClick={() => remove(d.doc_id)}
            aria-label="첨부 해제"
            className="grid size-3.5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
    </div>
  )
}

function Suggestions({
  onPick,
  onRun,
}: {
  onPick: (q: string) => void
  onRun: (q: string) => void
}) {
  const { docs } = useActiveDocs()
  const { items } = useRecommendationsCache()

  // 지금 상태에서 실제로 할 수 있는 것만 띄운다 — 눌렀는데 아무 일도 안 나는 칩이 있으면
  // 나머지 칩까지 못 믿게 된다. 문서를 담았는지가 먼저다: 추천을 거치지 않고 전체 목록에서
  // 담은 공고도 준비 점검·정리·질문이 전부 된다(판정은 POST /eligibility가 직접 해준다).
  const chips =
    docs.length >= 2
      ? [
          { label: '비교표 만들어줘', run: true },
          { label: '입찰 준비 상태 점검해줘', run: true },
          { label: '핵심 정리해줘', run: true },
        ]
      : docs.length === 1
        ? [
            { label: '입찰 준비 상태 점검해줘', run: true },
            { label: '핵심 정리해줘', run: true },
            { label: '참가 자격 요건은?', run: false },
          ]
        : items.length === 0
          ? [{ label: '맞춤 공고 찾아줘', run: true }]
          : [{ label: '맞춤 공고 다시 찾아줘', run: true }]

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={() => (c.run ? onRun(c.label) : onPick(c.label))}
          className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

function Message({ message }: { message: ChatMessage }) {
  const { answerAsk, pickCandidate } = useChatFlows()

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-xl rounded-br-sm bg-primary px-3.5 py-2.5 text-[13px] whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  // 카드형(진행 단계·확인 질문·점검 결과)은 본문 대신 카드를 그린다.
  if (message.card) {
    return (
      <MessageCardView
        card={message.card}
        onAnswer={(option) => void answerAsk(message.id, option)}
      />
    )
  }

  const meta = message.meta
  const kind = meta?.kind ?? 'answer'

  if (kind === 'clarify') {
    return (
      <ClarifyCard
        content={message.content}
        candidates={parseClarifyCandidates(message.content)}
        onPick={(label) => void pickCandidate(candidateTitle(label))}
      />
    )
  }

  if (kind === 'no_evidence') {
    return (
      <div className="rounded-xl border border-danger bg-danger-soft px-3.5 py-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-danger">
          <ShieldAlert className="size-3" />
          근거를 찾지 못했어요
        </p>
        <p className="text-[12.5px] leading-relaxed">{message.content}</p>
      </div>
    )
  }

  return (
    <div className="min-w-0">
      <MarkdownMessage content={message.content} citations={meta?.citations} />
      {meta && <FileCards meta={meta} />}
      {meta && <CostLine cost={meta.cost} />}
    </div>
  )
}

/** 답변이 파일을 만들어냈으면 그 자리에서 열 수 있게 카드로 붙인다. */
function FileCards({ meta }: { meta: AssistantMeta }) {
  const { files, open } = useWorkspace()
  const ids = meta.fileIds ?? []
  if (ids.length === 0) return null

  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {ids.map((id) => {
        const file = files.find((f) => f.id === id)
        if (!file) return null
        return (
          <button
            key={id}
            onClick={() => open(file.type === 'table' ? 'compare' : genKey(id))}
            className="flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold">{file.title}</span>
              <span className="mt-px block text-[11px] text-muted-foreground">
                파일에 저장됨 · 눌러서 가운데에 열기
              </span>
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        )
      })}
    </div>
  )
}

function CostLine({ cost }: { cost: Cost }) {
  const parts: string[] = []
  if (typeof cost.cost_usd === 'number') parts.push(`$${cost.cost_usd.toFixed(4)}`)
  if (typeof cost.input_tokens === 'number' && typeof cost.output_tokens === 'number') {
    parts.push(`${cost.input_tokens}→${cost.output_tokens} tok`)
  }
  if (parts.length === 0) return null
  return (
    <p className="mt-1.5 font-mono text-[0.66rem] text-muted-foreground/70">{parts.join(' · ')}</p>
  )
}

function Thinking({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin text-primary" />
      {label}
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
    <div className="rounded-xl border border-danger bg-danger-soft px-3.5 py-3">
      <p className="text-[11px] font-bold text-danger">{ERROR_LABEL[error.kind]}</p>
      <p className="mt-1 text-[12.5px]">{error.message}</p>
    </div>
  )
}

function EmptyState({ onOpenProfile }: { onOpenProfile: () => void }) {
  const { filledCount } = useProfile()

  return (
    <div className="flex flex-col gap-2.5 px-1 py-7">
      <h2 className="font-heading text-center text-[1.35rem] font-bold">
        공고, 읽지 말고 물어보세요
      </h2>
      <p className="mb-2 text-center text-[12.5px] text-muted-foreground">
        답은 항상 원문 근거와 출처가 함께예요.
      </p>
      <Step n={1}>
        <button
          onClick={onOpenProfile}
          className="font-bold text-primary underline-offset-2 hover:underline"
        >
          회사 프로필
        </button>
        을 작성해두면{filledCount === 0 ? ' (아직 비어 있어요)' : ''}
      </Step>
      <Step n={2}>
        “<b>맞춤 공고 찾아줘</b>”로 자격 대조된 공고를 받고
      </Step>
      <Step n={3}>
        공고를 체크하면 <b>질문·준비 점검·비교표·핵심 정리</b>까지 — 결과물은 파일 탭에 저장돼요
      </Step>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] border border-border bg-card px-3.5 py-3">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-foreground">
        {n}
      </span>
      <p className="text-[12.5px] leading-relaxed">{children}</p>
    </div>
  )
}
