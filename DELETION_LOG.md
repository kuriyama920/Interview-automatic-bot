# Deletion Log

## 2026-02-10 Dead Code Cleanup

### Analysis Method
Manual code analysis: traced all imports, exports, and usages across the entire `src/` directory
to identify unreferenced code. Build and all 62 tests verified after changes.

### Deleted Items

#### 1. Deleted File: `src/renderer/src/components/Skeleton.tsx` (96 lines)
- **Risk**: SAFE
- **Reason**: Entirely unused. Exports `Skeleton`, `SkeletonText`, `SkeletonCard`,
  `TranscriptSkeleton`, `AIResponseSkeleton`, and `DocumentSkeleton` -- none imported anywhere.
  `App.tsx` defines its own inline `AIResponseSkeleton`.
- **Impact**: CSS output reduced by 0.58 kB (79.82 -> 79.24 kB)

#### 2. Removed Unused Types from `src/types/auth.ts` (72 lines)
- **Risk**: SAFE
- **Types removed**:
  - `JWTPayload` - never imported outside the file
  - `AuthCallbackParams` - never imported outside the file
  - `PlanLimits` - never imported (renderer defines its own locally in `useSubscription.ts`)
  - `SubscriptionPlan` - never imported outside the file
  - `SubscriptionResponse` - never imported outside the file
- **Remaining types**: `User`, `UserUsage`, `UserSettings`, `SubscriptionTier`,
  `SubscriptionStatus`, `AuthState`, `AuthTokens`, `AuthMeResponse`, `DEFAULT_AUTH_STATE`

#### 3. Removed Unused `Divider` Component from `src/renderer/src/components/ui/index.tsx` (12 lines)
- **Risk**: SAFE
- **Reason**: Exported but never imported by any component in the codebase

#### 4. Removed Unused `updateConfig` Method from `src/services/ai.service.ts` (7 lines)
- **Risk**: SAFE
- **Reason**: Never called anywhere in the codebase. Also removed 2 corresponding dead
  tests in `tests/unit/ai.service.test.ts`

#### 5. Removed Unused Methods from `src/services/auth.service.ts` (23 lines)
- **Risk**: SAFE
- **Methods removed**:
  - `cancelLogin()` - never called from any IPC handler or elsewhere
  - `isInitialized()` - never called externally (only `getAuthState()` is used)
- Also removed unused `DEFAULT_AUTH_STATE` type import (was imported but never referenced)

#### 6. Removed Unused `isInitialized` Method from `src/services/settings.service.ts` (7 lines)
- **Risk**: SAFE
- **Reason**: Never called externally. The service's initialization state is managed internally.

#### 7. Changed `TranscriptCallback` Export to Local Type in `src/services/stt.service.ts` (1 line)
- **Risk**: SAFE
- **Reason**: `TranscriptCallback` was only used within the same file. Changed from
  `export type` to `type` (local).

### Items NOT Deleted (Noted for Future)

The following were identified as duplication but NOT removed to avoid breaking changes:

- **Duplicate type definitions** across `src/preload/index.ts`, `src/renderer/src/env.d.ts`,
  `src/renderer/src/types/index.ts`, and various hooks. These duplications exist because the
  renderer process cannot directly import from the preload process in all contexts.
- **Unused hook return values** (`loadSettings` from `useSettings`, `validateSession` from
  `useAuth`, `generateResponse` from `useAIResponse`) -- these are part of public hook APIs
  and may be used in future features.

### Build Verification

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| `out/main/index.js` | 56.31 kB | 55.69 kB | -0.62 kB |
| `out/renderer/assets/*.css` | 79.82 kB | 79.24 kB | -0.58 kB |
| `out/renderer/assets/*.js` | 334.98 kB | 334.98 kB | 0 |
| Test files | 5 passed | 5 passed | 0 |
| Tests | 64 (62 pass + 2 dead) | 62 pass | -2 dead tests |
| Lines removed | - | ~220 | - |
