import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Project root (folder with package.json), works from server/ or dist/server/. */
export function projectRoot(): string {
  const candidates = [path.resolve(__dirname, ".."), path.resolve(__dirname, "../..")];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "package.json"))) return c;
  }
  return path.resolve(__dirname, "..");
}
