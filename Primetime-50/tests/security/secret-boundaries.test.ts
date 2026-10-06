import { expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const privateNames = ["PRIMEFIT_AI_KEY", "OPENAI_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SERVICE_ROLE_KEY"];
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(root,entry.name)) : [join(root,entry.name)]);
}
it("production browser bundles do not reference private provider configuration", () => {
  if (!existsSync(".next/static")) throw new Error("Run pnpm build before the production bundle security check.");
  const bundles = files(".next/static").filter(file => file.endsWith(".js"));
  expect(bundles.length).toBeGreaterThan(0);
  for (const file of bundles) {
    const source = readFileSync(file,"utf8");
    for (const name of privateNames) {
      expect(source, `Private configuration reference in ${file}`).not.toContain(name);
      const value = process.env[name];
      // Values are inspected for presence only and never included in failure messages.
      if (value) expect(source.includes(value), `Private value leaked in ${file}`).toBe(false);
    }
  }
});
