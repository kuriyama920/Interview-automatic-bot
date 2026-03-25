# Backend Codemap

> Freshness: 2026-03-10T12:00:00+09:00

## Cloudflare Workers API (apps/worker/)

### Entry Point

```
src/index.ts
  ├── Hono<{Bindings: Env}>
  ├── corsMiddleware (global)
  ├── supabase middleware (global, creates admin client per request)
  ├── Routes:
  │   ├── /api/auth         → routes/auth.ts
  │   ├── /api/ai           → routes/ai.ts
  │   ├── /api/stt          → routes/stt.ts
  │   ├── /api/stripe       → routes/stripe.ts
  │   ├── /api/documents    → routes/documents.ts
  │   ├── /api/questions    → routes/questions.ts
  │   └── /api/subscription → routes/subscription.ts
  └── Cron: scheduled() → Monthly usage reset (1st day 00:00 UTC)
```

### Route Handlers

#### auth.ts (6 endpoints)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /google | No | Initiate Google OAuth |
| GET | /callback | No | OAuth callback (upsert user, JWT) |
| POST | /session | No | Create polling session for Electron |
| GET | /session | No | Poll session status |
| GET | /me | JWT | Get current user + profile + usage |
| PUT | /profile | JWT | Update interview profile |

#### ai.ts (4 endpoints)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /generate | JWT | SSE streaming AI response |
| POST | /summarize | JWT | Conversation summarization |
| POST | /prefetch-context | JWT | Fetch all doc context for session |
| POST | /embeddings | JWT | Generate text embeddings |

#### stt.ts (2 endpoints)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /token | JWT | Get Deepgram temp token (10min) |
| POST | /usage | JWT | Report STT minutes used |

#### stripe.ts (5 endpoints)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | /success | No | Checkout success HTML page |
| GET | /cancel | No | Checkout cancel HTML page |
| POST | /checkout | JWT | Create Stripe Checkout session |
| POST | /portal | JWT | Create billing portal session |
| POST | /webhook | Stripe sig | Handle Stripe events |

#### documents.ts (4 endpoints)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | / | JWT | Upload + parse + embed document |
| GET | / | JWT | List user documents |
| DELETE | /:id | JWT | Delete document + chunks |
| POST | /search | JWT | pgvector similarity search |

#### questions.ts (4 endpoints)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | / | JWT | List user Q&A |
| POST | / | JWT | Batch save + embed Q&A |
| DELETE | /:id | JWT | Delete single question |
| POST | /generate | JWT | AI-generate 20 answers |

#### subscription.ts (1 endpoint)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | / | JWT | Get subscription + plans + usage |

### Library Dependencies

```
lib/auth.ts          → (Web Crypto API, no internal deps)
lib/supabase.ts      → @supabase/supabase-js
lib/usage.ts         → Supabase RPC (check_and_reserve_usage, adjust_reserved_usage)
lib/stripe.ts        → stripe SDK
lib/subscription.ts  → stripe, supabase
lib/openai.ts        → openai SDK (text-embedding-3-small)
lib/deepgram.ts      → fetch (Deepgram REST API)
lib/prompts.ts       → (pure data, no deps)
lib/profile.ts       → (pure utility, no deps)
lib/validation.ts    → (pure utility, no deps)
lib/document-parser.ts → pdf-parse, mammoth
lib/allowed-origins.ts → (pure data)
lib/url.ts           → (pure utility)
lib/quality.ts       → (pure utility, response scoring)
lib/auth-pages.ts    → (pure HTML templates)
```

### Route → Lib Dependency Matrix

```
             auth supa usage stripe sub openai deep prompt prof valid docprs origin url quality authpg
auth.ts       ✓    ✓                                              ✓         ✓     ✓          ✓
ai.ts              ✓    ✓                  ✓          ✓     ✓
stt.ts             ✓    ✓                        ✓
stripe.ts          ✓          ✓     ✓                                       ✓     ✓
documents.ts       ✓    ✓                  ✓                ✓     ✓
questions.ts       ✓    ✓                  ✓          ✓     ✓     ✓
subscription.ts    ✓
middleware/auth ✓
middleware/cors                                                              ✓
```

### Middleware

```
middleware/auth.ts  → Extracts Bearer JWT, verifies via lib/auth.verifyJWT
middleware/cors.ts  → ALLOWED_ORIGINS whitelist + Cloudflare Pages preview support
```

### External Dependencies (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| hono | 4.7.0 | Web framework |
| @supabase/supabase-js | 2.39.0 | Database client |
| openai | 4.28.0 | AI generation + embeddings |
| stripe | 14.14.0 | Payment processing |
| pdf-parse | 1.1.1 | PDF document parsing |
| mammoth | 1.6.0 | DOCX document parsing |

### Test Coverage

```
tests/
├── helpers/          # Test utilities (mock Supabase, JWT, etc.)
├── lib/              # Unit tests for library functions
├── middleware/        # Auth + CORS middleware tests
├── routes/           # Route handler tests (per route file)
└── integration/      # Cross-route integration tests
```

## Electron Service Layer (src/services/)

```
auth.service.ts    → Singleton, electron-store (AES), OAuth polling, JWT management
stt.service.ts     → Class (per source), @deepgram/sdk WebSocket, 16kHz PCM
ai.service.ts      → Singleton, SSE streaming via authenticatedFetch, phase tracking
context.service.ts → Singleton, document upload (FormData), pgvector search proxy
questions.service.ts → Singleton, Q&A CRUD + AI generation proxy
logger.service.ts  → Factory, Winston (console + file, 5MB rolling)
```

### Service → API Mapping

```
authService.authenticatedFetch → All /api/* endpoints (JWT Bearer)
STTService.connect             → Deepgram WS (via temp token from /api/stt/token)
aiService.generateStreamResponse → POST /api/ai/generate (SSE)
aiService.summarizeTurn        → POST /api/ai/summarize
contextService.addDocument     → POST /api/documents (FormData)
contextService.getRelevantContext → POST /api/documents/search
```
