import { useMemo, useState } from 'react'
import { ChevronLeft, FileText, FolderOpen, Search, Table2, Target } from 'lucide-react'

import type { RecommendationItem } from '@/lib/api'
import { deadlineBadge, formatRelativeTime, VERDICT_TONE_CLASS, verdictBadge } from '@/lib/format'
import { useActiveDocs, MAX_ACTIVE_DOCS } from '@/lib/active-docs-context'
import { useChatFlows } from '@/lib/chat-flows'
import { useRecommendationsCache, type RecoProgress } from '@/lib/recommendations-context'
import { docKey, genKey, useWorkspace } from '@/lib/workspace-context'
import { cn } from '@/lib/utils'

export type PanelTab = 'reco' | 'files'

/**
 * 2열 — 맞춤 공고 ⇄ 파일.
 *
 * 공고를 체크하면 활성 문서가 되고, 그대로 채팅 입력창 위에 첨부칩으로 뜬다. 즉 이 패널의
 * 체크박스가 "이 대화의 근거 문서"를 고르는 유일한 조작이다 — 별도 담기 버튼을 두지 않은
 * 이유는, 목록에서 고르는 행위와 대화에 붙이는 행위가 사용자 머릿속에서 하나이기 때문이다.
 */
export function DocsPanel({
  open,
  tab,
  onTabChange,
  onToggle,
  onBrowseAll,
}: {
  open: boolean
  tab: PanelTab
  onTabChange: (tab: PanelTab) => void
  onToggle: () => void
  onBrowseAll: () => void
}) {
  if (!open) {
    return (
      <aside className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-r border-border py-3">
        <button
          onClick={() => {
            onTabChange('reco')
            onToggle()
          }}
          title="맞춤 공고"
          aria-label="맞춤 공고"
          className="grid size-7.5 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Target className="size-4" />
        </button>
        <button
          onClick={() => {
            onTabChange('files')
            onToggle()
          }}
          title="파일"
          aria-label="파일"
          className="grid size-7.5 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <FolderOpen className="size-4" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 w-[clamp(13.125rem,20vw,17rem)] shrink-0 flex-col border-r border-border">
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-2">
        <div className="flex flex-1 gap-0.5 rounded-[10px] border border-border bg-secondary p-[3px]">
          <SegButton active={tab === 'reco'} onClick={() => onTabChange('reco')}>
            맞춤 공고
          </SegButton>
          <SegButton active={tab === 'files'} onClick={() => onTabChange('files')}>
            파일
          </SegButton>
        </div>
        <button
          onClick={onToggle}
          title="패널 접기"
          aria-label="패널 접기"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      </div>

      {tab === 'reco' ? <RecoTab onBrowseAll={onBrowseAll} /> : <FilesTab />}
    </aside>
  )
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg py-1.5 text-xs transition-colors',
        active ? 'bg-accent font-bold text-accent-foreground' : 'font-medium text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

function RecoTab({ onBrowseAll }: { onBrowseAll: () => void }) {
  const { items, loading, progress, error } = useRecommendationsCache()
  const { docs, add, remove, has, isFull } = useActiveDocs()
  const { open } = useWorkspace()
  // 패널 버튼으로 시작해도 대화에 그대로 남도록 채팅과 같은 흐름을 부른다.
  const { runReco, runCompare } = useChatFlows()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return items
    return items.filter(
      (r) => (r.사업명 ?? '').includes(q) || (r.발주기관 ?? '').includes(q) || r.doc_id.includes(q),
    )
  }, [items, query])

  if (loading && items.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ProgressSteps progress={progress} />
      </div>
    )
  }

  if (error && items.length === 0) {
    return (
      <EmptyReco
        title="맞춤 공고를 불러오지 못했어요"
        body={error.message}
        cta="다시 찾아줘"
        onCta={() => runReco('맞춤 공고 다시 찾아줘')}
        onBrowseAll={onBrowseAll}
      />
    )
  }

  if (items.length === 0) {
    return (
      <EmptyReco
        title="아직 맞춤 공고가 없어요"
        body={'회사 프로필을 작성한 뒤 채팅에서\n“맞춤 공고 찾아줘”라고 해보세요.'}
        cta="맞춤 공고 찾아줘"
        onCta={() => runReco()}
        onBrowseAll={onBrowseAll}
      />
    )
  }

  const selectedCount = docs.length

  return (
    <>
      <div className="relative mx-3 mb-2">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="사업명·발주기관 검색"
          className="h-7.5 w-full rounded-lg border border-input bg-card py-1 pr-2.5 pl-7.5 text-[12.5px] outline-none focus:border-primary"
        />
      </div>
      <p className="mx-4 mb-2 text-[11px] text-muted-foreground">
        참가자격 대조 완료 {items.length}건 · 체크하면 대화에 첨부돼요
      </p>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3">
        <div className="flex flex-col gap-1.5">
          {filtered.map((r) => (
            <RecoRow
              key={r.doc_id}
              item={r}
              selected={has(r.doc_id)}
              // 상한에 걸리면 체크 자체를 막는다 — 눌러도 아무 일이 없으면 고장으로 읽힌다.
              disabled={!has(r.doc_id) && isFull}
              onToggle={() =>
                has(r.doc_id)
                  ? remove(r.doc_id)
                  : add({ doc_id: r.doc_id, 사업명: r.사업명, verdict: r.verdict })
              }
              onOpenSource={() => open(docKey(r.doc_id))}
            />
          ))}
          {filtered.length === 0 && (
            <p className="px-1 py-4 text-center text-[11.5px] text-muted-foreground">
              “{query}”와 맞는 공고가 없어요.
            </p>
          )}
        </div>
        <button
          onClick={onBrowseAll}
          className="my-3 w-full py-1 text-[11.5px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          전체 공고 둘러보기
        </button>
      </div>

      {selectedCount >= 2 && (
        <div className="px-3 pt-2.5 pb-1">
          <button
            onClick={() => runCompare()}
            className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
          >
            <Table2 className="size-3.5" />
            선택한 {selectedCount}건 비교표 만들기
          </button>
        </div>
      )}
      {selectedCount > 0 && selectedCount < 2 && (
        <p className="px-4 pt-2 pb-2 text-[11px] text-muted-foreground">
          하나 더 체크하면 비교표를 만들 수 있어요 (최대 {MAX_ACTIVE_DOCS}건).
        </p>
      )}
    </>
  )
}

