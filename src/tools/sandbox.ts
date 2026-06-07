import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

/**
 * Result of resolving a user-provided path inside the sandbox.
 */
export type SandboxResolveResult = { ok: true; real: string } | { ok: false; reason: string };

/**
 * Resolve a user-provided path against `sandboxDir` and confirm it cannot
 * escape it via `..`, an absolute path, or a symlink that points outside.
 *
 * Returns either a verified real (canonical) path inside the sandbox,
 * or a friendly error string suitable for handing back to the model.
 *
 * Strategy:
 *  1. Reject absolute inputs outright (`/etc/passwd`, `C:\...`).
 *  2. `path.resolve` joins the input against the sandbox; this collapses
 *     any `..` segments. We then check the result is still inside.
 *  3. `realpathSync` follows any symlinks on the resolved path. We
 *     re-check the canonical path is still inside the sandbox so a
 *     symlink in the corpus pointing at `/etc/passwd` is rejected.
 */
export function resolveInSandbox(sandboxDir: string, userPath: string): SandboxResolveResult {
  if (isAbsolute(userPath)) {
    return { ok: false, reason: "Refused: path is outside the sandbox." };
  }

  const requested = resolve(sandboxDir, userPath);
  if (!isInside(sandboxDir, requested)) {
    return { ok: false, reason: "Refused: path is outside the sandbox." };
  }

  let real: string;
  try {
    real = realpathSync(requested);
  } catch {
    return { ok: false, reason: `Not found: ${userPath}` };
  }

  if (!isInside(sandboxDir, real)) {
    return { ok: false, reason: "Refused: resolved path is outside the sandbox." };
  }

  return { ok: true, real };
}

function isInside(sandboxDir: string, candidate: string): boolean {
  if (candidate === sandboxDir) return true;
  const rel = relative(sandboxDir, candidate);
  return rel !== "" && !rel.startsWith("..");
}
