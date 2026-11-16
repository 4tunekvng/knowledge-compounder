import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `next dev` listens on every network interface unless given a host, so anyone
// on the same network (café or office wifi) could open the dev app and call its
// API routes. Every launcher that starts it must pass -H 127.0.0.1.
function nextDevCommands(): string[] {
  const root = process.cwd();
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const launchPath = join(root, ".claude", "launch.json");
  const launch = existsSync(launchPath)
    ? JSON.parse(readFileSync(launchPath, "utf8")).configurations
    : [];
  const launchCommands = launch.map((c: { runtimeArgs?: string[] }) =>
    (c.runtimeArgs ?? []).join(" "),
  );
  return [...Object.values<string>(pkg.scripts), ...launchCommands].filter(
    (command) => command.includes("next dev"),
  );
}

describe("dev server", () => {
  it("listens on loopback only", () => {
    // Arrange
    const commands = nextDevCommands();

    // Act
    const exposed = commands.filter((c) => !c.includes("-H 127.0.0.1"));

    // Assert
    expect(commands.length).toBeGreaterThan(0);
    expect(exposed).toEqual([]);
  });
});
