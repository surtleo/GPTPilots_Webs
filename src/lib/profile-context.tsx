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
  /**
   * 공고 요건 원문에 이 단어가 있으면 이 체크 항목이 그 요건을 답해준다고 본다.
   *
   * 용도: 준비 점검 후 되묻는 질문을 **그 공고에서 실제로 확인 못 한 요건**에서만 뽑기 위함.
   * 예전엔 체크 안 한 항목 전부를 물어봐서 그 공고와 상관없는 걸 묻고 있었다.
   * 단어는 실제 요건 원문(data/extracted/eligibility.json)에서 확인한 표현만 넣었다.
   */
  matches: readonly string[]
}

export interface QualGroup {
  id: string
  label: string
  items: readonly QualItem[]
  /** 체크박스로 표현할 수 없어 화면에 따로 그리는 입력이 있는 유형. */
  extra?: 'daegi' | 'licenseOther'
}

/**
 * 보유 자격 — 유형별로 나눈다.
 *
 * 유형을 나눈 이유: 항목이 21개면 한 줄로 늘어놓을 수 없고, 사용자가 "우리랑 상관있는
 * 묶음"만 열어보게 하는 편이 훨씬 빠르다.
 *
 * 아래 순서(유형·항목 모두)는 임의가 아니라 **실측 등장 빈도 내림차순**이다 — 흔한 것부터
 * 묻는다. 98개 문서·1,703개 요건을 훑은 값이고, 화면에는 표시하지 않는다(빈도 %를 뱃지로
 * 달았더니 입력 화면이 숫자로 어지러워져서 뺐다). 항목을 추가·삭제할 때 순서 근거로 쓸 것:
 *
 *   유형별(그 유형 조건이 하나라도 있는 문서 비율)
 *     기본 참가자격 97% · 컨소시엄·하도급 92% · 사업자 신고·증명서 87%
 *     기업 규모·납세 79% · 인력·보안 57% · 면허·업종 등록 54%
 *
 *   항목별(그 조건이 등장한 문서 비율)
 *     경쟁입찰 참가자격 96% · 부정당업자 86% · 공동수급 85% · 소프트웨어사업자 84%
 *     하도급 81% · 대기업집단 72% · 직접생산확인 63% · 중소기업·소상공인 58%
 *     보안 46% · 허위기재 33% · 결격사유 29% · 청렴 28% · 보증금 18% · 체납 16%
 *     기술인력 11%
 *   면허·업종은 개별로는 드물어 문서 "건수"로 셌다(합치면 54%):
 *     정보통신공사업 7건 · 엔지니어링 4건 · 공간정보·측량 2건 · 기술사 2건
 *     해외건설·건설업·조달청 물품 각 1건
 */
export const QUAL_GROUPS: readonly QualGroup[] = [
  {
    id: 'basic',
    label: '기본 참가자격',
    items: [
      {
        label: '국가계약법·지방계약법상 경쟁입찰 참가자격 보유',
        matches: [
          '국가계약법',
          '지방계약법',
          '국가를 당사자로 하는 계약',
          '지방자치단체를 당사자로',
          '경쟁입찰의 참가자격',
          '경쟁입찰 참가자격',
          '입찰참가자격 등록',
          '입찰참가자격등록',
        ],
      },
      {
        label: '부정당업자 제재 대상 아님',
        matches: ['부정당업자', '부정당 업자', '부정당업체', '부정당 업체'],
      },
      {
        label: '제출서류에 허위기재 없음(적발 시 실격)',
        matches: ['허위', '위·변조', '위변조'],
      },
      {
        label: '청렴서약·입찰담합·뇌물제공 이력 없음',
        matches: ['청렴', '담합', '뇌물', '금품'],
      },
    ],
  },
  {
    id: 'jv',
    label: '컨소시엄·하도급',
    items: [
      {
        label: '공동수급(컨소시엄) 형태로 참여 가능',
        matches: ['공동수급', '공동계약', '공동이행', '분담이행', '지분율'],
      },
      { label: '하도급을 받을 수 있음', matches: ['하도급'] },
    ],
  },
  {
    id: 'cert',
    label: '사업자 신고·증명서',
    items: [
      {
        label: '소프트웨어사업자 신고 완료 (컴퓨터관련서비스업 1468)',
        matches: [
          '소프트웨어사업자',
          'SW사업자',
          '컴퓨터관련서비스',
          '1468',
          '소프트웨어 진흥법',
          '소프트웨어산업 진흥법',
        ],
      },
      { label: '직접생산확인증명서 보유', matches: ['직접생산'] },
      {
        label: '중소기업·소상공인 확인서 보유',
        matches: ['중소기업', '소상공인', '소기업'],
      },
    ],
  },
  {
    id: 'scale',
    label: '기업 규모·납세',
    items: [
      {
        label: '국세·지방세·4대보험 체납 없음',
        matches: ['국세', '지방세', '체납', '완납', '4대 사회보험', '사회보험'],
      },
      {
        label: '입찰보증금·이행보증보험 준비 가능',
        matches: ['입찰보증금', '보증보험', '보증서'],
      },
    ],
    extra: 'daegi',
  },
  {
    id: 'tech',
    label: '인력·보안',
    items: [
      {
        label: '개인정보보호·보안서약 등 보안 규정 대응 가능',
        matches: ['개인정보', '보안'],
      },
      {
        label: '투입 예정 인력에 결격사유(형사처벌 등) 없음',
        matches: ['결격사유', '재직', '자사인력', '신원조사', '징역', '금고', '벌금'],
      },
      {
        label: '사업 수행 가능한 기술인력 보유',
        matches: ['기술인력', '기술자', '기술등급'],
      },
    ],
  },
  {
    id: 'lic',
    label: '면허·업종 등록',
    items: [
      { label: '정보통신공사업 등록', matches: ['정보통신공사업'] },
      { label: '엔지니어링사업자 신고', matches: ['엔지니어링'] },
      { label: '공간정보업·측량업 등록', matches: ['공간정보', '측량'] },
      { label: '기술사사무소 등록', matches: ['기술사'] },
      { label: '해외건설업 신고', matches: ['해외건설'] },
      { label: '건설업 등록', matches: ['건설업'] },
      {
        label: '조달청 물품 등록(컴퓨터서버 등)',
        matches: ['물품 등록', '세부품명', '물품분류', '컴퓨터서버'],
      },
    ],
    extra: 'licenseOther',
  },
] as const

