import { Navigate, Route, Routes } from 'react-router-dom'

import { OnboardingPage } from '@/pages/onboarding-page'
import { QuestionnairePage } from '@/pages/questionnaire-page'
import { RecommendationsPage } from '@/pages/recommendations-page'
import { RfpDetailPage } from '@/pages/rfp-detail-page'
import { MyPage } from '@/pages/my-page'

/**
 * 라우팅 — 와이어프레임 5화면(온보딩→질문→추천목록→상세채팅→마이페이지).
 * 화면 4(RfpDetailPage)만 실제 백엔드(/ask)와 연동되고, 나머지는 목업 데이터로 구조를 검증한다.
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/onboarding" replace />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/questionnaire" element={<QuestionnairePage />} />
      <Route path="/recommendations" element={<RecommendationsPage />} />
      <Route path="/rfp/:id" element={<RfpDetailPage />} />
      <Route path="/me" element={<MyPage />} />
      <Route path="*" element={<Navigate to="/onboarding" replace />} />
    </Routes>
  )
}

export default App
