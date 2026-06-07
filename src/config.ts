import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function loadSystemPrompt(): string {
  return readFileSync(resolve(here, "prompts/system.md"), "utf8");
}

export function requireApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.trim() === "") {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Set it in your shell (e.g. `export ANTHROPIC_API_KEY=sk-...`) or add it to a local .env file. See .env.example.",
    );
  }
  return key;
}

export const config = {
  model: "claude-sonnet-4-6",
  maxTokens: 4096,
  sandboxDir: resolve(process.cwd(), "sample-corpus"),
  systemPrompt: loadSystemPrompt(),
} as const;

export type AgentConfig = typeof config;
