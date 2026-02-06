# Dead Code Analysis Report

**Generated:** 2026-02-06
**Analysis Tools:** knip, depcheck, manual grep analysis
**Test Status:** ✅ All 63 tests passing

---

## Executive Summary

| Category | Count | Status |
|----------|-------|--------|
| SAFE to remove | 0 | ✅ Codebase is clean |
| CAUTION (Keep) | 4 | Types for future features |
| DANGER (False Positives) | 25+ | Entry points, API routes |

**Conclusion:** The codebase is clean after Phase 6 migration cleanup. No dead code to remove.

---

## Analysis Results

### Dependencies (package.json)

All dependencies are actively used:

| Package | Status | Usage |
|---------|--------|-------|
| `dotenv` | ✅ Used | src/main/index.ts |
| All others | ✅ Used | Various imports |

### devDependencies

All flagged items are **false positives** - used by build/lint/test tools:

| Package | Actual Usage |
|---------|--------------|
| `@electron/asar` | Used internally by electron-builder |
| `@playwright/test` | E2E test framework (tests/e2e) |
| `@typescript-eslint/*` | ESLint TypeScript support |
| `eslint-*` | ESLint rules and config |
| `postcss`, `tailwindcss`, `autoprefixer` | CSS build toolchain |
| `typescript` | TypeScript compiler |

---

## Types Reserved for Future Features

These types in `src/types/auth.ts` are kept for planned features:

| Type | Purpose |
|------|---------|
| `JWTPayload` | JWT token structure |
| `AuthCallbackParams` | OAuth callback handling |
| `PlanLimits` | Phase 7 Stripe integration |
| `SubscriptionPlan` | Phase 7 Stripe integration |

**Recommendation:** Keep - needed for subscription system.

---

## Previous Cleanup (Phase 6)

The following items were already removed:

### Files Deleted
- `src/services/document.service.ts` → Moved to `apps/api/lib/document-parser.ts`

### Dependencies Removed
| Package | Reason |
|---------|--------|
| `langchain` | Only used by deleted document.service.ts |
| `mammoth` | Moved to apps/api |
| `pdf-parse` | Moved to apps/api |
| `uuid` | No longer imported |
| `@types/pdf-parse` | pdf-parse removed |

---

## Test Verification

```
Test Files  5 passed (5)
Tests       63 passed (63)
Duration    5.05s
```

---

## Conclusion

✅ **No action required** - the codebase is clean.

All flagged items from static analysis are:
1. Entry points (Electron main/preload/renderer)
2. Vercel API routes (file-based routing)
3. Config-based tools (PostCSS, Tailwind, ESLint)
4. Planned feature types (Stripe integration)
