import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { QUESTIONNAIRE_STEPS } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

/**
 * 화면 2 — 온보딩 뒤 이어지는 질문 단계. 와이어프레임의 (a) 선택지 / (b) 숫자 입력 /
 * (c) 자동추론 확인 3가지 질문 유형을 하나의 흐름으로 순회한다.
 * 아직 추천 엔진이 없어 응답은 로컬 상태로만 보관하고, 마지막 단계에서 추천 목록으로 이동한다.
 */
export function QuestionnairePage() {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const step = QUESTIONNAIRE_STEPS[stepIndex]
  const isLast = stepIndex === QUESTIONNAIRE_STEPS.length - 1
  const progressPct = ((stepIndex + 1) / QUESTIONNAIRE_STEPS.length) * 100

  const setAnswer = (value: string) => setAnswers((prev) => ({ ...prev, [step.id]: value }))

  const goNext = () => {
    if (isLast) {
      navigate('/recommendations')
      return
    }
    setStepIndex((i) => i + 1)
  }

  const goPrev = () => {
    if (stepIndex === 0) return
    setStepIndex((i) => i - 1)
  }

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

        {step.kind === 'confirm' && step.chips && (
          <div className="mt-4 flex flex-wrap gap-2">
            {step.chips.map((c) => (
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
                  className={cn(
                    'flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors',
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
          <Button size="lg" onClick={goNext} disabled={!answers[step.id]}>
            {isLast ? '추천 받기 →' : '다음 →'}
          </Button>
        </div>
      </div>
    </div>
  )
}
