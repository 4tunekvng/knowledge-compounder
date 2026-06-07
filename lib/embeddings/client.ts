import "server-only";
import { getEnv } from "@/lib/db/client";

const VOYAGE_MODEL = "voyage-3.5-lite";
const VOYAGE_DIM = 512;
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageResponse {
  data?: { embedding?: number[]; index?: number }[];
}

async function callVoyage(text: string, inputType: "document" | "query"): Promise<Float32Array | null> {
  const env = await getEnv();
  const apiKey = env.VOYAGE_API_KEY ?? process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: [text.slice(0, 16_000)],
          model: VOYAGE_MODEL,
          input_type: inputType,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      console.warn(`Voyage embedding failed: ${response.status}`);
      return null;
    }
    const json = (await response.json()) as VoyageResponse;
    const vec = json.data?.[0]?.embedding;
    if (vec && vec.length > 0) {
      return new Float32Array(vec);
    }
    return null;
  } catch (err) {
    console.warn(`Voyage embedding error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function embed(text: string): Promise<Float32Array> {
  const remote = await callVoyage(text, "document");
  return remote ?? lexicalEmbedding(text);
}

// Hashed bag-of-words into a fixed-length vector. Crude but order-invariant,
// language-agnostic, and consistent across calls. Cosine similarity over these
// vectors gives a usable "share many of the same notable words" signal that
// complements a real embedder when one isn't configured.
function lexicalEmbedding(text: string): Float32Array {
  const dim = VOYAGE_DIM;
  const vec = new Float32Array(dim);
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOP_WORDS.has(raw)) continue;
    const h = hash32(raw) % dim;
    vec[h] += 1;
  }
  // L2-normalize so cosine similarity reduces to a dot product.
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }
  return vec;
}

function hash32(str: string): number {
  // FNV-1a 32-bit. Non-cryptographic, fast, deterministic across processes.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "are", "was",
  "but", "not", "you", "your", "they", "their", "there", "what", "when",
  "which", "will", "into", "about", "than", "then", "been", "were", "also",
  "more", "most", "some", "such", "these", "those", "would", "could", "should",
  "make", "made", "much", "many", "very", "just", "only", "over", "after",
  "before", "between", "where", "while",
]);

export function embeddingToBlob(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToEmbedding(blob: Buffer | Uint8Array | null | undefined): Float32Array | null {
  if (!blob) return null;
  // Buffer copy ensures the Float32Array view doesn't outlive the source buffer
  // and isn't misaligned (better-sqlite3 returns Buffers that may not be 4-byte aligned).
  const buf = Buffer.from(blob);
  const len = Math.floor(buf.byteLength / 4);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = buf.readFloatLE(i * 4);
  }
  return out;
}
