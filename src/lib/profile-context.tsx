import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/**
 * 회사 프로필 — 공고의 참가자격을 대조하는 근거.
 *
 * localStorage에 저장한다 — 회사소개 자유서술 수준의 정보라 브라우저 로컬 저장으로 충분한
 * 민감도(서버 전송은 판정 요청 시에만).
 *
 * 항목 구성 근거(2026-07-30): 이전엔 자격 체크리스트가 5개뿐이었는데, 이미 추출해둔
 * 98개 문서·1,703개 참가자격 요건을 실측해보니 그 5개로는 요건의 26%만 커버됐다.
 * 유형별로 나눠 21개로 늘려 75%까지 올렸다. 각 항목 옆 빈도는 "그 조건이 등장한 문서 비율"로,
 * 지어낸 값이 아니라 실측값이다.
 */
const STORAGE_KEY = 'bidmate.profile.v1'

/**
 * 주력 분야 — 다중 선택.
 *
 * 단일 선택(라디오)이었던 것을 다중으로 바꿨다: 여러 분야를 겸하는 회사가 많은데 하나만
 * 고르게 하면 나머지 분야의 공고를 놓친다. 이 목록은 실측 데이터가 아니라 제안값이다
 * (문서에서 "분야"를 뽑는 로직이 없어 근거를 만들 수 없었음 — 팀 합의 대상).
 *
 * 백엔드 src/profile.py에도 FIELD_OPTIONS 3개가 있고 "프론트와 맞춰야 한다"는 주석이
 * 달려 있지만, 그걸 쓰는 POST /profile/infer는 온보딩 화면이 삭제되면서 호출부가 사라졌다.
 * 지금은 어느 화면도 그 엔드포인트를 부르지 않으므로 값이 어긋나도 동작에 영향이 없다
 * — 백엔드 주석 정정은 별도 작업으로 남긴다.
 */
export const FIELD_OPTIONS = [
  '관제·모니터링 시스템',
  'SI · 시스템 통합 구축',
  '데이터·AI 분석 솔루션',
  '웹·모바일 서비스 개발',
  '인프라·클라우드 구축',
  '정보보안',
  '유지보수·운영(SM)',
  'GIS·공간정보',
] as const

/** 17개 시도 — 지역제한 공고가 따지는 단위가 시도라서 그 단위로만 둔다(실측 7개 조항 전부 시도). */
export const REGION_OPTIONS = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
] as const

/** 실제 98개 문서에서 지역제한으로 등장한 지역 — 화면에 점으로 표시해 "왜 이 칸이 있는지" 보여준다. */
export const REGIONS_SEEN_IN_DOCS: readonly string[] = [
  '부산광역시',
  '광주광역시',
  '전북특별자치도',
  '경상북도',
]

/** 그리드 표시용 짧은 라벨 — "서울특별시" → "서울", "충청북도" → "충북". */
export function shortRegion(full: string): string {
  const stripped = full.replace(/특별자치시$|특별자치도$|광역시$|특별시$|도$/, '')
  return stripped.replace(/^(충청|전라|경상)([북남])$/, (_m, a: string, b: string) => a[0] + b)
}

export interface QualItem {
  label: string
  /** 이 조건이 등장한 문서 비율(또는 건수) — 실측값. 표시용 문자열 그대로 둔다. */
  freq: string
}

export interface QualGroup {
  id: string
  label: string
  /** 이 유형의 조건이 하나라도 등장한 문서 비율(합집합, 실측). */
  coverage: string
  items: readonly QualItem[]
  /** 체크박스로 표현할 수 없어 화면에 따로 그리는 입력이 있는 유형. */
  extra?: 'daegi' | 'licenseOther'
  note?: string
}

/**
 * 보유 자격 — 유형별로 나눈다.
 *
 * 유형을 나눈 이유: 항목이 21개면 한 줄로 늘어놓을 수 없고, 사용자가 "우리랑 상관있는
 * 묶음"만 열어보게 하는 편이 훨씬 빠르다. 순서는 등장 빈도 내림차순 — 흔한 것부터 묻는다.
 */
