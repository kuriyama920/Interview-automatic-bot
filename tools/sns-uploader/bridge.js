/**
 * video-shorts (Node.js) → sns-uploader (Python) ブリッジ
 *
 * 既存の Remotion パイプラインから生成された動画を
 * Python の非公式 SNS ライブラリで投稿する
 *
 * 使い方:
 *   node bridge.js post --video <path> --platforms x,instagram,tiktok
 *   node bridge.js post-latest --platforms x,instagram,tiktok
 *   node bridge.js status
 */

import { execSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** OS に応じた Python パスを解決 */
function findPython() {
  // 1. venv (Windows)
  const winVenv = resolve(__dirname, 'venv', 'Scripts', 'python.exe')
  if (existsSync(winVenv)) return winVenv

  // 2. venv (Linux/macOS)
  const unixVenv = resolve(__dirname, 'venv', 'bin', 'python')
  if (existsSync(unixVenv)) return unixVenv

  // 3. GitHub Actions / システム Python
  return 'python'
}

const PYTHON = findPython()
const MAIN_PY = resolve(__dirname, 'main.py')

function run() {
  if (PYTHON !== 'python' && !existsSync(PYTHON)) {
    console.error('Python venv が見つかりません。セットアップしてください:')
    console.error('  cd tools/sns-uploader && python -m venv venv')
    console.error('  venv/Scripts/pip install -r requirements.txt  (Windows)')
    console.error('  venv/bin/pip install -r requirements.txt      (Linux/macOS)')
    process.exit(1)
  }

  // CLI引数をそのまま Python に渡す
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log('使い方:')
    console.log('  node bridge.js post --video <path> --platforms x,instagram,tiktok')
    console.log('  node bridge.js post-latest --platforms x,instagram,tiktok')
    console.log('  node bridge.js status')
    process.exit(0)
  }

  const cmd = `"${PYTHON}" "${MAIN_PY}" ${args.join(' ')}`

  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: __dirname,
      env: { ...process.env },
    })
  } catch (error) {
    process.exit(error.status || 1)
  }
}

run()
