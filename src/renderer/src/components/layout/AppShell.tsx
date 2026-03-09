/**
 * アプリケーションシェル
 * サイドバー + メインコンテンツ領域
 */

import { useNavigation } from '../../contexts/NavigationContext'
import { Sidebar } from './Sidebar'
import { DashboardPage } from '../pages/DashboardPage'
import { InterviewPage } from '../pages/InterviewPage'
import { DocumentsPage } from '../pages/DocumentsPage'
import { QuestionsPage } from '../pages/QuestionsPage'
import { ProfilePage } from '../pages/ProfilePage'
import { SubscriptionPage } from '../pages/SubscriptionPage'

function PageContent() {
  const { currentPage } = useNavigation()

  return (
    <div className="h-full animate-fade-in" key={currentPage}>
      {currentPage === 'dashboard' && <DashboardPage />}
      {currentPage === 'interview' && <InterviewPage />}
      {currentPage === 'documents' && <DocumentsPage />}
      {currentPage === 'questions' && <QuestionsPage />}
      {currentPage === 'profile' && <ProfilePage />}
      {currentPage === 'subscription' && <SubscriptionPage />}
    </div>
  )
}

export function AppShell() {
  return (
    <div className="h-full flex bg-surface-secondary overflow-hidden" data-theme="interview-light">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <PageContent />
      </main>
    </div>
  )
}
