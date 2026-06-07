import { readdirSync, statSync, realpathSync } from "node:fs";
import { resolve, relative } from "node:path";
import { z } from "zod";

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

function inSandbox(sandboxDir: string, candidate: string): boolean {
  if (candidate === sandboxDir) return true;
  const rel = relative(sandboxDir, candidate);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}

export async function listFilesHandler(input: ListFilesInput, sandboxDir: string): Promise<string> {
  const requested = resolve(sandboxDir, input.dir);
  if (!inSandbox(sandboxDir, requested)) {
    return "Refused: path is outside the sandbox.";
  }

  let real: string;
  try {
    real = realpathSync(requested);
  } catch {
    return `Directory not found: ${input.dir}`;
  }

  if (!inSandbox(sandboxDir, real)) {
    return "Refused: resolved path is outside the sandbox.";
  }

  let entries: string[];
  try {
    entries = readdirSync(real);
  } catch (err) {
    return `Could not list directory: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (entries.length === 0) return "(empty directory)";

  const annotated = entries.sort().map((name) => {
    try {
      const isDir = statSync(resolve(real, name)).isDirectory();
      return isDir ? `${name}/` : name;
    } catch {
      return name;
    }
  });

  return annotated.join("\n");
}
