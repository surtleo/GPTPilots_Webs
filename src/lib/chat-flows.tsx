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

import { ApiError, fetchEligibility, type EligibilityResult } from '@/lib/api'
import { useActiveDocs } from '@/lib/active-docs-context'
import type { MessageCard, ReportItem, StepItem } from '@/lib/chat-cards'
import { useChatSessions } from '@/lib/chat-sessions-context'
import { verdictBadge } from '@/lib/format'
import { QUALIFICATION_OPTIONS, useProfile } from '@/lib/profile-context'
import { useRecommendationsCache } from '@/lib/recommendations-context'
import { genKey, useWorkspace } from '@/lib/workspace-context'

/**
 * 채팅 명령 → 실제 백엔드 흐름.
 *
 * 프로토타입(BidMate UX 개선 v6)의 flowReco · flowCompare · flowSummary · flowReady를 그대로
 * 옮기되, 프로토타입에서 지어낸 값으로 그렸던 자리를 전부 실제 엔드포인트로 바꿨다:
 *
 *   flowReco     POST /recommendations/stream   (진행 단계도 실제 이벤트)
 *   flowSummary  POST /ask                       (답변을 그대로 파일로 저장)
 *   flowReady    POST /eligibility/{doc_id}      (met·unmet·unclear_count)
 *   flowCompare  GET  /rfps/{doc_id} + 추천 판정  (계약에 없는 항목은 표에도 안 넣음)
 *
 * 컨텍스트로 올린 이유: 같은 흐름을 채팅 입력창과 왼쪽 패널 버튼 양쪽에서 시작한다.
 * 어디서 눌렀든 대화에는 똑같이 남아야 하므로 시작 지점만 다르고 실행은 하나여야 한다.
 */
interface ChatFlowsValue {
  runReco: (text?: string) => void
  runCompare: (text?: string) => void
  runSummary: (text?: string) => Promise<void>
  /** 입찰 준비 점검 — 체크한 공고의 참가자격을 프로필로 대조한다. */
  runReady: (text?: string) => Promise<void>
  /** 확인 질문에 답하기 — 자격을 프로필에 반영하고 그 문서를 다시 판정한다. */
  answerAsk: (messageId: string, option: string) => Promise<void>
  /** 반문 후보를 골랐을 때 — 그 사업명을 붙여 다시 묻는다. */
  pickCandidate: (label: string) => Promise<void>
  /** 흐름이 도는 중이면 채팅에 띄울 문구, 아니면 null. */
  busy: string | null
}

const ChatFlowsContext = createContext<ChatFlowsValue | null>(null)

const NO_MATCH = '해당 없음'

/** 판정별 건수 — "참가 가능"처럼 뭉뚱그리지 않고 백엔드 verdict 그대로 센다. */
function verdictBreakdown(items: { verdict: string }[]): string {
  const ok = items.filter((r) => r.verdict === '적격').length
  const check = items.length - ok
  if (items.length === 0) return '0건'
  if (check === 0) return `적격 ${ok}건`
  if (ok === 0) return `확인필요 ${check}건`
  return `적격 ${ok}건 · 확인필요 ${check}건`
}

/** 추천 진행 단계 — 백엔드 스트림 이벤트를 그대로 단계 리스트로 옮긴다. */
function recoSteps(
  progress: ReturnType<typeof useRecommendationsCache>['progress'],
  done: boolean,
): StepItem[] {
  if (done) {
    return [
      { label: '적합도 높은 공고 선별', state: 'done' },
      { label: '후보별 참가자격 대조', state: 'done' },
      { label: '결과 정리', state: 'done' },
    ]
  }
  const count = progress.stage !== 'idle' && 'count' in progress ? progress.count : null
  const matching = progress.stage === 'matching' ? progress : null
  const enriching = progress.stage === 'enriching'
  return [
    {
      label: count != null ? `적합도 높은 공고 ${count}건 선별` : '프로필과 가까운 공고 선별',
      state: progress.stage === 'idle' ? 'active' : 'done',
    },
    {
      label: matching
        ? `후보별 참가자격 대조 (${matching.done}/${matching.total})`
        : '후보별 참가자격 대조',
      state: enriching ? 'done' : matching ? 'active' : 'pending',
    },
    { label: '결과 정리', state: enriching ? 'active' : 'pending' },
  ]
}

