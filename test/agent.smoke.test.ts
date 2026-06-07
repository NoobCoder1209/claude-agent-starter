import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type StreamCall = {
  args: unknown;
};

type FinalMessageScript = {
  stop_reason: "tool_use" | "end_turn";
  content: unknown[];
};

const streamCalls: StreamCall[] = [];
const scriptedMessages: FinalMessageScript[] = [];

function makeStream(args: unknown) {
  // deep-clone so we capture the messages array as it was at call time,
  // not after the agent loop mutates it for subsequent turns
  streamCalls.push({ args: structuredClone(args) });
  const next = scriptedMessages.shift();
  if (!next) {
    throw new Error(
      "agent called messages.stream more times than the test scripted; check the loop's stop condition.",
    );
  }
  return {
    on(_event: string, _cb: (...args: unknown[]) => void) {
      // text deltas are ignored in the smoke test
      return this;
    },
    finalMessage: async () => next,
  };
}

vi.mock("@anthropic-ai/sdk", () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: { stream: (args: unknown) => makeStream(args) },
  }));
  return { default: Anthropic };
});

describe("agent loop", () => {
  beforeEach(() => {
    streamCalls.length = 0;
    scriptedMessages.length = 0;
    process.env.ANTHROPIC_API_KEY = "sk-test";
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.clearAllMocks();
  });

  test("dispatches read_file and feeds the result back into a follow-up turn", async () => {
    // Turn 1: model asks for read_file on a real corpus file.
    scriptedMessages.push({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_test_1",
          name: "read_file",
          input: { path: "elden-ring.md" },
        },
      ],
    });

    // Turn 2: model emits final answer.
    scriptedMessages.push({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Summary of the file." }],
    });

    const { run } = await import("../src/agent.js");

    await run("Find the file about Elden Ring and summarise it.");

    expect(streamCalls.length).toBe(2);

    const secondCallArgs = streamCalls[1]!.args as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const lastUserMessage = secondCallArgs.messages.at(-1);
    expect(lastUserMessage).toBeDefined();
    expect(lastUserMessage!.role).toBe("user");

    const toolResults = lastUserMessage!.content as Array<{
      type: string;
      tool_use_id: string;
      content: string;
    }>;

    expect(toolResults).toHaveLength(1);
    expect(toolResults[0]!.type).toBe("tool_result");
    expect(toolResults[0]!.tool_use_id).toBe("toolu_test_1");
    expect(toolResults[0]!.content).toContain("Elden Ring");
    expect(toolResults[0]!.content).toContain("FromSoftware");
  });

  test("rejects sandbox traversal in tool input", async () => {
    scriptedMessages.push({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_test_traverse",
          name: "read_file",
          input: { path: "../../../etc/passwd" },
        },
      ],
    });

    scriptedMessages.push({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Acknowledged the refusal." }],
    });

    const { run } = await import("../src/agent.js");

    await run("Read /etc/passwd.");

    const secondCallArgs = streamCalls[1]!.args as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const toolResults = secondCallArgs.messages.at(-1)!.content as Array<{ content: string }>;
    expect(toolResults[0]!.content).toMatch(/outside the sandbox/i);
  });
});
