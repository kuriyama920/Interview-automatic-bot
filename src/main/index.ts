import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { config } from 'dotenv'
import { setupIPC } from './ipc'

// .envファイルを読み込む（process.cwdを使用 - 開発時はプロジェクトルート）
const envPath = join(process.cwd(), '.env')
const envResult = config({ path: envPath })
console.log('[Main] .env path:', envPath)
console.log('[Main] .env load result:', envResult.error ? 'FAILED' : 'SUCCESS')
console.log('[Main] DEEPGRAM_API_KEY found:', !!process.env.DEEPGRAM_API_KEY)

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

app.whenReady().then(() => {
  app.setAppUserModelId('com.interview-bot')

  const mainWindow = createWindow()
  setupIPC(mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      const newWindow = createWindow()
      setupIPC(newWindow)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
