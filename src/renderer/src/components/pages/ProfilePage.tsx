/**
 * プロフィールページ
 * 面接プロフィール編集（全画面幅）
 */

import { ProfileTab } from '../ProfileTab'
import { PageHeader } from '../ui/PageHeader'

export function ProfilePage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="プロフィール"
        subtitle="面接プロフィール情報を設定して、AIの回答精度を向上"
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          <ProfileTab />
        </div>
      </div>
    </div>
  )
}