function RecoRow({
  item,
  selected,
  disabled,
  onToggle,
  onOpenSource,
}: {
  item: RecommendationItem
  selected: boolean
  disabled: boolean
  onToggle: () => void
  onOpenSource: () => void
}) {
  const badge = verdictBadge(item.verdict, item.unclear_count, item.missing_count)
  const due = deadlineBadge(item.마감일)

  return (
    <div
      className={cn(
        'relative flex items-start gap-2.5 rounded-[10px] border px-2.5 py-2.5',
        selected ? 'border-primary bg-accent' : 'border-border bg-card',
        disabled && 'opacity-50',
      )}
    >
      <button
        onClick={onToggle}
        disabled={disabled}
        role="checkbox"
        aria-checked={selected}
        aria-label={`${item.사업명 ?? item.doc_id} 대화에 첨부`}
        className={cn(
          'mt-0.5 grid size-4 shrink-0 place-items-center rounded border-2 text-primary-foreground',
          selected ? 'border-primary bg-primary' : 'border-input',
        )}
      >
        {selected && (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-2.5"
            aria-hidden
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </button>
      <button
        onClick={onToggle}
        disabled={disabled}
        title={item.doc_id}
        className="min-w-0 flex-1 text-left"
      >
        <span className="line-clamp-2 text-[12.5px] leading-snug font-semibold">
          {item.사업명 ?? item.doc_id}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={cn(
              'min-w-0 truncate rounded px-1.5 text-[10.5px] font-bold',
              VERDICT_TONE_CLASS[badge.tone],
            )}
          >
            {badge.label}
          </span>
          <span className={cn('shrink-0 font-mono', due.past && 'text-muted-foreground/60')}>
            {due.label}
          </span>
        </span>
      </button>
      <button
        onClick={onOpenSource}
        title={item.doc_id}
        className="shrink-0 self-end text-[10.5px] whitespace-nowrap text-muted-foreground underline underline-offset-2 transition-colors hover:text-primary"
      >
        원문 보기
      </button>
    </div>
  )
}

function EmptyReco({
  title,
  body,
  cta,
  onCta,
  onBrowseAll,
}: {
  title: string
  body: string
  cta: string
  onCta: () => void
  onBrowseAll: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2.5 px-5 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-border bg-secondary text-muted-foreground">
        <Target className="size-5" />
      </span>
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="text-[11.5px] leading-relaxed whitespace-pre-line text-muted-foreground">
        {body}
      </p>
      <button
        onClick={onCta}
        className="mt-0.5 rounded-full border border-primary bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-[filter] hover:brightness-[1.02]"
      >
        {cta}
      </button>
      {/* 추천이 없어도 문서는 담을 수 있어야 한다 — 추천은 지름길이지 유일한 입구가 아니다. */}
      <button
        onClick={onBrowseAll}
        className="text-[11.5px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
      >
        전체 공고 둘러보기
      </button>
    </div>
  )
}

/**
 * 추천 진행 단계 — 백엔드가 배치 그룹마다 흘려주는 실제 진행(NDJSON)을 그대로 표시한다.
 * 지어낸 퍼센트가 아니라 몇 번째 배치가 끝났는지를 그대로 보여준다.
 */
function ProgressSteps({ progress }: { progress: RecoProgress }) {
  const candidatesDone = progress.stage !== 'idle'
  const count = progress.stage !== 'idle' && 'count' in progress ? progress.count : null
  const matching = progress.stage === 'matching' ? progress : null
  const enriching = progress.stage === 'enriching'

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3.5 py-3">
      <div className="flex flex-col gap-2">
        <Step
          state={candidatesDone ? 'done' : 'active'}
          label={
            count != null ? `적합도 높은 공고 ${count}건 선별` : '프로필과 가까운 공고 선별 중…'
          }
        />
        <Step
          state={enriching ? 'done' : matching ? 'active' : 'pending'}
          label={
            matching
              ? `참가자격 대조 중 (${matching.done}/${matching.total})`
              : '후보별 참가자격 대조'
          }
        />
        <Step state={enriching ? 'active' : 'pending'} label="결과 정리 중" />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        다른 탭에 갔다 오셔도 계속 진행돼요.
      </p>
    </div>
  )
}

function Step({ state, label }: { state: 'done' | 'active' | 'pending'; label: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[11.5px]',
        state === 'pending' && 'text-muted-foreground opacity-60',
        state === 'active' && 'font-semibold',
      )}
    >
      <span
        className={cn(
          'grid size-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold',
          state === 'done' && 'bg-success-soft text-success',
          state === 'active' && 'text-primary',
        )}
      >
        {state === 'done' ? '✓' : state === 'active' ? '●' : '○'}
      </span>
      {label}
    </div>
  )
}

function FilesTab() {
  const { files, open, active } = useWorkspace()

  return (
    <>
      <p className="mx-4 mb-2 text-[11px] leading-relaxed text-muted-foreground">
        채팅에서 만든 표·정리가 여기 쌓여요 · 공고 원문은 답변의 출처로 열람해요
      </p>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3">
        {files.length === 0 ? (
          <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
            아직 없어요 — 채팅에서 비교표·핵심 정리를 요청하면 여기 저장돼요.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {files.map((f) => {
              const key = f.type === 'table' ? 'compare' : genKey(f.id)
              const isOpen = active === key
              return (
                <button
                  key={f.id}
                  onClick={() => open(key)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-[9px] border px-2.5 py-2 text-left',
                    isOpen ? 'border-border bg-card' : 'border-transparent',
                  )}
                >
                  <span className="grid size-6.5 shrink-0 place-items-center rounded-[7px] bg-accent text-accent-foreground">
                    {f.type === 'table' ? (
                      <Table2 className="size-3.5" />
                    ) : (
                      <FileText className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold">{f.title}</span>
                    <span className="mt-px block text-[10.5px] text-muted-foreground">
                      {formatRelativeTime(f.createdAt)} · {f.sub}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
