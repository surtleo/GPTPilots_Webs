import { Check, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  FIELD_OPTIONS,
  PROFILE_FIELD_COUNT,
  QUALIFICATION_OPTIONS,
  useProfile,
} from '@/lib/profile-context'
import { useWorkspace } from '@/lib/workspace-context'
import { cn } from '@/lib/utils'

/**
 * 내 회사 프로필 — 한 화면에 전부 펼친다(자유서술 · 자격 체크 · 주력분야 · 실적).
 *
 * 저장 버튼이 없다: 입력하는 즉시 localStorage에 반영된다. 버튼을 두면 "눌러야 반영되나?"를
 * 매번 신경 쓰게 되는데, 이 프로필은 추천을 다시 부르는 트리거일 뿐이라 그럴 이유가 없다.
 */
export function ProfileView() {
  const { profile, setProfile, filledCount } = useProfile()
  const { close } = useWorkspace()

  const toggleQual = (q: string) => {
    const next = profile.qualifications.includes(q)
      ? profile.qualifications.filter((x) => x !== q)
      : [...profile.qualifications, q]
    setProfile({ qualifications: next })
  }

  const pct = Math.round((filledCount / PROFILE_FIELD_COUNT) * 100)
  const remaining = PROFILE_FIELD_COUNT - filledCount

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[42rem] px-7 pt-6.5 pb-16">
        <header className="mb-4 flex items-start gap-2">
          <div className="flex-1">
            <h1 className="font-heading text-[1.7rem] font-bold tracking-tight">내 회사 프로필</h1>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">
              이 정보로 공고의 참가자격을 대조해요. 작성해두면 채팅에서 “맞춤 공고 찾아줘”가
              동작해요.
            </p>
          </div>
          <button
            onClick={() => close('profile')}
            title="닫기"
            aria-label="닫기"
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="mb-3.5 rounded-xl border border-border bg-card px-4.5 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-semibold">
              프로필 완성도 {filledCount}/{PROFILE_FIELD_COUNT}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {remaining > 0
                ? `${remaining}개를 더 채우면 판정이 더 정확해져요`
                : '판정에 필요한 항목을 모두 채우셨어요'}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
            <div className="h-full rounded-sm bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card>
            <label className="block text-sm font-semibold" htmlFor="intro">
              어떤 사업을 해오셨나요?
            </label>
            <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
              자유롭게 쓰셔도 됩니다. 하고 싶은 분야를 적으셔도 돼요.
            </p>
            <Textarea
              id="intro"
              rows={4}
              value={profile.introText}
              onChange={(e) => setProfile({ introText: e.target.value })}
              placeholder="예) 지자체 대상 관제·모니터링 시스템을 주로 구축해 왔으며, IoT 센서 연동과 대시보드 개발 경험이 있습니다."
              className="resize-none"
            />
          </Card>

          <Card>
            <p className="text-sm font-semibold">보유 자격·신고사항</p>
            <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
              체크하지 않은 항목은 “없음”이 아니라 “확인 못 함”으로 처리돼요.
            </p>
            <div className="flex flex-col gap-1.5">
              {QUALIFICATION_OPTIONS.map((q) => {
                const on = profile.qualifications.includes(q)
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => toggleQual(q)}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary',
                      on && 'border-primary bg-accent font-semibold text-accent-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border-2 border-input',
                        on && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {q}
                  </button>
                )
              })}
            </div>
          </Card>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Card>
              <p className="mb-2.5 text-sm font-semibold">주력 분야</p>
              <div className="flex flex-col gap-1.5">
                {FIELD_OPTIONS.map((f) => {
                  const on = profile.field === f
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setProfile({ field: on ? null : f })}
                      aria-pressed={on}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-secondary',
                        on && 'border-primary bg-accent font-semibold text-accent-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-4 shrink-0 place-items-center rounded-full border-2 border-input',
                          on && 'border-primary',
                        )}
                      >
                        {on && <span className="size-2 rounded-full bg-primary" />}
                      </span>
                      {f}
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card>
              <label className="block text-sm font-semibold" htmlFor="cnt">
                최근 3년 공공부문 실적
              </label>
              <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
                계약 서류 기준으로 입력해주세요.
              </p>
              <div className="flex items-center gap-2.5">
                <Input
                  id="cnt"
                  type="number"
                  min={0}
                  value={profile.recentCount}
                  onChange={(e) => setProfile({ recentCount: e.target.value })}
                  placeholder="0"
                  className="max-w-28 font-mono text-base font-semibold tabular-nums"
                />
                <span className="text-sm text-muted-foreground">건</span>
              </div>
            </Card>
          </div>

          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            입력하는 즉시 자동 저장돼요 — 저장 버튼이 없는 이유예요.
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card px-4.5 py-4">{children}</div>
}
