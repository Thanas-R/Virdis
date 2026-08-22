#!/usr/bin/env node
/**
 * Generates Vercel Edge Functions under `api/` from the Deno edge functions in
 * `supabase/functions/`. The generated files are near-verbatim copies with a
 * small compatibility prelude so the exact same logic runs on both platforms.
 *
 * Run: node scripts/gen-vercel-api.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "supabase", "functions");
const outDir = join(root, "api");

const PRELUDE = `// AUTO-GENERATED from supabase/functions/<name>/index.ts by scripts/gen-vercel-api.mjs
// Do not edit directly - edit the Supabase function and re-run the generator.
export const config = { runtime: "edge" };

type Handler = (req: Request) => Response | Promise<Response>;
let _handler: Handler = () => new Response("not ready", { status: 500 });
const serve = (fn: Handler) => {
  _handler = fn;
};
// Deno.env shim -> Vercel Environment Variables
const Deno = {
  env: {
    get: (key: string): string | undefined => (process.env as Record<string, string | undefined>)[key],
  },
};
void Deno;
`;

const EPILOGUE = `
export default function handler(req: Request) {
  return _handler(req);
}
`;

function transform(source) {
  let out = source
    // drop Deno std http server import (serve is shimmed above)
    .replace(/^\s*import\s*\{\s*serve\s*\}\s*from\s*["']https:\/\/deno\.land\/[^"']+["'];?\s*$/m, "")
    // tile proxy lives at /api/gee-tile-proxy on Vercel
    .replace(/\$\{supabaseUrl\}\/functions\/v1\/gee-tile-proxy/g, "/api/gee-tile-proxy");

  // Remove a now-unused supabaseUrl binding if the replacement orphaned it
  if (!out.includes("supabaseUrl}") && !out.includes("supabaseUrl +")) {
    out = out.replace(/^\s*const supabaseUrl = Deno\.env\.get\("SUPABASE_URL"\)[^\n]*\n/m, "");
  }

  return `${PRELUDE}\n${out.trim()}\n${EPILOGUE}`;
}

mkdirSync(outDir, { recursive: true });

const names = readdirSync(srcDir).filter((n) => {
  const p = join(srcDir, n, "index.ts");
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
});

for (const name of names) {
  const source = readFileSync(join(srcDir, name, "index.ts"), "utf8");
  writeFileSync(join(outDir, `${name}.ts`), transform(source));
  console.log(`generated api/${name}.ts`);
}
console.log(`\n${names.length} Vercel API routes generated.`);
