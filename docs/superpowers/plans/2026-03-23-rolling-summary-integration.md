# ローリングサマリー統合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 直近5ターンより前の会話を累積要約として圧縮し、AI生成時のcontextに含めることで、面接全体の文脈を保持する。

**Architecture:** `useConversationHistory` hookにローリングサマリー状態を追加。committed phase完了後に `ai:summarize` IPC経由でバックグラウンド要約を実行。要約結果を `buildSections()` で直近5ターンと結合してcontextに渡す。`validatePreviousResponseId` 等の不要コードを削除。

**Tech Stack:** React 18 hooks, TypeScript, Vitest, Electron IPC, Cloudflare Workers (Hono)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/renderer/src/hooks/useConversationHistory.ts` | サマリー状態管理、要約トリガー、context文字列構築 |
| Modify | `src/renderer/src/contexts/InterviewContext.tsx` | committed完了検知→要約トリガー呼び出し |
| Delete code | `apps/worker/src/lib/ai-validation.ts:75-92` | `validatePreviousResponseId` 関数削除 |
| Delete tests | `apps/worker/tests/lib/ai-validation.test.ts` | previousResponseId関連テスト削除 |
| Create | `tests/unit/useConversationHistory.test.ts` | サマリー統合のユニットテスト |
| Modify | `tests/unit/ai.service.test.ts` | summarizeTurn呼び出しのテスト確認 |

---

### Task 1: useConversationHistory にサマリー状態とトリガーを追加

**Files:**
- Modify: `src/renderer/src/hooks/useConversationHistory.ts`
- Test: `tests/unit/useConversationHistory.test.ts` (既存テストがなければ新規作成)

**設計:**
- `rollingSummary` state (string) を hook 内部で管理
- `triggerSummarize(turn: ConversationTurn)` コールバックを公開
  - `window.electron.ai.summarize(rollingSummary, turn.interviewer, turn.candidate)` を呼ぶ
  - 成功時に `rollingSummary` を更新
  - 失敗時はログのみ（要約失敗で面接を止めない）
- `buildSections()` を拡張: サマリーがある場合は `【会話要約】\n{summary}\n\n【直近の対話】\n...` の形式
- `resetSummary()` を公開（録音開始/クリア時に呼ぶ）
- hook の戻り値を `string` → `{ historyString: string; triggerSummarize: (turn) => void; resetSummary: () => void; turnCount: number }` に変更

- [ ] **Step 1: useConversationHistory のテストファイルを作成（RED）**

```typescript
// tests/unit/useConversationHistory.test.ts
import { describe, it, expect } from 'vitest'
import { parseTranscriptsToTurns, type ConversationTurn } from '../../src/renderer/src/hooks/useConversationHistory'

describe('parseTranscriptsToTurns', () => {
  it('should parse alternating system/mic transcripts into turns', () => {
    const transcripts = [
      { text: '自己紹介を', source: 'system' as const },
      { text: 'React5年です', source: 'mic' as const },
      { text: '強みは？', source: 'system' as const },
      { text: '設計力です', source: 'mic' as const },
    ]
    const turns = parseTranscriptsToTurns(transcripts)
    expect(turns).toHaveLength(2)
    expect(turns[0]).toEqual({ interviewer: '自己紹介を', candidate: 'React5年です' })
    expect(turns[1]).toEqual({ interviewer: '強みは？', candidate: '設計力です' })
  })

  it('should exclude incomplete final interviewer turn', () => {
    const transcripts = [
      { text: '自己紹介を', source: 'system' as const },
      { text: 'React5年です', source: 'mic' as const },
      { text: '次の質問は', source: 'system' as const },
    ]
    const turns = parseTranscriptsToTurns(transcripts)
    expect(turns).toHaveLength(1)
  })

  it('should respect maxTurns parameter', () => {
    const transcripts = Array.from({ length: 20 }, (_, i) => [
      { text: `Q${i}`, source: 'system' as const },
      { text: `A${i}`, source: 'mic' as const },
    ]).flat()
    const turns = parseTranscriptsToTurns(transcripts, 3)
    expect(turns).toHaveLength(3)
    expect(turns[0].interviewer).toBe('Q7')
  })
})

