import type { VerdictTone } from '@/lib/format'

/**
 * 대화에 끼어드는 카드형 메시지.
 *
 * 프로토타입(BidMate UX 개선 v6)의 메시지 종류를 그대로 옮긴 것이다 — think(진행 단계) ·
 * ask(확인 질문) · report(점검 결과) · candidates(문서 특정 반문). 프로토타입에서는 넷 다
 * 지어낸 값으로 그렸지만, 여기서는 전부 백엔드 응답으로 채운다:
 *
 *   steps      POST /recommendations/stream 의 진행 이벤트
 *   report     POST /eligibility/{doc_id} 의 met·unmet·unclear_count
 *   ask        프로필에서 아직 체크 안 한 자격 항목 (답하면 프로필에 반영 후 재판정)
 *   candidates POST /ask 가 반문으로 돌려준 후보 목록
 *
 * 지어낸 문장을 넣지 않는다는 게 이 타입의 존재 이유다. 특히 프로토타입에 있던 "추론 문단"
 * (모델이 속으로 이런 생각을 했다는 서술)은 옮기지 않았다 — 백엔드가 그런 걸 주지 않으므로
 * 화면에 쓰면 그 자리에서 창작이 된다. 대신 실제로 온 진행 단계만 보여준다.
 */
export type StepState = 'done' | 'active' | 'pending'

export interface StepItem {
  label: string
  state: StepState
}

export interface ReportItem {
  state: 'ok' | 'miss' | 'unclear'
  text: string
  why: string
}

export type MessageCard =
  /** failed: 중간에 끊겼다는 뜻. done만 있으면 실패도 "완료"로 보여 거짓 보고가 된다. */
  | { kind: 'steps'; steps: StepItem[]; done: boolean; failed?: boolean }
  | { kind: 'ask'; question: string; options: string[]; answered?: string }
  | {
      kind: 'report'
      title: string
      verdict: string
      tone: VerdictTone
      items: ReportItem[]
      note: string
    }

// 반문(clarify)은 카드를 따로 저장하지 않는다 — 후보 목록이 답변 본문 안에 그대로 들어 있어서
// 렌더할 때 파싱하면 된다. 상태를 이중으로 들고 있을 이유가 없고, 지난 대화를 다시 열어도
// 같은 버튼이 나온다.

/**
 * 반문 응답 본문에서 후보 목록을 뽑는다.
 *
 * 백엔드가 `1. 사업명 (발주기관)` 형태의 번호 목록으로 돌려준다(src/api/core.py
 * `_candidates_block`). doc_id는 이 목록에 실려오지 않으므로, 후보를 누르면 그 사업명을
 * 붙여 다시 질문한다 — 백엔드 안내문("아래 후보 중 선택해 다시 질문해 주세요")이 말하는
 * 그 동작이다.
 */
export function parseClarifyCandidates(answer: string): string[] {
  const out: string[] = []
  for (const line of answer.split('\n')) {
    const m = /^\s*\d+\.\s+(.+?)\s*$/.exec(line)
    if (m) out.push(m[1])
  }
  return out
}

/** `사업명 (발주기관)` → 사업명만. 다시 질문할 때 기관명까지 넣으면 검색이 어긋난다. */
export function candidateTitle(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, '').trim()
}
