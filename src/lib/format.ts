/**
 * 공고 카드 값 표기 헬퍼 — 백엔드는 원시값(정수 금액·ISO 날짜)만 주고 포맷은 프론트가 맡는다.
 * 값이 없을 수 있는 계약이라 전부 null을 받고 폴백 문자열을 돌려준다.
 */

const NONE = '—'

/**
 * 원 단위 정수 → 억/만원 표기. 억은 소수 1자리까지, 만원은 정수로 반올림한다.
 * 0은 추출 실패·비공개를 뜻하는 값이라 금액으로 찍지 않는다.
 */
export function formatAmount(won: number | null): string {
  if (won == null || !Number.isFinite(won) || won <= 0) return '금액 미공개'
  if (won >= 100_000_000) return `약 ${trimZero(won / 100_000_000)}억 원`
  if (won >= 10_000) return `약 ${Math.round(won / 10_000).toLocaleString('ko-KR')}만 원`
  return `${won.toLocaleString('ko-KR')}원`
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/** ISO 날짜(YYYY-MM-DD) → 그대로 표기, 없으면 '—'. */
export function formatDate(iso: string | null): string {
  return iso || NONE
}

export interface Deadline {
  /** 뱃지에 넣을 짧은 라벨 (D-6 / D-DAY / 마감). */
  label: string
  /** 마감일이 이미 지났는지 — 지난 공고는 중립 톤으로 죽여서 표시한다. */
  past: boolean
}

/**
 * 마감일 → D-표기. 기준 시각을 인자로 받아 테스트에서 고정할 수 있게 한다.
 * 날짜만 비교하므로 양쪽 다 자정으로 정규화한다(시분 때문에 하루가 어긋나는 것 방지).
 */
export function deadlineBadge(iso: string | null, now: Date = new Date()): Deadline {
  if (!iso) return { label: '마감일 미상', past: false }

  const due = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(due.getTime())) return { label: '마감일 미상', past: false }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

  if (days > 0) return { label: `D-${days}`, past: false }
  if (days === 0) return { label: 'D-DAY', past: false }
  return { label: '마감', past: true }
}
