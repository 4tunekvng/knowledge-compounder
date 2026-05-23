import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/db/client";

let cached: Anthropic | undefined;

export async function getAnthropic(): Promise<Anthropic> {
  if (!cached) {
    const env = await getEnv();
    const apiKey = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Set it as a worker secret with `wrangler secret put ANTHROPIC_API_KEY` (or in .env.local for next dev).",
      );
    }
    const baseURL = env.ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL;
    cached = new Anthropic({ apiKey, baseURL });
  }
  return cached;
}

export function isFakeAi(): boolean {
  return process.env.USE_FAKE_AI === "1";
}

export const MODELS = {
  // Per-source processing + theme clustering — balanced cost/quality.
  process: "claude-sonnet-4-6" as const,
  themes: "claude-sonnet-4-6" as const,
  // Essay drafting is the wow moment — pay for the best model.
  essay: "claude-opus-4-7" as const,
};
