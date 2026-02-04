# 将来実装予定の機能（バックログ）

このドキュメントでは、MVPには含めないが将来的に実装を検討する機能を記載します。

---

## 🔮 実装予定機能リスト

### 優先度: 高（Phase 7で実装検討）

#### 1. 複数LLM対応

**現状**: OpenAI GPT-4 Turboのみ

**将来の実装**:
- Claude 3.5 Sonnet対応
- Google Gemini 2.0対応
- ユーザーが設定画面でLLMを選択可能

**技術仕様**:
```typescript
interface LLMProvider {
  name: 'openai' | 'claude' | 'gemini';
  model: string;
  apiKey: string;
  generate(prompt: string): AsyncGenerator<string>;
}

class LLMService {
  private providers: Map<string, LLMProvider>;

  async switchProvider(name: string) {
    this.currentProvider = this.providers.get(name);
  }
}
```

**参考**: AI-powererd-interview-Assistantで実装済み

---

#### 2. 音声応答（TTS）

**概要**: 生成した回答を音声で読み上げる機能

**使用ケース**:
- 画面を見ずに回答を確認したい
- 自然な会話練習

**技術仕様**:
```typescript
import { OpenAI } from 'openai';

const speech = await openai.audio.speech.create({
  model: "tts-1",
  voice: "alloy",
  input: answerText,
});

const buffer = Buffer.from(await speech.arrayBuffer());
// Electronでオーディオ再生
```

**代替案**:
- Azure Speech TTS
- Google Cloud TTS
- ブラウザネイティブ `speechSynthesis` API（無料）

**参考**: Ai-Interview-Assistant-Pythonで実装済み

---

#### 3. Web検索統合

**概要**: リアルタイムで最新情報をWeb検索して回答に含める

**使用ケース**:
- 「最近のニュースについてどう思うか？」などの質問
- 企業の最新情報を確認

**技術仕様**:
```typescript
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";

const searchTool = new TavilySearchResults({
  maxResults: 3,
  apiKey: process.env.TAVILY_API_KEY,
});

const searchResults = await searchTool.invoke(question);
const context = searchResults.map(r => r.content).join('\n');

// LLMプロンプトに含める
const answer = await llm.generate(`
  質問: ${question}

  最新情報:
  ${context}

  上記を踏まえて回答してください。
`);
```

**コスト**: Tavily API - 無料枠1,000リクエスト/月

**参考**: AI-powererd-interview-Assistantで実装済み

---

#### 4. 面接後の評価レポート生成

**概要**: 面接終了後にAIが評価・フィードバックを生成

**機能**:
- 回答内容の評価（STAR法を使えているか等）
- 改善点の提案
- 強みの分析
- PDFレポート生成

**技術仕様**:
```typescript
interface InterviewReport {
  duration: number;
  questionCount: number;
  answers: Array<{
    question: string;
    answer: string;
    score: number;
    feedback: string;
  }>;
  overallScore: number;
  strengths: string[];
  improvements: string[];
}

async function generateReport(history: ConversationHistory): Promise<InterviewReport> {
  const prompt = `
    以下の面接内容を分析し、評価レポートを生成してください：
    ${JSON.stringify(history)}
  `;

  const report = await llm.generate(prompt);
  return JSON.parse(report);
}
```

**参考**: KanpeAI、ai-interview-assistantで実装済み

---

### 優先度: 中（将来検討）

#### 5. クラウド同期

**概要**: 履歴書・設定・会話履歴をクラウドに保存

**技術候補**:
- Firebase（無料枠あり）
- Supabase（PostgreSQL + Storage）
- AWS S3 + DynamoDB

**懸念点**:
- プライバシーリスク
- コスト

---

#### 6. 自動更新機能

**概要**: electron-updaterで自動アップデート

**必要なもの**:
- 更新サーバー（GitHub ReleasesでOK）
- コード署名証明書（年間$200～）

**実装**:
```typescript
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();
```

---

### 優先度: 低（要検討）

#### 7. マルチ言語UI対応

**概要**: UI言語を日本語/英語切り替え

**技術**: react-i18next

---

## 🔬 保留機能（技術検証が必要）

### ⏸️ 画面解析ルート（スクリーンショット→OCR）

**ステータス**: **保留中**

**概要**:
画面に表示されているコーディング問題や質問テキストをOCRで抽出し、AI回答を生成する機能。

**想定技術スタック**:

| コンポーネント | 技術 | 用途 |
|--------------|------|------|
| **スクリーンキャプチャ** | Electron `desktopCapturer` | 画面のスクリーンショット取得 |
| **OCR** | Tesseract.js / GPT-4 Vision | テキスト抽出 |
| **問題認識** | LLM | コーディング問題の構造化 |
| **解答生成** | GPT-4 | コード・解説生成 |

---

#### 実装案A: Tesseract.js（オープンソースOCR）

**メリット**:
- ✅ 完全無料
- ✅ ローカル実行（プライバシー保護）
- ✅ 多言語対応

**デメリット**:
- ❌ 精度が低い（特にコード）
- ❌ レイアウト複雑な画面に弱い

