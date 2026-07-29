import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

import {
  streamRecommendations,
  type RecommendationItem,
  type RecommendationProgressEvent,
} from '@/lib/api'

const CACHE_KEY = 'bidmate.recommendations.v1'

export interface RecoError {
  message: string
}

/** 실시간 진행 단계 — 화면이 이 값을 그대로 "~하는 중" 문구·단계 리스트로 보여준다. */
export type RecoProgress =
  | { stage: 'idle' }
  | { stage: 'candidates'; count: number }
  | { stage: 'matching'; done: number; total: number }
  | { stage: 'enriching' }

interface CachedResult {
  profileText: string
  items: RecommendationItem[]
}

interface RecommendationsValue {
  items: RecommendationItem[]
  loading: boolean
  progress: RecoProgress
  error: RecoError | null
  /** 지금 items가 어떤 프로필로 받아둔 결과인지. 아직 받은 게 없으면 null.
   *  호출부가 "이미 대조해둔 결과가 있는지"를 items 개수와 무관하게 판단할 때 쓴다 —
   *  0건도 엄연한 결과라서 items.length로는 구분이 안 된다. */
  cachedFor: string | null
  /** profileText가 이미 캐시된 것과 같으면 아무 것도 안 한다 — 재요청 없이 캐시를 그대로 보여준다.
   *  화면(탭)을 오갈 때마다 매번 새로 부르지 않게 하려고 존재하는 함수. */
  ensure: (profileText: string) => void
  /** 캐시 여부와 무관하게 강제로 다시 부른다 — "다시 시도"·"프로필 수정 후 다시 찾기"용. */
  refresh: (profileText: string) => void
}

const RecommendationsContext = createContext<RecommendationsValue | null>(null)

function loadCache(): CachedResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CachedResult) : null
  } catch {
    return null
  }
}

function saveCache(result: CachedResult) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result))
  } catch {
    // 세션스토리지 용량 초과 등 — 캐시는 있으면 좋은 것일 뿐이라 조용히 무시한다.
  }
}

/**
 * 추천 목록을 세션 동안(sessionStorage) 캐시하고, 진행 상황을 실시간(NDJSON 스트림)으로
 * 받는다. 배치 매칭이 문서당 수십 초 걸리는데:
 * ① 이 상태를 페이지 컴포넌트 안에 두면 사이드바로 다른 탭에 갔다 돌아올 때마다
 *    (=라우트 리마운트) 매번 새로 API를 부르게 된다 → 앱 셸 컨텍스트로 끌어올려 캐시.
 * ② "확인하는 중..."만 뜨고 몇 분이고 가만있으면 고통스럽다는 피드백 → 후보 수·
 *    배치 그룹 완료 개수를 실시간으로 받아 단계별로 보여준다.
 * 캐시 키는 profileText 그 자체 — 프로필이 바뀌면 자동으로 새 요청이 나간다.
 */
export function RecommendationsProvider({ children }: { children: ReactNode }) {
  const cachedOnLoad = useRef(loadCache())
  const [profileTextCached, setProfileTextCached] = useState<string | null>(
    cachedOnLoad.current?.profileText ?? null,
  )
  const [items, setItems] = useState<RecommendationItem[]>(cachedOnLoad.current?.items ?? [])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<RecoProgress>({ stage: 'idle' })
  const [error, setError] = useState<RecoError | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // 지금 어떤 profileText로 요청이 나가 있는지 — ref라서 즉시(동기) 갱신된다.
  // loading(state)만으로 가드하면 StrictMode의 effect 이중실행에서 두 번째 호출이
  // 아직 반영 안 된(stale) loading=false를 보고 통과해버려 요청이 중복 발사되고,
  // 첫 번째가 abort되면서 화면이 영원히 로딩 상태로 남는 레이스가 생겼다(실측).
  const inFlightForRef = useRef<string | null>(null)

  // 서버는 8초마다 heartbeat를 보낸다(src/eligibility.py HEARTBEAT_INTERVAL_S) —
  // 그보다 훨씬 오래(아래 값) 아무 이벤트도 안 오면 연결이 조용히 끊긴 것으로 보고
  // 스스로 포기한다. 2026-07-29 실전에서 겪음: 터널이 오래 조용한 연결을 죽은 걸로
  // 보고 끊어버리는데, fetch의 ReadableStream은 그런 상황을 에러로 알려주지 않아서
  // 화면이 "선별 완료" 상태에서 20분 넘게 그대로 멈춰있었다 — 이 워치독이 그걸 감지한다.
  const WATCHDOG_TIMEOUT_MS = 30_000
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchFor = useCallback((profileText: string) => {
    abortRef.current?.abort()
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    const controller = new AbortController()
    abortRef.current = controller
    inFlightForRef.current = profileText
    setLoading(true)
    setError(null)
    setProgress({ stage: 'idle' })

    const armWatchdog = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      watchdogRef.current = setTimeout(() => {
        controller.abort()
        setError({ message: '서버 응답이 끊긴 것 같아요. 다시 시도해주세요.' })
        setLoading(false)
      }, WATCHDOG_TIMEOUT_MS)
    }
    armWatchdog()

    void streamRecommendations(
      profileText,
      (event: RecommendationProgressEvent) => {
        armWatchdog() // 이벤트(heartbeat 포함)가 올 때마다 카운트다운 리셋
        switch (event.type) {
          case 'candidates':
            setProgress({ stage: 'candidates', count: event.count })
            break
          case 'matching':
            setProgress({ stage: 'matching', done: event.done, total: event.total })
            break
          case 'heartbeat':
            break // 진행 단계는 그대로, 워치독만 리셋(위에서 이미 함)
          case 'enriching':
            setProgress({ stage: 'enriching' })
            break
          case 'done':
            if (watchdogRef.current) clearTimeout(watchdogRef.current)
            setItems(event.items)
            setProfileTextCached(profileText)
            setLoading(false)
            saveCache({ profileText, items: event.items })
            break
          case 'error':
            if (watchdogRef.current) clearTimeout(watchdogRef.current)
            setError({ message: event.message })
            setLoading(false)
            break
        }
      },
      controller.signal,
    )
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (watchdogRef.current) clearTimeout(watchdogRef.current)
        const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
        setError({ message })
        setLoading(false)
      })
      .finally(() => {
        if (inFlightForRef.current === profileText) inFlightForRef.current = null
      })
  }, [])

  const ensure = useCallback(
    (profileText: string) => {
      if (!profileText.trim()) return
      if (profileText === profileTextCached && !error) return // 이미 캐시됨 — 재요청 없음
      if (inFlightForRef.current === profileText) return // 이미 같은 요청이 나가 있음
      fetchFor(profileText)
    },
    [profileTextCached, error, fetchFor],
  )

  const refresh = useCallback(
    (profileText: string) => {
      if (!profileText.trim()) return
      fetchFor(profileText)
    },
    [fetchFor],
  )

  return (
    <RecommendationsContext.Provider
      value={{ items, loading, progress, error, cachedFor: profileTextCached, ensure, refresh }}
    >
      {children}
    </RecommendationsContext.Provider>
  )
}

export function useRecommendationsCache(): RecommendationsValue {
  const ctx = useContext(RecommendationsContext)
  if (!ctx) {
    throw new Error('useRecommendationsCache는 RecommendationsProvider 안에서만 쓸 수 있습니다.')
  }
  return ctx
}
