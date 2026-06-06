# `claude-agent-starter` — Execution Plan

> Self-contained build plan. Inherit shared standards from the master plan
> (MIT licence, Pattern 3 demos, private→public visibility rule, README structure,
> CI baseline, GitHub topics, no Claude-Code/SAP material). This plan only
> documents what is specific to this repo.

## Goal

Ship a TypeScript starter that demonstrates how to build an agent on top of the
Anthropic SDK in a way that's actually usable — not a "hello world", not a
LangChain wrapper, just clean, opinionated code a Claude developer would copy
from. The single most-skimmed piece of evidence on the Upwork profile.

**Audience:** clients hiring a Claude developer. They will skim the README,
maybe clone, maybe run.

**Sells the skills:** AI Agent Development, Anthropic Claude API, LLM Integration,
Prompt Engineering, MCP-adjacent (tool use), TypeScript.

## Scope (must-haves)

1. Anthropic SDK (`@anthropic-ai/sdk`) wired up with env-var key handling.
2. **Prompt caching** demonstrated explicitly (the `cache_control` block on a
   long system prompt or tool definitions). README explains *why* caching
   matters and shows a before/after token-cost comment.
3. **Tool use loop** — model proposes a tool call, runtime executes it,
   result returns to model, loop continues until model emits a final answer.
4. **Two demo tools**, both pure-local, no external dependency:
   - `read_file(path)` — reads a file under a sandbox dir
   - `list_files(dir)` — lists a directory under the same sandbox
   (Sandbox dir defaults to `./sample-corpus/` shipped in the repo with a few
   markdown files about cats, so the agent has something interesting to read.)
5. **Streaming** — final assistant text streams to stdout.
6. **CLI shape** — one entrypoint: `npm run agent -- "your question"`.
7. README with title, GIF or screenshot of one full run, "What it shows",
   "Skills demonstrated", quick start, "How it works" diagram.

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
- **Package manager:** `pnpm` (faster, deterministic, common in TS land)
- **SDK:** `@anthropic-ai/sdk` latest
- **Model:** `claude-sonnet-4-6` (cost/quality sweet spot for a demo)
- **Testing:** `vitest` (fast, modern; one smoke test minimum)
- **Linting:** `eslint` + `@typescript-eslint`, `prettier`
- **CI:** GitHub Actions — install, type-check, lint, test

## File tree

```
claude-agent-starter/
  README.md
  PLAN.md                       ← this file
  LICENSE                       ← MIT
  .gitignore                    ← node_modules, dist, .env*
  .env.example                  ← ANTHROPIC_API_KEY=
  package.json
  pnpm-lock.yaml
  tsconfig.json
  .eslintrc.cjs
  .prettierrc
  vitest.config.ts
  .github/
    workflows/
      ci.yml
  sample-corpus/                ← three short markdown files for the agent to read
    cats-overview.md
    famous-cats.md
    cat-care.md
  src/
    index.ts                    ← CLI entrypoint
    agent.ts                    ← the agent loop (streaming + tool dispatch)
    tools/
      index.ts                  ← tool registry
      read-file.ts
      list-files.ts
    config.ts                   ← env loading, model name, system prompt
    prompts/
      system.md                 ← long-ish system prompt (caching target)
  test/
    agent.smoke.test.ts         ← one happy-path test using a mocked SDK
  docs/
    architecture.md             ← short flow diagram (optional)
    screenshots/
      demo.gif                  ← captured at polish time
```

## Step-by-step build

### 1. Bootstrap

```bash
cd <repo>
pnpm init
pnpm add @anthropic-ai/sdk
pnpm add -D typescript @types/node tsx vitest eslint @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin prettier eslint-config-prettier
npx tsc --init
```

Update `tsconfig.json` to `"target": "ES2022"`, `"module": "ES2022"`,
`"moduleResolution": "Bundler"`, `"strict": true`, `"outDir": "dist"`.

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

A long system prompt is what makes prompt caching worth showing. ~800–1000 words
giving the agent a personality, a workflow ("first plan, then act, then verify"),
and explicit tool-use instructions. Realistic enough that a reader thinks
"oh, that's how you'd actually structure this." Loaded at runtime as a string.

### 3. `src/config.ts`

Loads `process.env.ANTHROPIC_API_KEY` (throws a clear error if missing), reads
the system prompt file, exports model name (`claude-sonnet-4-6`), max tokens
(`4096`), sandbox path (`./sample-corpus`).

### 4. Tools (`src/tools/`)

Each tool exports:
```ts
export const readFileTool = {
  name: "read_file",
  description: "Read a markdown file from the sandbox corpus.",
  input_schema: {
    type: "object",
    properties: { path: { type: "string", description: "Relative path under sandbox." } },
    required: ["path"],
  },
  handler: async (input: { path: string }) => { /* read + return text */ },
};
```

