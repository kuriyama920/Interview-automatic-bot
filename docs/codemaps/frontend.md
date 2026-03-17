# Frontend Codemap

> Freshness: 2026-03-10T12:00:00+09:00

## Electron Renderer (src/renderer/src/)

### Component Tree

```
main.tsx
└── ErrorBoundary
    └── App.tsx
        ├── TitleBar (custom frameless window controls)
        └── ToastProvider (useToast context)
            └── AuthProvider (useAuth context)
                └── AuthContainer (auth gate)
                    ├── LoginPage (if !authenticated)
                    └── NavigationProvider (useNavigation context)
                        └── AppShell
                            ├── Sidebar (nav items, collapse toggle)
                            └── PageContent (key={currentPage})
                                ├── DashboardPage
                                ├── InterviewPage
                                │   └── InterviewProvider (useInterview context)
                                │       ├── TranscriptPanel
                                │       │   ├── RecordingControls
                                │       │   └── AudioSourceToggle
                                │       └── AIResponsePanel
                                ├── DocumentsPage
                                ├── QuestionsPage
                                ├── ProfilePage
                                └── SubscriptionPage
```

### Contexts (2)

| Context | Provider | Hook | State |
|---------|----------|------|-------|
| NavigationContext | NavigationProvider | useNavigation() | currentPage, sidebarCollapsed, isRecording |
| InterviewContext | InterviewProvider | useInterview() | Composes 7 hooks for interview session |

### Hooks (13)

| Hook | Purpose | Key State |
|------|---------|-----------|
| useAuth | Auth state + Google login | user, isAuthenticated, isLoading |
| useToast | Toast notifications | toasts[] (max 5) |
| useSTT | Deepgram WebSocket lifecycle | isConnected, transcripts[], currentText |
| useAudioCapture | Mic + system audio capture | isCapturing, audioSource |
| useAIResponse | SSE streaming AI responses | response, streamingText, isGenerating, currentPhase |
| useProgressiveAI | Cached Q&A + AI fallback | matchedAnswer, isGenerating |
| useQuestionCache | Bigram similarity matching | findMatch (>0.65), findPartialMatch (>0.4) |
| useConversationHistory | Sliding window + LLM summary | history (max 2000 chars) |
| useDocumentContextCache | Prefetch RAG context on start | cachedContext ref |
| useDocuments | Document CRUD | documents[], isLoading |
| useInterviewQuestions | Q&A editing + generation | questions[], hasUnsavedChanges |
| useInterviewProfile | Profile CRUD | profile, isLoading |
| useSubscription | Plan + usage management | subscription, usage, plans[] |

### Hook Composition (InterviewContext)

```
useInterview
├── useSTT              ← Deepgram transcription
├── useAudioCapture     ← Mic/system/both audio
├── useAIResponse       ← SSE streaming AI
├── useProgressiveAI    ← Smart caching layer
│   ├── useQuestionCache    ← Bigram similarity
│   ├── cachedDocumentContextRef (from useDocumentContextCache)
│   └── conversationHistory (from useConversationHistory)
├── useConversationHistory ← Rolling summary
└── useDocumentContextCache ← Prefetched RAG
```

### Pages (6)

| Page | Key Features |
|------|-------------|
| DashboardPage | Usage stats (STT min, AI tokens, docs), subscription tier |
| InterviewPage | Live transcription + AI response (two-column) |
| DocumentsPage | Upload PDF/DOCX, list, delete |
| QuestionsPage | Edit Q&A, AI generate 20 answers |
| ProfilePage | Interview profile (company, position, skills) |
| SubscriptionPage | Plan comparison, Stripe checkout/portal |

### IPC Communication (preload/index.ts)

