# Stripe 本番環境移行タスク

> 最終更新: 2026-03-21
> ステータス: 計画策定完了、実行待ち

---

## 現状

- Stripeアカウント: `acct_1T5jTrQyYpkxuJoj`（面接アシスタント）
- モード: **テスト環境のみ**（Liveモード未有効化）
- ダッシュボード警告: 「複数の機能が一時停止されています」「2の必須のタスクは期限が過ぎています」
- サブスクリプション: 0件（テストデータなし）

### テスト環境の現在値

| 項目 | テスト値 |
|------|---------|
| Secret Key | `sk_test_51T5jUZ...` |
| Publishable Key | `pk_test_51T5jUZ...` |
| Webhook Secret | `whsec_ELBC1Dna...` |
| Pro Price ID | `price_1T9KGPQyYpkxuJojeFrxaHTt`（¥2,980/月） |
| Max Price ID | `price_1T9KGSQyYpkxuJoj7ljkjRGC`（¥14,800/月） |
| Product: Pro | `prod_U7ZP1og8c3VSpe` |
| Product: Max | `prod_U7ZPm2el6FpoXu` |

### コード内のハードコード箇所

| ファイル | 行 | 内容 |
|---------|-----|------|
| `apps/web/lib/api.ts` | L36 | `price_1T5jdGJYscx9GZNhlwROF46u`（Pro フォールバック） |
| `apps/web/lib/api.ts` | L37 | `price_1T5jcKJYscx9GZNhz5epevXW`（Max フォールバック） |

> 注: Supabase `subscription_plans` テーブルにも `stripe_price_id_monthly` が格納されている。
> Checkout時はDBからPrice IDを検証するため、DBの値が正しければ動作する。

---

## タスク一覧

### Phase A: Stripeアカウント有効化（ユーザー対応）

- [ ] **A-1: 必須タスク2件を完了**
  - Stripeダッシュボード → 上部バナー「タスクを表示」をクリック
  - 本人確認/ビジネス情報の入力
  - 税務登録の追加（推奨欄にも表示あり）
  - **これが完了しないとLiveモードで決済不可**

- [ ] **A-2: Liveモードが有効化されたことを確認**
  - ダッシュボード右上のテスト環境トグルをOFFにしてLiveモードに切替可能になること

---

### Phase B: 本番用Stripe設定（ユーザー対応）

- [ ] **B-1: 本番用商品・価格を作成**
  - Stripeダッシュボード → Liveモードに切替 → 商品カタログ → 商品を追加
  - **Pro プラン**: ¥2,980/月（月額サブスクリプション、JPY）
  - **Max プラン**: ¥14,800/月（月額サブスクリプション、JPY）
  - 作成後、各Priceの `price_xxx` IDを控える
  - 控えた値: Pro = `________________` / Max = `________________`

- [ ] **B-2: 本番用Webhookエンドポイント作成**
  - Stripeダッシュボード（Liveモード）→ 開発者 → Webhook → エンドポイントを追加
  - URL: `https://interview-bot-api.interviewautomaticbot92.workers.dev/api/stripe/webhook`
  - 受信するイベント（5つ選択）:
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`
    - `invoice.paid`
  - 作成後の署名シークレット（`whsec_...`）を控える
  - 控えた値: `________________`

- [ ] **B-3: カスタマーポータル設定**
  - Stripeダッシュボード（Liveモード）→ 設定 → Billing → カスタマーポータル
  - サブスクリプションのキャンセル: 許可（期間終了時）
  - プラン変更: 許可
  - 請求書履歴: 表示

- [ ] **B-4: 本番用APIキーを控える**
  - Stripeダッシュボード（Liveモード）→ 開発者 → APIキー
  - シークレットキー（`sk_live_...`）を控える: `________________`
  - 公開可能キー（`pk_live_...`）を控える: `________________`

---

### Phase C: 環境変数更新（ユーザー対応）

- [ ] **C-1: Cloudflare Workers シークレット更新**
  - 以下コマンドを `apps/worker/` ディレクトリで実行:
  ```bash
  npx wrangler secret put STRIPE_SECRET_KEY
  # → B-4で控えた sk_live_... を入力

  npx wrangler secret put STRIPE_WEBHOOK_SECRET
  # → B-2で控えた whsec_... を入力
  ```
  - または Cloudflareダッシュボード → Workers → interview-bot-api → 設定 → 変数 → シークレットで設定

- [ ] **C-2: Workerを再デプロイ**
  ```bash
  cd apps/worker && npx wrangler deploy
  ```

---

### Phase D: コード更新（Claude対応 — Price ID確定後に実行）

- [ ] **D-1: `apps/web/lib/api.ts` のフォールバックPrice ID更新**
  - L36: `price_1T5jdGJYscx9GZNhlwROF46u` → 本番Pro Price ID
  - L37: `price_1T5jcKJYscx9GZNhz5epevXW` → 本番Max Price ID

- [ ] **D-2: Supabase `subscription_plans` テーブルのPrice ID更新**
  ```sql
  UPDATE subscription_plans
  SET stripe_price_id_monthly = '本番Pro Price ID'
  WHERE id = 'pro';

  UPDATE subscription_plans
  SET stripe_price_id_monthly = '本番Max Price ID'
  WHERE id = 'max';
  ```

- [ ] **D-3: Electron `.env` の公開可能キー更新（該当する場合）**
  - 現在Electronからはサーバー経由でCheckoutするため、直接使用箇所がなければスキップ可

---

### Phase E: 検証（共同対応）

- [ ] **E-1: Webhook接続テスト**
  - Stripeダッシュボード → Webhook → テストイベント送信
  - Worker側ログで正常受信を確認

- [ ] **E-2: Checkout フロー E2Eテスト**
  - Stripeテストカード（`4242 4242 4242 4242`）で決済フロー確認
  - 注意: Liveモードではテストカードは使えない。Stripe CLIの `stripe trigger` を使用
  ```bash
  stripe trigger checkout.session.completed
  ```

- [ ] **E-3: ポータルアクセス確認**
  - サブスクリプション管理画面が正しく表示されること

- [ ] **E-4: Webhook全イベントの動作確認**
  ```bash
  stripe trigger customer.subscription.updated
  stripe trigger customer.subscription.deleted
  stripe trigger invoice.payment_failed
  stripe trigger invoice.paid
  ```

- [ ] **E-5: E2Eスクリプト実行**
  ```powershell
  .\scripts\e2e-stripe-test.ps1 -JwtToken "本番JWT"
  ```

---

## 実行順序

```
A-1 → A-2 → B-1〜B-4（並列可） → C-1 → C-2 → D-1〜D-3（Claude実行） → E-1〜E-5
```

## 注意事項

- **テスト環境は残す**: 本番移行後もテストモードのProducts/Pricesは開発用に残す
- **Webhook署名**: テスト用と本番用は別のシークレット。環境変数の上書きに注意
- **テストカード不可**: Liveモードでは `4242...` は使えない。Stripe CLIまたは実カードで検証
- **ロールバック**: 問題発生時はCloudflare Workersのシークレットをテスト用キーに戻せば即座にテストモードに復帰可能
