# Stripe 本番環境移行タスク

> 最終更新: 2026-03-27
> ステータス: **本番モード有効化済み、Price ID不一致を修正必要**

---

## 現状（2026-03-27 MCP確認）

- Stripeアカウント: `acct_XXXXXXXXXXXX`
- モード: **本番（livemode: true）**
- 残高: ¥0
- 顧客: 0人 / サブスク: 0件 / 決済: 0件
- ダッシュボード: 追加審査タスクあり（特定商取引法URL提出）

### 本番環境の値

| 項目 | 本番値 |
|------|--------|
| Product: Pro | `prod_XXXXXXXXXXXX` |
| Product: Max | `prod_XXXXXXXXXXXX` |
| Pro Price ID | `price_XXXXXXXXXXXX`（¥2,980/月） |
| Max Price ID | `price_XXXXXXXXXXXX`（¥14,800/月） |

> **注意**: 実際のStripe IDは環境変数またはStripeダッシュボードで管理してください。

### Supabase DB の現在値（不一致あり）

| プラン | DB内 Price ID | Stripe本番 Price ID | 状態 |
|--------|--------------|-------------------|------|
| Free | null | — | OK |
| Pro | （DBで確認） | （Stripeダッシュボードで確認） | **不一致** |
| Max | （DBで確認） | （Stripeダッシュボードで確認） | **不一致** |

### コード内のハードコード箇所

| ファイル | 行 | 内容 | 状態 |
|---------|-----|------|------|
| `apps/web/lib/api.ts` | L36 | 環境変数 `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` を使用 | ✅ 対応済 |
| `apps/web/lib/api.ts` | L37 | 環境変数 `NEXT_PUBLIC_STRIPE_MAX_PRICE_ID` を使用 | ✅ 対応済 |

### Supabase profiles テストデータ

テストデータの具体的な情報はSupabaseダッシュボードで確認してください。

---

## タスク一覧

### Phase A: Stripeアカウント有効化 ✅完了

- [x] **A-1: 必須タスクを完了**
  - 本人確認/ビジネス情報の入力完了
  - Liveモード有効化済み
- [x] **A-2: Liveモードが有効化されたことを確認**
  - MCP接続でlivemode: true確認済み

### Phase A.5: 追加審査タスク

- [ ] **A.5-1: 特定商取引法URL提出**
  - Stripeダッシュボード → 上部バナーの追加審査タスク
  - URL: 本番の特商法ページURL
  - ページは作成・デプロイ済み ✅
  - **Stripeフォームに上記URLを入力して送信するだけ**

---

### Phase B: 本番用Stripe設定 ✅一部完了

- [x] **B-1: 本番用商品・価格を作成**
  - Pro / Max の Price ID を Stripe ダッシュボードで確認

