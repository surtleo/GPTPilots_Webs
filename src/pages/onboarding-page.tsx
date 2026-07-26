import { useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

/**
 * 화면 1 — 온보딩: 회사 소개 자유 서술 + 실적 파일 첨부(선택).
 * 추천/분석 백엔드가 아직 없어 입력값은 저장만 하고 다음 화면(질문)으로 이동한다.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const [intro, setIntro] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setFileName(file ? file.name : null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-6 py-10">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-10 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-h3 leading-none font-semibold tracking-tight">
              BidMate
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">공공 입찰 RFP 추천 서비스</p>
          </div>
        </div>

        <h2 className="font-heading text-h2 font-semibold tracking-tight">
          우리 회사에 맞는 공공 입찰을 찾아드립니다
        </h2>
        <p className="mt-2 text-muted-foreground">
          100건의 공고 중, 지원 가능하고 정리된 사업만 골라 추천합니다
        </p>

        <label className="mt-8 block text-sm font-medium" htmlFor="intro">
          회사가 어떤 사업을 해왔는지 자유롭게 설명해주세요
        </label>
        <Textarea
          id="intro"
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={6}
          placeholder="예) 저희는 지자체 대상 관제·모니터링 시스템을 주로 구축해 왔으며, IoT 센서 연동과 대시보드 개발 경험이 있습니다. 최근 3년간 3개 광역시 단위 프로젝트 5건을 수행했습니다…"
          className="mt-2 resize-none"
        />

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-xs text-muted-foreground">또는</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <label className="block text-sm font-medium">회사소개서·포트폴리오를 첨부해도 됩니다</label>
        <label
          htmlFor="portfolio"
          className="mt-2 flex h-30 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border bg-muted/40 text-center transition-colors hover:bg-muted"
        >
          <Upload className="size-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {fileName ?? '파일을 여기로 드래그하거나 클릭해서 업로드'}
          </span>
          <span className="font-mono text-xs text-muted-foreground/70">
            PDF · PPTX · HWP · 최대 20MB
          </span>
          <input
            id="portfolio"
            type="file"
            accept=".pdf,.pptx,.hwp"
            className="hidden"
            onChange={onFileChange}
          />
        </label>

        <div className="mt-9 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs text-muted-foreground">진행 1 / 3</span>
            <span className="flex gap-1">
              <span className="h-1.5 w-7 rounded-full bg-primary" />
              <span className="h-1.5 w-7 rounded-full bg-muted" />
              <span className="h-1.5 w-7 rounded-full bg-muted" />
            </span>
          </div>
          <Button size="lg" onClick={() => navigate('/questionnaire')}>
            다음 →
          </Button>
        </div>
      </div>
    </div>
  )
}
