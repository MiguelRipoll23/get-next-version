# Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vitest test suite covering all 17 version-bump scenarios and 14 GitHub service scenarios without network calls.

**Architecture:** Two test files under `__tests__/`. Version tests mock `@actions/core` and the github service module at the top level. GitHub service tests use `vi.resetModules()` in `beforeEach` plus dynamic imports to guarantee a fresh `octokit = null` between tests, because `octokit` is a module-level variable.

**Tech Stack:** Vitest 3, @vitest/coverage-v8, TypeScript (esbuild transpilation handled by Vitest — no separate tsconfig needed)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `vitest.config.ts` | Create | Vitest config with coverage settings |
| `package.json` | Modify | Replace old test script, add coverage script, add devDeps |
| `__tests__/version.test.ts` | Create | 17 scenarios for `getNextVersion` |
| `__tests__/github.test.ts` | Create | 14 scenarios for `getLatestTag` + `getMergedPullRequestsFilteredByCreated` |

---

## Task 1: Install Vitest and configure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-dev vitest @vitest/coverage-v8 --legacy-peer-deps
```

Expected: packages added to `devDependencies`.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/services/**'],
      thresholds: {
        lines: 90,
      },
    },
  },
})
```

- [ ] **Step 3: Update `package.json` scripts**

Replace the `"test"` script and add `"test:coverage"`. The old `"test"` ran a manual git-based packaging step; it is superseded by Vitest.

In `package.json`, change the `scripts` block to:

```json
"scripts": {
  "bundle": "npm run format:write && npm run package",
  "format:write": "npx prettier --write .",
  "format:check": "npx prettier --check .",
  "lint": "npx eslint .",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "package": "npx ncc build src/index.ts -o dist --source-map --license licenses.txt"
},
```

- [ ] **Step 4: Commit setup**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: install vitest and configure coverage"
```

---

## Task 2: `version.test.ts` — scaffold, mocks, and channel/prerelease tests (scenarios 1–4)

**Files:**
- Create: `__tests__/version.test.ts`

These four scenarios exercise the channel/prerelease short-circuit path. `getMergedPullRequestsFilteredByCreated` must **not** be called in any of them.

- [ ] **Step 1: Create `__tests__/version.test.ts` with this exact content**

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  getBooleanInput: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
}))

vi.mock('../src/services/github.js', () => ({
  getMergedPullRequestsFilteredByCreated: vi.fn(),
  setupOctokit: vi.fn(),
  getLatestTag: vi.fn(),
}))

import * as core from '@actions/core'
import { getMergedPullRequestsFilteredByCreated } from '../src/services/github.js'
import { getNextVersion } from '../src/services/version.js'
import type { Tag } from '../src/interfaces/tag-interface.js'
import type { PullRequest } from '../src/interfaces/pull-request-interface.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTag(tagName: string): Tag {
  return { tag_name: tagName, created_at: '2024-01-01T00:00:00Z' }
}

function makePRs(labelSets: string[][]): PullRequest[] {
  return labelSets.map((labels, i) => ({
    id: i + 1,
    title: `PR ${i + 1}`,
    labels: labels.map(name => ({ name })),
  }))
}

// ── Default inputs ────────────────────────────────────────────────────────────

const DEFAULT_INPUTS: Record<string, string> = {
  channel: 'stable',
  'new-build-for-prerelease': 'true',
  'major-labels': 'breaking-change',
  'minor-labels': 'feature,enhancement',
  'patch-labels': 'bug,bugfix,dependencies',
  pull_requests_base_branch: '',
}

function setupInputs(overrides: Record<string, string> = {}): void {
  const inputs = { ...DEFAULT_INPUTS, ...overrides }
  vi.mocked(core.getInput).mockImplementation((name, _opts) => inputs[name] ?? '')
  vi.mocked(core.getBooleanInput).mockImplementation(
    (name, _opts) => inputs[name] === 'true'
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  setupInputs()
  vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue([])
})

// ── Scenarios 1–4: channel/prerelease branching (no PR fetch) ─────────────────

describe('channel/prerelease branching — no PR fetch', () => {
  it('stable channel + prerelease tag strips prerelease (v1.0.0-beta.1 → v1.0.0)', async () => {
    setupInputs({ channel: 'stable' })
    const result = await getNextVersion(makeTag('v1.0.0-beta.1'))
    expect(result).toBe('v1.0.0')
    expect(getMergedPullRequestsFilteredByCreated).not.toHaveBeenCalled()
  })

  it('same-channel prerelease bumps build number (v1.0.0-alpha.3 → v1.0.0-alpha.4)', async () => {
    setupInputs({ channel: 'alpha' })
    const result = await getNextVersion(makeTag('v1.0.0-alpha.3'))
    expect(result).toBe('v1.0.0-alpha.4')
    expect(getMergedPullRequestsFilteredByCreated).not.toHaveBeenCalled()
  })

  it('different-channel prerelease resets build to 1 (v1.0.0-alpha.1 + channel=beta → v1.0.0-beta.1)', async () => {
    setupInputs({ channel: 'beta' })
    const result = await getNextVersion(makeTag('v1.0.0-alpha.1'))
    expect(result).toBe('v1.0.0-beta.1')
    expect(getMergedPullRequestsFilteredByCreated).not.toHaveBeenCalled()
  })

  it('prerelease tag with no numeric component defaults count to 1, not NaN (v1.0.0-alpha → v1.0.0-alpha.1)', async () => {
    setupInputs({ channel: 'alpha' })
    const result = await getNextVersion(makeTag('v1.0.0-alpha'))
    expect(result).toBe('v1.0.0-alpha.1')
    expect(result).not.toContain('NaN')
    expect(getMergedPullRequestsFilteredByCreated).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run scenarios 1–4**

```bash
npm test -- --reporter=verbose
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add __tests__/version.test.ts
git commit -m "test: add version channel/prerelease branching tests (scenarios 1-4)"
```

---

## Task 3: `version.test.ts` — PR-driven bump tests (scenarios 5–11)

**Files:**
- Modify: `__tests__/version.test.ts`

- [ ] **Step 1: Append the following `describe` block to `__tests__/version.test.ts`**

Add after the last closing `})` in the file:

```typescript
// ── Scenarios 5–11: PR-driven bumps ──────────────────────────────────────────