- [ ] **B-2: 本番用Webhookエンドポイント作成**
  - Stripeダッシュボード（Liveモード）→ 開発者 → Webhook → エンドポイントを追加
  - URL: 環境変数 `API_BASE_URL` + `/api/stripe/webhook`
  - 受信するイベント（5つ選択）:
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`
    - `invoice.paid`
  - 作成後の署名シークレット（`whsec_...`）を控える

- [ ] **B-3: カスタマーポータル設定**
  - Stripeダッシュボード（Liveモード）→ 設定 → Billing → カスタマーポータル
  - サブスクリプションのキャンセル: 許可（期間終了時）
  - プラン変更: 許可
  - 請求書履歴: 表示

- [ ] **B-4: 本番用APIキーを確認**
  - Stripeダッシュボード（Liveモード）→ 開発者 → APIキー

---

### Phase C: 環境変数更新

- [ ] **C-1: Cloudflare Workers シークレット更新**
  ```bash
  cd apps/worker
  npx wrangler secret put STRIPE_SECRET_KEY
  # → B-4の sk_live_... を入力

  npx wrangler secret put STRIPE_WEBHOOK_SECRET
  # → B-2の whsec_... を入力
  ```

- [ ] **C-2: Workerを再デプロイ**
  ```bash
  cd apps/worker && npx wrangler deploy
  ```

---

### Phase D: データ更新（Price ID確定済み — 実行可能）

- [ ] **D-1: Supabase `subscription_plans` テーブルのPrice ID更新**
  ```sql
  UPDATE subscription_plans
  SET stripe_price_id_monthly = '<YOUR_PRO_PRICE_ID>'
  WHERE id = 'pro';

  UPDATE subscription_plans
  SET stripe_price_id_monthly = '<YOUR_MAX_PRICE_ID>'
  WHERE id = 'max';
  ```

- [ ] **D-2: `apps/web/lib/api.ts` のPrice ID環境変数を設定**
  - `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` を設定
  - `NEXT_PUBLIC_STRIPE_MAX_PRICE_ID` を設定

- [ ] **D-3: テストデータのクリーンアップ**
  ```sql
  -- テスト用stripe_customer_idをクリア
  UPDATE profiles SET stripe_customer_id = NULL
  WHERE stripe_customer_id IS NOT NULL;

  -- テスト用subscription_tierをfreeにリセット
  UPDATE profiles SET subscription_tier = 'free', subscription_status = 'active',
    subscription_period_end = NULL
  WHERE subscription_tier != 'free';

  -- テスト用使用量をリセット（オプション）
  UPDATE profiles SET monthly_stt_minutes_used = 0, monthly_ai_tokens_used = 0;

  -- 古いwebhook_eventsをクリア
  DELETE FROM webhook_events;
  ```

- [ ] **D-4: Webアプリを再デプロイ**
  ```bash
  cd apps/web && npx next build && npx wrangler pages deploy out --project-name=interview-bot-web
  ```

---

### Phase E: 検証

> **注意: 本番(Live)モードでは `4242...` テストカードは使用不可**

- [ ] **E-1: Webhook接続テスト**
  - 方法1: Stripeダッシュボード → Webhook → テストイベント送信
  - 方法2: Stripe CLI
  ```bash
  stripe trigger checkout.session.completed --live
  ```
  - Worker側ログで正常受信を確認:
  ```bash
  cd apps/worker && npx wrangler tail
  ```

- [ ] **E-2: Checkout フロー確認**
  - **Stripe CLIで模擬イベント送信**（無料・安全）:
  ```bash
  stripe trigger checkout.session.completed --live
  stripe trigger customer.subscription.updated --live
  ```

- [ ] **E-3: ポータルアクセス確認**
  - サブスクリプション管理画面が正しく表示されること

- [ ] **E-4: Webhook全イベントの動作確認**
  ```bash
  stripe trigger customer.subscription.updated --live
  stripe trigger customer.subscription.deleted --live
  stripe trigger invoice.payment_failed --live
  stripe trigger invoice.paid --live
  ```

---

## 実行順序

```
A.5-1（特商法URL提出）
  ↓
B-2〜B-4（並列可: Webhook作成、ポータル設定、APIキー確認）
  ↓
C-1 → C-2（環境変数更新 → Worker再デプロイ）
  ↓
D-1〜D-4（DB更新、コード更新、テストデータクリーンアップ、Web再デプロイ）
  ↓
E-1〜E-4（検証）
```

## 本番テストの方法

| 方法 | コスト | 確認範囲 | 推奨度 |
|------|--------|---------|--------|
| **Stripe CLI `trigger`** | 無料 | Webhook処理のみ | ★★★ |
| **実カード→即返金** | 手数料3.6%発生（返金可） | Checkout〜Webhook全フロー | ★★☆ |
| **Stripe CLIローカル転送** | 無料 | ローカルでWebhookデバッグ | ★★★ |
| **ユニットテスト（vitest）** | 無料 | ロジック検証（モック） | 常時実行 |

### Stripe CLI セットアップ

```bash
# インストール（未済の場合）
scoop install stripe

# 本番アカウントにログイン
stripe login

# Webhookをローカルに転送してデバッグ
stripe listen --forward-to http://localhost:8787/api/stripe/webhook --live
```

## 注意事項

- **テスト環境は残す**: 本番移行後もテストモードのProducts/Pricesは開発用に残す
- **Webhook署名**: テスト用と本番用は別のシークレット。環境変数の上書きに注意
- **テストカード不可**: Liveモードでは `4242...` は使えない。Stripe CLIまたは実カードで検証
- **ロールバック**: 問題発生時はCloudflare Workersのシークレットをテスト用キーに戻せば即座にテストモードに復帰可能
- **返金手数料**: Stripeの日本アカウントでは返金時に決済手数料は返却されない点に注意
