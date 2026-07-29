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
 * 회사 프로필 화면 간 공유 상태 — 화면1(자유서술)·화면2(분야·건수)를 화면3(추천목록)까지
 * 들고 가기 위함 (ELIGIBILITY_MATCH_PLAN.md Phase 3 이전엔 화면 전환마다 버려졌다).
 * localStorage에도 저장해 새로고침해도 유지된다 — 이 프로필은 회사소개 자유서술 수준의
 * 정보라 세션스토리지보다 살짝 더 관대해도 되는 민감도(브라우저 로컬 저장, 서버 전송 없음).
 */
const STORAGE_KEY = 'bidmate.profile.v1'

/**
 * 보유 자격·신고사항 체크리스트 — 98건 참가자격 요건 추출 결과에서 반복적으로 나온
 * 항목만 골랐다(지어낸 목록 아님). 자유서술은 "해본 업무"는 잘 적지만 "소프트웨어사업자
 * 신고했다" 같은 자격·신고사항은 안 적는 경향이 있어(2026-07-27 실측 — met=0인 적격
 * 카드가 대다수), 이 체크리스트로 명시적 확인을 쉽게 만든다. 체크 안 한 항목은
 * "없다"가 아니라 "말 안 함"(불명 유지) — 임의로 미충족 처리하지 않는다.
 */
/** 주력 분야 선택지 — 백엔드 src/profile.py의 FIELD_OPTIONS와 값이 일치해야 한다. */
export const FIELD_OPTIONS = [
  'SI · 시스템 통합 구축',
  '관제·모니터링 시스템',
  '데이터·AI 분석 솔루션',
] as const

export const QUALIFICATION_OPTIONS = [
  '국가계약법상 경쟁입찰 참가자격 보유',
  '부정당업자 제재 대상 아님',
  '소프트웨어사업자 신고 완료',
  '중소기업 확인서 보유',
  '직접생산확인증명서 보유',
] as const

export interface ProfileState {
  introText: string
  field: string | null
  chips: string[]
  recentCount: string
  qualifications: string[]
}

const EMPTY: ProfileState = {
  introText: '',
  field: null,
  chips: [],
  recentCount: '',
  qualifications: [],
}

/**
 * 프로필 완성도 — 채운 항목 수 / 전체 항목 수.
 *
 * 자격 체크리스트를 5개로 세지 않고 "하나라도 체크했는가" 1항목으로 세는 이유: 5개 전부
 * 해당되는 회사는 없다. 다 채워야 100%인 것처럼 보이면 해당 없는 항목을 억지로 체크하게
 * 만드는데, 그건 판정을 망가뜨린다(체크 = 보유 주장).
 */
export const PROFILE_FIELD_COUNT = 4

export function profileFilledCount(p: ProfileState): number {
  return [
    p.introText.trim().length > 0,
    p.field != null,
    p.recentCount.trim().length > 0,
    p.qualifications.length > 0,
  ].filter(Boolean).length
}

interface ProfileContextValue {
  profile: ProfileState
  setProfile: (patch: Partial<ProfileState>) => void
  /** 참가자격 매칭·추천 검색에 넣을 최종 프로필 텍스트 — 자유서술 + 분야 + 실적을 한 문단으로. */
  combinedText: string
  /** 채운 항목 수 (0~PROFILE_FIELD_COUNT) — 사이드바·프로필 화면의 완성도 표시용. */
  filledCount: number
  reset: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

function loadInitial(): ProfileState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ProfileState>
    return { ...EMPTY, ...parsed }
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

  const combinedText = useMemo(() => {
    const parts = [profile.introText.trim()]
    if (profile.field) parts.push(`주력 분야: ${profile.field}`)
    if (profile.recentCount.trim()) {
      parts.push(`최근 3년간 공공부문 사업 실적: ${profile.recentCount.trim()}건`)
    }
    if (profile.qualifications.length > 0) {
      parts.push(profile.qualifications.map((q) => `- ${q}`).join('\n'))
    }
    return parts.filter(Boolean).join('\n')
  }, [profile])

  const filledCount = useMemo(() => profileFilledCount(profile), [profile])

  // value를 메모한다 — chat-flows의 흐름 콜백들이 combinedText·setProfile에 의존해서,
  // 매 렌더 새 객체가 내려가면 그 콜백들도 전부 새로 만들어진다.
  const value = useMemo(
    () => ({ profile, setProfile, combinedText, filledCount, reset }),
    [profile, setProfile, combinedText, filledCount, reset],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile은 ProfileProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
