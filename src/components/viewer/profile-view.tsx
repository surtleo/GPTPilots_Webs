import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  FIELD_OPTIONS,
  PROFILE_FIELD_COUNT,
  QUAL_GROUPS,
  REGION_OPTIONS,
  REGIONS_SEEN_IN_DOCS,
  shortRegion,
  useProfile,
  type DaegiState,
  type QualGroup,
} from '@/lib/profile-context'
import { useWorkspace } from '@/lib/workspace-context'
import { cn } from '@/lib/utils'

/**
 * 내 회사 프로필 — 자유서술 · 소재지 · 주력분야 · 실적 · 자격(유형별).
 *
 * 저장 버튼이 없다: 입력하는 즉시 localStorage에 반영된다. 버튼을 두면 "눌러야 반영되나?"를
 * 매번 신경 쓰게 되는데, 이 프로필은 추천을 다시 부르는 트리거일 뿐이라 그럴 이유가 없다.
 *
 * 자격 21개를 한 번에 펼치지 않고 유형 6개로 접어둔 이유: 한 화면에 21개를 늘어놓으면
 * 어디까지 봤는지 놓치고, 대부분은 자기와 무관한 유형이다. 대신 어느 유형에서 체크했든
 * 상단 요약에 모아 보여줘서 "내가 뭘 체크했는지"는 항상 한눈에 보이게 했다.
 */
export function ProfileView() {
  const { profile, setProfile, filledCount } = useProfile()
  const { close } = useWorkspace()
  // 한 번에 한 유형만 펼친다(아코디언) — 여러 개 열려 있으면 스크롤이 길어져 요약이 밀린다.
  const [openGroup, setOpenGroup] = useState<string | null>(null)

  const pct = Math.round((filledCount / PROFILE_FIELD_COUNT) * 100)
  const remaining = PROFILE_FIELD_COUNT - filledCount

  const toggleQual = (q: string) => {
    const next = profile.qualifications.includes(q)
      ? profile.qualifications.filter((x) => x !== q)
      : [...profile.qualifications, q]
    setProfile({ qualifications: next })
  }

  const toggleField = (f: string) => {
    const next = profile.fields.includes(f)
      ? profile.fields.filter((x) => x !== f)
      : [...profile.fields, f]
    setProfile({ fields: next })
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[42rem] px-7 pt-6.5 pb-16">
        <header className="mb-4 flex items-start gap-2">
          <div className="flex-1">
            <h1 className="font-heading text-[1.7rem] font-bold tracking-tight">내 회사 프로필</h1>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">
              여기 적은 정보로 공고의 참가자격을 대조해요. 작성해두면 채팅에서 “맞춤 공고 찾아줘”가
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

          <RegionCard />

          <Card>
            <p className="text-sm font-semibold">주력 분야</p>
            <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
              해당하는 분야를 모두 골라주세요 — 여러 분야를 겸하면 그만큼 더 많은 공고를 봐요.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FIELD_OPTIONS.map((f) => {
                const on = profile.fields.includes(f)
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleField(f)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-secondary',
                      on && 'border-primary bg-accent text-accent-foreground',
                    )}
                  >
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
              계약 서류 기준으로 입력해주세요. 실적 건수를 요건으로 두는 공고가 23%예요.
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

          {/* 자격 — 상단 요약 + 유형별 아코디언 */}
          <Card>
            <p className="text-sm font-semibold">보유 자격·신고사항</p>
            <p className="mt-0.5 mb-3 text-xs leading-relaxed text-muted-foreground">
              체크하지 않은 항목은 “없음”이 아니라 “확인 못 함”으로 처리돼요. 유형을 눌러 해당하는
              것만 골라주세요.
            </p>

            <CheckedSummary />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUAL_GROUPS.map((g) => {
                const done = g.items.filter((i) => profile.qualifications.includes(i.label)).length
                const open = openGroup === g.id
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setOpenGroup(open ? null : g.id)}
                    aria-expanded={open}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary',
                      open && 'border-primary bg-accent',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[12.5px] leading-tight font-bold',
                        open && 'text-accent-foreground',
                      )}
                    >
                      {g.label}
                    </span>
                    <span
                      className={cn(
                        'flex w-full items-center gap-1.5 text-[10.5px] text-muted-foreground',
                        open && 'text-accent-foreground/85',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 shrink-0 rounded-full bg-border',
                          done > 0 && done === g.items.length && 'bg-success',
                        )}
                      />
                      {done}/{g.items.length}
                      <ChevronDown
                        className={cn('ml-auto size-3 transition-transform', open && 'rotate-180')}
                      />
                    </span>
                  </button>
                )
              })}
            </div>

            {QUAL_GROUPS.filter((g) => g.id === openGroup).map((g) => (
              <GroupPanel key={g.id} group={g} onToggle={toggleQual} />
            ))}
          </Card>

          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            입력하는 즉시 자동 저장돼요 — 저장 버튼이 없는 이유예요.
          </p>
        </div>
      </div>
    </div>
  )
}

