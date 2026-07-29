import { NavLink, useNavigate } from 'react-router-dom'
import { Columns2, MessageSquare, PanelLeft, Plus, SunMoon, Target, User, X } from 'lucide-react'

import { useActiveDocs, SLOT_KEYS, MAX_ACTIVE_DOCS } from '@/lib/active-docs-context'
import { useChatSessions } from '@/lib/chat-sessions-context'
import { useProfile } from '@/lib/profile-context'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/chat', label: '대화', icon: MessageSquare },
  { to: '/profile', label: '내 회사 프로필', icon: User },
  { to: '/recommendations', label: '공고 추천', icon: Target },
] as const

/**
 * 좌측 사이드바 — 기능 전환 + 활성 문서(A·B·C) 관리.
 * 접으면 아이콘 레일이 된다: 모든 항목을 같은 크기(size-9)·같은 색 규칙으로 두고,
 * 채워진 primary는 로고 하나만 남긴다(선택 상태는 accent 배경으로만 구분).
 */
export function AppSidebar({
  collapsed,
  onToggleCollapse,
  onAddDoc,
  onCompare,
  onToggleTheme,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  onAddDoc: () => void
  onCompare: () => void
  onToggleTheme: () => void
}) {
  const { docs, remove, isFull } = useActiveDocs()
  const { profile } = useProfile()
  const hasProfile = profile.introText.trim().length > 0
  const { sessions, currentId, startNew, select, remove: removeSession } = useChatSessions()
  const navigate = useNavigate()

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-sidebar">
      {/* 브랜드 + 접기 */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-3.5 pt-4 pb-3',
          collapsed && 'flex-col gap-2 px-0',
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground">
          <BrandMark />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-heading text-[1.05rem] leading-none font-bold tracking-tight">
              BidMate
            </p>
            <p className="mt-1 font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
              공공입찰 자격진단
            </p>
          </div>
        )}
        <RailButton
          onClick={onToggleCollapse}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          collapsed={collapsed}
          className={collapsed ? '' : 'ml-auto'}
        >
          <PanelLeft className="size-[18px]" />
        </RailButton>
      </div>

      {!collapsed && <SectionLabel>기능</SectionLabel>}
      <nav className={cn('flex flex-col gap-0.5', collapsed ? 'items-center px-0' : 'px-2.5 pb-3')}>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg text-[0.84rem] whitespace-nowrap text-muted-foreground transition-colors hover:bg-card hover:text-foreground',
                collapsed ? 'size-9 justify-center' : 'px-2.5 py-2',
                isActive && 'bg-accent font-semibold text-accent-foreground hover:bg-accent',
              )
            }
          >
            <Icon className="size-[18px] shrink-0" />
            {!collapsed && <span className="flex-1">{label}</span>}
            {!collapsed && to === '/profile' && hasProfile && (
              <span className="size-1.5 shrink-0 rounded-full bg-success" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* 활성 문서 */}
      <div
        className={cn('flex items-center gap-1.5 pb-1.5', collapsed ? 'justify-center' : 'px-3.5')}
      >
        {!collapsed && (
          <>
            <span className="font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
              활성 문서
            </span>
            <span className="rounded-full border border-border px-1.5 font-mono text-[0.6rem] text-muted-foreground">
              {docs.length}
            </span>
          </>
        )}
        <RailButton
          onClick={onAddDoc}
          title="문서 담기"
          collapsed={collapsed}
          disabled={isFull}
          className={collapsed ? '' : 'ml-auto'}
          boxed={!collapsed}
        >
          <Plus className="size-[18px]" />
        </RailButton>
      </div>

      <div className={cn('flex flex-col gap-1.5 pb-3', collapsed ? 'items-center px-0' : 'px-2.5')}>
        {docs.map((doc, i) => (
          <div
            key={doc.doc_id}
            title={doc.사업명 ?? doc.doc_id}
            className={cn(
              'flex items-center gap-2 text-xs',
              collapsed
                ? 'size-9 justify-center rounded-lg bg-accent font-semibold text-accent-foreground'
                : 'rounded-lg border border-border bg-card px-2.5 py-1.5',
            )}
          >
            {collapsed ? (
              SLOT_KEYS[i]
            ) : (
              <>
                <span className="grid size-[17px] shrink-0 place-items-center rounded bg-primary font-mono text-[0.6rem] font-bold text-primary-foreground">
                  {SLOT_KEYS[i]}
                </span>
                <span className="min-w-0 flex-1 truncate">{doc.사업명 ?? doc.doc_id}</span>
                <button
                  onClick={() => remove(doc.doc_id)}
                  aria-label={`${SLOT_KEYS[i]} 비우기`}
                  className="grid shrink-0 place-items-center text-muted-foreground hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </>
            )}
          </div>
        ))}

        {docs.length >= 2 &&
          (collapsed ? (
            <RailButton onClick={onCompare} title="나란히 비교" collapsed>
              <Columns2 className="size-[18px]" />
            </RailButton>
          ) : (
            <button
              onClick={onCompare}
              className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-[filter] hover:brightness-105"
            >
              <Columns2 className="size-3.5" />
              나란히 비교
            </button>
          ))}

        {!collapsed && docs.length === 0 && (
          <p className="px-0.5 text-[0.68rem] text-muted-foreground">
            공고를 담으면 원문을 옆에서 보고, 두 개 이상이면 나란히 비교할 수 있어요.
          </p>
        )}
        {!collapsed && isFull && (
          <p className="px-0.5 text-[0.68rem] text-muted-foreground">
            {MAX_ACTIVE_DOCS}개까지 담을 수 있어요. 더 담으려면 하나를 비워주세요.
          </p>
        )}
      </div>

      {/* 최근 대화 — 클로드처럼 지난 세션들을 목록으로. "+" 로 진짜 빈 새 대화를 시작한다
          (예전엔 이 버튼이 사이드바 맨 위에 크게 있었는데, "대화" 탭과 하는 일이 똑같아
          중복이라는 피드백으로 없애고 여기 압축해서 넣었다). */}
      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1.5 px-3.5 pb-1.5">
            <span className="font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
              최근 대화
            </span>
            <button
              onClick={() => {
                startNew()
                navigate('/chat')
              }}
              title="새 대화"
              aria-label="새 대화"
              className="ml-auto grid size-[22px] shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
            {sessions.length === 0 ? (
              <p className="px-1.5 text-[0.68rem] text-muted-foreground">
                대화를 시작하면 여기 쌓여요.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      'group flex items-center rounded-lg pr-1 transition-colors hover:bg-card',
                      s.id === currentId && 'bg-card',
                    )}
                  >
                    <button
                      onClick={() => {
                        select(s.id)
                        navigate('/chat')
                      }}
                      title={s.title}
                      aria-current={s.id === currentId}
                      className={cn(
                        'min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-[0.8rem] text-muted-foreground',
                        s.id === currentId && 'font-medium text-foreground',
                      )}
                    >
                      {s.title}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSession(s.id)
                      }}
                      title="대화 삭제"
                      aria-label="대화 삭제"
                      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {collapsed && <div className="mt-auto" />}

      <div
        className={cn(
          'flex items-center gap-2 border-t border-border py-2.5',
          collapsed ? 'justify-center px-0' : 'justify-between px-3.5',
        )}
      >
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">
              {profile.field ?? '회사 프로필 미작성'}
            </p>
            <p className="text-[0.68rem] text-muted-foreground">
              {profile.recentCount ? `최근 3년 ${profile.recentCount}건` : '추천에서 작성 가능'}
            </p>
          </div>
        )}
        <RailButton
          onClick={onToggleTheme}
          title="라이트/다크 전환"
          collapsed={collapsed}
          boxed={!collapsed}
        >
          <SunMoon className="size-[18px]" />
        </RailButton>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4.5 pb-1.5 font-mono text-[0.6rem] tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  )
}

/** 레일/툴 버튼 — 접힘 상태에선 size-9 무테, 펼침 상태에선 26px 박스. */
function RailButton({
  children,
  title,
  onClick,
  collapsed,
  disabled,
  boxed,
  className,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  collapsed?: boolean
  disabled?: boolean
  boxed?: boolean
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cn(
        'grid shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors enabled:hover:bg-card enabled:hover:text-foreground disabled:opacity-40',
        collapsed ? 'size-9' : boxed ? 'size-[26px] border border-border bg-card' : 'size-[26px]',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** 로고 마크 — lucide Sparkles와 같은 결의 단순 별 아이콘. */
function BrandMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[19px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  )
}
