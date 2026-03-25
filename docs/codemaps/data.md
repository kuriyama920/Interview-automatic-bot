# Data Models Codemap

> Freshness: 2026-03-10T12:00:00+09:00

## Supabase PostgreSQL Schema

### Core Tables

#### profiles
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | User ID |
| email | text | Google email |
| name | text | Display name |
| picture | text | Google avatar URL |
| subscription_tier | text | 'free' / 'pro' / 'max' |
| subscription_status | text | 'active' / 'canceled' / 'past_due' |
| subscription_period_end | timestamp | Current period end |
| stripe_customer_id | text | Stripe customer reference |
| monthly_stt_minutes_used | numeric | Current month STT usage |
| monthly_ai_tokens_used | bigint | Current month AI token usage |
| document_count | int | Active document count |
| interview_profile | jsonb | InterviewProfile object |
| created_at | timestamp | |
| updated_at | timestamp | |

#### documents
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK→profiles) | Owner |
| name | text | Filename |
| type | text | 'resume' / 'job_posting' / 'expected_qa' |
| status | text | 'processing' / 'ready' / 'error' |
| chunk_count | int | Number of chunks |
| word_count | int | Total word count |
| uploaded_at | timestamp | |

#### document_chunks
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| document_id | UUID (FK→documents) | Parent document |
| user_id | UUID (FK→profiles) | Owner (for RLS) |
| content | text | Chunk text (~500 chars) |
| chunk_index | int | Order within document |
| embedding | vector(1536) | text-embedding-3-small |
| question_id | UUID | Link to interview_questions (for Q&A) |

#### interview_questions
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK→profiles) | Owner |
| question | text | Question text |
| answer | text | Prepared answer |
| sort_order | int | Display order |
| created_at | timestamp | |
| updated_at | timestamp | |

#### subscription_plans
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| tier | text | 'free' / 'pro' / 'max' |
| name | text | Plan display name |
| price | numeric | Monthly price (JPY) |
| stt_minutes_limit | numeric | Monthly STT limit |
| ai_tokens_limit | bigint | Monthly AI token limit |
| document_limit | int | Max documents |
| stripe_price_id | text | Stripe price reference |
| is_active | boolean | Available for purchase |

#### usage_logs
| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| user_id | UUID (FK→profiles) | |
| usage_type | text | 'stt' / 'ai_completion' / 'embedding' / 'storage' |
| amount | numeric | Usage amount |
| metadata | jsonb | Additional context |
| created_at | timestamp | |

#### oauth_states
| Column | Type | Description |
|--------|------|-------------|
| state | text (PK) | Random token |
| redirect_uri | text | OAuth redirect |
| session_id | text | Polling session reference |
| expires_at | timestamp | 5-minute TTL |

#### auth_sessions
| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | Session ID |
| status | text | 'pending' / 'completed' / 'expired' / 'consumed' |
| token | text | JWT (when completed) |
| user_data | jsonb | User info |
| return_url | text | Where to redirect |
| expires_at | timestamp | 5-minute TTL |

#### webhook_events
| Column | Type | Description |
|--------|------|-------------|
| event_id | text (PK) | Stripe event ID |
| event_type | text | Stripe event type |
| processed_at | timestamp | |

#### user_settings
| Column | Type | Description |
|--------|------|-------------|
| user_id | UUID (PK, FK→profiles) | |
| settings | jsonb | User preferences |

### RPC Functions

| Function | Purpose |
|----------|---------|
| check_and_reserve_usage | Atomic usage check + reserve |
| adjust_reserved_usage | Reconcile reserved vs actual |
| increment_column | Generic counter increment |
| match_documents | pgvector similarity search |
| cleanup_old_webhook_events | Remove events older than 30 days |

---

## TypeScript Types (src/types/)

### auth.ts

```typescript
interface User {
  id: string; email: string; name: string; picture?: string
}
interface UserUsage {
  sttMinutesUsed: number; sttMinutesLimit: number
  aiTokensUsed: number; aiTokensLimit: number
  documentCount: number; documentLimit: number
}
type SubscriptionTier = 'free' | 'pro' | 'max'
type SubscriptionStatus = 'active' | 'canceled' | 'past_due'
interface AuthState {
  isAuthenticated: boolean; user?: User
  subscription?: { tier, status, periodEnd }
  usage?: UserUsage
}
interface InterviewProfile {
  fullName: string; nameReading?: string
  currentCompany?: string; currentPosition?: string
  previousCompanies?: string[]
  targetCompany?: string; targetPosition?: string
  technologies?: string[]; certifications?: string[]
  education?: string; yearsOfExperience?: number
  additionalNotes?: string
}
```

### document.ts

```typescript
type DocumentType = 'resume' | 'job_posting' | 'expected_qa'
interface DocumentMetadata {
  id: string; name: string; type: DocumentType
  status: 'processing' | 'ready' | 'error'
  chunkCount?: number; wordCount?: number; uploadedAt: string
}
interface ContextResult {
  content: string; similarity: number
  documentName: string; documentType: DocumentType
}
```

### question.ts

```typescript
interface InterviewQuestion {
  id: string; question: string; answer: string
  sortOrder: number; createdAt?: string; updatedAt?: string
}
interface QuestionInput {
  id?: string; question: string; answer: string; sortOrder: number
}
```

---

## Worker Types (apps/worker/src/types.ts)

```typescript
type Env = {
  GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string
  JWT_SECRET: string
  SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string
  OPENAI_API_KEY: string
  STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string
  CRON_SECRET: string; DEEPGRAM_API_KEY: string
}
type Variables = {
  supabase: SupabaseClient; jwtPayload: JWTPayload
}
```

---

## Data Flow Patterns

### Document Upload → RAG Search

```
1. POST /api/documents (FormData: file + type)
2. parseDocument() → text (pdf-parse or mammoth)
3. chunkText(text, 500, 50) → DocumentChunk[]
4. generateEmbeddings(chunks) → vector(1536)[]
5. INSERT documents + document_chunks (with embeddings)
6. POST /api/documents/search (query)
7. generateEmbedding(query) → vector(1536)
8. match_documents RPC → cosine similarity results
```

### Usage Tracking (Atomic)

```
1. checkAndReserveUsage(userId, resource, amount)
   → RPC check_and_reserve_usage (atomic read + increment)
2. [Perform operation]
3. adjustReservedUsage(userId, resource, reserved, actual)
   → RPC adjust_reserved_usage (decrement reserved - actual)
4. recordUsage(userId, type, amount, metadata)
   → INSERT usage_logs + increment_column on profiles
```

### Stripe Subscription Lifecycle

```
checkout.session.completed → getOrCreateStripeCustomer + updateUserSubscription
customer.subscription.updated → Update tier/status
customer.subscription.deleted → Downgrade to 'free'
invoice.payment_failed → Set status 'past_due'
invoice.paid → Set status 'active'
Monthly cron → Reset monthly_stt_minutes_used + monthly_ai_tokens_used
```
