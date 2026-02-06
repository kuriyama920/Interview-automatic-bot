# Dead Code Analysis Report

Generated: 2026-02-05
Analysis Tools: knip v5.83.0, manual grep analysis
Test Status: Pending verification

---

## Executive Summary

Post-Phase 6 analysis identifies dead code after Cloud RAG migration.

| Category | Count | Action Required |
|----------|-------|-----------------|
| DANGER (False Positives) | 25 | DO NOT DELETE - entry points/API routes |
| CAUTION (Review Needed) | 4 | Keep - planned features |
| SAFE (Truly Unused) | 6 | DELETE - Phase 6 migration leftovers |

**Conclusion**: Phase 6 migration created dead code that should be cleaned up.

---

## DANGER - DO NOT DELETE

These items appear "unused" to analysis tools but are critical entry points, config files, or Vercel API routes.

### Electron Entry Points (False Positives)

| File | Reason |
|------|--------|
| `src/main/index.ts` | Main process entry point (referenced in electron.vite.config.ts) |
| `src/preload/index.ts` | Preload script entry point (referenced in electron.vite.config.ts) |
| `src/renderer/src/main.tsx` | React app entry point (referenced in index.html) |
| `src/renderer/src/App.tsx` | Root React component (imported by main.tsx) |
| `electron.vite.config.ts` | Build configuration (used by electron-vite) |

### React Components (Active UI)

| File | Reason |
|------|--------|
| `src/renderer/src/components/ErrorBoundary.tsx` | Error handling wrapper |
| `src/renderer/src/components/DocumentUploadPanel.tsx` | Document upload UI |
| `src/renderer/src/components/LoginPage.tsx` | Authentication UI |
| `src/renderer/src/components/SettingsModal.tsx` | Settings dialog |
| `src/renderer/src/components/Skeleton.tsx` | Loading placeholder |
| `src/renderer/src/components/Toast.tsx` | Notification component |

### Hooks (Active Features)

| File | Reason |
|------|--------|
| `src/renderer/src/hooks/useAIResponse.ts` | AI response state management |
| `src/renderer/src/hooks/useAuth.ts` | Authentication state hook |
| `src/renderer/src/hooks/useDocuments.ts` | Document management hook |
| `src/renderer/src/hooks/useSettings.ts` | Settings state hook |
| `src/renderer/src/hooks/useToast.tsx` | Toast notification hook |

### Vercel API Routes (Server-side - File-based routing)

| File | Reason |
|------|--------|
| `apps/api/api/auth/callback.ts` | Google OAuth callback endpoint (GET /api/auth/callback) |
| `apps/api/api/auth/google.ts` | Google OAuth initiation endpoint (GET /api/auth/google) |
| `apps/api/api/auth/me.ts` | User info endpoint (GET /api/auth/me) |
| `apps/api/lib/auth.ts` | Auth utilities (used by API routes) |
| `apps/api/lib/cors.ts` | CORS configuration (used by me.ts) |
| `apps/api/lib/env.ts` | Environment variable helper (used by auth.ts) |
| `apps/api/lib/supabase.ts` | Supabase client (used by all API routes) |

### Config Files

| File | Reason |
|------|--------|
| `src/renderer/src/env.d.ts` | TypeScript environment declarations |
| `src/renderer/src/index.css` | Global styles with Tailwind (imported by main.tsx) |

---

## CAUTION - Review Before Deletion

These items may have indirect usage patterns or are reserved for future features.

### Unused Exported Types (src/types/auth.ts)

| Type | Status | Notes |
|------|--------|-------|
| `JWTPayload` | Duplicate | Also defined in apps/api/lib/auth.ts - intentional separation |
| `AuthCallbackParams` | Planned | Reserved for future callback handling |
| `PlanLimits` | Planned | Reserved for subscription feature |
| `SubscriptionPlan` | Planned | Reserved for subscription feature |

**Recommendation**: Keep - these are part of the planned subscription system architecture.

### Unused Class Exports

| Export | File | Reason |
|--------|------|--------|
| `ContextService` | src/services/context.service.ts | Singleton pattern - class exported for testing |

**Recommendation**: Keep - useful for unit testing with dependency injection.

---

## SAFE - Phase 6 Dead Code (DELETE)

### 1. src/services/document.service.ts (ENTIRE FILE)

**Status**: DELETE
**Reason**: Phase 6でAPI側 (`apps/api/lib/document-parser.ts`) に移行済み
**Evidence**:
- No imports found anywhere in codebase
- Functionality fully replicated in API
- `langchain` dependency only used here

### 2. Unused Types in src/types/document.ts

**Types to DELETE**:
- `DocumentChunk` (line 12)
- `ParsedDocument` (line 22)

**Reason**: Only used by dead `document.service.ts`

### 3. Root Dependencies to REMOVE

| Package | Reason |
|---------|--------|
| `langchain` | Only used by dead document.service.ts |
| `mammoth` | Moved to apps/api/package.json |
| `pdf-parse` | Moved to apps/api/package.json |
| `uuid` | No imports found |

