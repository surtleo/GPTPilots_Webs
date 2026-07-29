import { useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FIELD_OPTIONS, QUALIFICATION_OPTIONS, useProfile } from '@/lib/profile-context'
import { cn } from '@/lib/utils'

/**
 * 내 회사 프로필 — 한 페이지에 전부 펼친다(자유서술 · 자격 체크 · 주력분야 · 실적).
 * 마법사(단계별)로 나누지 않는 이유: 사이드바로 아무 때나 드나드는 구조라
 * 진행 단계가 있으면 갇힌 느낌이 들고, 나중에 한 항목만 고칠 때도 번거롭다.
 */
export function ProfilePage() {
  const { profile, setProfile, reset } = useProfile()
  const [saved, setSaved] = useState(false)

  const toggleQual = (q: string) => {
    const next = profile.qualifications.includes(q)
      ? profile.qualifications.filter((x) => x !== q)
      : [...profile.qualifications, q]
    setProfile({ qualifications: next })
  }

  const uncheckedCount = QUALIFICATION_OPTIONS.length - profile.qualifications.length

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-7 py-7 pb-16">
        <header className="mb-5">
          <h1 className="font-heading text-h2 font-bold tracking-tight">내 회사 프로필</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            이 정보로 공고의 참가자격을 대조합니다. 언제든 고치면 추천도 다시 계산됩니다.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <Card>
            <label className="block text-sm font-semibold" htmlFor="intro">
              어떤 사업을 해오셨나요?
            </label>
            <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
              자유롭게 쓰셔도 됩니다. 하고 싶은 분야를 적으셔도 돼요.
            </p>
            <Textarea
              id="intro"
              rows={5}
              value={profile.introText}
              onChange={(e) => setProfile({ introText: e.target.value })}
              placeholder="예) 지자체 대상 관제·모니터링 시스템을 주로 구축해 왔으며, IoT 센서 연동과 대시보드 개발 경험이 있습니다."
              className="resize-none"
            />
          </Card>

          <Card>
            <p className="text-sm font-semibold">보유 자격·신고사항</p>
            <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
              업무 경험은 위에 쓰셔도 되지만, 자격·신고사항은 여기서 체크해주셔야 판정에 정확히
              반영됩니다.
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
                      'flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary',
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

          <Card>
            <p className="text-sm font-semibold">주력 분야</p>
            <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
              가장 가까운 하나를 골라주세요.
            </p>
            <div className="flex flex-col gap-1.5">
              {FIELD_OPTIONS.map((f) => {
                const on = profile.field === f
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setProfile({ field: f })}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary',
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
                className="max-w-32 font-mono text-base font-semibold tabular-nums"
              />
              <span className="text-sm text-muted-foreground">건</span>
            </div>
          </Card>

          {uncheckedCount > 0 && profile.introText.trim() && (
            <div className="rounded-xl border border-warning/40 bg-warning/5 px-5 py-4">
              <p className="font-mono text-[0.6rem] tracking-wider text-warning uppercase">
                정확도를 높이려면
              </p>
              <p className="mt-1.5 text-sm">
                체크하지 않은 자격이 <b>{uncheckedCount}개</b> 있습니다. 실제로 보유 중이시라면
                체크해주세요 — 체크하지 않으면 그 요건은 “확인 못 함”으로 남아 적격 판정의 근거가
                줄어듭니다.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2.5">
            <Button
              variant="outline"
              onClick={() => {
                reset()
                setSaved(false)
              }}
            >
              <RotateCcw className="size-4" />
              초기화
            </Button>
            <Button
              onClick={() => {
                setSaved(true)
                window.setTimeout(() => setSaved(false), 1800)
              }}
            >
              {saved ? '저장됨' : '저장'}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            입력하는 즉시 자동 저장됩니다 — 새로고침해도 유지돼요.
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card px-5 py-4.5">{children}</div>
}
