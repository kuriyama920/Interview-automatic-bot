# 開発ガイド - Interview Automatic Bot

このドキュメントでは、プロジェクトの詳細な開発ワークフローと実装パターンを説明します。

---

## 目次

1. [開発環境構築](#開発環境構築)
2. [開発フェーズ概要](#開発フェーズ概要)
3. [Phase 1: 音声認識実装](#phase-1-音声認識実装)
4. [Phase 2: AI回答生成](#phase-2-ai回答生成)
5. [Phase 3: コンテキスト管理](#phase-3-コンテキスト  管理)
6. [Phase 4: UI/UX改善](#phase-4-uiux改善)
7. [実装パターン](#実装パターン)
8. [テスト戦略](#テスト戦略)
9. [デバッグ手法](#デバッグ手法)

---

## 開発環境構築

### 必須ツール

```bash
# Node.js (v18.x LTS)
node --version  # v18.19.0 以上

# pnpm（推奨）
pnpm --version  # 8.x 以上

# Git
git --version   # 2.x 以上
```

### 推奨IDE・拡張機能

**Visual Studio Code** + 以下の拡張機能:

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Error Lens
- GitLens

### APIキー取得

#### 1. Deepgram API

1. [Deepgram Console](https://console.deepgram.com/)にアクセス
2. アカウント作成（GitHub連携可能）
3. 無料クレジット$200を取得
4. API Keysページでキー発行

**料金**: $0.0043/分（無料枠で約46,000分）

#### 2. OpenAI API

1. [OpenAI Platform](https://platform.openai.com/)にアクセス
2. アカウント作成
3. Billingで支払い方法登録（$5最低チャージ）
4. API Keysページでキー発行

**料金（GPT-4o）**:
- 入力: $0.005/1k tokens
- 出力: $0.015/1k tokens

---

## 開発フェーズ概要

| Phase | 内容 | ステータス | 主要ファイル |
|-------|------|-----------|-------------|
| Phase 1 | 音声認識（Deepgram STT） | ✅ 完了 | stt.service.ts, useSTT.ts |
| Phase 2 | AI回答生成（OpenAI GPT-4o） | ✅ 完了 | ai.service.ts, useAIResponse.ts |
| Phase 3 | コンテキスト管理（RAG） | ✅ 完了 | document.service.ts, context.service.ts |
| Phase 4 | UI/UX改善 | 🔜 次 | App.tsx, components/ |

---

## Phase 1: 音声認識実装

### 概要

Deepgram WebSocketを使用したリアルタイム音声認識。

### 主要ファイル

- `src/services/stt.service.ts` - Deepgram統合
- `src/renderer/src/hooks/useSTT.ts` - React Hook
- `src/renderer/src/hooks/useAudioCapture.ts` - AudioContext管理
- `src/main/ipc.ts` - IPCハンドラー

### データフロー

```
AudioContext (Renderer)
     │
     ├── ScriptProcessor (PCM 16kHz)
     │
     ▼
IPC: stt:audio(buffer)
     │
     ▼
STTService (Main Process)
     │
     ├── Deepgram WebSocket
     │
     ▼
IPC: stt:transcript
     │
     ▼
useSTT Hook (React State)
```

### 実装パターン

```typescript
// src/services/stt.service.ts
export class STTService {
  private connection: LiveClient | null = null

  async connect(apiKey: string): Promise<void> {
    const deepgram = createClient(apiKey)
    this.connection = deepgram.listen.live({
      model: 'nova-2',
      language: 'ja',
      smart_format: true,
      interim_results: true,
    })
  }

  send(audioData: ArrayBuffer): void {
    this.connection?.send(audioData)
  }
}
```

---

## Phase 2: AI回答生成

### 概要

OpenAI GPT-4oを使用したストリーミング回答生成。

### 主要ファイル

- `src/services/ai.service.ts` - OpenAI統合
- `src/renderer/src/hooks/useAIResponse.ts` - React Hook
- `src/main/ipc.ts` - IPCハンドラー

### データフロー

```
質問テキスト
     │
     ▼
IPC: ai:generateStream(question)
     │
     ▼
AIService.generateStreamResponse()
     │
     ├── OpenAI Chat Completions (stream: true)
     │
     ▼
IPC: ai:chunk / ai:complete / ai:error
     │
     ▼
useAIResponse Hook (streamingText, response)
```

### 実装パターン

```typescript
// src/services/ai.service.ts
export class AIService {
  async *generateStreamResponse(
    question: string,
    context?: string
  ): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: question },
      ],
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) yield content
    }
  }
}
```

---

## Phase 3: コンテキスト管理

### 概要

履歴書・求人票のアップロード・解析・RAGベース回答生成。

### 主要ファイル

- `src/types/document.ts` - 型定義
- `src/services/document.service.ts` - PDF/DOCX解析
- `src/services/context.service.ts` - Embeddings + 類似検索
- `src/renderer/src/hooks/useDocuments.ts` - React Hook
- `src/renderer/src/components/DocumentUploadPanel.tsx` - UI

### アーキテクチャ決定

| 決定事項 | 選択 | 理由 |
|---------|------|------|
| ベクトルストア | JSONファイル + インメモリ | ChromaDBはネイティブ依存で複雑 |
| Embeddings | OpenAI text-embedding-3-small | 高精度、低コスト |
| 類似検索 | cosine similarity | シンプル、効果的 |
| ストレージ | userData/context-data.json | Electron標準パス |

### データフロー

```
PDF/DOCX ファイル
     │
     ▼
IPC: document:upload(type)
     │
     ├── electron.dialog.showOpenDialog()
     │
     ▼
DocumentService.parseFile()
     │
     ├── pdf-parse / mammoth
     │
     ▼
DocumentService.chunkText()
     │
     ├── LangChain RecursiveCharacterTextSplitter (500文字)
     │
     ▼
ContextService.addDocument()
     │
     ├── OpenAI Embeddings (batch: 20)
     │
     ▼
context-data.json (永続化)
```

### AI生成時のコンテキスト統合

```
質問テキスト
     │
     ▼
ContextService.getRelevantContext(question)
     │
     ├── OpenAI Embeddings (クエリ)
     ├── cosine similarity (top-3, MIN_SIMILARITY=0.7)
     │
     ▼
コンテキスト付きプロンプト
     │
     ▼
AIService.generateStreamResponse()
```

### 実装パターン

```typescript
// src/services/context.service.ts
export class ContextService {
  private writeLock: Promise<void> = Promise.resolve()

  async addDocument(
    metadata: DocumentMetadata,
    chunks: Omit<DocumentChunk, 'embedding'>[]
  ): Promise<void> {
    const operation = async () => {
      // Embeddings生成
      // JSONファイルに保存
    }

    // Write lock で競合防止
    this.writeLock = this.writeLock.then(operation)
    await this.writeLock
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    // ゼロベクトル対策
    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) return 0
    return dotProduct / denominator
  }
}
```

---

## Phase 4: UI/UX改善

### 検討項目

1. **レスポンシブデザイン強化**
   - モバイル/タブレット対応
   - ウィンドウサイズに応じたレイアウト

2. **アクセシビリティ**
   - キーボードナビゲーション
   - スクリーンリーダー対応

3. **ユーザー体験向上**
   - ローディング状態の改善
   - トースト通知
   - エラーメッセージの改善

4. **設定画面**
   - APIキー設定UI
   - テーマ切り替え

5. **履歴・ログ機能**
   - 過去のセッション履歴
   - エクスポート機能

---

## 実装パターン

### サービス層パターン

```typescript
// シングルトンパターン
export class XxxService {
  private client: OpenAI | null = null
  private initialized = false

  async initialize(apiKey: string): Promise<void> {
    this.client = new OpenAI({ apiKey })
    this.initialized = true
    log.info('Service initialized')
  }

  isInitialized(): boolean {
    return this.initialized
  }
}

export const xxxService = new XxxService()
```

### React Hook パターン

```typescript
// src/renderer/src/hooks/useXxx.ts
export function useXxx() {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doAction = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electron.xxx.action()
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || 'Unknown error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // クリーンアップ
  useEffect(() => {
    return () => {
      window.electron.xxx.removeListeners()
    }
  }, [])

  return { data, isLoading, error, doAction }
}
```

### IPC通信パターン

```typescript
// src/main/ipc.ts
ipcMain.handle('xxx:action', async (_event, param: string) => {
  try {
    const result = await xxxService.action(param)
    return { success: true, data: result }
  } catch (error) {
    log.error('Action failed', { error: String(error) })
    return { success: false, error: String(error) }
  }
})

// src/preload/index.ts
const ALLOWED_INVOKE_CHANNELS = ['xxx:action']

xxx: {
  action: (param: string) => ipcRenderer.invoke('xxx:action', param),
}
```

### イミュータブル更新パターン

```typescript
// 悪い例: ミューテーション
this.data.items.push(newItem)

// 良い例: イミュータブル
this.data = {
  ...this.data,
  items: [...this.data.items, newItem],
}
```

---

## テスト戦略

### テストカバレッジ目標: 80%

### ユニットテスト

```bash
pnpm test
```

**対象**:
- services/*.ts
- hooks/*.ts
- utils/*.ts

**例**:
```typescript
// tests/unit/services/context.service.test.ts
describe('ContextService', () => {
  describe('cosineSimilarity', () => {
    it('should return 0 for zero vectors', () => {
      const result = contextService['cosineSimilarity']([0, 0], [1, 1])
      expect(result).toBe(0)
    })
  })
})
```

### 統合テスト

**対象**:
- IPC通信フロー
- サービス間連携

### E2Eテスト

```bash
pnpm exec playwright test
```

**対象**:
- 重要なユーザーフロー
- ドキュメントアップロード → AI生成

---

## デバッグ手法

### Electronメインプロセス

```bash
# Chrome DevToolsでデバッグ
pnpm dev --inspect
```

### レンダラープロセス

- F12キーでDevTools起動
- React DevTools拡張機能

### ログ確認

```typescript
// メインプロセス
import { createLogger } from './services/logger.service'
const log = createLogger('module-name')
log.info('Message', { key: 'value' })

// ログファイル: userData/logs/
```

### よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| IPC通信エラー | チャンネル名の不一致 | ALLOWED_INVOKE_CHANNELSを確認 |
| 型エラー | env.d.ts未更新 | Window.electron型を更新 |
| ビルドエラー | node_modules不整合 | `rm -rf node_modules && pnpm install` |

---

## 次のステップ

Phase 4 (UI/UX改善) の実装候補:

1. 設定画面UI
2. トースト通知システム
3. セッション履歴保存
4. テーマ切り替え

詳細は [docs/FUTURE_FEATURES.md](./docs/FUTURE_FEATURES.md) を参照。

---

**最終更新**: 2026-02-04