/** 어느 유형에서 체크했든 여기 모아 보여준다 — 접힌 유형 안의 체크가 안 보이는 걸 막는다. */
function CheckedSummary() {
  const { profile, setProfile } = useProfile()
  const checked = profile.qualifications

  return (
    <div className="mb-3 rounded-[10px] border border-border bg-secondary px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11.5px] font-bold">✓ 체크한 항목</span>
        <span className="font-mono text-[10.5px] text-muted-foreground">{checked.length}개</span>
      </div>
      {checked.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          아직 없어요 — 아래 유형을 눌러 골라보세요.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {checked.map((q) => (
            <span
              key={q}
              className="flex max-w-full items-center gap-1 rounded-full bg-accent py-0.5 pr-1 pl-2.5 text-[11px] font-semibold text-accent-foreground"
            >
              <span className="truncate">{q}</span>
              <button
                onClick={() =>
                  setProfile({ qualifications: profile.qualifications.filter((x) => x !== q) })
                }
                aria-label={`${q} 체크 해제`}
                className="grid size-3.5 shrink-0 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupPanel({ group, onToggle }: { group: QualGroup; onToggle: (q: string) => void }) {
  const { profile, setProfile } = useProfile()

  return (
    <div className="mt-2.5 rounded-[10px] border border-dashed border-border bg-secondary p-3">
      <div className="flex flex-col gap-1.5">
        {group.items.map((item) => {
          const on = profile.qualifications.includes(item.label)
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onToggle(item.label)}
              aria-pressed={on}
              className={cn(
                'flex items-center gap-2.5 rounded-[9px] border border-border bg-card px-3 py-2.5 text-left text-[12.5px] transition-colors hover:bg-background',
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
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
          )
        })}
      </div>

      {group.extra === 'daegi' && <DaegiPicker />}

      {group.extra === 'licenseOther' && (
        <div className="mt-2.5 rounded-[9px] border border-border bg-card px-3 py-2.5">
          <label className="mb-2 block text-[12.5px] font-semibold" htmlFor="licOther">
            그 외 보유한 면허·등록증
          </label>
          <Input
            id="licOther"
            value={profile.licenseOther}
            onChange={(e) => setProfile({ licenseOther: e.target.value })}
            placeholder="예) 소방시설공사업, 정보보호 전문서비스 기업 지정"
            className="text-[13px]"
          />
        </div>
      )}
    </div>
  )
}

/**
 * 대기업집단 소속 여부 — 3지선다.
 * 체크박스면 "예"라고 답할 방법이 없어서(체크 안 함 = 확인 못 함) 이 항목만 예외로 둔다.
 * 근거는 profile-context.tsx의 DaegiState 주석.
 */
function DaegiPicker() {
  const { profile, setProfile } = useProfile()
  const OPTS: { v: DaegiState; label: string; cls: string }[] = [
    { v: 'no', label: '아니오', cls: 'border-success bg-success-soft text-success' },
    { v: 'yes', label: '예', cls: 'border-danger bg-danger-soft text-danger' },
    { v: 'unknown', label: '모름', cls: 'border-warning bg-warning-soft text-warning' },
  ]

  return (
    <div className="mt-2.5 rounded-[9px] border border-border bg-card px-3 py-2.5">
      <p className="mb-2 text-[12.5px] font-semibold">
        대기업집단(상호출자제한기업집단)에 소속되어 있나요?
      </p>
      <div className="flex gap-1.5">
        {OPTS.map((o) => {
          const sel = profile.daegi === o.v
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => setProfile({ daegi: sel ? null : o.v })}
              aria-pressed={sel}
              className={cn(
                'flex-1 rounded-lg border border-border py-1.5 text-center text-xs font-semibold transition-colors',
                sel ? o.cls : 'bg-background hover:bg-secondary',
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 소재지 — 드래그로 여러 지역 선택 + 2곳 이상이면 본점 지정.
 *
 * 공고가 따지는 건 대개 "본점 소재지"라(실측 7개 조항 중 5개) 본점을 따로 물어야 정확하다.
 * 다만 1곳만 고른 경우엔 그게 본점이므로 묻지 않는다 — 뻔한 것을 두 번 묻지 않는다.
 */
function RegionCard() {
  const { profile, setProfile } = useProfile()
  const dragging = useRef(false)
  // 드래그 시작 칸의 반대 상태로 통일해 칠한다 — 지나간 칸이 켜졌다 꺼졌다 하지 않게.
  const mode = useRef<'select' | 'deselect' | null>(null)

  const apply = useCallback(
    (region: string) => {
      if (!mode.current) return
      const has = profile.regions.includes(region)
      if (mode.current === 'select' && has) return
      if (mode.current === 'deselect' && !has) return
      const next =
        mode.current === 'select'
          ? [...profile.regions, region]
          : profile.regions.filter((r) => r !== region)
      const nextHq = profile.hqRegion && next.includes(profile.hqRegion) ? profile.hqRegion : null
      setProfile({ regions: next, hqRegion: next.length === 1 ? next[0] : nextHq })
    },
    [profile.regions, profile.hqRegion, setProfile],
  )

  // 드래그 종료는 문서 전체에서 받는다 — 그리드 밖에서 손을 떼도 드래그가 안 남게.
  useEffect(() => {
    const end = () => {
      dragging.current = false
      mode.current = null
    }
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
    return () => {
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
    }
  }, [])

  const others = profile.regions.filter((r) => r !== profile.hqRegion)

  return (
    <Card>
      <p className="text-sm font-semibold">사업장이 있는 지역</p>
      <p className="mt-0.5 mb-2.5 text-xs leading-relaxed text-muted-foreground">
        칸을 <b className="font-semibold text-foreground">누른 채 드래그</b>하면 여러 곳을 한 번에
        고를 수 있어요. 일부 공고는 “본점이 ○○에 있어야 참가 가능”이라 이 정보가 필요해요.
      </p>
      <div className="grid touch-none grid-cols-4 gap-1.5 select-none sm:grid-cols-6">
        {REGION_OPTIONS.map((r) => {
          const on = profile.regions.includes(r)
          const isHq = profile.hqRegion === r
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              // 점이 찍힌 지역은 실제 공고에서 지역제한으로 등장한 곳 — 화면에 설명을 따로
              // 두지 않고 hover 툴팁으로만 알려준다(각주가 많으면 정작 입력이 안 읽힌다).
              title={REGIONS_SEEN_IN_DOCS.includes(r) ? `${r} — 지역제한 공고에 등장한 지역` : r}
              onPointerDown={(e) => {
                e.preventDefault()
                dragging.current = true
                mode.current = on ? 'deselect' : 'select'
                apply(r)
              }}
              onPointerEnter={() => {
                if (dragging.current) apply(r)
              }}
              className={cn(
                'relative rounded-[9px] border border-border bg-card py-2.5 text-[12.5px] font-semibold transition-colors hover:border-primary',
                on && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {shortRegion(r)}
              {REGIONS_SEEN_IN_DOCS.includes(r) && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-1 right-1 size-1.5 rounded-full bg-warning',
                    on && 'bg-primary-foreground/80',
                  )}
                />
              )}
              {isHq && (
                <span className="absolute inset-x-0 bottom-0.5 text-[8.5px] font-extrabold tracking-wide">
                  본점
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-2.5 text-xs leading-relaxed">
        {profile.regions.length === 0 ? (
          <span className="text-muted-foreground">
            선택 안 함 — 지역제한 공고는 “확인 못 함”으로 처리돼요.
          </span>
        ) : (
          <>
            사업장 <b className="text-primary">{profile.regions.length}곳</b>
            {profile.hqRegion && (
              <>
                {' · 본점 '}
                <b className="text-primary">{profile.hqRegion}</b>
              </>
            )}
            {others.length > 0 && (
              <span className="text-muted-foreground"> · 그 외 {others.join(' · ')}</span>
            )}
          </>
        )}
      </p>

      {profile.regions.length >= 2 && (
        <div className="mt-2.5 border-t border-dashed border-border pt-2.5">
          <p className="mb-2 text-[12.5px] font-semibold">이 중 본점(법인등기부상)은 어디인가요?</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.regions.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setProfile({ hqRegion: r })}
                aria-pressed={profile.hqRegion === r}
                className={cn(
                  'rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-secondary',
                  profile.hqRegion === r && 'border-primary bg-accent text-accent-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card px-4.5 py-4">{children}</div>
}
