# Improved Error Messages & Default Initial Version

Date: 2026-06-06

## Summary

Improve `get-next-version` to (1) auto-default to a configurable initial version when
no releases exist, and (2) emit distinct, actionable error messages so that AI tools
can diagnose and fix configuration issues.

## Changes

### 1. New input: `default-initial-version`

**File:** `action.yml`

Add a new optional input:

```yaml
default-initial-version:
  description: 'Default version to use when no releases exist (must be semver-valid)'
  default: '1.0.0'
```

**Files:** `src/constants/version-constants.ts`

```typescript
export const DEFAULT_INITIAL_VERSION = 'default-initial-version'
```

---

### 2. `getLatestTag()` returns null instead of throwing for "no releases"

**File:** `src/services/github.ts`

Change return type from `Promise<Tag>` to `Promise<Tag | null>`.

| Condition | Before | After |
|-----------|--------|-------|
| Empty response array | throw `NO_RELEASES_FOUND` | `return null` |
| API "Not Found" error | throw `NO_RELEASES_FOUND` (wrapped) | `return null` |
| Other API errors | throw `RELEASES_LISTING_FAILED (details)` | unchanged (still throws) |
| octokit not initialized | throw `OCTOKIT_NOT_INITIALIZED` | unchanged (still throws) |

Real API failures (rate limiting, network errors, 500s) still throw and fail the
workflow. Only the "no releases exist" cases return null.

---

### 3. `runAction()` handles null by using default version

**File:** `src/main.ts`

When `getLatestTag()` returns null:

1. Read `DEFAULT_INITIAL_VERSION` input
2. Parse with `semver.parse()` — throw with clear message if invalid
3. Apply channel via the exported `applyChannelAndFormat()` utility
4. Log: `"No releases found, using default initial version: <version>"`
5. `core.setOutput(NEXT_VERSION, version)` and return

When tags exist: unchanged logic.

---

### 4. Export `applyChannelAndFormat()`

**File:** `src/services/version.ts`

The private function `applyChannelAndFormat()` is made `export` so `main.ts` can
use it to apply the channel to the default initial version.

Signature:
```typescript
export function applyChannelAndFormat(version: SemVer, channel: string): string
```

- If channel is `'stable'` → strips prerelease
- If channel is prerelease (e.g. `'alpha'`) → sets `version.prerelease = [channel, 1]`

---

### 5. Distinct error messages for "no PRs" vs "no matching labels"

**File:** `src/services/version.ts`

In `getKindByPullRequestsLabels()`:

**After fetching PRs, check length:**
```typescript
if (mergedPullRequests.length === 0) {
  throw new Error(NO_MERGED_PRS)
}
```

**After the iteration loop, if kind is still UNKNOWN:**
```typescript
if (kind === UNKNOWN) {
  throw new Error(
    `${NO_MATCHING_LABELS}\n` +
    `Configured major labels: ${majorLabels.join(', ')}\n` +
    `Configured minor labels: ${minorLabels.join(', ')}\n` +
    `Configured patch labels: ${patchLabels.join(', ')}`
  )
}
```

The configured labels are included in the error so an AI can determine whether
to relabel PRs or adjust the action's label configuration.

---

### 6. New constants

**File:** `src/constants/version-constants.ts`

```typescript
export const NO_MERGED_PRS = 'No merged pull requests found since latest tag'
export const NO_MATCHING_LABELS = 'No pull requests with matching labels found since latest tag'
```

`NO_CHANGES_FOUND` is kept as a safety net for the default switch case in
`getNextVersionUsingLatestTag()`.

**File:** `src/constants/github-constants.ts`

`NO_RELEASES_FOUND` is removed since it is no longer used.

---

## Error Message Summary

| Scenario | Before | After |
|---|---|---|
| No releases exist | `"No releases found"` (error) | Log + default version (success) |
| No PRs since last tag | `"No changes found"` | `"No merged pull requests found since latest tag"` |
| PRs found, none match labels | `"No changes found"` | `"No pull requests with matching labels found since latest tag"` + lists configured labels |
| API failure | `"Releases listing failed (details)"` | unchanged |
| Invalid version tag | `"Invalid version name..."` | unchanged |
| Invalid default version | n/a (new) | `"Invalid default initial version: {value}"` |

## Files Modified

| File | Change |
|---|---|
| `action.yml` | Add `default-initial-version` input |
| `src/constants/version-constants.ts` | Add 3 new constants |
| `src/constants/github-constants.ts` | Remove `NO_RELEASES_FOUND` (unused) |
| `src/services/github.ts` | `getLatestTag()` returns `Tag \| null` |
| `src/services/version.ts` | Export `applyChannelAndFormat`, throw distinct errors, list configured labels |
| `src/main.ts` | Handle null from `getLatestTag()` |
