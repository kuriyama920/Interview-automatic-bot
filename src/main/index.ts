import { app, BrowserWindow, shell, session, desktopCapturer } from 'electron'
import { join } from 'path'
import { config } from 'dotenv'
import { setupIPC } from './ipc'
import { authService } from '../services/auth.service'

// .envファイルを読み込む（process.cwdを使用 - 開発時はプロジェクトルート）
const envPath = join(process.cwd(), '.env')
const envResult = config({ path: envPath })
console.log('[Main] .env path:', envPath)
console.log('[Main] .env load result:', envResult.error ? 'FAILED' : 'SUCCESS')
console.log('[Main] DEEPGRAM_API_KEY found:', !!process.env.DEEPGRAM_API_KEY)

// Deep Linkプロトコル
const PROTOCOL = 'interview-bot'

// デフォルトプロトコルクライアントとして登録
if (!app.isPackaged) {
  // 開発環境でのプロトコル設定
  if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      join(process.cwd(), 'node_modules', 'electron', 'dist', 'electron.exe'),
    ])
  } else if (process.platform === 'linux') {
    // Linux: 開発環境ではelectronのパスを指定
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.cwd()])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// Deep Linkを処理
function handleDeepLink(url: string): void {
  console.log('[Main] Deep link received:', url)

  // 認証コールバックを処理
  if (url.startsWith(`${PROTOCOL}://auth/callback`)) {
    authService.handleAuthCallback(url).catch((error) => {
      console.error('[Main] Failed to handle auth callback:', error)
    })
  }
}

function createWindow(): typeof BrowserWindow.prototype {
  const isDev = !app.isPackaged

  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details: { url: string }) => {
    shell.openExternal(details.url)
    return { action: 'deny' as const }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Windows: セカンドインスタンスからのDeep Linkを処理
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Windows: コマンドライン引数からプロトコルURLを取得
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (url) {
      handleDeepLink(url)
    }

    // メインウィンドウをフォーカス
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.interview-bot')

    const mainWindow = createWindow()

    // AuthServiceを初期化
    authService.initialize(mainWindow)

    setupIPC(mainWindow)

    // システム音声キャプチャを有効化（Phase 6.5）
    // getDisplayMedia() 呼び出し時にダイアログなしでシステム音声をキャプチャ
    session.defaultSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
          if (sources.length === 0) {
            console.error('[Main] No desktop sources available')
            callback({})
            return
          }
          // video: 画面ソース（APIの仕様上必須だがレンダラーで即停止）
          // audio: 'loopback' でシステム音声（Zoom/Teams等の相手の声）をキャプチャ
          callback({ video: sources[0], audio: 'loopback' })
        }).catch((error) => {
          console.error('[Main] Failed to get desktop sources:', error)
          callback({})
        })
      },
      { useSystemPicker: false } // ユーザー選択ダイアログを表示しない
    )
    console.log('[Main] System audio capture (loopback) enabled')

    // macOS: open-urlイベントでDeep Linkを処理
    app.on('open-url', (_event, url) => {
      handleDeepLink(url)
    })

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        const newWindow = createWindow()
        authService.setMainWindow(newWindow)
        setupIPC(newWindow)
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
