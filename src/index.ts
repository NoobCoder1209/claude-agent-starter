#!/usr/bin/env node
import { run } from "./agent.js";

const DEFAULT_PROMPT =
  "List the files in the corpus, then read the most interesting one and tell me why it stood out.";

async function main(): Promise<void> {
  const argv = process.argv.slice(2).join(" ").trim();
  const prompt = argv === "" ? DEFAULT_PROMPT : argv;
  await run(prompt);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\n${message}\n`);
  process.exit(1);
});