`tools/index.ts` exports `tools = [readFileTool, listFilesTool]` and a
dispatcher: `runTool(name, input) → Promise<string>`. **Path safety:** resolve
inputs against the sandbox dir and reject any traversal outside it.

### 5. Agent loop (`src/agent.ts`)

Pseudocode:

```ts
const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

while (true) {
  const response = await client.messages.stream({
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }, // ← caching demo
      },
    ],
    tools,
    messages,
  });

  // Stream final text to stdout as it arrives.
  for await (const event of response) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }

  const final = await response.finalMessage();
  messages.push({ role: "assistant", content: final.content });

  if (final.stop_reason !== "tool_use") break;

  // Run each tool block, append tool_result back.
  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  for (const block of final.content) {
    if (block.type === "tool_use") {
      const result = await runTool(block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }
  }
  messages.push({ role: "user", content: toolResults });
}
```

Key teaching moments to comment in code (sparingly — code self-documents):
- The `cache_control` block on the system prompt
- The streaming pattern with `finalMessage()` for tool dispatch
- Why the loop terminates on `stop_reason !== "tool_use"`

### 6. CLI (`src/index.ts`)

Reads `process.argv.slice(2).join(" ")` as the user prompt. Defaults to a
sensible demo prompt if none given (e.g. *"Find the file about famous cats and
summarise it."*). Calls `agent.run(prompt)`. Exits 0 on success.

### 7. Sample corpus (`sample-corpus/*.md`)

Three short, slightly-fun markdown files. They exist so the agent has real
content to read during the GIF demo. Pick a topic that's harmless and memorable
(cats, lighthouses, board-game rules — anything). Each file 50–150 words.

### 8. Smoke test (`test/agent.smoke.test.ts`)

Mock `@anthropic-ai/sdk` so CI doesn't need a real key. One test:
"agent dispatches `read_file` and returns its content." Use `vi.mock` to stub
`client.messages.stream` to return a deterministic `tool_use` then a final
text block.

### 9. CI (`.github/workflows/ci.yml`)

Triggers: `push` to `main`, `pull_request`. Steps:
- Checkout
- Setup Node 20 + pnpm
- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm test`

No deployment step. Build artefact not needed (it's a starter).

### 10. README

Title: **claude-agent-starter** — *The minimal, opinionated Claude agent template.*

Sections (per master plan order):
1. **Title** + tagline
2. **Demo** — `docs/screenshots/demo.gif` showing one full run
3. **What it shows** — bullets:
   - Anthropic SDK with prompt caching for a long system prompt
   - Tool-use loop with two safe local tools
   - Streaming responses to stdout
   - Clean TypeScript structure ready to fork
4. **Skills demonstrated** — Anthropic Claude API, AI Agent Development,
   Prompt Engineering, Tool Use, TypeScript, Node.js, Streaming APIs
5. **Quick start**:
   ```bash
   pnpm install
   cp .env.example .env  # paste your ANTHROPIC_API_KEY
   pnpm agent -- "Find the file about famous cats and summarise it."
   ```
6. **How it works** — short paragraph + ASCII flow diagram (user → agent loop
   → tool dispatch → SDK → streamed answer)
7. **Project layout** — file tree (the one above, abridged)
8. **License** — MIT

### 11. Polish + flip public

Capture the GIF using whatever you prefer (Kap on macOS works). Commit it.
Verify the checklist below. Flip the repo public via `gh repo edit
NoobCoder1209/claude-agent-starter --visibility public`. Pin on profile.

## Verification (tick before going public)

- [ ] `pnpm install` from a fresh clone works on Node 20
- [ ] `pnpm agent -- "Find the file about famous cats and summarise it."`
      runs end-to-end with a real `ANTHROPIC_API_KEY`
- [ ] `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit` all green locally and in CI
- [ ] README has a real GIF or at least 2 screenshots showing a full run
- [ ] No API keys in git history (`git log -p | grep -i anthropic` finds none)
- [ ] `.env.example` exists, `.env` is `.gitignore`d
- [ ] Topics set: `claude`, `claude-api`, `anthropic`, `ai-agent`, `typescript`, `prompt-caching`, `tool-use`
- [ ] Repo description matches the master plan
- [ ] Sandbox traversal protection actually works (`pnpm agent -- "read ../../etc/passwd"` is rejected)
- [ ] Smoke test mocks the SDK so CI passes without a real key

## Stretch (only if v1 lands and time allows)

- A second tool that calls a public, no-auth API (e.g. `wttr.in`) to demonstrate
  network-side tool use
- A `--verbose` flag printing each tool call inline (great for the GIF)
- A `--no-stream` flag for batch use cases

These are noted for v2 — do not let them creep into v1.
