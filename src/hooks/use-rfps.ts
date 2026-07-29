import { useCallback, useEffect, useState } from 'react'

import { ApiError, fetchRfp, fetchRfps, type RfpCard, type RfpListParams } from '@/lib/api'

export interface LoadError {
  kind: ApiError['kind']
  status: number
  message: string
}

function toLoadError(err: unknown): LoadError {
  if (err instanceof ApiError) return { kind: err.kind, status: err.status, message: err.message }
  return { kind: 'unknown', status: 0, message: '알 수 없는 오류가 발생했습니다.' }
}

export interface UseRfps {
  items: RfpCard[]
  /** 필터 적용 후 전체 건수 — 화면 상단 "총 N건" 표기용. */
  total: number
  loading: boolean
  error: LoadError | null
  reload: () => void
}

/** 공고 카드 목록 조회. q/limit/offset 변경 시 재요청하고, 이전 요청은 abort한다. */
export function useRfps({ q, limit, offset }: RfpListParams = {}): UseRfps {
  const [items, setItems] = useState<RfpCard[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<LoadError | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    // limit 0 = "지금은 필요 없다"는 신호 (닫혀 있는 팝업 등) — 요청을 아예 보내지 않는다.
    if (limit === 0) {
      setItems([])
      setTotal(0)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetchRfps({ q, limit, offset }, controller.signal)
      .then((res) => {
        setItems(res.items)
        setTotal(res.total)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return // 후속 요청이 갈아치운 경우 — 상태를 건드리지 않는다
        setError(toLoadError(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [q, limit, offset, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { items, total, loading, error, reload }
}

export interface UseRfp {
  card: RfpCard | null
  loading: boolean
  error: LoadError | null
}

/** 공고 카드 단건 조회. docId가 없으면 요청하지 않고 대기 상태로 둔다. */
export function useRfp(docId: string | undefined): UseRfp {
  const [card, setCard] = useState<RfpCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<LoadError | null>(null)

  useEffect(() => {
    if (!docId) {
      setCard(null)
      setLoading(false)
      setError({ kind: 'notfound', status: 404, message: '공고를 찾을 수 없습니다.' })
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetchRfp(docId, controller.signal)
      .then((res) => {
        setCard(res)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setCard(null)
        setError(toLoadError(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [docId])

  return { card, loading, error }
}

// 추천 목록은 src/lib/recommendations-context.tsx(useRecommendationsCache)로 옮겨졌다 —
// 배치 매칭이 문서당 1분 이상 걸리는데, 이 훅처럼 페이지 컴포넌트 안에 상태를 두면
// 사이드바로 다른 탭에 갔다 돌아올 때마다(=라우트 리마운트) 매번 재요청하게 된다.
// 앱 셸 레벨 컨텍스트에 둬서 프로필이 그대로면 캐시를 재사용한다.
