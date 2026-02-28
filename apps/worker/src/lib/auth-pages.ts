/**
 * 認証ページ HTML テンプレート
 * Hono: HTML文字列を返す（c.html()で使用）
 */

/**
 * HTMLエスケープ
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * 認証成功ページ HTML を生成
 */
export function getSuccessPageHtml(userName: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証成功 - Interview Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      background: #f9fafb; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      position: relative; overflow: hidden;
    }
    .bg-decoration { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.6; pointer-events: none; }
    .bg-1 { width: 400px; height: 400px; background: rgba(59,130,246,0.15); top: -100px; right: -100px; }
    .bg-2 { width: 300px; height: 300px; background: rgba(16,185,129,0.12); bottom: -50px; left: -50px; }
    .container {
      position: relative; background: rgba(255,255,255,0.85); backdrop-filter: blur(20px);
      padding: 3rem; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.06);
      box-shadow: 0 8px 32px rgba(0,0,0,0.08); text-align: center; max-width: 420px; width: 90%;
      animation: fadeIn 0.4s ease-out;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .icon-wrapper {
      width: 80px; height: 80px; margin: 0 auto 1.5rem;
      background: linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.05));
      border-radius: 1.25rem; display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(16,185,129,0.2);
    }
    .icon { width: 40px; height: 40px; color: #10b981; }
    h1 { color: #111827; margin-bottom: 0.5rem; font-size: 1.5rem; font-weight: 600; }
    .welcome { color: #6b7280; font-size: 0.95rem; margin-bottom: 2rem; }
    .name { font-weight: 600; color: #3b82f6; }
    .hint { font-size: 0.875rem; color: #6b7280; background: #f3f4f6; padding: 1rem 1.25rem; border-radius: 0.75rem; line-height: 1.6; }
    .countdown { margin-top: 1.5rem; font-size: 0.75rem; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>
  <div class="container">
    <div class="icon-wrapper">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>
    <h1>認証が完了しました</h1>
    <p class="welcome">ようこそ、<span class="name">${escapeHtml(userName)}</span> さん</p>
    <div class="hint"><span style="margin-right:0.5rem;opacity:0.7">💡</span>このウィンドウを閉じて、アプリに戻ってください</div>
    <p class="countdown">このページは自動的に閉じられます...</p>
  </div>
  <script>setTimeout(function(){window.close();},5000);</script>
</body>
</html>`
}

/**
 * エラーページ HTML を生成
 */
export function getErrorPageHtml(error: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証エラー - Interview Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      background: #f9fafb; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      position: relative; overflow: hidden;
    }
    .bg-decoration { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.5; pointer-events: none; }
    .bg-1 { width: 400px; height: 400px; background: rgba(239,68,68,0.12); top: -100px; right: -100px; }
    .bg-2 { width: 300px; height: 300px; background: rgba(249,115,22,0.1); bottom: -50px; left: -50px; }
    .container {
      position: relative; background: rgba(255,255,255,0.85); backdrop-filter: blur(20px);
      padding: 3rem; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.06);
      box-shadow: 0 8px 32px rgba(0,0,0,0.08); text-align: center; max-width: 420px; width: 90%;
      animation: fadeIn 0.4s ease-out;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .icon-wrapper {
      width: 80px; height: 80px; margin: 0 auto 1.5rem;
      background: linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.05));
      border-radius: 1.25rem; display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(239,68,68,0.2);
    }
    .icon { width: 40px; height: 40px; color: #ef4444; }
    h1 { color: #111827; margin-bottom: 0.75rem; font-size: 1.5rem; font-weight: 600; }
    .error-message {
      color: #991b1b; font-size: 0.875rem; background: #fee2e2; padding: 0.75rem 1rem;
      border-radius: 0.5rem; margin-bottom: 1.5rem; font-family: ui-monospace, monospace; word-break: break-all;
    }
    .hint { font-size: 0.875rem; color: #6b7280; background: #f3f4f6; padding: 1rem 1.25rem; border-radius: 0.75rem; line-height: 1.6; }
    .retry-btn {
      display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 1.5rem; padding: 0.75rem 1.5rem;
      background: #3b82f6; color: white; border: none; border-radius: 0.5rem; font-size: 0.875rem;
      font-weight: 500; cursor: pointer; text-decoration: none;
    }
    .retry-btn:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>
  <div class="container">
    <div class="icon-wrapper">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h1>認証に失敗しました</h1>
    <div class="error-message">${escapeHtml(error)}</div>
    <div class="hint">このウィンドウを閉じて、アプリからもう一度ログインをお試しください</div>
    <button class="retry-btn" onclick="window.close()">ウィンドウを閉じる</button>
  </div>
</body>
</html>`
}
