import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockUseInterviewProfile = vi.fn()

vi.mock('../../src/renderer/src/hooks/useInterviewProfile', () => ({
  useInterviewProfile: () => mockUseInterviewProfile(),
}))

import { ProfileTab } from '../../src/renderer/src/components/ProfileTab'

describe('ProfileTab', () => {
  const mockSaveProfile = vi.fn().mockResolvedValue(true)

  const defaultHookReturn = {
    profile: null as InterviewProfile | null,
    isLoading: false,
    isSaving: false,
    error: null as string | null,
    saveProfile: mockSaveProfile,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInterviewProfile.mockReturnValue(defaultHookReturn)
  })

  it('should show loading text when loading', () => {
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, isLoading: true })
    render(<ProfileTab />)
    expect(screen.getByText('読み込み中...')).toBeDefined()
  })

  it('should render basic info section', () => {
    render(<ProfileTab />)
    expect(screen.getByText('基本情報')).toBeDefined()
  })

  it('should render fullName input with label', () => {
    render(<ProfileTab />)
    expect(screen.getByText('氏名（必須）')).toBeDefined()
  })

  it('should render career sections', () => {
    render(<ProfileTab />)
    expect(screen.getByText('現職')).toBeDefined()
    expect(screen.getByText('志望先')).toBeDefined()
    expect(screen.getByText('経歴')).toBeDefined()
  })

  it('should render skills section', () => {
    render(<ProfileTab />)
    expect(screen.getByText('スキル・資格')).toBeDefined()
  })

  it('should render save button', () => {
    render(<ProfileTab />)
    expect(screen.getByText('プロフィールを保存')).toBeDefined()
  })

  it('should disable save button when fullName is empty', () => {
    render(<ProfileTab />)
    const saveButton = screen.getByText('プロフィールを保存').closest('button')
    expect(saveButton?.disabled).toBe(true)
  })

  it('should populate form when profile exists', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      nameReading: 'たなかたろう',
      currentCompany: 'テスト株式会社',
      currentPosition: 'エンジニア',
    }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    const nameInput = screen.getByDisplayValue('田中太郎')
    expect(nameInput).toBeDefined()
  })

  it('should call saveProfile on save click with valid fullName', async () => {
    const profile: InterviewProfile = { fullName: '田中太郎' }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    const saveButton = screen.getByText('プロフィールを保存').closest('button')
    fireEvent.click(saveButton!)

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalled()
    })
  })

  it('should show error when error exists', () => {
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, error: '保存に失敗しました' })
    render(<ProfileTab />)
    expect(screen.getByText('保存に失敗しました')).toBeDefined()
  })

  it('should render additional notes textarea', () => {
    render(<ProfileTab />)
    expect(screen.getByText('特記事項')).toBeDefined()
  })

  it('should render previous companies section', () => {
    render(<ProfileTab />)
    expect(screen.getByText('過去の職歴')).toBeDefined()
  })

  it('should render years of experience input', () => {
    render(<ProfileTab />)
    expect(screen.getByText('経験年数')).toBeDefined()
  })

  it('should render tags when profile has technologies', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      technologies: ['TypeScript', 'React'],
    }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    expect(screen.getByText('TypeScript')).toBeDefined()
    expect(screen.getByText('React')).toBeDefined()
  })

  it('should remove a tag when remove button is clicked', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      technologies: ['TypeScript'],
    }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    const removeBtn = screen.getByLabelText('TypeScriptを削除')
    fireEvent.click(removeBtn)
    expect(screen.queryByText('TypeScript')).toBeNull()
  })

  it('should add a tag when add button is clicked', () => {
    const profile: InterviewProfile = { fullName: '田中太郎' }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    // Find the technologies tag input by placeholder
    const input = screen.getByPlaceholderText('例: Excel（Enterで追加）')
    fireEvent.change(input, { target: { value: 'Go' } })
    // Find the 追加 button next to this input
    const addButtons = screen.getAllByText('追加')
    fireEvent.click(addButtons[0])
    expect(screen.getByText('Go')).toBeDefined()
  })

  it('should add a tag on Enter key in tag input', () => {
    const profile: InterviewProfile = { fullName: '田中太郎' }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    const input = screen.getByPlaceholderText('例: Excel（Enterで追加）')
    fireEvent.change(input, { target: { value: 'Python' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Python')).toBeDefined()
  })

  it('should not add duplicate tag', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      technologies: ['TypeScript'],
    }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    const input = screen.getByPlaceholderText('例: Excel（Enterで追加）')
    fireEvent.change(input, { target: { value: 'TypeScript' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Still only one TypeScript
    expect(screen.getAllByText('TypeScript')).toHaveLength(1)
  })

  it('should update yearsOfExperience when valid number entered', () => {
    const profile: InterviewProfile = { fullName: '田中太郎' }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    const yoeInput = screen.getByPlaceholderText('例: 8')
    fireEvent.change(yoeInput, { target: { value: '5' } })
    expect((yoeInput as HTMLInputElement).value).toBe('5')
  })

  it('should clear yearsOfExperience when empty string entered', () => {
    const profile: InterviewProfile = { fullName: '田中太郎', yearsOfExperience: 5 }
    mockUseInterviewProfile.mockReturnValue({ ...defaultHookReturn, profile })

    render(<ProfileTab />)
    const yoeInput = screen.getByPlaceholderText('例: 8')
    fireEvent.change(yoeInput, { target: { value: '' } })
    expect((yoeInput as HTMLInputElement).value).toBe('')
  })
})
