import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useInterviewProfile } from '../../src/renderer/src/hooks/useInterviewProfile'

const mockProfile = window.electron.profile

describe('useInterviewProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockProfile.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      profile: null,
    })
    ;(mockProfile.save as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
    })
  })

  it('should start with loading state', () => {
    const { result } = renderHook(() => useInterviewProfile())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isSaving).toBe(false)
    expect(result.current.profile).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should load null profile when none exists', async () => {
    const { result } = renderHook(() => useInterviewProfile())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.profile).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should load existing profile', async () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      currentCompany: 'テスト株式会社',
    }
    ;(mockProfile.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      profile,
    })

    const { result } = renderHook(() => useInterviewProfile())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.profile).toEqual(profile)
  })

  it('should set error when fetch fails', async () => {
    ;(mockProfile.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'プロフィール取得エラー',
    })

    const { result } = renderHook(() => useInterviewProfile())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('プロフィール取得エラー')
  })

  it('should save profile successfully', async () => {
    const savedProfile: InterviewProfile = { fullName: '山田花子' }
    ;(mockProfile.save as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      interviewProfile: savedProfile,
    })

    const { result } = renderHook(() => useInterviewProfile())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let saveResult: boolean = false
    await act(async () => {
      saveResult = await result.current.saveProfile({ fullName: '山田花子' })
    })

    expect(saveResult).toBe(true)
    expect(result.current.isSaving).toBe(false)
    expect(result.current.profile).toEqual(savedProfile)
  })

  it('should set error when save fails', async () => {
    ;(mockProfile.save as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: '保存エラー',
    })

    const { result } = renderHook(() => useInterviewProfile())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let saveResult: boolean = true
    await act(async () => {
      saveResult = await result.current.saveProfile({ fullName: 'テスト' })
    })

    expect(saveResult).toBe(false)
    expect(result.current.error).toBe('保存エラー')
  })

  it('should refresh profile', async () => {
    const { result } = renderHook(() => useInterviewProfile())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.refreshProfile()
    })

    expect(mockProfile.get).toHaveBeenCalledTimes(2)
  })
})
