import { expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { privateReferences } from "./browser-secrets";
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(root,entry.name)) : [join(root,entry.name)]);
}
it("production browser assets contain no private configuration names or configured values", () => {
  if (!existsSync(".next/static")) throw new Error("Run pnpm build before the production bundle security check.");
  const assets = files(".next/static");
  expect(assets.some(file => file.endsWith(".js"))).toBe(true);
  for (const file of assets) {
    const findings = privateReferences(readFileSync(file, "utf8"), process.env);
    // Only labels and the asset path enter assertions, including on failure.
    expect(findings, `Private configuration in ${file}`).toEqual([]);
  }
});
