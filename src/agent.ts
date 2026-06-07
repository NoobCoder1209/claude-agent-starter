import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import { config, requireApiKey } from "./config.js";
import { runTool, tools } from "./tools/index.js";

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
      system: [
        {
          type: "text",
          text: config.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      messages,
    });

    stream.on("text", (delta) => {
      process.stdout.write(delta);
    });

    const final = await stream.finalMessage();
    process.stdout.write("\n");

    messages.push({ role: "assistant", content: final.content });

    if (final.stop_reason !== "tool_use") {
      return;
    }

    const toolUses = final.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

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

  process.stdout.write(
    `\n[stopped: hit max turn limit (${maxTurns}). The agent looped without finishing.]\n`,
  );
}
