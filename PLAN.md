# `claude-agent-starter` — Execution Plan

## How to use this plan

You are the build session for this repo. Read this whole file before doing anything else, then start executing immediately — no kickoff prompt needed.

**Working agreement:**

1. **Start without waiting.** When invoked, read this file end-to-end, then begin Phase 1 in the *Subagent playbook* section below. Do not ask "should I start?" — the answer is yes.
2. **Always ask the user about business decisions and business logic.** Tone, copy, agent personality, sample corpus topic, screenshot framing, anything user-facing or brand-related. These are *theirs* to decide. The "Business decisions to ask the user about" section below lists the open questions for this repo.
3. **Ask the user when you are genuinely blocked.** Missing credentials, ambiguous requirements, conflicting constraints, or a decision only they can make.
4. **Do not ask the user about engineering details.** Library choice, file structure, function naming, internal abstractions — make the call yourself, document it briefly in code or PR description.
5. **Use subagents aggressively.** Default to the playbook below for every non-trivial step. Parallel `Explore` for research, `Plan` for design, `code-reviewer` for review, `tester` for tests. Multiple subagents in a single message whenever they're independent.
6. **TaskCreate / TaskUpdate everything.** Track progress publicly so the user can see state any time.
7. **Pattern 3 only.** No live deployed demos calling Anthropic. README ships GIF/screenshots; user supplies their own key to run locally. Never commit a key.
8. **Follow the master plan's shared standards** (MIT, README structure, CI baseline, GitHub topics, repo stays private until verification passes).
9. **All `Agent` tool calls must pass `model: "opus"`.** Per user's saved preference.
10. **Off-limits forever:** anything under SAP-internal sources, anything from `~/.claude/`, RCA/runbook content. None of this material may surface in the public repo.

## Subagent playbook (this repo)

This repo is small. Don't over-spawn — the right level is 2–3 subagents per non-trivial phase.

**Phase 1 — Research (parallel, single message):**
- `Explore` (Opus): "Find the latest `@anthropic-ai/sdk` patterns for prompt caching with `cache_control`. Identify the canonical example in their docs and one well-regarded community example. Report ≤250 words."
- `Explore` (Opus): "Find the canonical TypeScript tool-use loop pattern for the Anthropic SDK including streaming + final-message tool dispatch. Return a minimal working code skeleton ≤80 lines."

**Phase 2 — Design (single agent):**
- `Plan` (Opus): "Given the research above and this PLAN.md, propose the exact file tree, package.json scripts, and 5-step build order. Return as a checklist."

**Phase 3 — Build:** main session writes the code. Dispatch `Explore` (Opus) only when stuck on a specific API question.

**Phase 4 — Review (parallel):**
- `code-reviewer` (Opus) on the diff: "Review for correctness, prompt-caching correctness, security (path traversal in tools), README accuracy. High effort."
- `tester` (Opus): "Write the smoke test that mocks `@anthropic-ai/sdk` and asserts a tool-use loop dispatches `read_file` and returns its content."

**Phase 5 — Polish:** main session captures GIF, applies review feedback, ticks the verification checklist, asks user before flipping public.

---

## Goal

Ship a TypeScript starter that demonstrates how to build an agent on top of the
Anthropic SDK in a way that's actually usable — not a "hello world", not a
LangChain wrapper, just clean, opinionated code a Claude developer would copy
from. The single most-skimmed piece of evidence on the Upwork profile.

**Audience:** clients hiring a Claude developer. They will skim the README,
maybe clone, maybe run.

**Sells the skills:** AI Agent Development, Anthropic Claude API, LLM Integration,
Prompt Engineering, MCP-adjacent (tool use), TypeScript.

## Business decisions to ask the user about

Before writing code, surface these (these are theirs):

- **Sample corpus topic** — README defaults to "cats", but ask if they want a different topic (lighthouses, board games, etc.) that fits their brand voice.
- **Agent personality / system-prompt voice** — formal? Friendly? Pirate? Their call.
- **Demo prompt shown in README + GIF** — what the agent gets asked. Has to feel representative of what a client would imagine using it for.
- **Whether to show before/after token-cost numbers** in the caching section (real numbers from a test run vs handwaved). Real is better but takes a small budget hit on Aleksandar's API key.

## Scope (must-haves)

1. Anthropic SDK (`@anthropic-ai/sdk`) wired up with env-var key handling.
2. **Prompt caching** demonstrated explicitly (the `cache_control` block on a long system prompt or tool definitions). README explains *why* caching matters and shows a before/after token-cost comment.
3. **Tool use loop** — model proposes a tool call, runtime executes it, result returns to model, loop continues until model emits a final answer.
4. **Two demo tools**, both pure-local, no external dependency:
   - `read_file(path)` — reads a file under a sandbox dir
   - `list_files(dir)` — lists a directory under the same sandbox
   (Sandbox dir defaults to `./sample-corpus/` shipped in the repo.)
5. **Streaming** — final assistant text streams to stdout.
6. **CLI shape** — one entrypoint: `pnpm agent -- "your question"`.
7. README with title, GIF or screenshot of one full run, "What it shows", "Skills demonstrated", quick start, "How it works" diagram.

## Out of scope (do NOT silently expand)