export function ChatFlowsProvider({ children }: { children: ReactNode }) {
  const { docs } = useActiveDocs()
  const { profile, setProfile, matchText, searchText } = useProfile()
  const {
    items,
    loading: recoLoading,
    progress,
    error: recoError,
    cachedFor,
    refresh,
  } = useRecommendationsCache()
  const { pushLocal, patchCard, send, peekCurrentId } = useChatSessions()
  const { open, addFile } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  // 지금 진행 중인 추천 흐름의 단계 카드 — 카드 id와 그 카드가 실제로 속한 세션 id를 함께
  // 들고 있는다. 대조는 1~2분 걸리는데(위 진행바 문구 참고) 그사이 사용자가 사이드바에서
  // 다른 대화로 넘어갈 수 있다 — patchCard/pushLocal이 "지금 보고 있는 세션"이 아니라
  // 이 sessionId를 향하게 해야, 카드가 엉뚱한 세션에서 영원히 멈춰 있거나 결과 메시지가
  // 이 흐름과 무관한 대화에 끼어드는 걸 막는다(2026-07-30 QA 라운드에서 코드 리뷰로 발견).
  const recoCardRef = useRef<{ id: string; sessionId: string } | null>(null)

  // 추천 진행 상황을 단계 카드에 반영한다. 프로토타입은 타이머로 가짜 진행을 그렸지만,
  // 여기서 쓰는 값은 백엔드가 배치 그룹마다 흘려주는 실제 이벤트다.
  useEffect(() => {
    const active = recoCardRef.current
    if (!active) return
    const { id, sessionId } = active
    if (recoLoading) {
      patchCard(id, { steps: recoSteps(progress, false), done: false }, sessionId)
      return
    }
    recoCardRef.current = null

    // 실패했는데 완료로 굳히면 안 된다. 로딩이 풀렸다는 것만 보고 성공으로 단정하면,
    // 스트림이 끊기거나 워치독이 걸린 경우에도 단계가 전부 ✓로 바뀌고 예전 캐시 건수로
    // "담아뒀어요"라는 거짓 보고가 남는다 — 에러는 왼쪽 패널에만 뜨는데도.
    if (recoError) {
      patchCard(id, { failed: true, done: true }, sessionId)
      pushLocal('assistant', `참가자격 대조가 중단됐어요 — ${recoError.message}`, { sessionId })
      return
    }

    patchCard(id, { steps: recoSteps(progress, true), done: true }, sessionId)
    // "참가 가능"이라고 뭉뚱그리지 않는다: 백엔드는 적격과 확인필요를 함께 돌려주는데,
    // 확인필요는 미충족 요건이 1건 이상 있다는 판정이다(src/eligibility.py `_build_verdict`).
    // 이걸 전부 "참가 가능"으로 재서술하면 프론트가 판정을 바꿔 말하는 셈이 된다.
    pushLocal(
      'assistant',
      items.length > 0
        ? `참가자격을 대조해 ${verdictBreakdown(items)}을 왼쪽 맞춤 공고에 담아뒀어요. 확인필요는 미충족 요건이 남아 있다는 뜻이라 뱃지를 꼭 봐주세요. 체크하시면 그 공고를 근거로 답하고, 준비 점검·비교표·핵심 정리도 만들 수 있어요.`
        : '자격이 걸리지 않는 공고를 찾지 못했어요. 회사 소개를 더 구체적으로 적거나 보유 자격을 체크하시면 결과가 달라질 수 있어요.',
      { sessionId },
    )
  }, [recoLoading, recoError, progress, items, patchCard, pushLocal])

  const runReco = useCallback(
    (text = '맞춤 공고 찾아줘') => {
      pushLocal('user', text)

      // 이미 대조가 돌고 있으면 다시 쏘지 않는다. 재발사하면 진행 중 스트림이 abort되고
      // 처음부터 다시 도는 데다(백엔드 매칭 비용 중복), 앞서 띄운 진행 카드는 갱신할 주인을
      // 잃어 "대조하는 중…" 스피너로 영원히 남는다 — 그 상태 그대로 localStorage에 저장돼
      // 새로고침해도 계속 돈다. 대조는 1~2분 걸려서 그 사이 다시 누르기 쉽다.
      if (recoLoading || recoCardRef.current) {
        pushLocal(
          'assistant',
          '이미 참가자격을 대조하는 중이에요 — 끝나면 왼쪽 맞춤 공고에 담아드릴게요.',
        )
        return
      }

      if (!matchText.trim()) {
        pushLocal(
          'assistant',
          '먼저 회사 프로필을 작성해 주세요. 왼쪽 아래 “내 회사 프로필”에서 해오신 사업과 보유 자격을 채우시면, 그걸로 공고의 참가자격을 대조해 드려요.',
        )
        return
      }
      // 이미 같은 프로필로 대조해둔 결과가 있으면 그대로 알리고 끝낸다 — 돈 드는 재대조를
      // 굳이 다시 돌릴 이유가 없다. 판단 기준을 items 개수가 아니라 cachedFor로 두는 게
      // 중요하다: 0건도 엄연한 결과이고, 개수로 판단하면 "0건 캐시" 상태에서 ensure()가
      // 조용히 조기 반환해 진행 카드가 영원히 도는 채로 멈춘다.
      const cacheValid = cachedFor !== null && cachedFor === matchText && !recoError
      if (cacheValid && !/다시/.test(text)) {
        pushLocal(
          'assistant',
          items.length > 0
            ? `이미 이 프로필로 대조해둔 결과가 있어요 — ${verdictBreakdown(items)}. 왼쪽 맞춤 공고에서 확인하시고, 새로 대조하려면 “맞춤 공고 다시 찾아줘”라고 해주세요.`
            : '이 프로필로는 자격이 걸리지 않는 공고를 찾지 못했어요. 프로필을 고치신 뒤 “맞춤 공고 다시 찾아줘”라고 해주세요.',
        )
        return
      }

      refresh(matchText, searchText)
      // pushLocal('user', text) 위에서 이미 세션을 확정지었으니(없었으면 방금 만들어졌으니)
      // 그 직후 시점의 currentId를 그대로 이 흐름이 쓸 세션으로 고정한다 — 대조가 도는
      // 1~2분 동안 사용자가 다른 대화로 넘어가도 이 흐름은 시작한 세션에 계속 쓴다.
      const sessionId = peekCurrentId()
      if (!sessionId) return
      const cardId = pushLocal('assistant', '', {
        card: { kind: 'steps', steps: recoSteps(progress, false), done: false },
        sessionId,
      })
      recoCardRef.current = { id: cardId, sessionId }
    },
    [
      matchText,
      searchText,
      items,
      cachedFor,
      recoError,
      recoLoading,
      refresh,
      pushLocal,
      peekCurrentId,
      progress,
    ],
  )

  const runCompare = useCallback(
    (text = '비교표 만들어줘') => {
      if (docs.length < 2) return
      pushLocal('user', text)
      const titles = docs.map((d) => d.사업명 ?? d.doc_id)
      addFile({
        id: 'compare',
        type: 'table',
        title: `비교표 — 공고 ${docs.length}건`,
        sub: '대화에서 생성',
        meta: titles.join(' · '),
        body: titles.join('\n'),
      })
      open('compare')
      pushLocal(
        'assistant',
        `체크하신 ${docs.length}건을 항목별로 비교했어요. 값이 갈리는 항목엔 “차이” 표시를 붙였어요 — 표는 왼쪽 파일 탭에도 저장했어요.`,
        { meta: { fileIds: ['compare'] } },
      )
    },
    [docs, addFile, open, pushLocal],
  )

  const runSummary = useCallback(
    async (text = '핵심 정리해줘') => {
      const target = docs[0]
      if (!target) return
      // send() 자체는 시작 시점 세션에 알아서 답을 남기지만(내부에서 자체 캡처),
      // 그 뒤에 따로 붙이는 "파일로도 저장했어요" 안내는 별개 쓰기라 세션을 직접 못 박아야
      // /ask 응답이 오는 사이 다른 대화로 넘어가도 엉뚱한 곳에 끼어들지 않는다.
      const sessionId = peekCurrentId() ?? undefined
      setBusy('원문을 읽고 핵심을 정리하는 중…')
      try {
        // 정리 내용도 문서 근거에서 나와야 하므로 /ask를 그대로 태운다.
        // 형식 지시문은 요청에만 붙이고 화면에는 사용자가 친 말 그대로 남긴다.
        const res = await send(
          `${text} 사업 개요·참가자격·제출 서류·평가 기준 순으로, 원문 근거만 써서 정리해줘.`,
          { displayText: text },
        )
        if (!res) return
        const id = `sum-${target.doc_id}`
        addFile({
          id,
          type: 'doc',
          title: `핵심 정리 — ${target.사업명 ?? target.doc_id}`,
          sub: '대화에서 생성',
          meta: `${target.사업명 ?? target.doc_id} · 원문 기준`,
          body: res.answer,
        })
        pushLocal('assistant', '정리한 내용을 파일로도 저장했어요.', {
          meta: { fileIds: [id] },
          sessionId,
        })
        open(genKey(id))
      } finally {
        setBusy(null)
      }
    },
    [docs, send, addFile, pushLocal, open, peekCurrentId],
  )

  /** 판정 결과 → 리포트 카드 + 저장할 본문. */
  const buildReport = useCallback(
    (
      title: string,
      result: EligibilityResult,
    ): { card: Extract<MessageCard, { kind: 'report' }>; body: string } => {
      const badge = verdictBadge(result.verdict, result.unclear_count, result.missing_count)
      const reportItems: ReportItem[] = [
        ...result.met.map<ReportItem>((m) => ({
          state: 'ok',
          text: m.requirement,
          why: m.reason,
        })),
        ...result.unmet.map<ReportItem>((m) => ({
          state: 'miss',
          text: m.requirement,
          why: m.reason,
        })),
      ]
      if (result.unclear_count > 0) {
        reportItems.push({
          state: 'unclear',
          text: `프로필에 언급이 없어 확인 못 한 요건 ${result.unclear_count}건`,
          why: '보유하고 계시면 프로필에서 체크해 주세요 — 체크하면 다시 판정해 드려요',
        })
      }
      const note = `요건 ${result.total}건 중 ${result.met.length}건 확인, ${result.unmet.length}건 미충족, ${result.unclear_count}건 미확인이에요. 근거가 없는 항목은 충족으로 치지 않았어요.`
      const body =
        `■ 판정: ${badge.label}\n\n` +
        reportItems
          .map(
            (x) =>
              `${x.state === 'ok' ? '🟢' : x.state === 'miss' ? '🔴' : '🟡'} ${x.text}\n   ${x.why}`,
          )
          .join('\n') +
        `\n\n■ 유의\n· ${note}\n· 1순위 선정 ≠ 계약. 자격은 계약체결일까지 유지해야 합니다.`
      return {
        card: {
          kind: 'report',
          title,
          verdict: badge.label,
          tone: badge.tone,
          items: reportItems,
          note,
        },
        body,
      }
    },
    [],
  )

  /** 아직 체크 안 한 자격 — 확인 질문의 선택지가 된다. */
  const uncheckedQualifications = useMemo(
    () => QUALIFICATION_OPTIONS.filter((q) => !profile.qualifications.includes(q)),
    [profile.qualifications],
  )

  // fetchEligibility가 도는 몇 초 사이 사용자가 다른 대화로 넘어갈 수 있다 — sessionId를
  // 받아 판정 결과가 항상 그 흐름을 시작한 세션에 남도록 한다(추천 대조와 같은 원리,
  // QA 라운드 4에서 마저 적용).
  const judge = useCallback(
    async (docId: string, title: string, profileText: string, sessionId?: string) => {
      const result = await fetchEligibility(docId, profileText)
      const { card, body } = buildReport(title, result)
      pushLocal('assistant', '', { card, sessionId })
      const id = `ready-${docId}`
      addFile({
        id,
        type: 'doc',
        title: `준비 점검 — ${title}`,
        sub: '대화에서 생성',
        meta: `${title} · 회사 프로필 기준`,
        body,
      })
      pushLocal('assistant', '점검 결과를 파일로도 저장했어요.', {
        meta: { fileIds: [id] },
        sessionId,
      })
      return result
    },
    [buildReport, pushLocal, addFile],
  )

  const runReady = useCallback(
    async (text = '입찰 준비 상태 점검해줘') => {
      const target = docs[0]
      if (!target) return
      pushLocal('user', text)
      const sessionId = peekCurrentId() ?? undefined
      if (!matchText.trim()) {
        pushLocal(
          'assistant',
          '판정하려면 회사 프로필이 필요해요. 왼쪽 아래 “내 회사 프로필”을 먼저 채워주세요.',
          { sessionId },
        )
        return
      }
      const title = target.사업명 ?? target.doc_id
      setBusy('공고 요건을 뽑아 프로필과 대조하는 중…')
      try {
        await judge(target.doc_id, title, matchText, sessionId)
        // 확인 못 한 자격이 남아 있으면 되묻는다. 프로토타입의 확인 질문과 같은 자리인데,
        // 물어보는 항목이 지어낸 게 아니라 프로필에서 실제로 체크가 빠진 것들이다.
        if (uncheckedQualifications.length > 0) {
          pushLocal('assistant', '', {
            card: {
              kind: 'ask',
              question:
                '프로필에 체크가 빠진 자격이 있어요. 실제로 보유하고 계신 게 있으면 골라주세요 — 프로필에 반영해서 다시 판정해 드릴게요.',
              options: [...uncheckedQualifications, NO_MATCH],
            },
            sessionId,
          })
        }
      } catch (err) {
        pushLocal(
          'assistant',
          err instanceof ApiError ? err.message : '참가자격을 판정하지 못했습니다.',
          { sessionId },
        )
      } finally {
        setBusy(null)
      }
    },
    [docs, matchText, judge, uncheckedQualifications, pushLocal, peekCurrentId],
  )

  const answerAsk = useCallback(
    async (messageId: string, option: string) => {
      // 이 확인 질문 카드를 누른 시점의 세션 — judge()가 다시 판정한 결과도 이 세션에 남아야
      // 한다(누른 뒤 답이 오는 몇 초 사이 다른 대화로 넘어갈 수 있음).
      const sessionId = peekCurrentId() ?? undefined
      patchCard(messageId, { answered: option }, sessionId)
      pushLocal('user', option, { sessionId })
      if (option === NO_MATCH) {
        pushLocal(
          'assistant',
          '알겠습니다. 확인 못 한 요건은 그대로 “미확인”으로 남겨둘게요 — 없는 걸로 처리하지 않았어요.',
          { sessionId },
        )
        return
      }
      const target = docs[0]
      const nextQualifications = [...profile.qualifications, option]
      setProfile({ qualifications: nextQualifications })
      if (!target) return
      // 프로필이 바뀌었으니 같은 문서를 다시 판정한다. combinedText는 다음 렌더에야
      // 갱신되므로, 방금 고른 자격을 넣은 텍스트를 여기서 직접 만들어 넘긴다.
      const profileText = [matchText, `- ${option}`].join('\n')
      setBusy('바뀐 프로필로 다시 판정하는 중…')
      try {
        await judge(target.doc_id, target.사업명 ?? target.doc_id, profileText, sessionId)
      } catch (err) {
        pushLocal(
          'assistant',
          err instanceof ApiError ? err.message : '다시 판정하지 못했습니다.',
          {
            sessionId,
          },
        )
      } finally {
        setBusy(null)
      }
    },
    [
      patchCard,
      pushLocal,
      docs,
      profile.qualifications,
      setProfile,
      matchText,
      judge,
      peekCurrentId,
    ],
  )

  const pickCandidate = useCallback(
    async (label: string) => {
      await send(`${label} 공고에 대해 답해줘`)
    },
    [send],
  )

  const value = useMemo<ChatFlowsValue>(
    () => ({ runReco, runCompare, runSummary, runReady, answerAsk, pickCandidate, busy }),
    [runReco, runCompare, runSummary, runReady, answerAsk, pickCandidate, busy],
  )

  return <ChatFlowsContext.Provider value={value}>{children}</ChatFlowsContext.Provider>
}

export function useChatFlows(): ChatFlowsValue {
  const ctx = useContext(ChatFlowsContext)
  if (!ctx) throw new Error('useChatFlows는 ChatFlowsProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
