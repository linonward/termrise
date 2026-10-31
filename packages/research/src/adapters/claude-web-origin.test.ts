import { describe, expect, it } from "vitest";

import { claudeCostMicros, createClaudeWebOrigin } from "./claude-web-origin";

const window = {
  from: new Date("2026-09-24T00:00:00Z"),
  to: new Date("2026-10-31T00:00:00Z"),
  burstDay: "2026-10-24",
};

describe("claudeCostMicros", () => {
  it("adds tokens and searches", () => {
    expect(
      claudeCostMicros("claude-haiku-5-5", {
        input_tokens: 20_000,
        output_tokens: 300,
        server_tool_use: { web_search_requests: 2 },
      }),
    ).toBe(2_000 + 150 + 20_000);
  });
});

describe("createClaudeWebOrigin", () => {
  it("turns the pages found and the answer into evidence, resuming a paused turn", async () => {
    const calls: unknown[] = [];
    const usage = {
      input_tokens: 10_000,
      output_tokens: 200,
      server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
    };
    const responses = [
      { stop_reason: "pause_turn", usage, content: [] },
      {
        stop_reason: "end_turn",
        usage,
        content: [
          {
            type: "web_search_tool_result",
            tool_use_id: "s1",
            content: [
              {
                type: "web_search_result",
                title: "Sims 4 Halloween plumbob costume",
                url: "https://example.com/plumbob",
                page_age: "October 20, 2026",
                encrypted_content: "x",
              },
              {
                type: "web_search_result",
                title: "No date",
                url: "https://example.com/other",
                page_age: null,
                encrypted_content: "y",
              },
            ],
          },
          {
            type: "web_search_tool_result",
            tool_use_id: "s2",
            content: {
              type: "web_search_tool_result_error",
              error_code: "max_uses_exceeded",
            },
          },
          {
            type: "text",
            text: "A Halloween costume trend on TikTok in mid October.",
          },
        ],
      },
    ];
    const web = createClaudeWebOrigin({
      client: {
        messages: {
          create: async (body: unknown) => {
            calls.push(body);
            return responses[calls.length - 1];
          },
        },
      } as never,
    });
    const { value, costMicros } = await web.search("plumbob template", window);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      model: "claude-haiku-5-5",
      tools: [{ type: "web_search_20250305", max_uses: 3 }],
    });
    expect(value).toEqual([
      {
        source: "web",
        kind: "page",
        title: "Sims 4 Halloween plumbob costume",
        url: "https://example.com/plumbob",
        at: new Date("October 20, 2026").toISOString(),
        score: null,
      },
      expect.objectContaining({ kind: "page", at: "" }),
      expect.objectContaining({
        kind: "summary",
        title: "A Halloween costume trend on TikTok in mid October.",
      }),
    ]);
    expect(costMicros).toBe(2 * (1_000 + 100 + 10_000));
    expect(web.maxCostMicros).toBeGreaterThan(30_000);
  });
});
