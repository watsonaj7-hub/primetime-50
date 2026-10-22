import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { privateNames, privateReferences } from "../security/browser-secrets";

it.each(privateNames)("detects a private name and an inlined value for %s without returning the value", name => {
  const value = `SYNTHETIC_PRIVATE_VALUE_${privateNames.indexOf(name)}_NOT_A_CREDENTIAL`;
  expect(privateReferences(`config.${name}`, {})).toContain(name);
  const findings = privateReferences(`const inlined = "${value}"`, { [name]: value });
  expect(findings).toEqual([name]);
  expect(JSON.stringify(findings).includes(value)).toBe(false);
});
it("checks escaped configured values and permits public configuration", () => {
  const value = 'SYNTHETIC_"ESCAPED\\VALUE';
  expect(privateReferences(JSON.stringify(value), { SUPABASE_SERVICE_ROLE_KEY: value })).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  expect(privateReferences('NEXT_PUBLIC_SUPABASE_ANON_KEY="public-fixture"', { OPENAI_API_KEY: "" })).toEqual([]);
});

it("the real bundle-check reporter detects inlined service credentials without printing asset contents", () => {
  const root = mkdtempSync(join(tmpdir(), "issue4-scanner-"));
  const sentinel = "SYNTHETIC_REPORTER_PRIVATE_VALUE_NOT_CREDENTIAL";
  try {
    mkdirSync(join(root, "tests/security"), { recursive: true });
    mkdirSync(join(root, ".next/static"), { recursive: true });
    for (const path of ["vitest.config.mts", "tests/security/browser-secrets.ts", "tests/security/secret-boundaries.test.ts"]) {
      copyFileSync(resolve(path), join(root, path));
    }
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "dir");
    // Do not inherit credentials into the subprocess. Only this synthetic value
    // and runtime-location variables are needed; no package install or build.
    const env = { NODE_ENV: "test" as const, PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, SUPABASE_SERVICE_ROLE_KEY: sentinel };
    for (const content of [sentinel, `PRIMEFIT_AI_KEY ${sentinel}`]) {
      writeFileSync(join(root, ".next/static/probe.js"), content);
      const result = spawnSync(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "--project", "security"], { cwd: root, env, encoding: "utf8", timeout: 20000 });
      const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(output.includes("Private configuration in")).toBe(true);
      expect(output.includes(sentinel)).toBe(false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 45000);
