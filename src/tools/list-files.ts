import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { resolveInSandbox } from "./sandbox.js";

export const listFilesSchema = z.object({
  dir: z.string().default("."),
});

export type ListFilesInput = z.infer<typeof listFilesSchema>;

export const listFilesToolDefinition = {
  name: "list_files",
  description:
    "List files and subdirectories under a path inside the sandboxed corpus. Pass '.' for the root. Directories are suffixed with '/'.",
  input_schema: {
    type: "object" as const,
    properties: {
      dir: {
        type: "string",
        description: "Relative path inside the sandbox. Use '.' for the root.",
        default: ".",
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export async function listFilesHandler(input: ListFilesInput, sandboxDir: string): Promise<string> {
  const resolved = resolveInSandbox(sandboxDir, input.dir);
  if (!resolved.ok) return resolved.reason;

  let entries: string[];
  try {
    entries = readdirSync(resolved.real);
  } catch (err) {
    return `Could not list directory: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (entries.length === 0) return "(empty directory)";

  const annotated = entries.sort().map((name) => {
    try {
      const isDir = statSync(resolve(resolved.real, name)).isDirectory();
      return isDir ? `${name}/` : name;
    } catch {
      return name;
    }
  });

  return annotated.join("\n");
}
