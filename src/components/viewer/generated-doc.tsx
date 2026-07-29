import { FileText, X } from 'lucide-react'

import { formatRelativeTime } from '@/lib/format'
import { genKey, useWorkspace } from '@/lib/workspace-context'

/** 대화가 만들어낸 문서(핵심 정리 등)를 그대로 펼쳐 보여준다. */
export function GeneratedDoc({ fileId }: { fileId: string }) {
  const { files, close } = useWorkspace()
  const file = files.find((f) => f.id === fileId)

  if (!file) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">문서를 찾을 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-[46px] shrink-0 items-center gap-2 border-b border-border bg-card px-4.5 py-2">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-[13px] font-semibold">{file.title}</span>
        <span className="shrink-0 rounded bg-secondary px-1.5 text-[10.5px] text-muted-foreground">
          {formatRelativeTime(file.createdAt)} · {file.sub}
        </span>
        <button
          onClick={() => close(genKey(file.id))}
          title="닫기"
          aria-label="닫기"
          className="ml-auto grid size-6.5 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-5.5">
        <div className="mx-auto max-w-[44rem] rounded-xl border border-border bg-card px-7 py-6 shadow-sm">
          <h1 className="font-heading mb-1 text-xl font-bold">{file.title}</h1>
          <p className="mb-3.5 text-[12.5px] text-muted-foreground">{file.meta}</p>
          <pre className="font-sans text-[13.5px] leading-[1.85] whitespace-pre-wrap text-foreground">
            {file.body}
          </pre>
        </div>
      </div>
    </div>
  )
}
