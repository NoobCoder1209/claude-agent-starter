# claude-agent-starter

A small, opinionated TypeScript starter for building agents on top of the **Anthropic Claude API** — clean, readable code you can copy from. No LangChain, no provider abstraction, no web framework. Just a focused demo of three things that actually matter:

1. **Prompt caching** with `cache_control` on the system prompt and tool definitions.
2. **A streaming tool-use loop** — the model proposes tool calls, the runtime executes them, results flow back, and the loop continues until the model stops.
3. **Sandboxed local tools** — `read_file` and `list_files` over a tiny corpus of Markdown.

The agent (named **Sage**) ships pointed at a corpus of three short notes on modern video games (Elden Ring, The Witcher 3, Baldur's Gate 3). Swap the corpus, swap the system prompt, swap the topic — the loop is the part that matters.

---

## What it shows

- **Prompt caching done right.** One `cache_control: { type: "ephemeral" }` block on the long system prompt, one on the last tool definition. On follow-up turns within ~5 minutes, both prefixes hit the cache and you only pay full price for the new user message and the model's reply.
- **The canonical tool-use loop.** `client.messages.stream(...)` for streaming, `await stream.finalMessage()` for the assembled message, `stop_reason === "tool_use"` to decide whether to keep going.
- **Streaming output.** Text deltas write to stdout as they arrive. No "thinking…" spinner — the model's voice appears in real time.
- **Path-traversal-safe sandbox.** Tool inputs go through `path.resolve` plus `realpathSync` and a relative-path check. Symlink escapes and `..` traversals are rejected with a friendly message returned to the model.
- **Validated tool inputs.** Every tool has a Zod schema; bad inputs become a friendly string the model can react to, never a thrown exception that breaks the loop.
- **A loud-but-friendly missing-key error.** No 400-line stack trace; one line telling you what to set and where.

## Skills demonstrated

AI Agent Development · Anthropic Claude API · LLM Integration · Prompt Engineering · Tool Use / MCP-adjacent · TypeScript

---

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/<you>/claude-agent-starter.git
cd claude-agent-starter
pnpm install

# 2. Set your API key
cp .env.example .env
# then edit .env and paste your key, or:
export ANTHROPIC_API_KEY=sk-ant-...

# 3. Ask the agent something
pnpm agent -- "List the files in the corpus, then read the most interesting one and tell me why."
```

You'll see the answer stream out token-by-token. Try a few prompts:

```bash
pnpm agent -- "Compare Elden Ring and Baldur's Gate 3 in two paragraphs."
pnpm agent -- "Which of the three games sold the most copies, according to the corpus?"
pnpm agent -- "What's in this corpus?"
```

---

## How it works

```
                ┌────────────────────────────────────────────┐
                │  user prompt                                │
                └──────────────────┬─────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │  client.messages.stream({                                │
        │    system:   [ … cache_control ]   ← cached prefix       │
        │    tools:    [ …, …cache_control ] ← cached prefix       │
        │    messages: [ … ]                 ← changes each turn   │
        │  })                                                      │
        └──────────────────┬───────────────────────────────────────┘
                           │
              text deltas  │   final.stop_reason
              ──► stdout   ▼
                  ┌─────────────────────┐         no
                  │  stop_reason ===    │──────────────► done
                  │  "tool_use" ?       │
                  └─────────┬───────────┘
                            │ yes
                            ▼
                  ┌─────────────────────┐
                  │  for each tool_use: │
                  │    runTool(name,    │
                  │            input)   │
                  │  → tool_result      │
                  └─────────┬───────────┘
                            │
                            └──────► loop
```

The whole loop is **about 100 lines** in [`src/agent.ts`](./src/agent.ts) — most of which is comments. The tool-use protocol is [documented by Anthropic here](https://docs.claude.com/en/docs/agents-and-tools/tool-use/handle-tool-calls).

### A note on caching

Prompt caching only kicks in once a cacheable prefix exceeds a per-model minimum (1,024 tokens for `claude-sonnet-4-6`). The system prompt in [`src/prompts/system.md`](./src/prompts/system.md) is sized to clear that bar. The default 5-minute TTL is free; a 1-hour TTL is also available at a small write surcharge — see [the docs](https://docs.claude.com/en/docs/build-with-claude/prompt-caching).

In a back-to-back run on the same conversation, expect cache hits to drop the per-turn input cost by ~90% on the cached portion. Numbers vary; the docs have the canonical breakdown.

---

## Project layout

```
claude-agent-starter/
├── src/
│   ├── index.ts              # CLI entrypoint, top-level error handling
│   ├── agent.ts              # streaming tool-use loop
│   ├── config.ts             # env validation, model + sandbox config
│   ├── prompts/
│   │   └── system.md         # the long, cached system prompt
│   └── tools/
│       ├── index.ts          # tools registry + dispatcher
│       ├── sandbox.ts        # path-traversal protection (shared by tools)
│       ├── read-file.ts      # sandboxed file read
│       └── list-files.ts     # sandboxed directory list
├── sample-corpus/            # 3 short Markdown files the agent reads
├── scripts/
│   └── count-tokens.ts       # verifies the system prompt clears the cache minimum
├── test/
│   └── agent.smoke.test.ts   # SDK-mocked smoke test for the loop
└── .github/workflows/ci.yml  # install · lint · typecheck · test on Node 20
```

## Tech

- **Node** 20+ · **pnpm** 9
- **TypeScript** 5.5 (strict, `noUncheckedIndexedAccess`)
- **`@anthropic-ai/sdk`** 0.102+ · **`zod`** 3
- **`vitest`** for tests · **`eslint`** + **`prettier`** for the usual

## Scripts

```bash
pnpm agent -- "prompt"   # run the agent
pnpm test                # run the smoke test (no API key needed; SDK is mocked)
pnpm typecheck           # tsc --noEmit
pnpm lint                # eslint
pnpm format              # prettier --write
```

---

## License

MIT — see [LICENSE](./LICENSE).
