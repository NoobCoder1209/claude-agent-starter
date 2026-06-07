import { readFileSync, realpathSync } from "node:fs";
import { resolve, relative } from "node:path";
import { z } from "zod";

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

function inSandbox(sandboxDir: string, candidate: string): boolean {
  const rel = relative(sandboxDir, candidate);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}

export async function readFileHandler(input: ReadFileInput, sandboxDir: string): Promise<string> {
  const requested = resolve(sandboxDir, input.path);
  if (!inSandbox(sandboxDir, requested)) {
    return "Refused: path is outside the sandbox.";
  }

  let real: string;
  try {
    real = realpathSync(requested);
  } catch {
    return `File not found: ${input.path}`;
  }

  if (!inSandbox(sandboxDir, real)) {
    return "Refused: resolved path is outside the sandbox.";
  }

  try {
    return readFileSync(real, "utf8");
  } catch (err) {
    return `Could not read file: ${err instanceof Error ? err.message : String(err)}`;
  }
}
