import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Columns2, Plus, SendHorizontal, Sparkles, X } from 'lucide-react'

import { Textarea } from '@/components/ui/textarea'
import { ChatView } from '@/components/chat-view'
import { DocPanel } from '@/components/doc-panel'
import { useChat } from '@/hooks/use-chat'
import { useActiveDocs, SLOT_KEYS } from '@/lib/active-docs-context'
import { cn } from '@/lib/utils'

const STARTERS = [
  { q: '교육 관련해서 발주된 사업 뭐가 있어?', hint: '분야로 공고 찾기' },
  { q: '이 공고 예산이 얼마야?', hint: '공고 메타 바로 조회' },
  { q: '참가 자격 요건이 어떻게 되나요?', hint: '문서 근거로 답변' },
  { q: '두 공고 참가자격 차이가 뭐야?', hint: '활성 문서 나란히 비교' },
]

const PINNED_SUGGESTIONS = [
  '참가 자격 요건이 어떻게 되나요?',
  '제출 서류가 뭔가요?',
  '평가 기준이 어떻게 되나요?',
]

/**
 * 메인 대화 화면 — 문서를 지정하지 않아도 자유롭게 묻고, 활성 문서가 있으면
 * 그 문서로 좁혀 답한다. 오른쪽에 원문 패널(단일/비교)을 함께 띄운다.
 *
 * 활성 문서가 여러 개일 때 첫 번째(A)를 대화의 활성 문서로 넘기는 이유:
 * 백엔드 /ask 계약이 doc_id 하나만 받기 때문. 비교 질문은 아직 A 기준으로
 * 답하며, 여러 문서를 한 번에 근거로 삼는 건 백엔드 확장이 필요하다.
 */
export function ChatPage({
  docPanelOpen,
  compare,
  onToggleCompare,
  onCloseDocPanel,
  onAddDoc,
}: {
  docPanelOpen: boolean
  compare: boolean
  onToggleCompare: () => void
  onCloseDocPanel: () => void
  onAddDoc: () => void
}) {
  const { docs, remove } = useActiveDocs()
  const primaryDocId = docs[0]?.doc_id ?? null
  const chat = useChat(primaryDocId)
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 활성 문서(A)가 바뀌면 대화를 새로 시작한다 — 다른 공고 맥락이 섞이면
  // 답변이 어느 문서 기준인지 알 수 없어진다(백엔드도 문서 전환 시 히스토리를 끊는다).
  // chat 객체 전체를 의존성에 넣으면 매 렌더마다 재실행되므로 reset만 넣는다.
  const { reset } = chat
  const prevPrimary = useRef(primaryDocId)
  useEffect(() => {
    if (prevPrimary.current !== primaryDocId) {
      prevPrimary.current = primaryDocId
      reset()
    }
  }, [primaryDocId, reset])

  const submit = () => {
    const text = draft.trim()
    if (!text || chat.loading) return
    setDraft('')
    void chat.send(text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const empty = chat.messages.length === 0 && !chat.loading && !chat.error
  const showPanel = docPanelOpen && docs.length > 0

  return (
    <div
      className={cn('grid min-h-0 flex-1')}
      style={{
        gridTemplateColumns: showPanel
          ? compare
            ? '1fr'
            : 'minmax(0,1fr) minmax(21rem,27rem)'
          : '1fr',
      }}
    >
      {!(showPanel && compare) && (
        <div className="flex min-h-0 min-w-0 flex-col">
          {/* 활성 문서 바 */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-6 py-2.5">
            <span className="font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
              활성 문서
            </span>
            {docs.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                없음 — 질문에 따라 자동으로 문서를 찾습니다
              </span>
            ) : (
              docs.map((doc, i) => (
                <span
                  key={doc.doc_id}
                  title={doc.사업명 ?? doc.doc_id}
                  className="flex min-w-0 max-w-[15rem] items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 text-xs font-semibold"
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded bg-primary font-mono text-[0.58rem] font-bold text-primary-foreground">
                    {SLOT_KEYS[i]}
                  </span>
                  <span className="truncate">{doc.사업명 ?? doc.doc_id}</span>
                  <button
                    onClick={() => remove(doc.doc_id)}
                    aria-label={`${SLOT_KEYS[i]} 비우기`}
                    className="grid shrink-0 place-items-center text-muted-foreground hover:text-danger"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            )}
            <button
              onClick={onAddDoc}
              title="문서 담기"
              aria-label="문서 담기"
              className="grid size-[26px] shrink-0 place-items-center rounded-md border border-dashed border-input bg-card text-muted-foreground transition-colors hover:border-primary hover:border-solid hover:text-primary"
            >
              <Plus className="size-3.5" />
            </button>
            {docs.length >= 2 && (
              <button
                onClick={onToggleCompare}
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Columns2 className="size-3.5" />
                나란히 보기
              </button>
            )}
          </div>

          {/* 대화 */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {empty ? (
              <Hero onPick={(q) => setDraft(q)} />
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-6">
                <ChatView
                  messages={chat.messages}
                  loading={chat.loading}
                  error={chat.error}
                  emptyHint={
                    primaryDocId
                      ? '이 공고의 내용만 근거로 답합니다.'
                      : undefined
                  }
                />
              </div>
            )}
          </div>

          {/* 입력 */}
          <div className="shrink-0 border-t border-border bg-card px-6 pt-3.5 pb-4">
            <div className="mx-auto w-full max-w-3xl">
              {primaryDocId && empty && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {PINNED_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setDraft(s)
                        taRef.current?.focus()
                      }}
                      className="rounded-full border border-border bg-secondary px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-xl border border-input bg-card py-2 pr-2 pl-3.5 focus-within:border-primary">
                <Textarea
                  ref={taRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  disabled={chat.loading}
                  placeholder={
                    primaryDocId ? '이 공고에 대해 물어보세요' : '공고에 대해 무엇이든 물어보세요'
                  }
                  className="max-h-32 min-h-9 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0"
                />
                <button
                  onClick={submit}
                  disabled={!draft.trim() || chat.loading}
                  aria-label="보내기"
                  className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-[filter] hover:brightness-105 disabled:opacity-40"
                >
                  <SendHorizontal className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-center text-[0.68rem] text-muted-foreground">
                문서에 근거가 없으면 “확인되지 않습니다”라고 답합니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {showPanel && (
        <DocPanel
          compare={compare}
          onToggleCompare={onToggleCompare}
          onClose={onCloseDocPanel}
          onAdd={onAddDoc}
        />
      )}
    </div>
  )
}

function Hero({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-6 pt-[7vh] text-center">
      <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
        <Sparkles className="size-5" />
      </span>
      <h1 className="font-heading text-h2 font-bold tracking-tight">무엇을 도와드릴까요?</h1>
      <p className="mt-2 mb-6 text-muted-foreground">
        공고에 대해 자유롭게 물어보세요. 사업명을 말씀하시면 그 문서로 답합니다.
      </p>
      <div className="grid w-full gap-2 text-left sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s.q}
            onClick={() => onPick(s.q)}
            className="flex flex-col gap-0.5 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary hover:bg-secondary"
          >
            <span className="text-sm font-semibold">{s.q}</span>
            <span className="text-xs text-muted-foreground">{s.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