describe('buildSections with summary', () => {
  it('should include summary section when provided', () => {
    // このテストは buildSectionsWithSummary のエクスポート後に有効化
  })
})
```

- [ ] **Step 2: テスト実行して既存テストがパスすることを確認**

Run: `cd c:/dev/Interview-automatic-bot && npx vitest run tests/unit/useConversationHistory.test.ts`

- [ ] **Step 3: useConversationHistory を拡張（サマリー状態 + triggerSummarize + resetSummary）**

変更内容:
1. `buildSections(recentTurns, summary?)` にオプショナル `summary` 引数追加
2. summary がある場合: `【会話要約】\n${summary}\n\n【直近の対話】\n...`
3. hook に `rollingSummary` useState 追加
4. `triggerSummarize` コールバック: IPC経由で要約API呼び出し → state更新
5. `resetSummary` コールバック: state を '' にリセット
6. 戻り値をオブジェクトに変更: `{ historyString, triggerSummarize, resetSummary, turnCount }`
7. `buildSectionsWithSummary` を named export（テスト用）

- [ ] **Step 4: テスト実行**

Run: `cd c:/dev/Interview-automatic-bot && npx vitest run tests/unit/useConversationHistory.test.ts`

- [ ] **Step 5: コミット**

```bash
git add src/renderer/src/hooks/useConversationHistory.ts tests/unit/useConversationHistory.test.ts
git commit -m "feat: add rolling summary state and trigger to useConversationHistory"
```

---

### Task 2: InterviewContext で要約トリガーを統合

**Files:**
- Modify: `src/renderer/src/contexts/InterviewContext.tsx`

**設計:**
- `useConversationHistory` の戻り値をオブジェクトに対応
- committed生成完了検知（既存の `wasGenerating && !isGenerating` ロジック）で、**直近に閉じたターン**を `triggerSummarize` に渡す
- 要約は6ターン目以降のみ（直近5ターンは原文なので、5ターン超えたら要約開始）
- `handleClear` と `handleStart` で `resetSummary` を呼ぶ

- [ ] **Step 1: InterviewContext の useConversationHistory 呼び出しを更新**

```typescript
// Before:
const conversationHistory = useConversationHistory({ transcripts, audioSource })

// After:
const {
  historyString: conversationHistory,
  triggerSummarize,
  resetSummary,
  turnCount,
} = useConversationHistory({ transcripts, audioSource })
```

- [ ] **Step 2: committed完了時に要約トリガーを追加**

既存の W-01 speculative採用判定の useEffect 内に追加:

```typescript
// W-01 判定の後に追加
// ローリングサマリー: 6ターン目以降、committed完了ごとに要約を更新
if (turnCount > RECENT_TURN_COUNT) {
  // 直近5ターンの1つ前（6ターン目）を要約対象として渡す
  // triggerSummarize 内部で適切なターンを選択
  triggerSummarize()
}
```

- [ ] **Step 3: handleClear と handleStart で resetSummary を呼ぶ**

```typescript
// handleStart 内
resetSummary()
resetProgressiveAI()
clearResponse()

// handleClear 内
resetSummary()
abortGeneration()
clearTranscripts()
```

- [ ] **Step 4: ビルド確認**

Run: `cd c:/dev/Interview-automatic-bot && npx tsc --noEmit`

- [ ] **Step 5: コミット**

```bash
git add src/renderer/src/contexts/InterviewContext.tsx
git commit -m "feat: integrate rolling summary trigger in InterviewContext"
```

---

### Task 3: 不要コード削除（previousResponseId / validatePreviousResponseId）

**Files:**
- Modify: `apps/worker/src/lib/ai-validation.ts` (validatePreviousResponseId 関数削除)
- Modify: `apps/worker/tests/lib/ai-validation.test.ts` (関連テスト削除)

- [ ] **Step 1: ai-validation.ts から validatePreviousResponseId を削除**

削除対象: `validatePreviousResponseId` 関数（未使用であることは grep で確認済み）

- [ ] **Step 2: ai-validation.test.ts から関連テストを削除**

削除対象: `validatePreviousResponseId` のテストスイート

- [ ] **Step 3: Worker テスト実行**

Run: `cd c:/dev/Interview-automatic-bot/apps/worker && npx vitest run`

- [ ] **Step 4: コミット**

```bash
git add apps/worker/src/lib/ai-validation.ts apps/worker/tests/lib/ai-validation.test.ts
git commit -m "refactor: remove unused validatePreviousResponseId"
```

---

### Task 4: 統合テスト・動作確認

**Files:**
- Modify: `tests/integration/ipc.test.ts` (必要に応じて)
- Modify: `tests/unit/ai.service.test.ts` (必要に応じて)

- [ ] **Step 1: 全テスト実行（Electron側）**

Run: `cd c:/dev/Interview-automatic-bot && pnpm test`

- [ ] **Step 2: Worker テスト実行**

Run: `cd c:/dev/Interview-automatic-bot/apps/worker && npx vitest run`

- [ ] **Step 3: ビルド確認**

Run: `cd c:/dev/Interview-automatic-bot && pnpm build`

- [ ] **Step 4: テスト失敗があれば修正**

- [ ] **Step 5: 最終コミット**

```bash
git add -A
git commit -m "test: verify rolling summary integration across all test suites"
```
