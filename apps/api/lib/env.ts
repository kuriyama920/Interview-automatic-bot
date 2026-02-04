/**
 * 環境変数バリデーション
 * 必須環境変数が設定されているか起動時にチェック
 */

interface EnvConfig {
  // Google OAuth
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string

  // JWT
  JWT_SECRET: string

  // Supabase
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

const REQUIRED_ENV_VARS: (keyof EnvConfig)[] = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
]

/**
 * 環境変数を検証
 * @throws Error 必須環境変数が不足している場合
 */
export function validateEnv(): void {
  const missingVars: string[] = []

  // 基本的な必須環境変数
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missingVars.push(varName)
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}`
    console.error(errorMessage)
    throw new Error(errorMessage)
  }
}

/**
 * 環境変数を安全に取得
 */
export function getEnv<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`)
  }
  return value as EnvConfig[K]
}

/**
 * 環境変数を取得（デフォルト値あり）
 */
export function getEnvOrDefault<K extends keyof EnvConfig>(key: K, defaultValue: string): string {
  return process.env[key] || defaultValue
}
