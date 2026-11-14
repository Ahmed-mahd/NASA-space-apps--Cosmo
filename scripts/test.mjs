// Runs the TypeScript test files with Node's built-in test runner.
// jiti (already installed with Tailwind) compiles TypeScript on the fly and
// resolves the "@/..." import alias, so no extra test framework is needed.
//   npm test                 all *.test.ts files under src/
//   npm test -- brain        only files whose path contains "brain"
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createJiti } from "jiti";

const root = resolve(import.meta.dirname, "..");
const jiti = createJiti(import.meta.url, { alias: { "@": join(root, "src") }, interopDefault: true });

const filter = process.argv[2] ?? "";
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".test.ts") && p.includes(filter) ? [p] : [];
});

for (const file of walk(join(root, "src"))) await jiti.import(file);
