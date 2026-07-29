import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/**
 * 활성 문서 슬롯(A·B·C) — 사이드바·대화 상단·문서 패널이 같은 목록을 본다.
 *
 * 상한을 3개로 둔 이유: 나란히 비교 화면이 열 단위로 쪼개지는데, 4열부터는 원문
 * 한 줄이 너무 좁아져 읽을 수 없다. 더 담으려면 하나를 비우게 안내한다.
 * 라벨(A·B·C)은 배열 순서에서 파생한다 — 슬롯을 비우면 뒤가 앞으로 당겨지고,
 * 그 순서가 곧 비교 화면의 열 순서라 사용자가 위치로 문서를 기억할 수 있다.
 */
export const MAX_ACTIVE_DOCS = 3

export interface ActiveDoc {
  doc_id: string
  사업명: string | null
  /** 추천에서 담았을 때만 있다 — 적격 / 확인필요 등. 자유 대화로 담으면 없다. */
  verdict?: string
}

interface ActiveDocsValue {
  docs: ActiveDoc[]
  /** 이미 담긴 문서면 무시한다(중복 담기 방지). 상한을 넘으면 담지 않고 false를 준다. */
  add: (doc: ActiveDoc) => boolean
  remove: (docId: string) => void
  has: (docId: string) => boolean
  isFull: boolean
}

const ActiveDocsContext = createContext<ActiveDocsValue | null>(null)

export function ActiveDocsProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<ActiveDoc[]>([])

  // 담겼는지를 updater 안에서 플래그로 빼내지 않는다 — updater는 순수해야 하고
  // (StrictMode에서 두 번 돌 수 있다), 판정은 렌더 시점 상태로 해도 충분하다.
  // 이 함수는 클릭 핸들러에서만 불린다.
  const add = useCallback(
    (doc: ActiveDoc) => {
      if (docs.some((d) => d.doc_id === doc.doc_id) || docs.length >= MAX_ACTIVE_DOCS) {
        return false
      }
      setDocs((prev) =>
        prev.some((d) => d.doc_id === doc.doc_id) || prev.length >= MAX_ACTIVE_DOCS
          ? prev
          : [...prev, doc],
      )
      return true
    },
    [docs],
  )

  const remove = useCallback((docId: string) => {
    setDocs((prev) => prev.filter((d) => d.doc_id !== docId))
  }, [])

  const value = useMemo<ActiveDocsValue>(
    () => ({
      docs,
      add,
      remove,
      has: (docId) => docs.some((d) => d.doc_id === docId),
      isFull: docs.length >= MAX_ACTIVE_DOCS,
    }),
    [docs, add, remove],
  )

  return <ActiveDocsContext.Provider value={value}>{children}</ActiveDocsContext.Provider>
}

export function useActiveDocs(): ActiveDocsValue {
  const ctx = useContext(ActiveDocsContext)
  if (!ctx) throw new Error('useActiveDocs는 ActiveDocsProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
