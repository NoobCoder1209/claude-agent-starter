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
    finalMessage: async () => ({
      // realistic-ish Message shape: real SDK returns id/type/role/model/usage too
      id: "msg_test_" + Math.random().toString(36).slice(2, 8),
      type: "message" as const,
      role: "assistant" as const,
      model: "claude-sonnet-4-6",
      usage: {
        input_tokens: 10,
        output_tokens: 10,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      ...next,
    }),
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

  test("sets cache_control breakpoints on system prompt and last tool", async () => {
    scriptedMessages.push({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Hi." }],
    });

    const { run } = await import("../src/agent.js");

    await run("hello");

    const args = streamCalls[0]!.args as {
      system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
      tools: Array<{ name: string; cache_control?: { type: string } }>;
    };

    // System prompt block carries an ephemeral cache breakpoint.
    expect(args.system).toHaveLength(1);
    expect(args.system[0]!.cache_control).toEqual({ type: "ephemeral" });

    // Last tool definition carries the breakpoint; earlier tools do not.
    expect(args.tools.length).toBeGreaterThanOrEqual(2);
    const lastTool = args.tools.at(-1)!;
    expect(lastTool.cache_control).toEqual({ type: "ephemeral" });
    for (const t of args.tools.slice(0, -1)) {
      expect(t.cache_control).toBeUndefined();
    }
  });

  test("returns early when stop_reason is tool_use but no tool_use blocks were emitted", async () => {
    // Pathological case: Anthropic API would reject an empty user content array
    // on the next turn. The loop should bail out instead.
    scriptedMessages.push({
      stop_reason: "tool_use",
      content: [{ type: "text", text: "I want to call a tool but didn't actually emit one." }],
    });

    const { run } = await import("../src/agent.js");

    // Should resolve without throwing and without calling stream a second time.
    await run("test");

    expect(streamCalls.length).toBe(1);
  });
});
