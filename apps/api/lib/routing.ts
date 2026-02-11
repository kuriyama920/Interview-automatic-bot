/**
 * Vercel Serverless Functions 統合ルーティング用ヘルパー
 * vercel.json の rewrites で付与される __route クエリパラメータを取得する。
 */

import { VercelRequest } from '@vercel/node'

/**
 * vercel.json rewrites で設定された __route パラメータを取得
 */
export function getRoute(req: VercelRequest): string {
  const route = req.query.__route
  return typeof route === 'string' ? route : ''
}
