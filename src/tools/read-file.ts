import { readFileSync } from "node:fs";
import { z } from "zod";

import { resolveInSandbox } from "./sandbox.js";

export const readFileSchema = z.object({
  path: z.string().min(1, "path must be a non-empty string"),
});

export type ReadFileInput = z.infer<typeof readFileSchema>;

export const readFileToolDefinition = {
  name: "read_file",
  description:
    "Read the full contents of a file inside the sandboxed corpus. Path must be relative to the sandbox root. Returns the file's text contents, or a friendly error string if the path escapes the sandbox or the file is missing.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Relative path to the file inside the sandbox, e.g. 'elden-ring.md'.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
};

export async function readFileHandler(input: ReadFileInput, sandboxDir: string): Promise<string> {
  const resolved = resolveInSandbox(sandboxDir, input.path);
  if (!resolved.ok) return resolved.reason;

  try {
    return readFileSync(resolved.real, "utf8");
  } catch (err) {
    return `Could not read file: ${err instanceof Error ? err.message : String(err)}`;
  }
}