describe('PR-driven bumps — stable channel, tag v1.2.3', () => {
  const tag = makeTag('v1.2.3')

  it('no PRs throws No changes found', async () => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue([])
    await expect(getNextVersion(tag)).rejects.toThrow('No changes found')
  })

  it('PR with unrecognised label throws No changes found', async () => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['docs']])
    )
    await expect(getNextVersion(tag)).rejects.toThrow('No changes found')
  })

  it('patch label → v1.2.4', async () => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['bug']])
    )
    expect(await getNextVersion(tag)).toBe('v1.2.4')
  })

  it('minor label → v1.3.0', async () => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['feature']])
    )
    expect(await getNextVersion(tag)).toBe('v1.3.0')
  })

  it('major label → v2.0.0', async () => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['breaking-change']])
    )
    expect(await getNextVersion(tag)).toBe('v2.0.0')
  })

  it('MINOR beats PATCH across multiple PRs ([bug, feature] → v1.3.0)', async () => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['bug'], ['feature']])
    )
    expect(await getNextVersion(tag)).toBe('v1.3.0')
  })

  it('MAJOR breaks loop early ([feature, breaking-change, feature] → v2.0.0)', async () => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['feature'], ['breaking-change'], ['feature']])
    )
    expect(await getNextVersion(tag)).toBe('v2.0.0')
  })
})
```

- [ ] **Step 2: Run all version tests**

```bash
npm test -- --reporter=verbose
```

Expected: 11 tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/version.test.ts
git commit -m "test: add PR-driven bump tests (scenarios 5-11)"
```

---

## Task 4: `version.test.ts` — label edge cases, prefix, invalid input (scenarios 12–17)

**Files:**
- Modify: `__tests__/version.test.ts`

- [ ] **Step 1: Append three more `describe` blocks to `__tests__/version.test.ts`**

Add after the last `})` in the file:

