import type { ToolUnion } from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import { readFileHandler, readFileSchema, readFileToolDefinition } from "./read-file.js";
import { listFilesHandler, listFilesSchema, listFilesToolDefinition } from "./list-files.js";

/**
 * Tool definitions sent to the model.
 *
 * The last tool carries `cache_control: { type: "ephemeral" }` so the entire
 * `tools` array is cached as a single prefix on the next call. Anthropic's
 * caching applies to all blocks up to and including the one that carries the
 * breakpoint.
 */
export const tools: ToolUnion[] = [
  readFileToolDefinition,
  {
    ...listFilesToolDefinition,
    cache_control: { type: "ephemeral" },
  },
];

type ToolName = "read_file" | "list_files";

const TOOL_NAMES = ["read_file", "list_files"] as const satisfies readonly ToolName[];

const handlers: Record<ToolName, (input: unknown, sandboxDir: string) => Promise<string>> = {
  read_file: async (input, sandboxDir) => {
    const parsed = readFileSchema.parse(input);
    return readFileHandler(parsed, sandboxDir);
  },
  list_files: async (input, sandboxDir) => {
    const parsed = listFilesSchema.parse(input);
    return listFilesHandler(parsed, sandboxDir);
  },
};

function isKnownTool(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Run a tool by name. Returns a string for the model — never throws on bad
 * input or missing files; always returns a friendly error message that the
 * model can react to.
 */
export async function runTool(name: string, input: unknown, sandboxDir: string): Promise<string> {
  if (!isKnownTool(name)) {
    return `Unknown tool: ${name}`;
  }

  try {
    return await handlers[name](input, sandboxDir);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return `Invalid input for ${name}: ${issues}`;
    }
    return `Tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
