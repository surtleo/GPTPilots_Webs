import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number
  className?: string
}

/** 0~100 사이 값을 받는 단순 진행률 바 (질문 단계 표시용). */
function Progress({ value, className }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export { Progress }
