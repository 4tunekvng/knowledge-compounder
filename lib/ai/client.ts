import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { OutputConfig } from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import { getEnv } from "@/lib/db/client";

async function getAnthropic(
  onResponse: (response: Response) => void,
): Promise<Anthropic> {
  const env = await getEnv();
  const apiKey = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Set it as a worker secret with `wrangler secret put ANTHROPIC_API_KEY` (or in .env.local for next dev).",
    );
  }
  const baseURL = env.ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL;
  return new Anthropic({
    apiKey,
    baseURL,
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      onResponse(response);
      return response;
    },
  });
}

export function isFakeAi(): boolean {
  return process.env.USE_FAKE_AI === "1";
}

/**
 * Test mode's stand-in reply (USE_FAKE_AI=1), logged with its source so a
 * stub can never pass for the model's answer in the logs.
 */
export function testStub<T>(label: string, make: () => T): T {
  console.log(`[ai] ${label} source=test-stub`);
  return make();
}

export const MODELS = {
  // Per-source processing + theme clustering — balanced cost/quality.
  process: "claude-sonnet-5-5" as const,
  themes: "claude-sonnet-5-5" as const,
  // Essay drafting is the wow moment — pay for the best model.
  essay: "claude-opus-5-5" as const,
};

// A reply that fails or can't be parsed is retried once before the capture
// is marked failed; a free tier that is briefly overloaded or returns
// malformed JSON usually answers on the next try.
const ATTEMPTS = 2;

interface StructuredArgs<Schema extends z.ZodType> {
  label: string;
  model: (typeof MODELS)[keyof typeof MODELS];
  maxTokens: number;
  effort: OutputConfig["effort"];
  schema: Schema;
  system: string;
  userMessage: string;
}

/**
 * One structured Claude call: cached system prompt, adaptive thinking, the
 * reply parsed against `schema`, tried up to ATTEMPTS times. A rejected key
 * is not retried: it will not change between tries.
 */
export async function parseStructured<Schema extends z.ZodType>(
  args: StructuredArgs<Schema>,
): Promise<z.infer<Schema>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await callOnce(args, attempt);
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) break;
    }
  }
  throw lastError;
}

/**
 * Opens a client per call and always closes it so sockets don't pile up
 * across requests. A retry skips the gateway's response cache, which could
 * otherwise hand back the same bad reply.
 */
async function callOnce<Schema extends z.ZodType>(
  args: StructuredArgs<Schema>,
  attempt: number,
): Promise<z.infer<Schema>> {
  const started = Date.now();
  let headers: Headers | null = null;
  const client = await getAnthropic((r) => (headers = r.headers));
  // Which free tier answered, and what failed before it: the gateway says so
  // in its headers, and they explain a slow or failed capture.
  const logCall = (outcome: string) => {
    const h = headers as Headers | null;
    console.log(
      `[ai] ${args.label} source=model try ${attempt} ${outcome} ` +
        `${Date.now() - started}ms ` +
        `route=${h?.get("x-fortune-llm-route") ?? "none"} ` +
        `model=${h?.get("x-fortune-llm-model") ?? args.model} ` +
        `prior=${h?.get("x-fortune-llm-prior-errors") ?? "none"} ` +
        `skipped=${h?.get("x-fortune-llm-skipped") ?? "none"}`,
    );
  };
  try {
    const response = await client.messages.parse({
      model: args.model,
      max_tokens: args.maxTokens,
      thinking: { type: "adaptive" },
      output_config: {
        format: zodOutputFormat(args.schema),
        effort: args.effort,
      },
      system: [
        {
          type: "text",
          text: args.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: args.userMessage }],
      // The gateway's own flag; the SDK's type only knows user_id.
      ...(attempt > 1
        ? { metadata: { fortune_no_cache: true } as { user_id?: string } }
        : {}),
    });

    logCall(response.parsed_output ? "ok" : "unparsed");
    if (!response.parsed_output) {
      const stop = response.stop_reason;
      throw new Error(
        `${args.label} returned no parsed output (stop_reason=${stop})`,
      );
    }
    return response.parsed_output;
  } catch (err) {
    if (!(err instanceof Error && err.message.includes("no parsed output"))) {
      logCall(`error ${err instanceof Error ? err.message.slice(0, 200) : err}`);
    }
    throw err;
  } finally {
    try { await (client as unknown as { close?(): Promise<void> }).close?.(); } catch {}
  }
}
