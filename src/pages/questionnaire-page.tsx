import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { inferProfile } from '@/lib/api'
import { QUESTIONNAIRE_STEPS } from '@/lib/mock-data'
import { useProfile } from '@/lib/profile-context'
import { cn } from '@/lib/utils'

/**
 * 화면 2 — 온보딩 뒤 이어지는 질문 단계. (a) 분야 선택 / (b) 자동추론 확인 / (c) 실적 건수
 * 3단계를 순회한다. "자동추론" 단계는 예전엔 고정 mock chips를 보여줬지만
 * (ELIGIBILITY_MATCH_PLAN.md Phase 3에서 발견), 이제 화면1 자유서술을 실제로
 * POST /profile/infer에 보내 받은 분야·키워드를 보여준다.
 * 마지막 단계에서 분야·실적 건수를 ProfileProvider에 저장하고 추천 목록으로 이동한다.
 */
export function QuestionnairePage() {
  const navigate = useNavigate()
  const { profile, setProfile } = useProfile()
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const [inferredField, setInferredField] = useState<string | null>(null)
  const [inferredChips, setInferredChips] = useState<string[]>([])
  const [inferring, setInferring] = useState(false)

  // 화면1 자유서술로 딱 한 번 자동추론 — introText가 이 화면에 머무는 동안 안 바뀌므로 마운트 시 1회.
  useEffect(() => {
    if (!profile.introText.trim()) return
    const controller = new AbortController()
    setInferring(true)
    inferProfile(profile.introText, controller.signal)
      .then((res) => {
        setInferredField(res.field)
        setInferredChips(res.chips)
      })
      .catch(() => {
        // 추론 실패해도 흐름을 막지 않는다 — chips 없이 확인 단계만 스킵되는 셈
        setInferredField(null)
        setInferredChips([])
      })
      .finally(() => setInferring(false))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = QUESTIONNAIRE_STEPS[stepIndex]
  const isLast = stepIndex === QUESTIONNAIRE_STEPS.length - 1
  const progressPct = ((stepIndex + 1) / QUESTIONNAIRE_STEPS.length) * 100
  const chips = step.kind === 'confirm' ? inferredChips : undefined

  const setAnswer = (value: string) => setAnswers((prev) => ({ ...prev, [step.id]: value }))

  const goNext = () => {
    if (isLast) {
      setProfile({
        field: answers.field ?? inferredField ?? null,
        recentCount: answers.recent_count ?? '',
      })
      navigate('/recommendations')
      return
    }
    setStepIndex((i) => i + 1)
  }

  const goPrev = () => {
    if (stepIndex === 0) return
    setStepIndex((i) => i - 1)
  }

  // "자동추론" 단계는 응답이 오기 전까진 다음으로 못 넘어가게 — chips 없이 넘어가면 확인할 게 없다.
  const nextDisabled = step.kind === 'confirm' ? inferring || !answers[step.id] : !answers[step.id]

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-6 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-9 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Progress value={progressPct} className="flex-1" />
          <span className="font-mono text-xs whitespace-nowrap text-muted-foreground">
            {stepIndex + 1} / {QUESTIONNAIRE_STEPS.length}
          </span>
        </div>

        {step.helper && (
          <p className="mb-4 rounded-md border border-dashed border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
            💬 {step.helper}
          </p>
        )}

        <h2 className="font-heading text-h3 leading-snug font-semibold tracking-tight">
          {step.prompt}
        </h2>

        {step.kind === 'confirm' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {inferring && (
              <span className="text-sm text-muted-foreground">자유서술을 분석하는 중…</span>
            )}
            {!inferring && chips && chips.length === 0 && (
              <span className="text-sm text-muted-foreground">
                자동추론 결과가 없어요 — 화면1에서 더 자세히 적어주시면 정확해져요
              </span>
            )}
            {!inferring &&
              chips?.map((c) => (
                <Badge key={c} variant="accent" className="px-3 py-1 text-sm">
                  {c}
                </Badge>
              ))}
          </div>
        )}

        {(step.kind === 'choice' || step.kind === 'confirm') && step.options && (
          <div className="mt-6 flex flex-col gap-3">
            {step.options.map((opt) => {
              const selected = answers[step.id] === opt
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAnswer(opt)}
                  disabled={step.kind === 'confirm' && inferring}
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors disabled:opacity-50',
                    selected
                      ? 'border-primary bg-accent text-accent-foreground'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4.5 shrink-0 items-center justify-center rounded-full border-2',
                      selected ? 'border-primary' : 'border-border',
                    )}
                  >
                    {selected && <span className="size-2 rounded-full bg-primary" />}
                  </span>
                  {opt}
                </button>
              )
            })}
          </div>
        )}

        {step.kind === 'number' && (
          <div className="mt-6 flex items-center gap-3">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              value={answers[step.id] ?? ''}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="0"
              className="h-14 flex-1 text-xl font-semibold"
            />
            <span className="text-muted-foreground">{step.unit}</span>
          </div>
        )}

        <div className="mt-9 flex items-center justify-between">
          <Button variant="outline" onClick={goPrev} disabled={stepIndex === 0}>
            ← 이전
          </Button>
          <Button size="lg" onClick={goNext} disabled={nextDisabled}>
            {isLast ? '추천 받기 →' : '다음 →'}
          </Button>
        </div>
      </div>
    </div>
  )
}
