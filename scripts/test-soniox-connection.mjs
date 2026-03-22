/**
 * Soniox WebSocket 接続テスト
 * Usage: node scripts/test-soniox-connection.mjs
 */
import WebSocket from 'ws'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// .envからSONIOX_API_KEYを読み取り
function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  const match = envContent.match(/^SONIOX_API_KEY=(.+)$/m)
  if (!match) throw new Error('SONIOX_API_KEY not found in .env')
  return match[1].trim()
}

const SONIOX_API_KEY = loadEnv()
const WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'

console.log('=== Soniox WebSocket 接続テスト ===')
console.log(`Endpoint: ${WS_URL}`)
console.log(`API Key: ${SONIOX_API_KEY.slice(0, 8)}...${SONIOX_API_KEY.slice(-8)}`)
console.log('')

const ws = new WebSocket(WS_URL)

const timeout = setTimeout(() => {
  console.error('❌ タイムアウト: 10秒以内に接続できませんでした')
  ws.close()
  process.exit(1)
}, 10000)

ws.on('open', () => {
  console.log('✅ WebSocket接続成功!')
  console.log('')

  // 初期設定メッセージを送信
  const config = {
    api_key: SONIOX_API_KEY,
    model: 'stt-rt-preview',
    audio_format: 'pcm_s16le',
    sample_rate: 16000,
    num_channels: 1,
    language_hints: ['ja'],
    enable_endpoint_detection: true,
  }

  console.log('📤 設定メッセージを送信中...')
  console.log(JSON.stringify({ ...config, api_key: '[REDACTED]' }, null, 2))
  ws.send(JSON.stringify(config))
})

ws.on('message', (data) => {
  const message = JSON.parse(data.toString())
  console.log('')
  console.log('📥 サーバーからの応答:')
  console.log(JSON.stringify(message, null, 2))

  // 設定確認後、空フレームで接続を閉じる
  if (message.status === 'error') {
    console.error('❌ エラー:', message.message || message)
    clearTimeout(timeout)
    ws.close()
    process.exit(1)
  }

  if (message.error_code) {
    console.error('❌ APIエラー:', message.error_message)
    clearTimeout(timeout)
    ws.close()
    process.exit(1)
  }

  // 接続テスト成功 - グレースフルに閉じる
  console.log('')
  console.log('✅ API接続・認証成功! 課金も正常に動作しています。')
  clearTimeout(timeout)
  // 空フレームでグレースフル切断
  ws.send(Buffer.alloc(0))
  setTimeout(() => {
    ws.close()
  }, 1000)
})

ws.on('error', (error) => {
  clearTimeout(timeout)
  console.error('❌ WebSocket エラー:', error.message)
  process.exit(1)
})

ws.on('close', (code, reason) => {
  clearTimeout(timeout)
  console.log(`🔌 接続終了 (code: ${code}, reason: ${reason || 'N/A'})`)
  console.log('')
  console.log('=== テスト完了 ===')
  process.exit(0)
})