### 4. Root devDependencies to REMOVE

| Package | Reason |
|---------|--------|
| `@types/pdf-parse` | pdf-parse removed from root |

---

## Dependencies Analysis (Updated)

### Dependencies Analysis

#### Root package.json

| Package | Flagged By | Actual Status | Verification |
|---------|------------|---------------|--------------|
| `dotenv` | knip | **USED** | Imported in src/main/index.ts:3 |

**Result**: No unused dependencies in root package.json.

#### apps/api/package.json

| Package | Status | Notes |
|---------|--------|-------|
| `@supabase/supabase-js` | **USED** | Imported in lib/supabase.ts |
| `resend` | PLANNED | Email service for future notifications |
| `stripe` | PLANNED | Payment service for subscriptions |

**Recommendation**: Keep `resend` and `stripe` if subscription features are planned within 6 months.

### devDependencies Analysis (All False Positives)

| Package | Flagged By | Actual Usage |
|---------|------------|--------------|
| `@electron/asar` | knip | Used by electron-builder internally |
| `@playwright/test` | knip | E2E test framework (tests/e2e planned) |
| `@typescript-eslint/eslint-plugin` | knip | Used by ESLint for TypeScript |
| `@typescript-eslint/parser` | knip | Used by ESLint for TypeScript |
| `eslint-config-prettier` | knip | ESLint/Prettier integration |
| `eslint-plugin-react` | knip | React-specific ESLint rules |
| `eslint-plugin-react-hooks` | knip | Hooks rules enforcement |
| `autoprefixer` | depcheck | Used in postcss.config.js |
| `postcss` | depcheck | Used in postcss.config.js |
| `tailwindcss` | depcheck | Used in tailwind.config.js |
| `typescript` | depcheck | Core TypeScript compiler |

**Result**: All devDependencies are actively used by build/test/lint toolchain.

---

## Action Items

### Required Actions

1. **Add missing dependency** (unlisted in package.json but used):
   ```bash
   pnpm add -D @vitest/coverage-v8
   ```

### No Action Required

All other flagged items are false positives due to:
- Electron entry points not detected by standard import analysis
- Vercel API routes using file-based routing (no explicit imports)
- PostCSS/Tailwind plugins loaded by name in config files
- ESLint plugins loaded by name in configuration

---

## Verification Commands

```bash
# Verify tests pass
pnpm test --run

# Verify build succeeds
pnpm build

# Verify lint passes
pnpm lint
```

---

## Cleanup Execution Log (Phase 6)

**Date**: 2026-02-05
**Trigger**: Phase 6 Cloud RAG migration completed

### Files Deleted
| File | Reason |
|------|--------|
| `src/services/document.service.ts` | Moved to `apps/api/lib/document-parser.ts` |

### Types Removed
| Type | File |
|------|------|
| `DocumentChunk` | `src/types/document.ts` |
| `ParsedDocument` | `src/types/document.ts` |

### Dependencies Removed (root package.json)
| Package | Type | Reason |
|---------|------|--------|
| `langchain` | dependency | Only used by deleted document.service.ts |
| `mammoth` | dependency | Moved to apps/api |
| `pdf-parse` | dependency | Moved to apps/api |
| `uuid` | dependency | No longer imported |
| `@types/pdf-parse` | devDependency | pdf-parse removed |

### Verification
- Tests: 63/63 passing
- TypeScript: No errors
- Build: Verified

---

## Previous Cleanup Actions (Completed)

The following packages were identified and removed in previous analysis:

| Package | Status | Date |
|---------|--------|------|
| `@reduxjs/toolkit` | REMOVED | Pre-Phase 4 |
| `react-redux` | REMOVED | Pre-Phase 4 |
| `@electron-toolkit/preload` | REMOVED | Pre-Phase 4 |
| `@electron-toolkit/utils` | REMOVED | Pre-Phase 4 |
| `langchain` | REMOVED | Phase 6 |
| `mammoth` | REMOVED | Phase 6 |
| `pdf-parse` | REMOVED | Phase 6 |
| `uuid` | REMOVED | Phase 6 |

---

## Appendix: Tool Output Summary

### knip v5.83.0 Results

```
Unused files: 25 (all false positives - entry points/API routes)
Unused dependencies: 4 (3 in apps/api, 1 in root - all verified as used or planned)
Unused devDependencies: 7 (all false positives - config-based tools)
Unlisted dependencies: 1 (@vitest/coverage-v8)
Unused exports: 2 (intentional for testing)
Unused exported types: 4 (planned features)
```

### depcheck v1.4.7 Results

```
Unused devDependencies: 11 (all false positives - config-based tools)
```

---

## Cleanup Execution Log

| Action | Status | Notes |
|--------|--------|-------|
| Analysis completed | Done | knip + depcheck + manual verification |
| Tests verified | Done | 63/63 passing |
| Build verified | Done | No TypeScript errors |
| False positives identified | Done | 25 files, 7 devDeps |
| Safe removals identified | Done | 0 packages (codebase is clean) |
| Missing dependency identified | Done | @vitest/coverage-v8 |
