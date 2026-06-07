import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  TextBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import { config, requireApiKey } from "./config.js";
import { runTool, tools } from "./tools/index.js";

/**
 * Cached system prompt block. Hoisted to module scope so the reference
 * (and content) is stable across turns. Anthropic's prompt cache is
 * content-keyed, not identity-keyed, but a stable reference makes it
 * obvious to a future maintainer that this is meant to be cacheable —
 * mutating it per turn would silently invalidate the cache.
 */
const systemBlocks: TextBlockParam[] = [
  {
    type: "text",
    text: config.systemPrompt,
    cache_control: { type: "ephemeral" },
  },
];

/**
 * Agent loop.
 *
 * Each iteration calls `messages.stream`, pipes text deltas to stdout, then
 * inspects the assembled final message. If the model wants to call tools,
 * we run them locally, package the results as `tool_result` blocks, and loop.
 * Otherwise we stop.
 *
 * Caching strategy: one breakpoint on the system prompt, one on the last tool
 * (see `tools/index.ts`). On follow-up turns within ~5 minutes, both prefixes
 * hit the cache and only the changing `messages` array is billed at full rate.
 */
export async function run(userPrompt: string): Promise<void> {
  const client = new Anthropic({ apiKey: requireApiKey() });

  const messages: MessageParam[] = [{ role: "user", content: userPrompt }];

  // Hard safety cap so a misbehaving model can't loop forever on tools.
  const maxTurns = 12;

  for (let turn = 0; turn < maxTurns; turn++) {
    const stream = client.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens,
      system: systemBlocks,
      tools,
      messages,
    });

    stream.on("text", (delta) => {
      process.stdout.write(delta);
    });

    const final = await stream.finalMessage();
    process.stdout.write("\n");

    // The assistant turn must be echoed back into `messages` so the next
    // request includes the model's previous reply (Anthropic protocol).
    // The system prompt and tools array are cached, so only the new
    // assistant + user blocks add to the next turn's billed input tokens.
    messages.push({ role: "assistant", content: final.content });

    if (final.stop_reason !== "tool_use") {
      return;
    }

    const toolUses = final.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

    // Defensive: if the model claimed `tool_use` but emitted no tool_use
    // blocks, the API rejects an empty user message on the next turn.
    // Treat this as an early stop.
    if (toolUses.length === 0) {
      return;
    }

    const toolResults: ContentBlockParam[] = await Promise.all(
      toolUses.map(async (tu) => {
        const result = await runTool(tu.name, tu.input, config.sandboxDir);
        return {
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content: result,
        };
      }),
    );

    messages.push({ role: "user", content: toolResults });
  }

  process.stderr.write(
    `\n[stopped: hit max turn limit (${maxTurns}). The agent looped without finishing.]\n`,
  );
  process.exitCode = 1;
}
