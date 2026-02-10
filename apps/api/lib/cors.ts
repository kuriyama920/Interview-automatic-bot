/**
 * CORS ユーティリティ
 * Electron アプリとWebからの安全なアクセスを許可
 */

import { VercelResponse } from '@vercel/node'
import { ALLOWED_ORIGINS } from './allowed-origins'

/**
 * CORSヘッダーを設定
 * @param res Vercel Response
 * @param origin リクエストのOriginヘッダー
 * @returns true if origin is allowed, false otherwise
 */
export function setCorsHeaders(res: VercelResponse, origin: string | null | undefined): boolean {
  // 許可するメソッドとヘッダー
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400') // 24時間キャッシュ

  // Electronアプリ（originがnull、undefined、または空）の場合
  // JWTトークンで認証されるため、レスポンスを返すことは許可
  // ただし、クレデンシャル付きのリクエストには対応しない
  if (!origin || origin === 'null') {
    // Electronアプリの場合、特定のオリジンを返す代わりに
    // Access-Control-Allow-Originを設定しない
    // これにより、ブラウザからの攻撃を防ぎつつElectronは動作する
    return true
  }

  // 許可されたオリジンかチェック
  if ((ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    return true
  }

  // 許可されていないオリジン
  return false
}

/**
 * OPTIONSリクエスト（プリフライト）を処理
 */
export function handlePreflight(res: VercelResponse, origin: string | null | undefined): void {
  setCorsHeaders(res, origin)
  res.status(200).end()
}
