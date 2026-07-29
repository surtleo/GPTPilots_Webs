import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * 가운데 뷰어의 탭 상태 + 대화가 만들어낸 파일(비교표·정리·점검 리포트).
 *
 * 탭 키를 문자열 하나로 두는 이유: 뷰어에 뜨는 것이 공고 원문·비교표·생성 문서·프로필로
 * 종류가 제각각인데, 탭 바는 그걸 한 줄에 섞어 보여준다. 종류별로 배열을 따로 두면
 * "지금 활성 탭이 무엇인지"를 매번 종류별로 뒤져야 해서 키 하나로 통일했다.
 *   doc:<doc_id>  공고 원문        compare  비교표
 *   gen:<file_id> 생성 문서        profile  내 회사 프로필
 */
const FILES_KEY = 'bidmate.generated-files.v1'

export type ViewerKey = string

export type GeneratedFileType = 'table' | 'doc'

export interface GeneratedFile {
  id: string
  type: GeneratedFileType
  title: string
  /** 목록 두 번째 줄 — "방금 · 대화에서 생성" 같은 출처 표기. */
  sub: string
  /** 문서 본문 위 회색 한 줄. 어느 공고 기준인지 등. */
  meta: string
  body: string
  createdAt: number
}

/** 인용 각주를 눌렀을 때 원문 뷰어가 스크롤·하이라이트할 대상. */
export interface CiteTarget {
  docId: string
  /** 원문에서 그대로 찾을 문자열. 못 찾으면 하이라이트 없이 원문만 연다. */
  quote: string | null
  section: string | null
  /** 같은 인용을 다시 눌러도 다시 반짝이도록 매번 증가시킨다. */
  nonce: number
}

interface WorkspaceValue {
  tabs: ViewerKey[]
  active: ViewerKey | null
  /** 탭을 열고 활성화한다. 이미 열려 있으면 활성화만 한다. */
  open: (key: ViewerKey) => void
  close: (key: ViewerKey) => void
  /** 인용 각주 → 그 공고 원문을 열고 해당 대목으로 점프한다. */
  openCite: (docId: string, quote: string | null, section: string | null) => void
  cite: CiteTarget | null
  files: GeneratedFile[]
  addFile: (file: Omit<GeneratedFile, 'createdAt'>) => void
  removeFile: (id: string) => void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function docKey(docId: string): ViewerKey {
  return `doc:${docId}`
}

export function genKey(fileId: string): ViewerKey {
  return `gen:${fileId}`
}

export function parseKey(
  key: ViewerKey,
):
  | { kind: 'doc'; docId: string }
  | { kind: 'gen'; fileId: string }
  | { kind: 'compare' }
  | { kind: 'profile' } {
  if (key === 'compare') return { kind: 'compare' }
  if (key === 'profile') return { kind: 'profile' }
  if (key.startsWith('doc:')) return { kind: 'doc', docId: key.slice(4) }
  return { kind: 'gen', fileId: key.slice(4) }
}

function loadFiles(): GeneratedFile[] {
  try {
    const raw = localStorage.getItem(FILES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GeneratedFile[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<ViewerKey[]>([])
  const [active, setActive] = useState<ViewerKey | null>(null)
  const [cite, setCite] = useState<CiteTarget | null>(null)
  const [files, setFiles] = useState<GeneratedFile[]>(loadFiles)
  const citeNonce = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify(files))
    } catch {
      // 용량 초과 등 — 생성 파일은 다시 만들 수 있으니 조용히 넘어간다.
    }
  }, [files])

  const open = useCallback((key: ViewerKey) => {
    setTabs((prev) => (prev.includes(key) ? prev : [...prev, key]))
    setActive(key)
  }, [])

  const close = useCallback((key: ViewerKey) => {
    setTabs((prev) => {
      const next = prev.filter((k) => k !== key)
      // 닫은 게 지금 보던 탭이면 옆 탭으로 넘어간다 — 아무것도 안 남으면 뷰어 자체가 닫힌다.
      setActive((cur) => (cur === key ? (next.length ? next[next.length - 1] : null) : cur))
      return next
    })
  }, [])

  const openCite = useCallback(
    (docId: string, quote: string | null, section: string | null) => {
      citeNonce.current += 1
      setCite({ docId, quote, section, nonce: citeNonce.current })
      open(docKey(docId))
    },
    [open],
  )

  const addFile = useCallback((file: Omit<GeneratedFile, 'createdAt'>) => {
    // 같은 id로 다시 만들면(같은 공고를 또 정리하는 등) 최신 것으로 교체하고 맨 위로 올린다.
    setFiles((prev) => [
      { ...file, createdAt: Date.now() },
      ...prev.filter((f) => f.id !== file.id),
    ])
  }, [])

  const removeFile = useCallback(
    (id: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== id))
      close(genKey(id))
    },
    [close],
  )

  const value = useMemo<WorkspaceValue>(
    () => ({ tabs, active, open, close, openCite, cite, files, addFile, removeFile }),
    [tabs, active, open, close, openCite, cite, files, addFile, removeFile],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace는 WorkspaceProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
