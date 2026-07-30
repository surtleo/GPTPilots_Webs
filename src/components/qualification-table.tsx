import {
  qualificationSummary,
  REPORT_STATE_LABEL,
  type QualificationCounts,
  type ReportItem,
} from '@/lib/chat-cards'
import { cn } from '@/lib/utils'

/**
 * 준비 점검·적격 확인 결과 공용 표 — 요건 | 판정 | 근거 3열.
 *
 * 채팅 report 카드와 문서 뷰어 참가자격 블록이 같은 데이터를 다른 모양으로 그리던 것을
 * 하나로 합쳤다(UX 2차 스펙 §3, 사용자가 고른 A안). 행 값은 전부 백엔드 판정
 * (met·unmet의 requirement·reason)을 그대로 쓴다 — 여기서 재서술하면 창작이 된다.
 * 미확인(unclear)은 개수만 오는 계약이라 호출부가 "확인 못 한 요건 N건" 행 하나로 만든다.
 */

/** 판정 상태 → 배지 색. 판정 뱃지(VERDICT_TONE_CLASS)와 같은 색 토큰을 쓴다. */
const STATE_BADGE_CLASS: Record<ReportItem['state'], string> = {
  ok: 'bg-success-soft text-success',
  miss: 'bg-danger-soft text-danger',
  unclear: 'bg-warning-soft text-warning',
}

export function QualificationTable({
  rows,
  counts,
}: {
  rows: ReportItem[]
  /** 예전에 저장된 report 카드에는 집계가 없어서 옵션 — 없으면 요약 줄만 생략한다. */
  counts?: QualificationCounts
}) {
  return (
    <div className="flex flex-col gap-2">
      {counts && (
        <p className="text-[11.5px] text-muted-foreground">{qualificationSummary(counts)}</p>
      )}
      <div className="overflow-x-auto rounded-[10px] border border-border">
        <table className="w-full border-collapse text-[12.5px] leading-normal">
          <thead>
            <tr className="bg-secondary text-left text-[11px] text-muted-foreground">
              <th className="px-2.5 py-1.5 font-semibold">요건</th>
              <th className="px-2.5 py-1.5 font-semibold">판정</th>
              <th className="px-2.5 py-1.5 font-semibold">근거</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.text}-${i}`} className="border-t border-border align-top">
                <td className="px-2.5 py-2">{r.text}</td>
                <td className="px-2.5 py-2 whitespace-nowrap">
                  <span
                    className={cn(
                      'rounded px-1.5 py-px text-[10.5px] font-bold',
                      STATE_BADGE_CLASS[r.state],
                    )}
                  >
                    {REPORT_STATE_LABEL[r.state]}
                  </span>
                </td>
                <td className="px-2.5 py-2 text-muted-foreground">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