- No web UI, no server, no deployment.
- No multi-provider abstraction (no OpenAI fallback, no LangChain, no Vercel AI SDK).
- No vector DB / RAG (that's `markdown-rag`'s job).
- No MCP protocol (that's `mcp-server-sample`'s job).
- No agentic memory / persistent state across runs.
- No more than the two demo tools.

## Tech stack

- **Language:** TypeScript 5.x
- **Runtime:** Node 20 LTS (specify in `engines`)
- **Package manager:** `pnpm`
- **SDK:** `@anthropic-ai/sdk` latest
- **Model:** `claude-sonnet-4-6`
- **Testing:** `vitest`
- **Linting:** `eslint` + `@typescript-eslint`, `prettier`
- **CI:** GitHub Actions — install, type-check, lint, test

## File tree

```
claude-agent-starter/
  README.md
  PLAN.md
  LICENSE                       ← MIT
  .gitignore                    ← node_modules, dist, .env*
  .env.example                  ← ANTHROPIC_API_KEY=
  package.json
  pnpm-lock.yaml
  tsconfig.json
  .eslintrc.cjs
  .prettierrc
  vitest.config.ts
  .github/workflows/ci.yml
  sample-corpus/                ← three short markdown files for the agent to read
  src/
    index.ts                    ← CLI entrypoint
    agent.ts                    ← agent loop (streaming + tool dispatch)
    tools/
      index.ts
      read-file.ts
      list-files.ts
    config.ts
    prompts/
      system.md                 ← long system prompt (caching target)
  test/
    agent.smoke.test.ts
  docs/
    architecture.md
    screenshots/demo.gif
```

## Step-by-step build

### 1. Bootstrap

```bash
pnpm init
pnpm add @anthropic-ai/sdk
pnpm add -D typescript @types/node tsx vitest eslint @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin prettier eslint-config-prettier
npx tsc --init
```

`tsconfig.json`: `"target": "ES2022"`, `"module": "ES2022"`, `"moduleResolution": "Bundler"`, `"strict": true`, `"outDir": "dist"`.

`package.json` scripts:
```json
{
  "scripts": {
    "agent": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write ."
  }
}
```

### 2. System prompt (`src/prompts/system.md`)

~800–1000 words giving the agent a personality, a workflow ("plan, act, verify"), and explicit tool-use instructions. Loaded at runtime.

### 3. `src/config.ts`

Loads `process.env.ANTHROPIC_API_KEY` (clear error if missing), reads the system prompt, exports model name, max tokens (`4096`), sandbox path.

### 4. Tools (`src/tools/`)

Each tool exports name + description + input_schema + handler. `tools/index.ts` exports a registry and a dispatcher `runTool(name, input) → Promise<string>`. **Path safety:** resolve inputs against the sandbox dir; reject any traversal outside it.

### 5. Agent loop (`src/agent.ts`)

```ts
const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
while (true) {
  const response = await client.messages.stream({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    tools,
    messages,
  });
  for await (const event of response) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }
  const final = await response.finalMessage();
  messages.push({ role: "assistant", content: final.content });
  if (final.stop_reason !== "tool_use") break;
  const toolResults = [];
  for (const block of final.content) {
    if (block.type === "tool_use") {
      const result = await runTool(block.name, block.input);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
  }
  messages.push({ role: "user", content: toolResults });
}
```

Comment sparingly: `cache_control` on system, streaming + `finalMessage()` for tool dispatch, loop terminates on `stop_reason !== "tool_use"`.

### 6. CLI (`src/index.ts`)

Reads `process.argv.slice(2).join(" ")` as user prompt. Default to a sensible demo prompt. Calls `agent.run(prompt)`. Exits 0.

### 7. Sample corpus

3 short markdown files (50–150 words each) on the topic the user picks.

### 8. Smoke test

Mock `@anthropic-ai/sdk` with `vi.mock`. One test: agent dispatches `read_file` and returns its content.

### 9. CI

Setup Node 20 + pnpm; `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm exec tsc --noEmit`; `pnpm test`. No deploy.

### 10. README

1. Title + tagline
2. Demo (GIF / screenshots)
3. What it shows (bullets)
4. Skills demonstrated
5. Quick start
6. How it works (paragraph + ASCII diagram)
7. Project layout
8. License — MIT

### 11. Polish + flip public

Capture GIF. Tick verification. **Ask the user** before flipping public.

## Verification (tick before going public)

- [ ] `pnpm install` from a fresh clone works on Node 20
- [ ] `pnpm agent -- "Find the file about famous cats and summarise it."` runs end-to-end with a real key
- [ ] `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit` green locally and in CI
- [ ] README has a real GIF or 2+ screenshots
- [ ] No keys in git history
- [ ] `.env.example` exists, `.env` is `.gitignore`d
- [ ] Topics set: `claude`, `claude-api`, `anthropic`, `ai-agent`, `typescript`, `prompt-caching`, `tool-use`
- [ ] Repo description matches master plan
- [ ] Sandbox traversal protection works (`pnpm agent -- "read ../../etc/passwd"` rejected)
- [ ] Smoke test mocks the SDK; CI passes without a real key

## Stretch (defer to v2)

- Second tool calling a public no-auth API (e.g. `wttr.in`)
- `--verbose` flag printing each tool call
- `--no-stream` flag