```typescript
// ── Scenarios 12–13: label input edge cases ───────────────────────────────────

describe('label input edge cases', () => {
  const tag = makeTag('v1.2.3')

  it('whitespace around commas is trimmed (" bug, bugfix" matches label bug → v1.2.4)', async () => {
    setupInputs({ 'patch-labels': ' bug, bugfix' })
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['bug']])
    )
    expect(await getNextVersion(tag)).toBe('v1.2.4')
  })

  it('empty patch-labels input produces no matches → No changes found', async () => {
    setupInputs({ 'patch-labels': '' })
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['bug']])
    )
    await expect(getNextVersion(tag)).rejects.toThrow('No changes found')
  })
})

// ── Scenarios 14–15: version prefix passthrough ────────────────────────────────

describe('version prefix passthrough', () => {
  beforeEach(() => {
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['bug']])
    )
  })

  it('v-prefixed tag produces v-prefixed result', async () => {
    const result = await getNextVersion(makeTag('v1.2.3'))
    expect(result).toMatch(/^v/)
  })

  it('unprefixed tag produces unprefixed result', async () => {
    const result = await getNextVersion(makeTag('1.2.3'))
    expect(result).not.toMatch(/^v/)
    expect(result).toBe('1.2.4')
  })
})

// ── Scenario 16: prerelease channel + stable tag ──────────────────────────────

describe('prerelease channel with stable tag uses PR labels', () => {
  it('feature PR on stable 1.0.0 with channel=alpha → 1.1.0-alpha.1', async () => {
    setupInputs({ channel: 'alpha' })
    vi.mocked(getMergedPullRequestsFilteredByCreated).mockResolvedValue(
      makePRs([['feature']])
    )
    expect(await getNextVersion(makeTag('1.0.0'))).toBe('1.1.0-alpha.1')
  })
})

// ── Scenario 17: invalid tag ──────────────────────────────────────────────────

describe('invalid input', () => {
  it('malformed tag name throws Invalid version name', async () => {
    await expect(getNextVersion(makeTag('not-a-semver'))).rejects.toThrow(
      'Invalid version name'
    )
  })
})
```

- [ ] **Step 2: Run all 17 version tests**

```bash
npm test -- --reporter=verbose
```

Expected: 17 tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/version.test.ts
git commit -m "test: add label edge cases, prefix, and invalid input tests (scenarios 12-17)"
```

---

## Task 5: `github.test.ts` — scaffold + `getLatestTag` tests (scenarios 1–5)

**Files:**
- Create: `__tests__/github.test.ts`

Key design: `octokit` is a module-level `let` in `github.ts`. `vi.resetModules()` in `beforeEach` clears the module cache so each test re-evaluates the module from scratch, resetting `octokit` to `null`. The service module is re-imported dynamically after setting up the mock octokit.

- [ ] **Step 1: Create `__tests__/github.test.ts` with this exact content**

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@actions/core', () => ({
  getInput: vi.fn().mockReturnValue(''),
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@actions/github', () => ({
  getOctokit: vi.fn(),
  context: {
    repo: { owner: 'owner', repo: 'repo' },
    ref: 'refs/heads/main',
  },
}))

// ── Per-test module isolation ─────────────────────────────────────────────────
//
// octokit is a module-level variable in github.ts. vi.resetModules() clears
// the module cache so each test starts with a fresh octokit = null.

let serviceModule: typeof import('../src/services/github.js')
let coreModule: typeof import('@actions/core')
let mockListReleases: ReturnType<typeof vi.fn>
let mockPaginate: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.resetModules()

  mockListReleases = vi.fn()
  mockPaginate = vi.fn()

  // Import in dependency order so github.ts gets the already-cached instances.
  coreModule = await import('@actions/core')

  const githubActions = await import('@actions/github')
  vi.mocked(githubActions.getOctokit).mockReturnValue({
    rest: { repos: { listReleases: mockListReleases } },
    paginate: mockPaginate,
  } as never)

  // Fresh service module — octokit starts as null
  serviceModule = await import('../src/services/github.js')
})

// ── Scenarios 1–5: getLatestTag ───────────────────────────────────────────────

describe('getLatestTag', () => {
  it('throws octokit not initialized when setupOctokit has not been called', async () => {
    await expect(serviceModule.getLatestTag()).rejects.toThrow(
      'octokit not initialized'
    )
  })

  it('returns the first release as a Tag', async () => {
    mockListReleases.mockResolvedValue({
      data: [{ tag_name: 'v1.0.0', created_at: '2024-01-01T00:00:00Z' }],
    })
    serviceModule.setupOctokit()
    const result = await serviceModule.getLatestTag()
    expect(result.tag_name).toBe('v1.0.0')
    expect(result.created_at).toBe('2024-01-01T00:00:00Z')
  })

  it('throws No releases found when the release list is empty', async () => {
    mockListReleases.mockResolvedValue({ data: [] })
    serviceModule.setupOctokit()
    await expect(serviceModule.getLatestTag()).rejects.toThrow('No releases found')
  })

  it('throws No releases found when the API error contains "Not Found"', async () => {
    mockListReleases.mockRejectedValue(new Error('Not Found'))
    serviceModule.setupOctokit()
    await expect(serviceModule.getLatestTag()).rejects.toThrow('No releases found')
  })

  it('wraps generic API errors as Releases listing failed with cause', async () => {
    const cause = new Error('server error')
    mockListReleases.mockRejectedValue(cause)
    serviceModule.setupOctokit()
    const error = await serviceModule.getLatestTag().catch(e => e)
    expect(error.message).toBe('Releases listing failed (server error)')
    expect(error.cause).toBe(cause)
  })
})
```

