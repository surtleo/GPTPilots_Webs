import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bookmark, MessageSquareText, UserRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TopNav } from '@/components/layout/top-nav'
import { MOCK_CONVERSATIONS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'profile', label: '내 프로필', icon: UserRound },
  { id: 'saved', label: '저장한 공고', icon: Bookmark },
  { id: 'history', label: '대화 기록', icon: MessageSquareText },
] as const

type TabId = (typeof TABS)[number]['id']

/** 화면 5 — 마이페이지: 프로필 카드 + 사이드 탭(프로필/저장한 공고/대화 기록). 전부 목업 데이터. */
export function MyPage() {
  const [tab, setTab] = useState<TabId>('history')

  return (
    <div className="min-h-screen bg-secondary">
      <TopNav />
      <main className="mx-auto flex max-w-5xl gap-6 px-6 py-8">
        <aside className="flex w-56 shrink-0 flex-col gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
                tab === t.id
                  ? 'border-border bg-accent text-accent-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted',
              )}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1">
          <ProfileCard />

          {tab === 'history' && <ConversationHistory />}
          {tab === 'saved' && (
            <EmptyPanel text="아직 저장한 공고가 없습니다. 추천 목록에서 공고를 저장해보세요." />
          )}
          {tab === 'profile' && <EmptyPanel text="등록 정보 편집 화면은 준비 중입니다." />}
        </div>
      </main>
    </div>
  )
}

function ProfileCard() {
  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <UserRound className="size-6" />
      </span>
      <div className="flex-1">
        <div className="font-heading text-lg font-semibold">(주)○○테크 · 중소SW기업</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['관제 시스템', 'IoT 센서', '지자체'].map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      </div>
      <Button variant="outline" size="sm">
        등록 정보 수정
      </Button>
    </div>
  )
}

function ConversationHistory() {
  return (
    <div>
      <h2 className="mb-3.5 font-heading text-lg font-semibold tracking-tight">지난 대화</h2>
      <div className="flex flex-col gap-3.5">
        {MOCK_CONVERSATIONS.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-5 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.title}</div>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                마지막 대화 · {c.date}
              </div>
              <div className="mt-2 text-sm text-foreground">{c.preview}</div>
            </div>
            <Button
              render={<Link to={`/rfp/${c.rfpId}`} />}
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
            >
              이어서 대화하기 <ArrowRight className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
