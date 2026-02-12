/**
 * エラーメッセージ日本語変換ユーティリティ
 *
 * APIやサービスから返る英語エラーを、ユーザー向け日本語メッセージに変換。
 */

interface FormattedError {
  message: string
  hint?: string
}

/** パターン → 日本語変換テーブル（先頭から順にマッチ） */
const ERROR_PATTERNS: readonly { test: (error: string) => boolean; result: FormattedError }[] = [
  // トークン上限
  {
    test: (e) => e.includes('token') && e.includes('limit'),
    result: {
      message: '月間AIトークンの上限に達しました',
      hint: '月初にリセットされます。Proプランで上限が大幅に拡張されます。',
    },
  },
  // STT上限
  {
    test: (e) => e.includes('STT') && e.includes('limit') || e.includes('stt') && e.includes('exceeded'),
    result: {
      message: '月間の音声認識時間の上限に達しました',
      hint: '月初にリセットされます。Proプランで上限が大幅に拡張されます。',
    },
  },
  // ドキュメント上限
  {
    test: (e) => e.includes('document') && e.includes('limit'),
    result: {
      message: 'ドキュメントの登録上限に達しました',
      hint: '不要なドキュメントを削除するか、プランをアップグレードしてください。',
    },
  },
  // 認証
  {
    test: (e) => e.includes('Unauthorized') || e.includes('401') || e.includes('unauthorized'),
    result: {
      message: 'ログインが必要です',
      hint: 'セッションが切れた可能性があります。再ログインしてください。',
    },
  },
  // ネットワーク
  {
    test: (e) => e.includes('fetch') && e.includes('failed') || e.includes('NetworkError') || e.includes('network'),
    result: {
      message: 'サーバーに接続できませんでした',
      hint: 'インターネット接続を確認してください。',
    },
  },
  // タイムアウト
  {
    test: (e) => e.includes('timeout') || e.includes('Timeout'),
    result: {
      message: 'リクエストがタイムアウトしました',
      hint: 'しばらく待ってからもう一度お試しください。',
    },
  },
  // ドキュメントアップロード
  {
    test: (e) => e.includes('履歴書または求人票をアップロード'),
    result: {
      message: '履歴書または求人票が未登録です',
      hint: '先にコンテキストパネルからアップロードしてください。',
    },
  },
  // ドキュメント初期化
  {
    test: (e) => e.includes('Failed to initialize'),
    result: {
      message: 'サービスの初期化に失敗しました',
      hint: 'アプリを再起動してください。',
    },
  },
  // ドキュメントアップロード失敗
  {
    test: (e) => e.includes('Failed to upload') || e.includes('Upload failed'),
    result: {
      message: 'ファイルのアップロードに失敗しました',
      hint: 'ファイル形式（PDF/DOCX）とサイズ（10MB以下）を確認してください。',
    },
  },
  // ドキュメント削除
  {
    test: (e) => e.includes('Failed to remove') || e.includes('Failed to delete'),
    result: {
      message: '削除に失敗しました',
      hint: 'もう一度お試しください。',
    },
  },
  // AI生成失敗
  {
    test: (e) => e.includes('Failed to generate') || e.includes('AI returned empty'),
    result: {
      message: 'AIの回答生成に失敗しました',
      hint: 'しばらく待ってからもう一度お試しください。',
    },
  },
  // AIパース
  {
    test: (e) => e.includes('Failed to parse') || e.includes('Invalid AI response'),
    result: {
      message: 'AIの回答を処理できませんでした',
      hint: 'もう一度お試しください。',
    },
  },
  // Checkout失敗
  {
    test: (e) => e.includes('Checkout') || e.includes('checkout'),
    result: {
      message: '決済ページを開けませんでした',
      hint: 'しばらく待ってからもう一度お試しください。',
    },
  },
  // Customer Portal
  {
    test: (e) => e.includes('Customer Portal') || e.includes('portal'),
    result: {
      message: '管理画面を開けませんでした',
      hint: 'しばらく待ってからもう一度お試しください。',
    },
  },
  // Googleログイン
  {
    test: (e) => e.includes('Google') || e.includes('OAuth') || e.includes('login'),
    result: {
      message: 'ログインに失敗しました',
      hint: 'しばらく待ってからもう一度お試しください。',
    },
  },
  // 保存失敗
  {
    test: (e) => e.includes('Save failed') || e.includes('Failed to save'),
    result: {
      message: '保存に失敗しました',
      hint: 'もう一度お試しください。',
    },
  },
  // 音声ソース
  {
    test: (e) => e.includes('audio') || e.includes('音声'),
    result: {
      message: '音声の処理に失敗しました',
      hint: '音声ソースの設定を確認してください。',
    },
  },
]

/**
 * エラーメッセージをユーザー向け日本語に変換
 *
 * 既に日本語のメッセージはそのまま返す。
 * 英語のエラーはパターンマッチで変換。
 */
export function formatErrorMessage(error: string): FormattedError {
  if (!error) return { message: 'エラーが発生しました' }

  // "Error: " プレフィックスを除去
  const cleaned = error.replace(/^Error:\s*/i, '').trim()

  // パターンマッチ
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(cleaned.toLowerCase())) {
      return pattern.result
    }
  }

  // 既に日本語ならそのまま返す（ひらがな/カタカナ/漢字を含む）
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(cleaned)) {
    return { message: cleaned }
  }

  // マッチしない英語エラー
  return {
    message: 'エラーが発生しました',
    hint: 'しばらく待ってからもう一度お試しください。',
  }
}