export const QUAL_GROUPS: readonly QualGroup[] = [
  {
    id: 'basic',
    label: '기본 참가자격',
    coverage: '97%',
    items: [
      { label: '국가계약법·지방계약법상 경쟁입찰 참가자격 보유', freq: '96%' },
      { label: '부정당업자 제재 대상 아님', freq: '86%' },
      { label: '제출서류에 허위기재 없음(적발 시 실격)', freq: '33%' },
      { label: '청렴서약·입찰담합·뇌물제공 이력 없음', freq: '28%' },
    ],
  },
  {
    id: 'jv',
    label: '컨소시엄·하도급',
    coverage: '92%',
    items: [
      { label: '공동수급(컨소시엄) 형태로 참여 가능', freq: '85%' },
      { label: '하도급을 받을 수 있음', freq: '81%' },
    ],
    note: '공고마다 요구 방향이 반대일 수 있어요("단독 참가만 허용" vs "공동수급 필수") — 체크는 우리 회사가 그렇게 할 수 있는지를 뜻해요.',
  },
  {
    id: 'cert',
    label: '사업자 신고·증명서',
    coverage: '87%',
    items: [
      { label: '소프트웨어사업자 신고 완료 (컴퓨터관련서비스업 1468)', freq: '84%' },
      { label: '직접생산확인증명서 보유', freq: '63%' },
      { label: '중소기업·소상공인 확인서 보유', freq: '58%' },
    ],
    note: '직접생산확인증명서는 세부품명별로 따로 발급돼요 — 실측 1위는 "정보시스템개발서비스(8111159901)"예요. 품명까지 고르게 하면 판정이 더 정확해지는데 항목이 또 늘어서 일단 안 나눴어요.',
  },
  {
    id: 'scale',
    label: '기업 규모·납세',
    coverage: '79%',
    items: [
      { label: '국세·지방세·4대보험 체납 없음', freq: '16%' },
      { label: '입찰보증금·이행보증보험 준비 가능', freq: '18%' },
    ],
    extra: 'daegi',
  },
  {
    id: 'tech',
    label: '인력·보안',
    coverage: '57%',
    items: [
      { label: '개인정보보호·보안서약 등 보안 규정 대응 가능', freq: '46%' },
      { label: '투입 예정 인력에 결격사유(형사처벌 등) 없음', freq: '29%' },
      { label: '사업 수행 가능한 기술인력 보유', freq: '11%' },
    ],
  },
  {
    id: 'lic',
    label: '면허·업종 등록',
    coverage: '54%',
    items: [
      { label: '정보통신공사업 등록', freq: '7건' },
      { label: '엔지니어링사업자 신고', freq: '4건' },
      { label: '공간정보업·측량업 등록', freq: '2건' },
      { label: '기술사사무소 등록', freq: '2건' },
      { label: '해외건설업 신고', freq: '1건' },
      { label: '건설업 등록', freq: '1건' },
      { label: '조달청 물품 등록(컴퓨터서버 등)', freq: '1건' },
    ],
    extra: 'licenseOther',
    note: '여기 뱃지는 %가 아니라 등장한 문서 수예요. 하나하나는 드물지만 합치면 54% 공고가 뭔가의 면허·등록을 요구해요 — "면허 보유" 하나로 뭉개면 어떤 면허인지 알 수 없어 판정이 안 돼서 유형을 따로 뺐어요.',
  },
] as const

/** 전체 자격 항목(평평한 목록) — 체크 안 된 항목을 되묻는 흐름(chat-flows)이 쓴다. */
export const QUALIFICATION_OPTIONS: readonly string[] = QUAL_GROUPS.flatMap((g) =>
  g.items.map((i) => i.label),
)

/**
 * 대기업집단(상호출자제한기업집단) 소속 여부 — 체크박스가 아니라 3지선다인 이유.
 *
 * 체크박스는 "체크 안 함 = 확인 못 함"이라 대기업 계열사가 **"예"라고 답할 방법이 없다.**
 * 그런데 이 조항은 실측 72% 문서에 있고, 해당되면 그 자체로 입찰 참여가 막힌다
 * (「소프트웨어 진흥법」 제48조제4항). 정직하게 "예"를 고를 수 있어야 판정이 사실을 반영한다.
 * "모름"은 프로필에 아무 문장도 넣지 않는다 — 모르는 것을 안다고 말하지 않는다(불명 유지).
 */
export type DaegiState = 'no' | 'yes' | 'unknown'

/** 기업신용평가 등급 — 참가자격 판정에는 쓰이지 않는다(CREDIT_NOT_USED_NOTE 참고). */
export const CREDIT_GRADES = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC 이하'] as const

