/**
 * トークンストレージサービス
 * safeStorage API を使用してJWTトークンを安全に暗号化保存
 *
 * - safeStorage利用可能時: Windows DPAPI / macOS Keychain で暗号化
 * - safeStorage利用不可時: プレーンテキストで保存（フォールバック）
 * - electron-store は encryptionKey なしで使用（暗号化はsafeStorageが担当）
 */

import Store from 'electron-store'
import { safeStorage } from 'electron'
import { createLogger } from './logger.service'
import type { AuthTokens } from '../types/auth'
import type { User } from '../types/shared'

const log = createLogger('token-storage')

interface TokenStoreSchema {
  tokens: string | null
  user: string | null
}

class TokenStorage {
  private store: Store<TokenStoreSchema> | null = null
  private encryptionAvailable = false

  initialize(): void {
    this.store = new Store<TokenStoreSchema>({
      name: 'auth-safe',
      defaults: {
        tokens: null,
        user: null,
      },
    })

    try {
      this.encryptionAvailable = safeStorage.isEncryptionAvailable()
    } catch (error) {
      log.error('safeStorage.isEncryptionAvailable() failed, falling back to plaintext', {
        error: String(error),
      })
      this.encryptionAvailable = false
    }
    log.info('TokenStorage initialized', { encryptionAvailable: this.encryptionAvailable })
  }

  getTokens(): AuthTokens | null {
    if (!this.store) {
      log.error('TokenStorage.getTokens called before initialize()')
      return null
    }

    const stored = this.store.get('tokens')
    if (!stored) return null

    try {
      if (this.encryptionAvailable) {
        const buffer = Buffer.from(stored, 'base64')
        const decrypted = safeStorage.decryptString(buffer)
        return JSON.parse(decrypted) as AuthTokens
      }
      return JSON.parse(stored) as AuthTokens
    } catch (error) {
      log.error('Failed to decrypt tokens, clearing corrupt data', { error: String(error) })
      this.store.delete('tokens')
      return null
    }
  }

  setTokens(tokens: AuthTokens): void {
    if (!this.store) {
      log.error('TokenStorage.setTokens called before initialize()')
      return
    }

    const serialized = JSON.stringify(tokens)

    if (this.encryptionAvailable) {
      const encrypted = safeStorage.encryptString(serialized)
      this.store.set('tokens', encrypted.toString('base64'))
    } else {
      log.warn('safeStorage unavailable, storing tokens in plaintext')
      this.store.set('tokens', serialized)
    }
  }

  getUser(): User | null {
    if (!this.store) {
      log.error('TokenStorage.getUser called before initialize()')
      return null
    }

    try {
      const stored = this.store.get('user')
      if (!stored) return null

      if (this.encryptionAvailable) {
        try {
          const buffer = Buffer.from(stored as string, 'base64')
          const decrypted = safeStorage.decryptString(buffer)
          return JSON.parse(decrypted) as User
        } catch {
          // Fallback: handle legacy plaintext object format
          if (typeof stored === 'object') {
            return stored as User
          }
          log.warn('Failed to decrypt user data, clearing')
          this.store.delete('user')
          return null
        }
      } else {
        if (typeof stored === 'string') {
          return JSON.parse(stored) as User
        }
        return stored as User
      }
    } catch {
      log.warn('Failed to read user data')
      return null
    }
  }

  setUser(user: User): void {
    if (!this.store) {
      log.error('TokenStorage.setUser called before initialize()')
      return
    }

    const serialized = JSON.stringify(user)

    if (this.encryptionAvailable) {
      const encrypted = safeStorage.encryptString(serialized)
      this.store.set('user', encrypted.toString('base64'))
    } else {
      log.warn('safeStorage unavailable, storing user data in plaintext')
      this.store.set('user', serialized)
    }
  }

  deleteTokens(): void {
    if (!this.store) {
      log.error('TokenStorage.deleteTokens called before initialize()')
      return
    }
    this.store.delete('tokens')
  }

  deleteUser(): void {
    if (!this.store) {
      log.error('TokenStorage.deleteUser called before initialize()')
      return
    }
    this.store.delete('user')
  }
}

export const tokenStorage = new TokenStorage()
