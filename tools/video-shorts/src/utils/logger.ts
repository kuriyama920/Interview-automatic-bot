/**
 * Winston ロガー
 */

import { createLogger, format, transports } from 'winston'
import { LOG_LEVEL } from '../config.js'

export const logger = createLogger({
  level: LOG_LEVEL,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const base = `[${timestamp}] ${level.toUpperCase()}: ${message}`
      return stack ? `${base}\n${stack}` : base
    })
  ),
  transports: [new transports.Console()],
})
