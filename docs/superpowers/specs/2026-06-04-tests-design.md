# Test Suite Design — get-next-version

**Date:** 2026-06-04
**Scope:** Black-box unit tests for the version calculation and GitHub service layers.

---

## Goals

- Cover all critical version-bump decision paths through the public API.
- Cover all error branches in the GitHub service layer without any network calls.
- Guard the edge-case fixes already merged (prerelease NaN guard, label whitespace trim, `filter(Boolean)` on empty input, 1000-result warning, `done()` early exit).

## Non-goals

- End-to-end / integration tests against real GitHub API.
- White-box tests of unexported helpers.
- Coverage of `src/main.ts` or `src/index.ts` (orchestration only, no logic).

---

## Framework

| Package | Role |
|---|---|
| `vitest` | Test runner and assertion library |
| `@vitest/coverage-v8` | V8-based coverage reporter |

**Why Vitest over Jest:** The project uses `"type": "module"` (ESM). Jest requires `--experimental-vm-modules` and additional transform config. Vitest handles ESM + TypeScript natively with zero config.

### package.json scripts

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage"
```

### vitest.config.ts

Minimal config: set `environment: 'node'`, enable coverage for `src/**`, exclude `dist/` and `node_modules/`.

---

## File Structure

```
__tests__/
  version.test.ts   — getNextVersion (all bump/channel/label/prefix scenarios)
  github.test.ts    — setupOctokit, getLatestTag, getMergedPullRequestsFilteredByCreated
vitest.config.ts
```

---

## Mocking Strategy

Each test file mocks at the module level using `vi.mock`. All mocks are reset between tests via `beforeEach`.

### Mocked modules

| Module | Faked surface |
|---|---|
| `@actions/core` | `getInput`, `getBooleanInput`, `info`, `debug`, `warning`, `setFailed`, `setOutput` |
| `@actions/github` | `getOctokit` (returns fake octokit object), `context.repo`, `context.ref` |
| `../src/services/github.js` *(version tests only)* | `getMergedPullRequestsFilteredByCreated` returns a controlled `PullRequest[]` |

For **github.test.ts**, the fake octokit is built inline per test:

```typescript
const mockListReleases = vi.fn()
const mockPaginate = vi.fn()
const fakeOctokit = {
  rest: { repos: { listReleases: mockListReleases } },
  paginate: mockPaginate,
}
vi.mocked(github.getOctokit).mockReturnValue(fakeOctokit as never)
```

`setupOctokit()` is called at the start of each github test that needs an initialised client.

**Module state isolation:** `octokit` is a module-level variable in `github.ts`. Once set, it persists across tests in the same module instance. `github.test.ts` must use `vi.resetModules()` in `beforeEach` and re-import the service functions dynamically inside each test (or use `beforeEach` + `vi.isolateModules`) to guarantee a fresh `octokit = null` state for the "not initialized" scenarios (1 and 6).

---

## Test Scenarios

### `version.test.ts`

Default action inputs used across all version tests unless overridden:

```
channel: "stable"
new-build-for-prerelease: "true"
major-labels: "breaking-change"
minor-labels: "feature,enhancement"
patch-labels: "bug,bugfix,dependencies"
```

#### Channel / prerelease branching (no PR fetch)

These paths are decided before any network call, so `getMergedPullRequestsFilteredByCreated` must not be called.

| # | Tag | Channel | Expected output |
|---|---|---|---|
| 1 | `v1.0.0-beta.1` | stable | `v1.0.0` |
| 2 | `v1.0.0-alpha.3` | alpha | `v1.0.0-alpha.4` |
| 3 | `v1.0.0-alpha.1` | beta | `v1.0.0-beta.1` |
| 4 | `v1.0.0-alpha` | alpha | `v1.0.0-alpha.1` (NaN guard — no numeric component) |

#### PR-driven bumps (stable channel, `v`-prefixed tags, base tag `v1.2.3`)

`getMergedPullRequestsFilteredByCreated` is mocked to return the listed PRs.

| # | PRs (labels) | Expected |
|---|---|---|
| 5 | `[]` (empty) | throws `No changes found` |
| 6 | one PR, no recognised labels | throws `No changes found` |
| 7 | `[bug]` | `v1.2.4` |
| 8 | `[feature]` | `v1.3.0` |
| 9 | `[breaking-change]` | `v2.0.0` |
| 10 | `[bug]`, `[feature]` (patch then minor) | `v1.3.0` (MINOR beats PATCH) |
| 11 | `[feature]`, `[breaking-change]`, `[feature]` | `v2.0.0` (MAJOR breaks loop) |

#### Label input edge cases

| # | Scenario | Expected |
|---|---|---|
| 12 | `patch-labels` configured with spaces: `" bug, bugfix"` — PR has label `bug` | `v1.2.4` (trim fix) |
| 13 | `patch-labels` configured as empty string `""` — PR has label `bug` | throws `No changes found` (filter(Boolean) fix) |

#### Version prefix passthrough

| # | Tag | Expected prefix |
|---|---|---|
| 14 | `v1.2.3` | result starts with `v` |
| 15 | `1.2.3` | result has no `v` prefix |

#### Prerelease channel with stable tag (PR-driven)

| # | Tag | Channel | PRs | Expected |
|---|---|---|---|---|
| 16 | `1.0.0` | alpha | `[feature]` | `1.1.0-alpha.1` |

#### Invalid input

| # | Scenario | Expected |
|---|---|---|
| 17 | Tag `not-a-semver` | throws `Invalid version name` |

---

### `github.test.ts`

Default context for all github tests:
```typescript
context.repo = { owner: 'owner', repo: 'repo' }
context.ref = 'refs/heads/main'
core.getInput('pull_requests_base_branch') → ''  // derive from ref
```

#### `getLatestTag`

| # | Setup | Expected |
|---|---|---|
| 1 | `setupOctokit` not called | throws `octokit not initialized` |
| 2 | `listReleases` resolves with one release | returns it as `Tag` |
| 3 | `listReleases` resolves with empty array | throws `No releases found` |
| 4 | `listReleases` rejects with error containing "Not Found" | throws `No releases found` |
| 5 | `listReleases` rejects with generic error `"server error"` | throws `Releases listing failed (server error)` with `cause` set |

#### `getMergedPullRequestsFilteredByCreated`

| # | Setup | Expected |
|---|---|---|
| 6 | `setupOctokit` not called | throws `octokit not initialized` |
| 7 | `paginate` resolves with 3 PRs | returns array of 3 `PullRequest` objects |
| 8 | `paginate` resolves with `[]` | returns `[]` |
| 9 | `paginate` resolves with exactly 1000 items | `core.warning` called once |
| 10 | `paginate` resolves with 999 items | `core.warning` not called |
| 11 | Query string captured from paginate call | contains `created:>=` |
| 12 | `stopOnLabels` = `['breaking-change']`, page contains matching PR | the map callback calls `done()` |
| 13 | `stopOnLabels` = `[]` | `done()` never called |
| 14 | `paginate` rejects with `"rate limit"` | throws `Pull requests search failed (rate limit)` with `cause` set |

---

## Coverage Targets

| File | Target |
|---|---|
| `src/services/version.ts` | ≥ 90 % line |
| `src/services/github.ts` | ≥ 90 % line |

No hard gate on branch coverage — some branches (e.g. octokit null-check in non-initialised path) are exercised via scenario 1/6.

---

## Out of Scope

- `src/main.ts` — thin orchestration, no independent logic.
- `src/index.ts` — single `void run()` call.
- `src/constants/` and `src/interfaces/` — pure data, no logic.
