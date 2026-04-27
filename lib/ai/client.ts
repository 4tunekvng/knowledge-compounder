import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to enable AI processing.",
    );
  }
  if (!cached) {
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
