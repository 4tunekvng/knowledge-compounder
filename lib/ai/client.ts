import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { OutputConfig } from "@anthropic-ai/sdk/resources/messages";
import type { z } from "zod";
import { getEnv } from "@/lib/db/client";

async function getAnthropic(): Promise<Anthropic> {
  const env = await getEnv();
  const apiKey = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Set it as a worker secret with `wrangler secret put ANTHROPIC_API_KEY` (or in .env.local for next dev).",
    );
  }
  const baseURL = env.ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL;
  return new Anthropic({ apiKey, baseURL });
}

export function isFakeAi(): boolean {
  return process.env.USE_FAKE_AI === "1";
}

export const MODELS = {
  // Per-source processing + theme clustering — balanced cost/quality.
  process: "claude-sonnet-5-5" as const,
  themes: "claude-sonnet-5-5" as const,
  // Essay drafting is the wow moment — pay for the best model.
  essay: "claude-opus-5-5" as const,
};

/**
 * One structured Claude call: cached system prompt, adaptive thinking, the
 * reply parsed against `schema`. Opens a client per call and always closes
 * it so sockets don't pile up across requests.
 */
export async function parseStructured<Schema extends z.ZodType>(args: {
  label: string;
  model: (typeof MODELS)[keyof typeof MODELS];
  maxTokens: number;
  effort: OutputConfig["effort"];
  schema: Schema;
  system: string;
  userMessage: string;
}): Promise<z.infer<Schema>> {
  const client = await getAnthropic();
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
    });

    if (!response.parsed_output) {
      const stop = response.stop_reason;
      throw new Error(
        `${args.label} returned no parsed output (stop_reason=${stop})`,
      );
    }
    return response.parsed_output;
  } finally {
    try { await (client as unknown as { close?(): Promise<void> }).close?.(); } catch {}
  }
}
