/**
 * Stripe Checkout キャンセルページ
 * GET /api/stripe/cancel
 *
 * Checkout をキャンセルした場合にリダイレクトされる HTML ページ。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>決済キャンセル - Interview Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      background: #f9fafb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }

    .bg-decoration {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.5;
      pointer-events: none;
    }
    .bg-1 {
      width: 400px;
      height: 400px;
      background: rgba(249, 115, 22, 0.12);
      top: -100px;
      right: -100px;
    }
    .bg-2 {
      width: 300px;
      height: 300px;
      background: rgba(59, 130, 246, 0.1);
      bottom: -50px;
      left: -50px;
    }

    .container {
      position: relative;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 3rem;
      border-radius: 1.5rem;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
      text-align: center;
      max-width: 420px;
      width: 90%;
      animation: fadeIn 0.4s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .icon-wrapper {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(249, 115, 22, 0.05));
      border-radius: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(249, 115, 22, 0.2);
    }

    .icon {
      width: 40px;
      height: 40px;
      color: #f97316;
    }

    h1 {
      color: #111827;
      margin-bottom: 0.5rem;
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    .description {
      color: #6b7280;
      font-size: 0.95rem;
      margin-bottom: 2rem;
    }

    .hint {
      font-size: 0.875rem;
      color: #6b7280;
      background: #f3f4f6;
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      line-height: 1.6;
    }

    .close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .brand {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: #9ca3af;
      font-size: 0.8rem;
    }

    .brand-icon {
      width: 20px;
      height: 20px;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-icon svg {
      width: 12px;
      height: 12px;
      color: #3b82f6;
    }
  </style>
</head>
<body>
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>

  <div class="container">
    <div class="icon-wrapper">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>

    <h1>決済がキャンセルされました</h1>
    <p class="description">プランの変更は行われていません</p>

    <div class="hint">
      このウィンドウを閉じて、Interview Bot アプリに戻ってください。いつでもプランをアップグレードできます。
    </div>

    <button class="close-btn" onclick="window.close()">
      ウィンドウを閉じる
    </button>

    <div class="brand">
      <div class="brand-icon">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
      Interview Bot
    </div>
  </div>
</body>
</html>
  `
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(html)
}