```
window.electron
├── auth
│   ├── getState()          → AuthState
│   ├── loginWithGoogle()   → void (starts polling)
│   ├── validate()          → AuthState
│   ├── logout()            → void
│   ├── getToken()          → string
│   └── onStateChanged(cb)  → unsubscribe
├── stt
│   ├── start(config)       → {token, config}
│   ├── stop()              → void
│   ├── sendAudio(data)     → void
│   ├── onTranscript(cb)    → unsubscribe
│   └── status()            → boolean
├── ai
│   ├── init(config)        → void
│   ├── generate(q, ctx)    → string
│   ├── generateStream(q, opts) → void
│   ├── summarize(data)     → string
│   ├── prefetchContext()   → string
│   ├── abort()             → void
│   ├── warm()              → void
│   ├── onChunk/onComplete/onPhase/onError(cb) → unsubscribe
│   └── status()            → boolean
├── document
│   ├── upload(path, type)  → DocumentMetadata
│   ├── list()              → DocumentMetadata[]
│   └── remove(id)          → void
├── questions
│   ├── list()              → InterviewQuestion[]
│   ├── save(questions)     → InterviewQuestion[]
│   ├── delete(id)          → void
│   └── generate()          → GeneratedQuestion[]
├── profile
│   ├── get()               → InterviewProfile
│   └── save(profile)       → InterviewProfile
├── subscription
│   ├── getPlans()          → Plan[]
│   ├── checkout(priceId)   → {url}
│   ├── portal()            → {url}
│   └── refresh()           → SubscriptionInfo
├── audio
│   ├── setSource(source)   → void
│   └── getSource()         → string
└── window
    ├── minimize/maximize/close()
    └── isMaximized()       → boolean
```

### Utilities

```
renderer/src/utils/
├── logger.ts         → Console logger (dev-only debug/info, always error)
└── errorMessages.ts  → Pattern-based EN→JP error translation with hints
```

---

## Next.js Marketing Site (apps/web/)

### Page Structure

```
app/
├── layout.tsx          → RootLayout (Navbar + Footer, metadata)
├── page.tsx            → Home (6 sections composed)
├── robots.ts           → SEO robots metadata
├── sitemap.ts          → SEO sitemap (4 URLs)
├── globals.css         → Tailwind imports + base styles
├── download/
│   ├── page.tsx        → GitHub release fetch + download card
│   └── error.tsx       → Error boundary with retry
├── checkout/
│   ├── page.tsx        → Google OAuth + Stripe checkout flow
│   ├── success/page.tsx → Post-checkout success
│   └── cancel/page.tsx  → Checkout cancellation
├── terms/page.tsx      → Terms of service (12 sections)
└── privacy/page.tsx    → Privacy policy (9 sections)
```

### Component Architecture

```
components/
├── Navbar.tsx          → Fixed top, glass effect, mobile hamburger
├── HeroSection.tsx     → CTA + stats + gradient bg
├── FeaturesSection.tsx → 6 feature cards (2-col grid)
├── DemoSection.tsx     → Interactive demos
│   └── demos/
│       ├── AppDemo.tsx         → Typewriter transcript + AI demo
│       └── FeatureDemos.tsx    → 4 feature demos (AI, docs, questions)
├── PricingSection.tsx  → 3-tier plan cards
├── FAQSection.tsx      → 6 accordion items
├── CTASection.tsx      → Final CTA banner
├── Footer.tsx          → Links + copyright
└── SignupModal.tsx     → Google OAuth modal (shared by Hero + Pricing)
```

### Library

```
lib/
├── api.ts    → Auth session + Stripe checkout API calls
│              getPriceIdForPlan, createAuthSession, pollAuthSession, createStripeCheckout
└── github.ts → GitHub release fetch for download page
               getLatestRelease, findInstallerAsset, formatFileSize
```

### Rendering Strategy

| Component | Type | Reason |
|-----------|------|--------|
| Layout, Footer, CTA, Features | Server | Static content |
| Terms, Privacy, Download | Server | Static/async content |
| Navbar, Hero, Pricing, FAQ | Client | useState interaction |
| SignupModal, Checkout | Client | OAuth flow + state |
| Demo components | Client | Animation + timers |