/**
 * 신용등급·자본금을 참가자격 체크리스트에서 빼서 따로 둔 이유(실측):
 * 98개 문서를 전수 확인했을 때 "○○등급 이상이어야 참가 가능"을 요구한 문서는 0건이었다.
 * 신용평가등급확인서는 전부 (a) 제출서류 목록이거나 (b) 기술평가 신인도 가감점용이다.
 * 판정에 쓰이지 않는 칸을 체크리스트에 섞으면 완성도 카운터가 부풀려지고 "다 채웠으니
 * 괜찮겠지"라는 잘못된 안심을 준다. 기술평가(Q2) 기능이 생기면 그쪽에서 쓴다.
 */
export const CREDIT_NOT_USED_NOTE =
  '참가자격 판정에는 쓰이지 않아요 — "○○등급 이상"을 참가 조건으로 요구한 공고가 실측 0건이었어요. 기술평가 점수(신인도)에 쓰이는 값이라 그 기능이 생기면 반영돼요.'

export interface ProfileState {
  introText: string
  /** 주력 분야 — 다중 선택. */
  fields: string[]
  recentCount: string
  qualifications: string[]
  /** 사업장이 있는 지역(시도). */
  regions: string[]
  /** 그중 본점 — 공고가 따지는 건 대개 본점 소재지다. 1곳만 고르면 자동으로 본점. */
  hqRegion: string | null
  /** 목록에 없는 면허·등록증 자유 입력. */
  licenseOther: string
  daegi: DaegiState | null
  /** 아래 둘은 판정에 쓰지 않는다 — CREDIT_NOT_USED_NOTE 참고. */
  creditGrade: string | null
  capital: string
}

const EMPTY: ProfileState = {
  introText: '',
  fields: [],
  recentCount: '',
  qualifications: [],
  regions: [],
  hqRegion: null,
  licenseOther: '',
  daegi: null,
  creditGrade: null,
  capital: '',
}

/**
 * 프로필 완성도 — 채운 항목 수 / 전체 항목 수.
 *
 * 자격 체크리스트 21개를 21항목으로 세지 않고 "하나라도 체크했는가" 1항목으로 센다:
 * 21개 전부 해당되는 회사는 없다. 다 채워야 100%인 것처럼 보이면 해당 없는 항목을 억지로
 * 체크하게 되고, 그건 판정을 망가뜨린다(체크 = 보유 주장).
 */
export const PROFILE_FIELD_COUNT = 5

export function profileFilledCount(p: ProfileState): number {
  return [
    p.introText.trim().length > 0,
    p.fields.length > 0,
    p.recentCount.trim().length > 0,
    p.regions.length > 0,
    p.qualifications.length > 0,
  ].filter(Boolean).length
}

interface ProfileContextValue {
  profile: ProfileState
  setProfile: (patch: Partial<ProfileState>) => void
  /**
   * 참가자격 대조(LLM)에 넣을 전체 프로필 텍스트 — 자격·소재지·실적까지 전부 담는다.
   * 대조는 정보가 많을수록 정확해진다(같은 문서 확인율 10% → 60% 실측).
   */
  matchText: string
  /**
   * 공고 후보를 고를 때(적합도 임베딩 검색) 쓸 텍스트 — 자유서술 + 주력 분야만.
   *
   * 자격 체크리스트를 여기 섞으면 안 된다: 그 문구는 모든 회사가 동일하게 쓰는 법령
   * 표현이라 회사를 구분하는 신호가 아닌데, 정작 구분되어야 하는 사업 분야 서술을
   * 희석시킨다. 실측 — 서로 완전히 다른 3개 회사의 추천 후보 8건 평균 겹침률이
   * 체크 0개 25% → 5개 38% → 16개 50%로 올라갔고, 검색에서 자격을 빼면 25%로 돌아온다.
   * 백엔드가 이 값을 search_text로 받는다(src/eligibility.py recommend_progress).
   */
  searchText: string
  /** 채운 항목 수 (0~PROFILE_FIELD_COUNT). */
  filledCount: number
  reset: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

/**
 * 저장된 프로필 복원 — 예전 구조로 저장된 것도 최대한 살린다.
 *
 * 예전 구조: field(단일 문자열) · chips. 지금: fields(배열), chips 없음.
 * field는 fields로 옮기고 chips는 버린다(쓰던 화면이 삭제돼 소비처가 없다).
 * 자격 항목은 라벨 문자열이 바뀌었으므로 예전 체크값 중 지금 목록에 없는 것은 조용히
 * 사라진다 — 없는 항목을 체크된 것으로 되살리면 "보유 주장"을 대신 하는 셈이다.
 * 배열이어야 하는 값이 손상돼 있으면(수동 편집·구버전) 빈 배열로 눕힌다 — 렌더에서
 * 터지면 화면이 통째로 죽는다.
 */
function loadInitial(): ProfileState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ProfileState> & { field?: string | null }
    const merged: ProfileState = { ...EMPTY, ...parsed }

