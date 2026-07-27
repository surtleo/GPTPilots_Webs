/**
 * 화면 1·2·5(온보딩·질문·마이페이지)용 목업 데이터.
 * 온보딩 질문 엔진과 대화 이력 저장 백엔드가 아직 없어 정적 데이터로 구조만 검증한다.
 * 화면 3·4(공고 목록·상세+채팅)는 `lib/api.ts`를 통해 실제 백엔드와 연동된다.
 */

export interface ConversationSummary {
  id: string
  title: string
  date: string
  preview: string
}

export const MOCK_CONVERSATIONS: ConversationSummary[] = [
  {
    id: 'c1',
    title: '○○시 통합관제 시스템 고도화 사업',
    date: '2026-07-22 16:40',
    preview: 'AI: 참가 자격은 SW사업자 신고 및 관제 실적 3건 이상이 필요합니다…',
  },
  {
    id: 'c2',
    title: '○○광역시 스마트시티 IoT 플랫폼 구축',
    date: '2026-07-20 11:12',
    preview: 'AI: 이 사업은 컨소시엄 구성이 가능하며 주관사 요건은…',
  },
  {
    id: 'c3',
    title: '○○군 재난안전 상황관리시스템 유지보수',
    date: '2026-07-18 09:05',
    preview: '나: 유지보수 인력 상주 조건이 있나요? / AI: 과업지시서 p.7 기준…',
  },
]

export type QuestionKind = 'choice' | 'number' | 'confirm'

export interface QuestionnaireStep {
  id: string
  kind: QuestionKind
  prompt: string
  helper?: string
  options?: string[]
  chips?: string[]
  unit?: string
}

export const QUESTIONNAIRE_STEPS: QuestionnaireStep[] = [
  {
    id: 'field',
    kind: 'choice',
    prompt: '주력으로 수행해 온 사업 분야는 무엇인가요?',
    options: ['SI · 시스템 통합 구축', '관제·모니터링 시스템', '데이터·AI 분석 솔루션'],
  },
  {
    id: 'inferred',
    kind: 'confirm',
    prompt: '입력하신 내용을 보아 아래 분야로 보입니다. 맞나요?',
    helper: '방금 자유롭게 작성하신 회사 소개에서 자동으로 뽑아낸 항목이에요',
    chips: ['관제 시스템', 'IoT 센서 연동', '지자체 대응'],
    options: ['네, 맞아요', '일부만 맞아요 → 직접 수정할게요'],
  },
  {
    id: 'recent_count',
    kind: 'number',
    prompt: '최근 3년간 공공부문 사업 실적은 몇 건인가요?',
    helper: '계약 서류 기준으로 입력해주세요',
    unit: '건',
  },
]
