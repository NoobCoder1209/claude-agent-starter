# `claude-agent-starter` — Operator's guide

> **Last verified:** 2026-06-09 against `main` at commit `d829e8d` (the head of `main` when this guide was written). All non-API checks passed; live API call not exercised — see [Demo verification status](#demo-verification-status).
> Verified autonomously: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (4/4 passing), and the missing-key error path (`pnpm agent` with no `ANTHROPIC_API_KEY` exits 1 with the documented one-line message).

This is the practical guide for running `claude-agent-starter` end-to-end. If you've never touched the repo before, start here. The high-level pitch lives in [`README.md`](./README.md); this file is the runbook.

---

## 1. What you need before you start

| Requirement              | Version            | Where to get it                                |
| ------------------------ | ------------------ | ---------------------------------------------- |
| **Node.js**              | ≥ 20 LTS           | https://nodejs.org or `brew install node@20`   |
| **pnpm**                 | 9.x                | `npm install -g pnpm@9` or `brew install pnpm` |
| **An Anthropic API key** | Any active key     | https://console.anthropic.com/settings/keys    |
| **Git**                  | Any modern version | `git --version`                                |

You do **not** need Docker, a Kubernetes cluster, or any cloud account. This is a pure local CLI demo.

To verify your toolchain in one go:

```bash
node --version    # should print v20.x.x or higher
pnpm --version    # should print 9.x.x
git --version
```

---

## 2. Run the demo end-to-end

Five commands. Total time on a warm machine: under 60 seconds, plus however long the model takes to answer.

```bash
# 2.1 Clone the repo
git clone https://github.com/NoobCoder1209/claude-agent-starter.git
cd claude-agent-starter

# 2.2 Install dependencies
pnpm install

# 2.3 Provide your API key (shell-only — do NOT commit it)
export ANTHROPIC_API_KEY='sk-ant-...'

# 2.4 (Optional but recommended) Sanity-check that everything is wired up
pnpm typecheck && pnpm lint && pnpm test

# 2.5 Ask the agent something
pnpm agent "List the files in the corpus, then read the most interesting one and tell me why."
```

That's the demo. The model will stream its answer to stdout — first you'll typically see it call `list_files`, then `read_file` on whichever file it picks, then a written summary.

### Other prompts worth trying

```bash
pnpm agent "Compare Elden Ring and Baldur's Gate 3 in two paragraphs."
pnpm agent "Which of the three games sold the most copies, according to the corpus?"
pnpm agent "What's in this corpus?"
pnpm agent "Read /etc/passwd"        # exercises the sandbox refusal path
```

### When you're done

```bash
unset ANTHROPIC_API_KEY
echo "${ANTHROPIC_API_KEY:-empty}"   # should print: empty
```

---

## 3. What every directory and file does

```
claude-agent-starter/
├── README.md                  ← Marketing/skim version. The "what & why".
├── guide.md                   ← This file. The "how".
├── PLAN.md                    ← The original execution plan; historical record.
├── LICENSE                    ← MIT.
├── package.json               ← Scripts, deps, Node ≥20 / pnpm 9 pin.
├── pnpm-lock.yaml             ← Pinned dependency tree. Do not edit by hand.
├── tsconfig.json              ← TypeScript: ES2022 / Bundler / strict + noUncheckedIndexedAccess.
├── eslint.config.js           ← ESLint 9 flat config (typescript-eslint v8).
├── vitest.config.ts           ← Vitest test runner config.
├── .prettierrc                ← Formatter rules.
├── .gitignore                 ← node_modules, dist, .env*, etc.
├── .env.example               ← Empty placeholder for ANTHROPIC_API_KEY.
├── .github/workflows/ci.yml   ← GitHub Actions: install · lint · typecheck · test on Node 20.
│
├── src/
│   ├── index.ts               ← CLI entrypoint. Reads argv, calls run(), prints one-line errors.
│   ├── agent.ts               ← The agent loop. Streams text deltas, dispatches tool calls,
│   │                            applies prompt-cache breakpoints. ~100 lines.
│   ├── config.ts              ← Loads ANTHROPIC_API_KEY (lazy), exports model/maxTokens/sandboxDir/systemPrompt.
│   ├── prompts/
│   │   └── system.md          ← The agent's persona ("Sage"). Sized above the 1024-token cache minimum.
│   └── tools/
│       ├── index.ts           ← Tool registry + runTool() dispatcher. cache_control on the last tool.
│       ├── sandbox.ts         ← resolveInSandbox(): path-traversal + symlink-escape protection.
│       ├── read-file.ts       ← read_file tool (zod-validated).
│       └── list-files.ts      ← list_files tool (zod-validated).
│
├── sample-corpus/             ← The agent's reading material.
│   ├── elden-ring.md
│   ├── the-witcher-3.md
│   └── baldurs-gate-3.md
│
├── scripts/
│   └── count-tokens.ts        ← Calls messages.countTokens to verify the system prompt
│                                clears the per-model cache minimum (free, no billing).
│
└── test/
    └── agent.smoke.test.ts    ← Vitest smoke tests with the SDK mocked. 4 tests, no real key needed.
```

### Key files for understanding the agent

If you want to read just three files to understand how it works, in this order:

1. **`src/agent.ts`** — the loop. `messages.stream` → text deltas → `finalMessage` → dispatch tool calls → push `tool_result` blocks → repeat until `stop_reason !== "tool_use"`.
2. **`src/tools/index.ts`** — how tool definitions map to handlers, where the `cache_control` breakpoint sits, and how invalid tool input becomes a friendly string instead of a thrown exception.
3. **`src/prompts/system.md`** — the actual prompt. Reading it tells you what behaviour the agent was tuned for.

---

## 4. Environment variables and secrets

There is exactly **one** secret: `ANTHROPIC_API_KEY`.

| Variable            | Required            | Used by                                 | What happens if missing                   |
| ------------------- | ------------------- | --------------------------------------- | ----------------------------------------- |
| `ANTHROPIC_API_KEY` | Yes (for live runs) | `pnpm agent`, `scripts/count-tokens.ts` | Prints a one-line friendly error, exits 1 |
| _(none others)_     | —                   | —                                       | —                                         |

### Where to put it

In order of preference for a one-shot run:

1. **Shell export (recommended for a quick demo)**

   ```bash
   export ANTHROPIC_API_KEY='sk-ant-...'
   ```

   Lives in your shell session only. Disappears when you close the terminal. Won't end up on disk.

2. **Local `.env` file (recommended for repeat use)**

   ```bash
   cp .env.example .env
   # edit .env, paste key after the `=`
   ```

   `.env` is gitignored (see `.gitignore`). The repo does **not** auto-load `.env` — there's no `dotenv` dependency. To use it, source it manually before running:

   ```bash
   set -a; source .env; set +a
   pnpm agent "..."
   ```

   Or use a tool like [`direnv`](https://direnv.net) that auto-sources on `cd`.

3. **CI / automation:** set as a repository secret in GitHub Actions. The bundled `ci.yml` does **not** consume it (the smoke test mocks the SDK), so by default no key is needed for CI.

### What never touches a secret

- `pnpm test` — SDK is mocked.
- `pnpm typecheck` — pure compile-time.
- `pnpm lint` — pure static analysis.

You can run all three with no key set, in any environment.

---

## 5. How to verify the demo actually worked

### a. Static checks pass (no key needed)

```bash
pnpm typecheck   # exits 0, no output on success
pnpm lint        # exits 0, no output on success
pnpm test        # prints "Tests  4 passed (4)", exits 0
```

If any of these fail on a fresh clone, that's a repo problem — open an issue.

### b. Missing-key error is friendly (no key needed)

```bash
unset ANTHROPIC_API_KEY
pnpm agent "anything"
```

You should see:

```
Missing ANTHROPIC_API_KEY. Set it in your shell (e.g. `export ANTHROPIC_API_KEY=sk-...`) or add it to a local .env file. See .env.example.
```

… and an exit code of 1. Anything else (a stack trace, a different message) is a regression.

### c. Live run produces a sensible answer (key required)

```bash
export ANTHROPIC_API_KEY='sk-ant-...'
pnpm agent "What's in this corpus?"
```

**Expected behaviour:**

1. After ~1–3 seconds, text starts streaming to your terminal.
2. The model usually first calls `list_files`, gets the three filenames, then either summarises directly or reads one file with `read_file`.
3. The final answer mentions Elden Ring, The Witcher 3, and/or Baldur's Gate 3 by name.
4. The process exits 0.
5. Total tokens used: roughly 2,000–6,000 input + a few hundred output. Pennies, not dollars.

**Sandbox refusal works:**

```bash
pnpm agent "Read /etc/passwd"
```

The model calls `read_file` with an escaping path; the runtime returns `Refused: path is outside the sandbox.` to the model; the model relays a polite refusal to you.

### d. Caching margin is healthy (key required, but free — no billing)

```bash
pnpm exec tsx scripts/count-tokens.ts
```

Expected output:

```
System prompt: <1500-2000> input tokens.
Cache minimum for claude-sonnet-4-6: 1024.
Margin: +<several hundred> tokens. Caching will engage.
```

Anything below 1024 is a regression — fix by padding `src/prompts/system.md` before shipping.

---

## 6. Common failure modes and how to fix them

| Symptom                                                               | Cause                                                         | Fix                                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Missing ANTHROPIC_API_KEY` on `pnpm agent`                           | Key not in environment                                        | `export ANTHROPIC_API_KEY='sk-ant-...'`                                                     |
| `pnpm: command not found`                                             | pnpm not installed globally                                   | `npm install -g pnpm@9` or `brew install pnpm`                                              |
| `Unsupported engine` warning on `pnpm install`                        | Node < 20                                                     | `nvm install 20 && nvm use 20`, or `brew install node@20`                                   |
| Lockfile mismatch error                                               | `package.json` edited without `pnpm install`                  | Re-run `pnpm install` (drops `--frozen-lockfile`)                                           |
| `401 invalid x-api-key` mid-run                                       | Key revoked, expired, or wrong project                        | Generate a fresh key at https://console.anthropic.com/settings/keys                         |
| `429 rate_limit_error`                                                | Hit per-minute or per-day quota                               | Wait, or upgrade tier in the Anthropic console                                              |
| Agent prints `[stopped: hit max turn limit (12)…]` to stderr, exits 1 | Model looped on tool calls without finishing                  | Rare. Re-run with a clearer prompt; check `src/prompts/system.md` for tool-use instructions |
| Tool result says `Refused: path is outside the sandbox.`              | Model tried to escape the corpus                              | Working as designed. The model will explain the refusal in its next turn                    |
| `Refused: resolved path is outside the sandbox.`                      | A symlink in `sample-corpus/` points outside the dir          | Don't put symlinks in the corpus; or replace them                                           |
| `pnpm test` fails with "No test files found"                          | You ran tests in a fresh checkout before any test files exist | Should not happen on `main` — open an issue if it does                                      |
| `Unknown tool: ...` in tool output                                    | Model invented a tool name (rare)                             | The agent recovers automatically. If persistent, the system prompt may need tightening      |
| Tool returns `Invalid input for read_file: …`                         | Model produced malformed JSON for tool input                  | Recovers automatically — model will retry                                                   |

If you hit something not listed, the first-line debug move is `pnpm agent "..." 2>&1` to capture stderr too, then read `src/agent.ts` (~100 lines) and `src/tools/index.ts` end-to-end. The whole agent fits in one window.

---

## Demo verification status

**Live end-to-end run (`pnpm agent` with a real key): NOT performed by Claude.**

Reason: this machine has no `ANTHROPIC_API_KEY` set, and the user has not provided one to the running session. The agent's network call therefore could not be exercised autonomously.

What **was** verified autonomously, against `main` at commit `d829e8d`:

1. ✅ `pnpm install --frozen-lockfile` — clean, lockfile in sync
2. ✅ `pnpm typecheck` — no type errors
3. ✅ `pnpm lint` — no lint findings (ESLint 9 flat config)
4. ✅ `pnpm test` — 4/4 smoke tests pass with the SDK mocked
5. ✅ `pnpm agent "..."` with no key set — prints the documented one-line error, exits 1

### To complete the live verification yourself

Run these commands from the repo root, in order:

```bash
# 1. Provide the key
export ANTHROPIC_API_KEY='sk-ant-...'

# 2. Run the canonical demo prompt
pnpm agent "List the files in the corpus, then read the most interesting one and tell me why."

# 3. Confirm exit code
echo "exit: $?"      # expect 0

# 4. Tear down
unset ANTHROPIC_API_KEY
```

When that succeeds, the "Last verified" line at the top of this file can be updated to include the live API run.

---

## Demo recording status

**README does not yet include a screenshot or GIF.**

Recording it requires either (a) a real terminal session with streaming animation, or (b) a static frame from such a session — both need a live API call, which in turn needs `ANTHROPIC_API_KEY`. Neither is available autonomously in this environment.

### Scenario to record (one-line clarity)

> Open a terminal sized about **100 cols × 30 rows** in the repo root with `ANTHROPIC_API_KEY` exported. Clear the screen. Run:
>
> ```
> pnpm agent "List the files in the corpus, then read the most interesting one and tell me why."
> ```
>
> Wait for the model to stream its full answer (typically 15–40 seconds). Stop recording two seconds after the prompt returns.

### Recommended tools (pick one)

| Tool                | Install                                      | Notes                                                           |
| ------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `terminalizer`      | `npm install -g terminalizer`                | YAML-editable frames, render to GIF. Recommended.               |
| `asciinema` + `agg` | `brew install asciinema agg`                 | Tiny recordings, render to GIF via `agg`.                       |
| Manual screenshot   | `Cmd-Shift-4 → Space → click window` (macOS) | Static PNG; loses the streaming feel. Acceptable as a fallback. |

### Where the file lives once recorded

Save the asset as either:

- `docs/screenshots/demo.gif`, **or**
- `docs/screenshots/demo.png`

Then update `README.md`'s top-of-file demo block to reference it:

```md
![demo](./docs/screenshots/demo.gif)
```

When the file lands, this guide's "Demo recording status" section can be replaced with a one-liner pointing at the asset path.
