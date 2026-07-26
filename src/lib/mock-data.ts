/**
 * 화면 1·2·3·5(온보딩·질문·추천목록·마이페이지)용 목업 데이터.
 * 실제 추천/질문 엔진 백엔드가 아직 없어 정적 데이터로 구조만 검증한다.
 * 화면 4(RFP 상세+채팅)만 `lib/api.ts`의 실제 /ask 백엔드와 연동된다.
 */

export interface RfpSummary {
  id: string
  stars: number
  fit: '상' | '중' | '하'
  dday: string
  title: string
  org: string
  budget: string
  tags: string[]
  summary: string
}

export const MOCK_RFPS: RfpSummary[] = [
  {
    id: '2024-0412',
    stars: 3,
    fit: '상',
    dday: 'D-6',
    title: '○○시 통합관제 시스템 고도화 사업',
    org: '○○시청',
    budget: '약 8.4억 원',
    tags: ['관제 시스템', '영상분석', '지자체'],
    summary:
      '노후 관제 장비 교체 및 AI 이상탐지 기능 신규 도입 — 귀사 실적과 요건이 정확히 일치합니다.',
  },
  {
    id: '2024-0388',
    stars: 3,
    fit: '상',
    dday: 'D-11',
    title: '○○광역시 스마트시티 IoT 플랫폼 구축',
    org: '○○광역시청',
    budget: '약 12.0억 원',
    tags: ['IoT', '플랫폼', '데이터'],
    summary: '도시 전역 센서 데이터 통합 플랫폼 구축, IoT 연동 경험이 강점으로 작용합니다.',
  },
  {
    id: '2024-0355',
    stars: 3,
    fit: '중',
    dday: 'D-3',
    title: '○○군 재난안전 상황관리시스템 유지보수',
    org: '○○군청',
    budget: '약 2.1억 원',
    tags: ['유지보수', '재난안전'],
    summary: '기존 시스템 운영·유지보수 중심 사업. 규모는 작지만 실적 확보에 유리합니다.',
  },
  {
    id: '2024-0321',
    stars: 3,
    fit: '중',
    dday: 'D-20',
    title: '○○도 교통정보 빅데이터 분석 도입',
    org: '○○도청',
    budget: '약 5.6억 원',
    tags: ['빅데이터', '교통'],
    summary: '빅데이터 역량을 부합하는 교통 도메인 실적이 없어 컨소시엄 검토가 필요합니다.',
  },
  {
    id: '2024-0290',
    stars: 3,
    fit: '하',
    dday: 'D-8',
    title: '○○청 정보시스템 클라우드 전환 사업',
    org: '○○청',
    budget: '약 9.3억 원',
    tags: ['클라우드', '인프라'],
    summary: '클라우드 전환 중심으로 주력 분야와 거리가 있어 단독 지원은 권장하지 않습니다.',
  },
]

export interface RfpDetail {
  id: string
  title: string
  org: string
  overview: string
  conditions: { label: string; value: string }[]
  attachments: { name: string; size: string }[]
  suggestedQuestions: string[]
}

export const MOCK_RFP_DETAILS: Record<string, RfpDetail> = Object.fromEntries(
  MOCK_RFPS.map((r) => [
    r.id,
    {
      id: r.id,
      title: r.title,
      org: `${r.org} · 정보통신과`,
      overview:
        '기존 관제 시스템의 노후 장비를 교체하고 AI 기반 이상탐지·이상행위 기능을 신규 도입하여 통합관제센터의 운영 효율을 높이는 고도화 사업.',
      conditions: [
        { label: '사업 규모', value: r.budget },
        { label: '사업 기간', value: '계약일 ~ 8개월' },
        { label: '입찰 방식', value: '협상에 의한 계약' },
        { label: '참가 자격', value: 'SW사업자 신고 필수' },
        { label: '실적 요건', value: '관제 구축 3건 이상' },
        { label: '평가 방식', value: '기술 90 : 가격 10' },
        { label: '마감일', value: `${r.dday} · 6/30 18:00` },
      ],
      attachments: [
        { name: '제안요청서(RFP).hwp', size: '2.4MB' },
        { name: '과업지시서.pdf', size: '1.1MB' },
        { name: '평가배점표.xlsx', size: '88KB' },
      ],
      suggestedQuestions: ['참가 자격이 되나요?', '평가 기준이 뭐예요?', '비슷한 사업 낙찰가는?'],
    },
  ]),
)

export interface ConversationSummary {
  id: string
  rfpId: string
  title: string
  date: string
  preview: string
}

export const MOCK_CONVERSATIONS: ConversationSummary[] = [
  {
    id: 'c1',
    rfpId: '2024-0412',
    title: '○○시 통합관제 시스템 고도화 사업',
    date: '2026-07-22 16:40',
    preview: 'AI: 참가 자격은 SW사업자 신고 및 관제 실적 3건 이상이 필요합니다…',
  },
  {
    id: 'c2',
    rfpId: '2024-0388',
    title: '○○광역시 스마트시티 IoT 플랫폼 구축',
    date: '2026-07-20 11:12',
    preview: 'AI: 이 사업은 컨소시엄 구성이 가능하며 주관사 요건은…',
  },
  {
    id: 'c3',
    rfpId: '2024-0355',
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
