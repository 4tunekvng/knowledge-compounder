import { describe, expect, it } from "vitest";
import { cosineSimilarity, topK } from "@/lib/embeddings/similarity";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns 0 for any zero vector", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 1, 1]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("throws on length mismatch", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(() => cosineSimilarity(a, b)).toThrow();
  });
});

describe("topK", () => {
  it("returns the highest-scored k items in descending order", () => {
    const result = topK(
      [
        { item: "a", score: 0.1 },
        { item: "b", score: 0.9 },
        { item: "c", score: 0.5 },
        { item: "d", score: 0.7 },
      ],
      2,
    );
    expect(result.map((r) => r.item)).toEqual(["b", "d"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      { item: "a", score: 0.1 },
      { item: "b", score: 0.9 },
    ];
    const before = [...input];
    topK(input, 1);
    expect(input).toEqual(before);
  });
});
