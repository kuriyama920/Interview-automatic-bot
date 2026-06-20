# Architecture Codemap

> Freshness: 2026-06-21T12:00:00+09:00

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    User's Desktop                       │
│  ┌───────────────────────────────────────────────────┐  │
│  │           Electron Desktop App (src/)             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │  │
│  │  │  Main    │  │ Preload  │  │  Renderer     │   │  │
│  │  │ Process  │──│  Bridge  │──│  (React 18)   │   │  │
│  │  │          │  │          │  │               │   │  │
│  │  └────┬─────┘  └──────────┘  └───────────────┘   │  │
│  │       │ Services Layer                            │  │
│  │  ┌────┴──────────────────────────────────────┐    │  │
│  │  │ auth | stt | ai | context | questions     │    │  │
│  │  └────┬──────────────────────────────────────┘    │  │
│  └───────┼───────────────────────────────────────────┘  │
│          │ HTTPS (JWT Bearer)                           │
└──────────┼──────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────────────────┐
    │      Cloudflare Workers API (apps/worker/)      │
    │  ┌────────────────────────────────────────────┐  │
    │  │  Hono Router + CORS + Auth Middleware      │  │
    │  │  Routes: auth|ai|stt|stripe|docs|questions │  │
    │  └──────┬───────────┬──────────┬──────────────┘  │
    │         │           │          │                  │
    │    ┌────▼────┐ ┌────▼────┐ ┌──▼───────┐         │
    │    │Supabase │ │ OpenAI  │ │ Soniox   │         │
    │    │PostgreSQL│ │gpt-5-* │ │ stt-rt   │         │
    │    │+pgvector│ │         │ │          │         │
    │    └─────────┘ └─────────┘ └──────────┘         │
    │         │                                        │
    │    ┌────▼────┐                                   │
    │    │ Stripe  │                                   │
    │    │Payments │                                   │
    │    └─────────┘                                   │
    └──────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────┐
    │      Next.js Marketing Site (apps/web/)          │
    │  Landing Page | Download | Checkout | Legal      │
    └──────────────────────────────────────────────────┘
```

## Monorepo Structure

```
pnpm-workspace.yaml → packages: ["apps/*"]

interview-automatic-bot/          # Root (Electron app)
├── src/                          # Electron desktop app
│   ├── main/         (2 files)   # Main process
│   ├── preload/      (1 file)    # IPC bridge
│   ├── renderer/src/ (~53 files) # React UI
│   ├── services/     (8 files)   # Business logic
│   └── types/        (4 files)   # Shared types
├── apps/
│   ├── worker/                   # Cloudflare Workers API
│   │   ├── src/routes/  (7 files)
│   │   ├── src/lib/     (21 files)
│   │   ├── src/middleware/ (2 files)
│   │   └── tests/       (35 files)
│   └── web/                      # Next.js LP
│       ├── app/         (8 pages)
│       ├── components/  (11 files)
│       └── lib/         (2 files)
├── tests/                        # Electron app tests
│   ├── unit/        (58 files)
│   ├── integration/ (1 file)
│   └── e2e/         (2 files)
├── scripts/         (2 files)    # E2E/test scripts
└── docs/            (3 files)    # Documentation
```

## Key Integration Points

| Integration | Protocol | Auth | Data Flow |
|------------|----------|------|-----------|
| Electron → Workers | HTTPS + SSE | JWT Bearer | API proxy for all services |
| Workers → Supabase | PostgreSQL | Service Role Key | User data, documents, usage |
| Workers → OpenAI | HTTPS | API Key | gpt-5-nano / gpt-5.4-nano（二段生成）, embeddings |
| Workers → Soniox | HTTPS | API Key → Temp Token | STT token provisioning |
| Workers → Stripe | HTTPS + Webhook | Secret Key + Webhook Secret | Checkout, subscription |
| Web → Workers | HTTPS | JWT (checkout flow) | Auth session, Stripe checkout |
| Electron ← OAuth | Deep Link | interview-bot:// | Google OAuth callback |
| Web → GitHub | HTTPS | Public API | Release info for download page |

## Authentication Flow

```
1. Electron → shell.openExternal(Workers /api/auth/session)
2. Workers → Create session → Return sessionId + authUrl
3. Electron → Poll /api/auth/session?id=xxx
4. Browser → Google OAuth → Workers /api/auth/callback
5. Workers → Upsert user → Generate JWT → Store in session
6. Electron ← Poll returns JWT → Store in electron-store (AES)
7. All subsequent requests: Authorization: Bearer <JWT>
```

## Audio Pipeline

```
Mic → getUserMedia() ─────────────┐
                                  ├→ AudioWorklet → 16kHz PCM → Soniox WS
System → setDisplayMediaRequestHandler ┘     (via temp token from /api/stt/token)
```

## AI Response Pipeline

```
Transcript → useProgressiveAI
  ├→ Layer 1: QuestionCache (bigram match, <1ms)
  │   └→ Match found → Instant cached answer
  └→ Layer 2: AI Generation (350ms debounce)
      └→ POST /api/ai/generate-v2 (SSE)
          ├→ Phase 1: gpt-5-nano（speculative, ~0.77s TTFT）
          └→ Phase 2: gpt-5.4-nano（committed, RAG付き）
```
