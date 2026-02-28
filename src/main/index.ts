import { app, BrowserWindow, shell, session, desktopCapturer } from 'electron'
import { join, resolve } from 'path'
import { config } from 'dotenv'
import { setupIPC } from './ipc'
import { authService } from '../services/auth.service'
import { createLogger } from '../services/logger.service'

const log = createLogger('Main')

// .envファイルを読み込む（process.cwdを使用 - 開発時はプロジェクトルート）
const envPath = join(process.cwd(), '.env')
const envResult = config({ path: envPath })
log.info('.env load result', { path: envPath, success: !envResult.error })
log.debug('DEEPGRAM_API_KEY found', { found: !!process.env.DEEPGRAM_API_KEY })

// Deep Linkプロトコル
const PROTOCOL = 'interview-bot'

// デフォルトプロトコルクライアントとして登録
if (!app.isPackaged) {
  // 開発環境: コンパイル済みメインスクリプトを引数として渡す
  // process.argv[1] = electron-viteが生成した out/main/index.js のパス
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      resolve(process.argv[1]),
    ])
  } else {
    log.warn('Cannot register protocol: no main script in argv')
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// Deep Linkを処理
function handleDeepLink(url: string): void {
  log.info('Deep link received', { url: url.replace(/token=[^&]+/, 'token=[REDACTED]') })

  // 認証コールバックを処理
  if (url.startsWith(`${PROTOCOL}://auth/callback`)) {
    authService.handleAuthCallback(url).catch((error) => {
      log.error('Failed to handle auth callback', { error: String(error) })
    })
  }
}

function createWindow(): typeof BrowserWindow.prototype {
  const isDev = !app.isPackaged

  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.ico'),
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

    // AuthServiceを初期化（失敗してもアプリを継続させる）
    try {
      authService.initialize(mainWindow)
    } catch (error) {
      log.error('AuthService initialization failed', { error: String(error) })
    }

    setupIPC(mainWindow)

    // システム音声キャプチャを有効化（Phase 6.5）
    // getDisplayMedia() 呼び出し時にダイアログなしでシステム音声をキャプチャ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Electron 28 supports options param not yet in types
    ;(session.defaultSession.setDisplayMediaRequestHandler as any)(
      (_request: unknown, callback: (streams: { video?: unknown; audio?: string }) => void) => {
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
          if (sources.length === 0) {
            log.error('No desktop sources available')
            // 空オブジェクトでリクエストを拒否
            callback({})
            return
          }
          // video: 画面ソース（APIの仕様上必須だがレンダラーで即停止）
          // audio: 'loopback' でシステム音声（Zoom/Teams等の相手の声）をキャプチャ
          callback({ video: sources[0], audio: 'loopback' })
        }).catch((error) => {
          log.error('Failed to get desktop sources', { error: String(error) })
          // 空オブジェクトでリクエストを拒否
          callback({})
        })
      },
      { useSystemPicker: false } // ユーザー選択ダイアログを表示しない
    )
    log.info('System audio capture (loopback) enabled')

    // Windows: 初回起動時のDeep Link処理（process.argvからURLを取得）
    const deepLinkUrl = process.argv.find((arg) => arg.startsWith(`${PROTOCOL}://`))
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl)
    }

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
