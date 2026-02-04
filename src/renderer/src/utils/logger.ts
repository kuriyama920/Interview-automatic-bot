// レンダラープロセス用の軽量ロガー
// 本番環境ではログを無効化

const isDev = import.meta.env.DEV

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function formatMessage(namespace: string, message: string): string {
  const timestamp = new Date().toISOString().slice(11, 23)
  return `${timestamp} [${namespace}] ${message}`
}

function log(level: LogLevel, namespace: string, message: string, ...args: unknown[]): void {
  if (!isDev && level !== 'error') return

  const formattedMessage = formatMessage(namespace, message)
  switch (level) {
    case 'debug':
      console.debug(formattedMessage, ...args)
      break
    case 'info':
      console.info(formattedMessage, ...args)
      break
    case 'warn':
      console.warn(formattedMessage, ...args)
      break
    case 'error':
      console.error(formattedMessage, ...args)
      break
  }
}

export function createLogger(namespace: string) {
  return {
    debug: (message: string, ...args: unknown[]) => log('debug', namespace, message, ...args),
    info: (message: string, ...args: unknown[]) => log('info', namespace, message, ...args),
    warn: (message: string, ...args: unknown[]) => log('warn', namespace, message, ...args),
    error: (message: string, ...args: unknown[]) => log('error', namespace, message, ...args),
  }
}