/** 전체 자격 항목(평평한 목록). */
export const QUALIFICATION_OPTIONS: readonly string[] = QUAL_GROUPS.flatMap((g) =>
  g.items.map((i) => i.label),
)

const ALL_QUAL_ITEMS: readonly QualItem[] = QUAL_GROUPS.flatMap((g) => g.items)

export interface AskableFromUnclear {
  /** 되물을 체크 항목 라벨 — 그 공고의 불명 요건과 실제로 연결된 것만. */
  labels: string[]
  /** 어떤 체크 항목과도 연결되지 않은 불명 요건 수. 프로필로는 답할 수 없는 것들. */
  unanswerableCount: number
}

/**
 * "이 공고에서 확인 못 한 요건" → "되물을 만한 체크 항목".
 *
 * 예전엔 준비 점검 후 되묻는 질문을 **체크 안 한 항목 전부**에서 뽑아서, 그 공고와 아무
 * 상관 없는 걸 물어봤다(예: 관제 시스템 공고인데 해외건설업 신고 여부를 물음).
 * 이제 백엔드가 불명 요건 목록을 주므로, 그 요건 원문에 걸리는 항목만 골라 묻는다.
 *
 * 이미 체크한 항목은 제외한다 — 답이 있는 걸 다시 묻지 않는다. 그래서 "불명 요건은
 * 남아 있지만 되물을 건 없음"이 정상적인 결과일 수 있다(요건이 "증명서를 보유했나"가
 * 아니라 "유효기간이 남았나" 같은 세부라 체크리스트로는 답이 안 되는 경우).
 *
 * 연결 안 된 요건은 개수로 돌려준다 — 못 묻는다는 사실을 화면이 정직하게 말할 수 있게.
 */
export function askableFromUnclear(
  unclearRequirements: readonly string[],
  alreadyChecked: readonly string[],
): AskableFromUnclear {
  const labels = new Set<string>()
  let unanswerable = 0

  for (const text of unclearRequirements) {
    const hit = ALL_QUAL_ITEMS.filter((item) => item.matches.some((kw) => text.includes(kw)))
    if (hit.length === 0) {
      unanswerable += 1
      continue
    }
    const askable = hit.filter((item) => !alreadyChecked.includes(item.label))
    // 걸리는 항목이 있는데 전부 이미 체크돼 있으면 물을 게 없다 — 못 답하는 요건으로도
    // 세지 않는다(체크리스트가 답을 이미 줬는데 세부 조건이 남은 경우라서).
    for (const item of askable) labels.add(item.label)
  }

  return { labels: [...labels], unanswerableCount: unanswerable }
}

/**
 * 대기업집단(상호출자제한기업집단) 소속 여부 — 체크박스가 아니라 3지선다인 이유.
 *
 * 체크박스는 "체크 안 함 = 확인 못 함"이라 대기업 계열사가 **"예"라고 답할 방법이 없다.**
 * 그런데 이 조항은 실측 72% 문서에 있고, 해당되면 그 자체로 입찰 참여가 막힌다
 * (「소프트웨어 진흥법」 제48조제4항). 정직하게 "예"를 고를 수 있어야 판정이 사실을 반영한다.
 * "모름"은 프로필에 아무 문장도 넣지 않는다 — 모르는 것을 안다고 말하지 않는다(불명 유지).
 */
export type DaegiState = 'no' | 'yes' | 'unknown'

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

  // 대조용 — 판정에 쓰이는 모든 값.
  //
  // 신용등급·자본금은 애초에 프로필 항목에서 뺐다: 98개 문서 전수 확인 결과 "○○등급
  // 이상이어야 참가 가능"을 요구한 문서가 0건이었다(전부 제출서류 목록이거나 기술평가
  // 신인도 가감점용). 판정에 쓰이지 않는 값은 받아둬도 쓸 곳이 없어 화면만 어지럽힌다
  // — 기술평가(Q2) 기능을 만들 때 그쪽에서 새로 받는 게 맞다.
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