- [ ] **Step 2: Run getLatestTag tests**

```bash
npm test -- --reporter=verbose
```

Expected: 5 new tests pass alongside all 17 version tests (22 total).

- [ ] **Step 3: Commit**

```bash
git add __tests__/github.test.ts
git commit -m "test: add getLatestTag tests (scenarios 1-5)"
```

---

## Task 6: `github.test.ts` — `getMergedPullRequestsFilteredByCreated` tests (scenarios 6–14)

**Files:**
- Modify: `__tests__/github.test.ts`

Scenarios 12 and 13 test the `done()` callback injected into `octokit.paginate`. The approach: `mockPaginate.mockImplementation` captures the third argument (the map function) and calls it manually with a crafted page response and a `done` spy.

- [ ] **Step 1: Append the following `describe` block to `__tests__/github.test.ts`**

Add after the last `})` in the file:

```typescript
// ── Scenarios 6–14: getMergedPullRequestsFilteredByCreated ───────────────────

describe('getMergedPullRequestsFilteredByCreated', () => {
  const CREATED_AT = '2024-01-01T00:00:00Z'

  function makePR(labelNames: string[]) {
    return {
      id: 1,
      title: 'PR',
      labels: labelNames.map(name => ({ name })),
    }
  }

  it('throws octokit not initialized when setupOctokit has not been called', async () => {
    await expect(
      serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT)
    ).rejects.toThrow('octokit not initialized')
  })

  it('returns the array returned by paginate', async () => {
    const prs = [makePR(['bug']), makePR(['feature']), makePR(['docs'])]
    mockPaginate.mockResolvedValue(prs)
    serviceModule.setupOctokit()
    const result = await serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT)
    expect(result).toHaveLength(3)
    expect(result[0].labels[0].name).toBe('bug')
  })

  it('returns an empty array when paginate resolves with []', async () => {
    mockPaginate.mockResolvedValue([])
    serviceModule.setupOctokit()
    const result = await serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT)
    expect(result).toEqual([])
  })

  it('emits core.warning when response length equals 1000', async () => {
    mockPaginate.mockResolvedValue(Array(1000).fill(makePR([])))
    serviceModule.setupOctokit()
    await serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT)
    expect(vi.mocked(coreModule.warning)).toHaveBeenCalledOnce()
    expect(vi.mocked(coreModule.warning)).toHaveBeenCalledWith(
      expect.stringContaining('1,000')
    )
  })

  it('does not emit core.warning when response length is 999', async () => {
    mockPaginate.mockResolvedValue(Array(999).fill(makePR([])))
    serviceModule.setupOctokit()
    await serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT)
    expect(vi.mocked(coreModule.warning)).not.toHaveBeenCalled()
  })

  it('query string contains created:>= and the provided timestamp', async () => {
    let capturedParams: { q: string; per_page: number } | undefined
    mockPaginate.mockImplementation(
      async (
        _route: unknown,
        params: { q: string; per_page: number }
      ) => {
        capturedParams = params
        return []
      }
    )
    serviceModule.setupOctokit()
    await serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT)
    expect(capturedParams?.q).toContain('created:>=')
    expect(capturedParams?.q).toContain(CREATED_AT)
  })

  it('calls done() when a page contains a PR matching stopOnLabels', async () => {
    type MapFn = (
      res: { data: Array<{ labels: Array<{ name: string }> }> },
      done: () => void
    ) => unknown[]
    let capturedMapFn: MapFn | undefined
    mockPaginate.mockImplementation(
      async (_route: unknown, _params: unknown, mapFn: MapFn) => {
        capturedMapFn = mapFn
        return []
      }
    )
    serviceModule.setupOctokit()
    await serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT, [
      'breaking-change',
    ])

    const doneSpy = vi.fn()
    capturedMapFn!(
      { data: [{ labels: [{ name: 'breaking-change' }] }] },
      doneSpy
    )
    expect(doneSpy).toHaveBeenCalledOnce()
  })

  it('does not call done() when stopOnLabels is empty', async () => {
    type MapFn = (
      res: { data: Array<{ labels: Array<{ name: string }> }> },
      done: () => void
    ) => unknown[]
    let capturedMapFn: MapFn | undefined
    mockPaginate.mockImplementation(
      async (_route: unknown, _params: unknown, mapFn: MapFn) => {
        capturedMapFn = mapFn
        return []
      }
    )
    serviceModule.setupOctokit()
    await serviceModule.getMergedPullRequestsFilteredByCreated(CREATED_AT, [])

    const doneSpy = vi.fn()
    capturedMapFn!(
      { data: [{ labels: [{ name: 'breaking-change' }] }] },
      doneSpy
    )
    expect(doneSpy).not.toHaveBeenCalled()
  })

  it('wraps paginate errors as Pull requests search failed with cause', async () => {
    const cause = new Error('rate limit')
    mockPaginate.mockRejectedValue(cause)
    serviceModule.setupOctokit()
    const error = await serviceModule
      .getMergedPullRequestsFilteredByCreated(CREATED_AT)
      .catch(e => e)
    expect(error.message).toBe('Pull requests search failed (rate limit)')
    expect(error.cause).toBe(cause)
  })
})
```

