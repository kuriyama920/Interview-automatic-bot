/**
 * YouTube OAuth 2.0 初回認証スクリプト
 *
 * ローカルHTTPサーバーを起動してリダイレクトを受け取り、
 * リフレッシュトークンを自動取得 → .env に書き込む
 */

import { google } from 'googleapis'
import { createServer } from 'http'
import { URL } from 'url'
import { readFile, writeFile } from 'fs/promises'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(__dirname, '..', '..', '.env')

config({ path: ENV_PATH })

const PORT = 8976
const REDIRECT_URI = `http://localhost:${PORT}/callback`

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
]

async function main() {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('エラー: YOUTUBE_CLIENT_ID と YOUTUBE_CLIENT_SECRET を .env に設定してください')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('\n=== YouTube OAuth 2.0 認証 ===\n')
  console.log('ブラウザが自動で開きます。開かない場合は以下のURLをブラウザで開いてください:')
  console.log(`\n${authUrl}\n`)

  // ブラウザを開く（Windowsでは start "" "url" 形式が必要）
  if (process.platform === 'win32') {
    exec(`start "" "${authUrl}"`)
  } else {
    const openCmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
    exec(`${openCmd} "${authUrl}"`)
  }

  // コールバックサーバー起動
  const code = await waitForCallback()

  console.log('認証コードを受信しました。トークンを取得中...')

  try {
    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.refresh_token) {
      console.error('\n警告: リフレッシュトークンが取得できませんでした。')
      console.error('Google Cloud Console > セキュリティ でアプリのアクセスを取り消してから再試行してください。')
      process.exit(1)
    }

    // .env ファイルに書き込み
    const envContent = await readFile(ENV_PATH, 'utf-8')
    const updatedContent = envContent.replace(
      /YOUTUBE_REFRESH_TOKEN=.*/,
      `YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`
    )
    await writeFile(ENV_PATH, updatedContent, 'utf-8')

    console.log('\n=== 認証成功 ===\n')
    console.log('.env に YOUTUBE_REFRESH_TOKEN を自動保存しました。')
    console.log(`\nリフレッシュトークン: ${tokens.refresh_token}\n`)
    console.log('GitHub Actions Secrets にも追加してください:')
    console.log(`  Name: YOUTUBE_REFRESH_TOKEN`)
    console.log(`  Value: ${tokens.refresh_token}`)
    console.log('')
  } catch (error) {
    console.error('トークン取得エラー:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<h1>認証が拒否されました</h1><p>ブラウザを閉じて再試行してください。</p>')
          server.close()
          reject(new Error(`OAuth error: ${error}`))
          return
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<h1>認証成功!</h1><p>このウィンドウを閉じてターミナルに戻ってください。</p>')
          server.close()
          resolve(code)
          return
        }
      }

      res.writeHead(404)
      res.end('Not Found')
    })

    server.listen(PORT, () => {
      console.log(`認証コールバックサーバー起動: http://localhost:${PORT}`)
      console.log('ブラウザでの認証を待っています...\n')
    })

    // 5分でタイムアウト
    setTimeout(() => {
      server.close()
      reject(new Error('認証がタイムアウトしました（5分）'))
    }, 300000)
  })
}

main()
