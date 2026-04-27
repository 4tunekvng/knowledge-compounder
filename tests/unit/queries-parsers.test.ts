import { describe, expect, it } from "vitest";
import {
  parseCitations,
  parseConcepts,
  parseSourceIds,
  parseTakeaways,
} from "@/lib/parsers";

describe("queries JSON parsers", () => {
  it("parseConcepts validates shape and skips junk", () => {
    const json = JSON.stringify([
      { name: "moats", weight: 0.4 },
      { name: "distribution", weight: 0.3 },
      { name: "missing weight" },
      { weight: 0.1 }, // missing name
      "not an object",
    ]);
    const result = parseConcepts(json);
    expect(result).toEqual([
      { name: "moats", weight: 0.4 },
      { name: "distribution", weight: 0.3 },
    ]);
  });

  it("parseConcepts returns [] on garbage", () => {
    expect(parseConcepts("not json")).toEqual([]);
    expect(parseConcepts("{}")).toEqual([]);
  });

  it("parseTakeaways returns string array", () => {
    const json = JSON.stringify(["one", "two", 3, null]);
    expect(parseTakeaways(json)).toEqual(["one", "two"]);
  });

  it("parseSourceIds returns positive integers only", () => {
    const json = JSON.stringify([1, 2, 3.5, "4", -1, 0]);
    expect(parseSourceIds(json)).toEqual([1, 2]);
  });

  it("parseCitations validates source_id and quote", () => {
    const json = JSON.stringify([
      { source_id: 1, quote: "Real quote" },
      { source_id: "not a number", quote: "x" },
      { source_id: 2 }, // missing quote
      { sourceId: 3, quote: "camelCase still works" },
    ]);
    const result = parseCitations(json);
    expect(result).toEqual([
      { sourceId: 1, quote: "Real quote" },
      { sourceId: 3, quote: "camelCase still works" },
    ]);
  });
});
