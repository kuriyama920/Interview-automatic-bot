import winston from 'winston'

const isDev = process.env.NODE_ENV !== 'production'

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`
  })
)

const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
  ],
})

// 開発時のみファイル出力
if (isDev) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/app.log',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    })
  )
}

// 名前空間付きロガーを作成するファクトリー
export function createLogger(namespace: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(`[${namespace}] ${message}`, meta)
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(`[${namespace}] ${message}`, meta)
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(`[${namespace}] ${message}`, meta)
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(`[${namespace}] ${message}`, meta)
    },
  }
}