    if (!Array.isArray(parsed.fields) && typeof parsed.field === 'string') {
      const known = (FIELD_OPTIONS as readonly string[]).includes(parsed.field)
      merged.fields = known ? [parsed.field] : []
    }
    merged.fields = Array.isArray(merged.fields)
      ? merged.fields.filter((f) => (FIELD_OPTIONS as readonly string[]).includes(f))
      : []
    merged.qualifications = Array.isArray(merged.qualifications)
      ? merged.qualifications.filter((q) => QUALIFICATION_OPTIONS.includes(q))
      : []
    merged.regions = Array.isArray(merged.regions)
      ? merged.regions.filter((r) => (REGION_OPTIONS as readonly string[]).includes(r))
      : []
    if (merged.hqRegion && !merged.regions.includes(merged.hqRegion)) merged.hqRegion = null
    return merged
  } catch {
    return EMPTY
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<ProfileState>(loadInitial)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  }, [profile])

  const setProfile = useCallback(
    (patch: Partial<ProfileState>) => setProfileState((prev) => ({ ...prev, ...patch })),
    [],
  )

  const reset = useCallback(() => setProfileState(EMPTY), [])

  // 검색용 — 자유서술 + 분야만 (위 searchText 주석의 실측 근거 참고).
  const searchText = useMemo(() => {
    const parts = [profile.introText.trim()]
    if (profile.fields.length > 0) parts.push(`주력 분야: ${profile.fields.join(' · ')}`)
    return parts.filter(Boolean).join('\n')
  }, [profile.introText, profile.fields])

  // 대조용 — 판정에 쓰이는 모든 값. creditGrade·capital은 뺀다(판정 미사용).
  const matchText = useMemo(() => {
    const parts = [searchText]
    if (profile.recentCount.trim()) {
      parts.push(`최근 3년간 공공부문 사업 실적: ${profile.recentCount.trim()}건`)
    }
    if (profile.hqRegion) parts.push(`본점 소재지: ${profile.hqRegion}`)
    const others = profile.regions.filter((r) => r !== profile.hqRegion)
    if (others.length > 0) parts.push(`그 외 사업장 소재지: ${others.join(' · ')}`)

    const lines = profile.qualifications.map((q) => `- ${q}`)
    if (profile.licenseOther.trim()) {
      lines.push(`- 그 외 보유 면허·등록: ${profile.licenseOther.trim()}`)
    }
    // "모름"·미선택은 아무 문장도 넣지 않는다 — 모르는 것을 안다고 말하지 않는다(불명 유지).
    if (profile.daegi === 'no') {
      lines.push('- 대기업집단(상호출자제한기업집단)에 속하지 않음')
    } else if (profile.daegi === 'yes') {
      lines.push('- 상호출자제한기업집단에 속한 대기업 계열사임')
    }
    if (lines.length > 0) parts.push(lines.join('\n'))
    return parts.filter(Boolean).join('\n')
  }, [
    searchText,
    profile.recentCount,
    profile.hqRegion,
    profile.regions,
    profile.qualifications,
    profile.licenseOther,
    profile.daegi,
  ])

  const filledCount = useMemo(() => profileFilledCount(profile), [profile])

  // value를 메모한다 — chat-flows의 흐름 콜백들이 이 값들에 의존해서, 매 렌더 새 객체가
  // 내려가면 그 콜백들도 전부 새로 만들어진다.
  const value = useMemo(
    () => ({ profile, setProfile, matchText, searchText, filledCount, reset }),
    [profile, setProfile, matchText, searchText, filledCount, reset],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile은 ProfileProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
