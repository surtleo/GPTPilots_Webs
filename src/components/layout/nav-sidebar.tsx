import { useEffect, useRef, useState } from 'react'
import {
  MoreHorizontal,
  PanelLeft,
  SquarePen,
  SunMoon,
  Trash2,
  User,
  type LucideIcon,
} from 'lucide-react'

import { useChatSessions } from '@/lib/chat-sessions-context'
import { PROFILE_FIELD_COUNT, useProfile } from '@/lib/profile-context'
import { cn } from '@/lib/utils'

/**
 * 1열 — 새 채팅 · 최근 채팅 · 프로필 · 테마.
 *
 * 접으면 52px 레일로 줄어든다. 레일에서도 새 채팅·프로필·테마는 남긴다 —
 * 접었다고 못 하게 되는 동작이 있으면 접기 자체를 안 쓰게 된다.
 */
export function NavSidebar({
  open,
  onToggle,
  onOpenProfile,
  onToggleTheme,
}: {
  open: boolean
  onToggle: () => void
  onOpenProfile: () => void
  onToggleTheme: () => void
}) {
  const { sessions, currentId, startNew, select, remove } = useChatSessions()
  const { filledCount } = useProfile()
  const [menuFor, setMenuFor] = useState<string | null>(null)

  // 메뉴가 열린 채로 "메뉴 바깥"을 누르면 닫는다.
  //
  // 바깥인지 반드시 확인해야 한다: 조건 없이 닫으면 pointerdown 시점에 메뉴가 사라져서
  // 그 안의 "채팅 삭제" 버튼이 click을 받지 못한다(눌러도 아무 일이 안 일어난다). ⋯ 버튼도
  // 마찬가지로 pointerdown에 닫히고 click에 다시 열려 토글이 안 된다.
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuFor) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenuFor(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuFor])

  if (!open) {
    return (
      <aside className="flex w-13 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-sidebar py-3">
        <Logo />
        <RailButton icon={PanelLeft} title="사이드바 펼치기" onClick={onToggle} />
        <RailButton icon={SquarePen} title="새 채팅" onClick={startNew} />
        <div className="mt-auto flex flex-col gap-1.5">
          <RailButton icon={User} title="내 회사 프로필" onClick={onOpenProfile} />
          <RailButton icon={SunMoon} title="라이트/다크 전환" onClick={onToggleTheme} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex min-h-0 w-[clamp(11.25rem,16vw,14.5rem)] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2.5">
        <Logo />
        <p className="font-heading text-[1.02rem] leading-none font-bold tracking-tight">BidMate</p>
        <button
          onClick={onToggle}
          title="사이드바 접기"
          aria-label="사이드바 접기"
          className="ml-auto grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      <div className="px-2.5 pt-0.5 pb-2.5">
        <button
          onClick={startNew}
          className="flex w-full items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2.5 text-[13px] font-semibold shadow-sm transition-colors hover:border-primary hover:text-primary"
        >
          <SquarePen className="size-3.5" />새 채팅
        </button>
      </div>

      <p className="px-4 pt-0.5 pb-1.5 text-[11px] font-bold text-muted-foreground">최근 채팅</p>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5">
        {sessions.length === 0 ? (
          <p className="px-1 text-[11.5px] leading-relaxed text-muted-foreground">
            대화를 시작하면 여기 쌓여요.
          </p>
        ) : (
          <div className="flex flex-col gap-px">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  'group relative flex items-center rounded-lg',
                  s.id === currentId && 'bg-card',
                )}
              >
                <button
                  onClick={() => select(s.id)}
                  className={cn(
                    'block min-w-0 flex-1 rounded-lg px-2.5 py-[7px] text-left text-[12.5px]',
                    s.id === currentId && 'font-semibold',
                  )}
                >
                  <span className="block truncate">{s.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {s.activeDocTitle ?? '문서 미지정'}
                  </span>
                </button>
                {/* ⋯ 버튼과 메뉴만 "메뉴 안쪽"으로 친다 — 행 전체를 감싸면 같은 행의 세션을
                    눌러 전환했는데도 메뉴가 열린 채로 남는다. */}
                <div
                  ref={menuFor === s.id ? menuRef : undefined}
                  className="relative mr-1 shrink-0"
                >
                  <button
                    onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                    title="더 보기"
                    aria-label="채팅 메뉴"
                    aria-expanded={menuFor === s.id}
                    className="grid size-5.5 place-items-center rounded-md text-muted-foreground opacity-0 transition-colors group-hover:opacity-100 hover:bg-border hover:text-foreground focus-visible:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                  {menuFor === s.id && (
                    <div className="absolute top-full right-0 z-50 mt-0.5 min-w-[110px] rounded-[9px] border border-border bg-card p-1 shadow-lg">
                      <button
                        onClick={() => {
                          remove(s.id)
                          setMenuFor(null)
                        }}
                        className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs text-danger transition-colors hover:bg-secondary"
                      >
                        <Trash2 className="size-3.5" />
                        채팅 삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-2.5 py-2.5">
        <button
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-1.5 py-1.5 text-left transition-colors hover:bg-card"
        >
          <span className="grid size-7.5 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-muted-foreground">
            <User className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold">내 회사 프로필</span>
            <span className="block text-[10.5px] text-muted-foreground">
              완성도 {filledCount}/{PROFILE_FIELD_COUNT}
            </span>
          </span>
        </button>
        <button
          onClick={onToggleTheme}
          title="라이트/다크 전환"
          aria-label="라이트/다크 전환"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <SunMoon className="size-3.5" />
        </button>
      </div>
    </aside>
  )
}

function Logo() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary text-primary-foreground">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden
      >
        <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
        <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
      </svg>
    </span>
  )
}

function RailButton({
  icon: Icon,
  title,
  onClick,
}: {
  icon: LucideIcon
  title: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  )
}
