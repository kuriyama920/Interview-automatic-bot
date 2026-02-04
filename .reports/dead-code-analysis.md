# Dead Code Analysis Report

Generated: 2026-02-04

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Unused Dependencies | 3 | SAFE to remove |
| Unused DevDependencies | 10 | CAUTION - review needed |
| Unused Exports | 2 | SAFE - intentional pattern |
| Unused Files | 0 | N/A (false positives) |

---

## 1. Unused Dependencies (SAFE)

These dependencies are installed but not imported anywhere:

| Package | Reason | Recommendation |
|---------|--------|----------------|
| `@reduxjs/toolkit` | Planned for future state management | **REMOVE** - Not currently used |
| `react-redux` | Planned for future state management | **REMOVE** - Not currently used |
| `electron-store` | Planned for config storage | **KEEP** - May use for document settings |

### Action: Remove unused dependencies

```bash
pnpm remove @reduxjs/toolkit react-redux
```

---

## 2. Unused DevDependencies (CAUTION)

| Package | Status | Recommendation |
|---------|--------|----------------|
| `@electron-toolkit/preload` | Not imported | **REMOVE** |
| `@electron-toolkit/utils` | Not imported | **REMOVE** |
| `@electron/asar` | Used by electron-builder | **KEEP** |
| `@playwright/test` | E2E testing (Phase 4) | **KEEP** |
| `@types/uuid` | Used in ipc.ts | **KEEP** (false positive) |
| `@typescript-eslint/eslint-plugin` | ESLint config needed | **KEEP** |
| `@typescript-eslint/parser` | ESLint config needed | **KEEP** |
| `eslint-config-prettier` | ESLint/Prettier integration | **KEEP** |
| `eslint-plugin-react` | React linting | **KEEP** |
| `eslint-plugin-react-hooks` | Hooks linting | **KEEP** |
| `autoprefixer` | Tailwind CSS | **KEEP** |
| `postcss` | Tailwind CSS | **KEEP** |
| `tailwindcss` | Styling | **KEEP** |
| `typescript` | Core dependency | **KEEP** |

### Action: Remove unused electron-toolkit packages

```bash
pnpm remove @electron-toolkit/preload @electron-toolkit/utils
```

---

## 3. Unused Exports (SAFE - Intentional)

| Export | File | Status |
|--------|------|--------|
| `ContextService` | context.service.ts | Singleton pattern - class exported but only instance used |
| `DocumentService` | document.service.ts | Singleton pattern - class exported but only instance used |

**Recommendation**: Keep exports for testing and extensibility.

---

## 4. False Positives (No Action)

Knip reported these as "unused" but they are entry points:

- `electron.vite.config.ts` - Build configuration
- `src/main/index.ts` - Electron main entry
- `src/preload/index.ts` - Preload script
- `src/renderer/src/App.tsx` - React root component
- `src/renderer/src/main.tsx` - React entry point
- All component/hook files - Dynamically imported

---

## 5. Missing Dependencies

| Package | File | Action |
|---------|------|--------|
| `@vitest/coverage-v8` | vitest.config.ts | **ADD** for coverage reports |

---

## Recommended Cleanup Actions

### Phase 1: Safe Removals (No risk)
1. Remove `@reduxjs/toolkit` and `react-redux`
2. Remove `@electron-toolkit/preload` and `@electron-toolkit/utils`

### Phase 2: Add Missing (Required)
1. Add `@vitest/coverage-v8` for test coverage

### Phase 3: Future Consideration
1. Set up ESLint config file (currently missing)
2. Evaluate if `electron-store` is needed

---

## Test Verification Required

Before each removal:
```bash
pnpm test --run && pnpm build
```

After all removals:
```bash
pnpm test --run && pnpm build && pnpm dev
```
