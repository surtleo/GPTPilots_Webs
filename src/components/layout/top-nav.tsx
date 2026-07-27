import { Link, useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { to: '/recommendations', label: '추천 목록' },
  { to: '/me', label: '내 정보' },
]

/** 헤더(로고 + 추천목록/내 정보 탭) — 화면 3·4·5 공통. */
export function TopNav() {
  const { pathname } = useLocation()

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        <Link to="/recommendations" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="font-heading text-lg leading-none font-semibold tracking-tight">
            BidMate
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {NAV_LINKS.map((l) => {
            const active = pathname.startsWith(l.to)
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  'border-b-2 border-transparent pb-0.5 text-muted-foreground transition-colors hover:text-foreground',
                  active && 'border-foreground font-medium text-foreground',
                )}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
