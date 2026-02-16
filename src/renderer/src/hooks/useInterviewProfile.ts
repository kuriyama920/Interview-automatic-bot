import { useState, useCallback, useEffect, useRef } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('useInterviewProfile')

interface UseInterviewProfileReturn {
  profile: InterviewProfile | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  saveProfile: (data: InterviewProfile) => Promise<boolean>
  refreshProfile: () => Promise<void>
}

export function useInterviewProfile(): UseInterviewProfileReturn {
  const [profile, setProfile] = useState<InterviewProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refreshProfile = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electron.profile.get()
      if (mountedRef.current) {
        if (result.success) {
          setProfile(result.profile || null)
        } else {
          setError(result.error || 'Failed to fetch profile')
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        log.error('Failed to fetch profile', { error: message })
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  const saveProfile = useCallback(async (data: InterviewProfile): Promise<boolean> => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await window.electron.profile.save(data)
      if (mountedRef.current) {
        if (result.success) {
          setProfile(result.interviewProfile || data)
          log.info('Profile saved successfully')
          return true
        } else {
          setError(result.error || 'Failed to save profile')
          log.error('Failed to save profile', { error: result.error })
          return false
        }
      }
      return false
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        log.error('Failed to save profile', { error: message })
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsSaving(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refreshProfile()
    return () => {
      mountedRef.current = false
    }
  }, [refreshProfile])

  return {
    profile,
    isLoading,
    isSaving,
    error,
    saveProfile,
    refreshProfile,
  }
}
