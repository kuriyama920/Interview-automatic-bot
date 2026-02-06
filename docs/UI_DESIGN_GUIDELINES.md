# UI デザインガイドライン

## 概要

Interview Bot のUIは **Linear Design + Apple Vibrancy** ハイブリッドアプローチを採用しています。

### デザイン原則

1. **クリーンでミニマル** - 不要な装飾を排除し、コンテンツに集中
2. **高コントラスト** - 面接中でも素早く情報を読み取れる視認性
3. **透過対応** - 将来の透過処理実装を考慮した設計
4. **プロフェッショナル** - SaaSとしての信頼感

### 参考デザイン

- [Linear App](https://linear.app) - クリーンなSaaSダッシュボード
- [Apple macOS](https://developer.apple.com/design/human-interface-guidelines/macos/overview/themes/) - Vibrancy効果
- [Notion](https://www.notion.so) - 機能的でシンプルなUI

---

## カラーパレット

### ベースカラー（白基調）

| 名前 | 値 | 用途 |
|------|-----|------|
| `surface` | `#ffffff` | メイン背景 |
| `surface-secondary` | `#f9fafb` | セカンダリ背景、カード内背景 |
| `surface-tertiary` | `#f3f4f6` | 三次背景、区切り |
| `surface-hover` | `#f0f1f3` | ホバー状態 |

### 透過対応カラー

| 名前 | 値 | 用途 |
|------|-----|------|
| `translucent-white` | `rgba(255, 255, 255, 0.85)` | ヘッダー背景 |
| `translucent-light` | `rgba(249, 250, 251, 0.8)` | サイドバー |
| `translucent-overlay` | `rgba(255, 255, 255, 0.6)` | オーバーレイ |

### テキストカラー

| 名前 | 値 | 用途 |
|------|-----|------|
| `content` | `#111827` | プライマリテキスト |
| `content-secondary` | `#6b7280` | セカンダリテキスト |
| `content-tertiary` | `#9ca3af` | プレースホルダー、ヒント |
| `content-inverted` | `#ffffff` | 反転テキスト（ボタン内） |

### アクセントカラー

| 名前 | 値 | 用途 |
|------|-----|------|
| `accent` | `#3b82f6` | プライマリアクション |
| `accent-hover` | `#2563eb` | ホバー状態 |
| `accent-subtle` | `#eff6ff` | 薄いアクセント背景 |
| `accent-muted` | `#dbeafe` | ミュートアクセント |

### セマンティックカラー

| カテゴリ | DEFAULT | subtle | text |
|----------|---------|--------|------|
| `success` | `#10b981` | `#d1fae5` | `#065f46` |
| `warning` | `#f59e0b` | `#fef3c7` | `#92400e` |
| `error` | `#ef4444` | `#fee2e2` | `#991b1b` |
| `info` | `#3b82f6` | `#dbeafe` | `#1e40af` |

---

## タイポグラフィ

### フォントファミリー

```css
font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
```

### フォントサイズ

| サイズ | クラス | 用途 |
|--------|--------|------|
| 12px | `text-xs` | キャプション、ヒント |
| 14px | `text-sm` | 本文、ラベル |
| 16px | `text-base` | 大きめの本文 |
| 18px | `text-lg` | 見出し（カード） |
| 20px | `text-xl` | 見出し（セクション） |
| 24px | `text-2xl` | 見出し（ページ） |

### フォントウェイト

| ウェイト | クラス | 用途 |
|----------|--------|------|
| 400 | `font-normal` | 本文 |
| 500 | `font-medium` | ラベル、強調 |
| 600 | `font-semibold` | 見出し |
| 700 | `font-bold` | 強い見出し |

---

## コンポーネント

### Card

カードは3つのバリアントがあります：

```tsx
// デフォルト（白背景、シャドウ）
<Card variant="default" padding="md">
  コンテンツ
</Card>

// グラス（透過背景、ブラー）
<Card variant="glass" padding="md">
  コンテンツ
</Card>

// 高架（ホバーで影が増す）
<Card variant="elevated" padding="md">
  コンテンツ
</Card>
```

### Button

```tsx
// プライマリ（青背景）
<Button variant="primary">保存</Button>

// セカンダリ（グレー背景）
<Button variant="secondary">キャンセル</Button>

// ゴースト（背景なし）
<Button variant="ghost">リセット</Button>

// 危険（赤背景）
<Button variant="danger">削除</Button>

// アイコン付き
<Button leftIcon={<IconComponent />}>テキスト</Button>

// ローディング
<Button isLoading>保存中...</Button>
```

### Badge

```tsx
<Badge variant="default">デフォルト</Badge>
<Badge variant="success">成功</Badge>
<Badge variant="warning">警告</Badge>
<Badge variant="error">エラー</Badge>
<Badge variant="info">情報</Badge>
```

### Alert

```tsx
<Alert variant="info">情報メッセージ</Alert>
<Alert variant="success">成功メッセージ</Alert>
<Alert variant="warning">警告メッセージ</Alert>
<Alert variant="error" onClose={() => {}}>エラーメッセージ</Alert>
```

### Input / Select / Toggle / Slider

```tsx
<Input label="ラベル" placeholder="プレースホルダー" />
<Select label="選択" options={[{ value: '1', label: 'オプション1' }]} />
<Toggle checked={true} onChange={() => {}} label="トグル" />
<Slider min={0} max={100} value={50} onChange={() => {}} label="スライダー" />
```

---

## シャドウ

| 名前 | 値 | 用途 |
|------|-----|------|
| `shadow-soft` | `0 1px 2px rgba(0,0,0,0.05)` | ボタン |
| `shadow-card` | `0 1px 3px rgba(0,0,0,0.1)` | カード |
| `shadow-elevated` | `0 4px 6px rgba(0,0,0,0.1)` | ホバー時 |
| `shadow-modal` | `0 20px 25px rgba(0,0,0,0.1)` | モーダル |
| `shadow-glass` | `0 8px 32px rgba(0,0,0,0.08)` | グラスカード |

---

## アニメーション

### 基本アニメーション

```css
/* フェードイン */
.animate-fade-in {
  animation: fadeIn 0.2s ease-out;
}

/* スライドアップ */
.animate-slide-up {
  animation: slideUp 0.3s ease-out;
}

/* 緩やかなパルス */
.animate-pulse-subtle {
  animation: pulseSubtle 2s infinite;
}

/* 波形 */
.animate-wave {
  animation: wave 1s ease-in-out infinite;
}
```

### トランジション

すべてのインタラクティブ要素には `transition-all duration-200` を適用：

```tsx
<button className="transition-all duration-200 hover:bg-surface-hover">
```

---

## レイアウト

### 3カラムレイアウト（メイン画面）

```
┌─────────────────────────────────────────────────────────┐
│  [ヘッダー: sticky, 透過背景, backdrop-blur]            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────┬───────────────┬─────────────────────┐   │
│  │           │               │                     │   │
│  │ コンテキスト │   文字起こし   │      AI回答        │   │
│  │  (3/12)   │    (4/12)     │      (5/12)        │   │
│  │           │               │                     │   │
│  │           │               │                     │   │
│  └───────────┴───────────────┴─────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### スペーシング

- コンテナ最大幅: `max-w-7xl`
- パディング: `p-4`
- カード間ギャップ: `gap-4`

---

## アクセシビリティ

### カラーコントラスト

- テキスト (`#111827`) on 背景 (`#ffffff`): **12.6:1** (AAA)
- セカンダリテキスト (`#6b7280`) on 背景 (`#ffffff`): **5.4:1** (AA)

### フォーカス状態

すべてのインタラクティブ要素に `focus:ring-2 focus:ring-accent focus:ring-offset-2` を適用。

### キーボードナビゲーション

- モーダルは `Escape` キーで閉じる
- すべてのボタンは `Tab` キーでフォーカス可能

---

## 透過処理対応（将来実装）

透過処理実装時は以下のクラスを使用：

```tsx
// ヘッダー
<header className="bg-translucent-white backdrop-blur-glass">

// サイドバー
<aside className="bg-translucent-light backdrop-blur-glass">

// グラスカード
<Card variant="glass">
```

---

## ファイル構成

```
src/renderer/src/
├── components/
│   ├── ui/
│   │   └── index.tsx          # 共通UIコンポーネント
│   ├── LoginPage.tsx          # ログイン画面
│   ├── DocumentUploadPanel.tsx # ドキュメント管理
│   ├── SettingsModal.tsx      # 設定モーダル
│   └── ...
├── App.tsx                    # メインアプリ
└── ...

tailwind.config.js             # カラーパレット、アニメーション定義
```

---

## 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2026-02-06 | 1.0.0 | Linear Design + Apple Vibrancy ハイブリッドスタイル適用 |

---

## 参考リソース

- [Linear UI Redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Glassmorphism Best Practices - NN/g](https://www.nngroup.com/articles/glassmorphism/)
- [SaaS Design Trends 2026](https://www.designstudiouiux.com/blog/top-saas-design-trends/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [DaisyUI Documentation](https://daisyui.com/)
