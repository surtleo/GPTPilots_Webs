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

/**
 * 참가자격 판정 뱃지 — 백엔드 verdict("적격"|"확인필요")에 "확인 못 한 요건 수"를 얹는다.
 *
 * 적격을 초록 하나로 칠하지 않는 이유: 백엔드가 말하는 적격은 "걸리는 게 없다"이지
 * "전부 확인됐다"가 아니다. 프로필에 언급이 없어 판단을 미룬 요건(unclear_count)이 남아
 * 있는데 초록으로만 보여주면 다 확인된 것처럼 읽힌다 — 실제로 met=0인 적격 카드가
 * 대다수였다(2026-07-27 실측). 그래서 미확인이 남으면 톤을 한 단계 낮춘다.
 */
/**
 * 톤 이름과 색의 대응(VERDICT_TONE_CLASS 참고): ok=초록, mid=노랑, warn=빨강(연한 배경),
 * block=빨강(꽉 찬 배경). block을 따로 둔 이유: "확인필요"가 이미 warn(연한 빨강)이라
 * "참가불가"를 warn으로 두면 색이 같아져 구분이 안 된다. 참가불가는 개수 문제가 아니라
 * 법적으로 참여가 막힌 상태라, 한눈에 다르게 보여야 한다.
 */
export type VerdictTone = 'ok' | 'mid' | 'warn' | 'block'

export interface VerdictBadge {
  label: string
  tone: VerdictTone
}

export function verdictBadge(
  verdict: string,
  unclearCount = 0,
  missingCount: number | null = null,
): VerdictBadge {
  if (verdict === '적격') {
    return unclearCount > 0
      ? { label: `적격 · 확인 ${unclearCount}건`, tone: 'mid' }
      : { label: '적격', tone: 'ok' }
  }
  if (verdict === '확인필요') {
    return missingCount != null && missingCount > 0
      ? { label: `확인필요 · ${missingCount}건 부족`, tone: 'warn' }
      : { label: '확인필요', tone: 'warn' }
  }
  // "참가불가"는 미충족 개수와 무관하게 그 자체로 참여가 막히는 요건(대기업집단 제한,
  // 부정당업자 제재)이 미충족일 때 백엔드가 내려준다. 여기서 명시적으로 다루지 않으면
  // 아래 폴백이 'mid'(노란색)로 칠해버리는데, 그러면 "확인필요"와 구분이 안 돼서
  // 이 판정을 새로 만든 의미가 없어진다 — 개수를 늘려 말하지 않고 danger로 못 박는다.
  if (verdict === '참가불가') {
    return { label: '참가불가', tone: 'block' }
  }
  return { label: verdict, tone: 'mid' }
}

/**
 * 생성 시각 → "방금 / N분 전 / N시간 전 / M월 D일".
 * 저장 당시 문자열을 그대로 들고 있으면 사흘 뒤에도 "방금"으로 남는다.
 */
export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diffMin = Math.floor((now - ts) / 60_000)
  if (!Number.isFinite(diffMin) || diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const d = new Date(ts)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** 판정 톤 → 뱃지 색 클래스. 텍스트는 원색, 배경은 같은 색을 옅게. */
export const VERDICT_TONE_CLASS: Record<VerdictTone, string> = {
  ok: 'text-success bg-success-soft',
  mid: 'text-warning bg-warning-soft',
  warn: 'text-danger bg-danger-soft',
  // 꽉 찬 빨강 — 연한 배경인 warn과 확실히 구분되고, 글자 대비도 훨씬 높다
  // (라운드 5 실측: soft 배경 뱃지는 라이트모드 대비가 2.8:1로 기준 미달이었다).
  block: 'text-danger-foreground bg-danger font-bold',
}
