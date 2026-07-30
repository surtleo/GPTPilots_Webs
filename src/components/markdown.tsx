import { useMemo } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { Citation } from '@/lib/api'
import { citeIndexFromHref, CiteChip, linkifyCitations } from '@/components/chat/cite'

/**
 * assistant 답변용 마크다운 렌더러 — GFM 표(배점표 등)·`출처` 포함.
 * 데이터 밀집 영역(표·코드)은 sans/mono로 가독성 우선 (spec §13-4 이탈 승인).
 */
export const markdownComponents: Components = {
  p: ({ node: _node, ...props }) => <p className="my-2 leading-relaxed" {...props} />,
  h1: ({ node: _node, ...props }) => (
    <h3 className="mt-4 mb-2 font-heading text-lg font-semibold" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h3 className="mt-4 mb-2 font-heading text-base font-semibold" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h4 className="mt-3 mb-1.5 text-sm font-semibold" {...props} />
  ),
  ul: ({ node: _node, ...props }) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
  li: ({ node: _node, ...props }) => <li className="leading-relaxed" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a
      className="text-primary underline underline-offset-2 hover:opacity-80"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  strong: ({ node: _node, ...props }) => <strong className="font-semibold" {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="my-2 border-l-2 border-border pl-3 text-muted-foreground italic"
      {...props}
    />
  ),
  hr: ({ node: _node, ...props }) => <hr className="my-3 border-border" {...props} />,
  code: ({ node: _node, ...props }) => (
    <code
      className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node: _node, ...props }) => <thead className="bg-secondary" {...props} />,
  th: ({ node: _node, ...props }) => (
    <th
      className="border-b border-border px-3 py-2 text-left font-mono text-xs font-semibold tracking-wide whitespace-nowrap"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-b border-border px-3 py-2 align-top" {...props} />
  ),
}

export function MarkdownMessage({
  content,
  citations,
}: {
  content: string
  /** 주면 본문의 `(출처: …)` 표기를 각주 칩으로 바꿔 단다. */
  citations?: Citation[]
}) {
  const { text, refs } = useMemo(() => {
    // 모델이 표 셀 안 줄바꿈을 `<br>`로 적는데, rehype-raw 없이는 평문 그대로 노출된다
    // (rehype-raw는 LLM 출력에 XSS 경로를 여니 쓰지 않는다). GFM 셀은 개행이 안 되므로
    // 가운뎃점 구분자로 바꿔 보여준다. 뒤따르는 불릿 대시는 구분자와 겹쳐 지운다.
    const flat = content.replace(/\s*<br\s*\/?>\s*(?:-\s*)?/gi, ' · ')
    return citations?.length ? linkifyCitations(flat, citations) : { text: flat, refs: null }
  }, [content, citations])

  const withCites = useMemo<Components>(
    () =>
      refs
        ? {
            ...markdownComponents,
            a: ({ node: _node, href, children, ...props }) => {
              const n = citeIndexFromHref(href)
              const citation = n != null ? refs.get(n) : undefined
              if (n != null && citation) return <CiteChip n={n} citation={citation} />
              return (
                <a
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                  target="_blank"
                  rel="noreferrer"
                  href={href}
                  {...props}
                >
                  {children}
                </a>
              )
            },
          }
        : markdownComponents,
    [refs],
  )

  return (
    <div className="text-sm text-foreground">
      <Markdown remarkPlugins={[remarkGfm]} components={withCites}>
        {text}
      </Markdown>
    </div>
  )
}
