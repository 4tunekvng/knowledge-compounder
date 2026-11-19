import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useLocalTime } from "@/lib/use-local-time";

function Stamp() {
  return createElement("span", null, useLocalTime(() => "18 Nov 2026") ?? "");
}

describe("useLocalTime", () => {
  it("leaves the time out of the server render, so it can't mismatch", () => {
    // Arrange
    const element = createElement(Stamp);

    // Act
    const html = renderToString(element);

    // Assert
    expect(html).toBe("<span></span>");
  });
});