- [ ] **Step 2: Run the full test suite**

```bash
npm test -- --reporter=verbose
```

Expected: 31 tests pass (17 version + 5 getLatestTag + 9 getMergedPullRequests). Zero failures.

- [ ] **Step 3: Commit**

```bash
git add __tests__/github.test.ts
git commit -m "test: add getMergedPullRequestsFilteredByCreated tests (scenarios 6-14)"
```

---

## Task 7: Coverage verification and final commit

**Files:** none (read-only verification)

- [ ] **Step 1: Run coverage**

```bash
npm run test:coverage
```

Expected output includes a coverage table for `src/services/version.ts` and `src/services/github.ts`. Both should show ≥ 90% line coverage. If either is below 90%, the thresholds in `vitest.config.ts` will cause this command to exit with code 1 — investigate which branches are uncovered and add a targeted test.

- [ ] **Step 2: Lint the test files**

```bash
npm run lint
```

Expected: no errors. If `@typescript-eslint/explicit-function-return-type` fires on `makePR` or `makeTag` helpers inside describe blocks (they are function declarations, not expressions), move them to arrow-function form:

```typescript
// Change:
function makePR(labelNames: string[]) { ... }
// To:
const makePR = (labelNames: string[]) => ({ ... })
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: verify ≥90% line coverage for service modules"
```

---

## Self-review notes

**Spec coverage:**
- Scenarios 1–4 ✓ Task 2
- Scenarios 5–11 ✓ Task 3
- Scenarios 12–13 ✓ Task 4
- Scenarios 14–15 ✓ Task 4
- Scenario 16 ✓ Task 4
- Scenario 17 ✓ Task 4
- GitHub scenarios 1–5 ✓ Task 5
- GitHub scenarios 6–14 ✓ Task 6

**Module isolation:** `vi.resetModules()` in `beforeEach` + dynamic imports guarantees fresh `octokit = null` for every github test. Covered in Task 5 scaffold.

**Type consistency:** `serviceModule`, `coreModule`, `mockListReleases`, `mockPaginate` declared at describe scope, assigned in `beforeEach`, used uniformly across Tasks 5 and 6. `makePR` in Task 6 is locally scoped to avoid collision with `makePRs` in version tests (different file). `MapFn` type alias duplicated in two tests — intentional, they are in separate `it` blocks and must be self-contained.
