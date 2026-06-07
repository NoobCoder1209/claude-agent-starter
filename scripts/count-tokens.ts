/**
 * Counts the tokens in the system prompt to verify it's above the per-model
 * cache minimum (1024 tokens for claude-sonnet-4-6). Below the threshold,
 * `cache_control: { type: "ephemeral" }` becomes a silent no-op.
 *
 * Usage: pnpm exec tsx scripts/count-tokens.ts
 *
 * Requires ANTHROPIC_API_KEY in the environment — uses the SDK's
 * `messages.countTokens`, which is a free no-billing endpoint.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config, requireApiKey } from "../src/config.js";

const MIN_TOKENS_FOR_CACHE = 1024;

async function main(): Promise<void> {
  const client = new Anthropic({ apiKey: requireApiKey() });

  const response = await client.messages.countTokens({
    model: config.model,
    system: [{ type: "text", text: config.systemPrompt }],
    messages: [{ role: "user", content: "ping" }],
  });

  const tokens = response.input_tokens;
  const margin = tokens - MIN_TOKENS_FOR_CACHE;

  process.stdout.write(`System prompt: ${tokens} input tokens.\n`);
  process.stdout.write(`Cache minimum for ${config.model}: ${MIN_TOKENS_FOR_CACHE}.\n`);

  if (margin < 0) {
    process.stderr.write(
      `\nFAIL: prompt is ${-margin} tokens BELOW the cache minimum. ` +
        `Caching will silently no-op. Pad the prompt before shipping.\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`Margin: +${margin} tokens. Caching will engage.\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
