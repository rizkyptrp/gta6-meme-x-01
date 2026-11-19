// main.ts — the graded entrypoint for this make.fun entry.
//
// The entry is a post on X, and this program's only job is to hand the
// grader the post's address: it copies POST.json from the repository
// directory into the output directory.
//
//   MAKEFUN_BOT_DIR    — the repository directory (default: /bot)
//   MAKEFUN_OUTPUT_DIR — the output directory (default: /output)
//
// It reads nothing else, writes nothing else, uses no network and no
// clock, and always produces the same bytes for the same input. If the
// copy fails for any reason it prints an error and exits non-zero.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const botDir = process.env.MAKEFUN_BOT_DIR || "/bot";
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

const source = join(botDir, "POST.json");
const destination = join(outDir, "POST.json");

// Fail fast with a clear message if the entry file is not there at all,
// rather than dying inside the copy with a vaguer error.
if (!existsSync(source)) {
  console.error("main.ts: POST.json not found in " + botDir);
  process.exit(1);
}

try {
  // The output directory may not exist yet; create it, parents included.
  mkdirSync(outDir, { recursive: true });
  copyFileSync(source, destination);
  console.log("main.ts: copied POST.json to " + destination);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("main.ts: failed to copy POST.json: " + message);
  process.exit(1);
}