**実装例**:
```typescript
import { desktopCapturer } from 'electron';
import Tesseract from 'tesseract.js';

// 1. スクリーンキャプチャ
async function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });

  return sources[0].thumbnail.toPNG();
}

// 2. OCRでテキスト抽出
async function extractText(screenshot: Buffer) {
  const { data: { text } } = await Tesseract.recognize(
    screenshot,
    'eng+jpn',
    {
      logger: m => console.log(m)
    }
  );

  return text;
}

// 3. コーディング問題を認識
function parseCodingProblem(text: string) {
  // 正規表現やLLMで問題部分を抽出
  const problemMatch = text.match(/Problem:(.+?)Example:/s);
  return problemMatch ? problemMatch[1].trim() : null;
}

// 4. AI解答生成
async function generateSolution(problem: string) {
  const prompt = `
    以下のコーディング問題を解いてください：

    ${problem}

    Pythonで実装し、解説も含めてください。
  `;

  return await llm.generate(prompt);
}
```

---

#### 実装案B: GPT-4 Vision API（推奨）

**メリット**:
- ✅ 最高精度（コード認識も正確）
- ✅ レイアウト・表も理解
- ✅ 実装が簡単

**デメリット**:
- ❌ コストがかかる（$0.01/画像）
- ❌ インターネット接続必須
- ❌ プライバシー懸念（画面がOpenAIに送信）

**実装例**:
```typescript
import { OpenAI } from 'openai';

async function analyzeScreenWithVision(screenshot: Buffer) {
  const base64Image = screenshot.toString('base64');

  const response = await openai.chat.completions.create({
    model: "gpt-4-vision-preview",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "この画面に表示されているコーディング問題を抽出し、解答を生成してください。"
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
              detail: "high"
            }
          }
        ]
      }
    ],
    max_tokens: 1000
  });

  return response.choices[0].message.content;
}
```

---

#### 実装案C: EasyOCR（Python）

**メリット**:
- ✅ Tesseractより高精度
- ✅ GPUアクセラレーション対応
- ✅ 無料

**デメリット**:
- ❌ Python依存（Electronとの統合が複雑）
- ❌ GPUないと遅い

---

### 使用ケース

#### ケース1: 技術面接（コーディング問題）

```
[LeetCode画面]
│
├─ スクリーンキャプチャ
│   ↓
├─ GPT-4 Vision / OCR
│   ↓
├─ 問題抽出
│   "Two Sum問題: 配列から合計がtargetになる2つの数のインデックスを返せ"
│   ↓
├─ LLM解答生成
│   ↓
└─ コード＋解説表示
    ```python
    def twoSum(nums, target):
        seen = {}
        for i, num in enumerate(nums):
            diff = target - num
            if diff in seen:
                return [seen[diff], i]
            seen[num] = i
    ```
```

#### ケース2: 共有画面の質問テキスト認識

```
[面接官が質問を画面共有]
│
├─ スクリーンキャプチャ
│   ↓
├─ OCR
│   "あなたのプロジェクトで最も困難だった課題は何ですか？"
│   ↓
├─ 質問検出（音声認識の補完）
│   ↓
└─ AI回答生成
```

---

### 技術的課題

| 課題 | 詳細 | 対策 |
|------|------|------|
| **プライバシー** | 画面全体を外部APIに送信 | ローカルOCR（Tesseract）を優先 |
| **精度** | コードのインデント・記号認識 | GPT-4 Vision推奨 |
| **パフォーマンス** | OCR処理で1-2秒かかる | キャッシュ、差分検出 |
| **コスト** | GPT-4 Vision: $0.01/画像 | 無料プランはTesseract |

---

### 参考実装

| プロジェクト | 技術 | 参考ポイント |
|------------|------|------------|
| **Interview Hunter** | OCR + LLM | コーディング問題認識 |
| **Phantom-AI-Interview** | EasyOCR | Python実装例 |

**GitHub**: [Phantom-AI-Interview](https://github.com/Abhi5h3k/Phantom-AI-Interview)

---

### 実装タイミング

**推奨**: **Phase 7以降（オプション機能）**

**理由**:
1. MVPには不要（音声認識で十分）
2. 技術面接特化ならメリットあり
3. プライバシー・コスト面で懸念

**決定が必要な点**:
- [ ] 実装するか？（Yes/No）
- [ ] 実装する場合、どの方式？
  - [ ] Tesseract.js（無料、低精度）
  - [ ] GPT-4 Vision（有料、高精度）
  - [ ] EasyOCR（無料、中精度、複雑）

---

## 📝 メモ・検討事項

### ユーザーからのフィードバック（2026-02-01）

> 「画面解析ルートは一度保留で良いです」

**理由**:
- MVPでは音声認識ルートに集中
- 実装複雑度を下げる
- Phase 7で必要性を再評価

**次のアクション**:
- Phase 1-6は音声認識のみで実装
- Phase 7開始前にユーザーと再度相談

---

## 🎯 機能優先度まとめ

| 機能 | 優先度 | 実装フェーズ | 理由 |
|------|--------|------------|------|
| 複数LLM対応 | 高 | Phase 7 | ユーザー選択肢を増やす |
| TTS（音声応答） | 高 | Phase 7 | 実用性高い |
| Web検索統合 | 高 | Phase 7 | 最新情報対応 |
| 評価レポート | 高 | Phase 7 | 学習効果向上 |
| **画面解析** | **保留** | **未定** | **技術検証・ユーザー要望次第** |
| クラウド同期 | 中 | 未定 | プライバシー懸念 |
| 自動更新 | 中 | 未定 | コスト・運用負荷 |
| マルチ言語UI | 低 | 未定 | 日本語優先 |

---

## 📞 次の検討タイミング

- **Phase 6完了時**: Phase 7実装機能をユーザーと相談
- **画面解析**: 技術面接特化の需要があれば再検討

**最終更新**: 2026-02-01
