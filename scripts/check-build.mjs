import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "index.html",
  "styles.css",
  "src/app.js",
  "src/firebase-client.js",
  "src/maps.js",
  "api/firebase-config.js",
  "vercel.json"
];

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const mapsModuleText = await readFile(path.join(root, "src/maps.js"), "utf8");
const countMatch = mapsModuleText.match(/export const MAPS = (\[[\s\S]*?\]);\n/);
if (!countMatch) {
  throw new Error("Could not locate MAPS export.");
}
const MAPS = JSON.parse(countMatch[1]);
if (!Array.isArray(MAPS) || MAPS.length !== 100) {
  throw new Error(`Expected 100 maps, found ${Array.isArray(MAPS) ? MAPS.length : "none"}.`);
}

for (const map of MAPS) {
  if (
    !map.id ||
    !map.ticker ||
    !map.name ||
    !Array.isArray(map.history) ||
    typeof map.returnPct !== "number"
  ) {
    throw new Error(`Invalid map payload: ${map.id || "unknown"}`);
  }
  if (map.history.length < 55 || !Array.isArray(map.future) || map.future.length < 15) {
    throw new Error(`Map ${map.id} does not have enough chart data.`);
  }
}

console.log(`Build check passed. ${MAPS.length} maps are ready.`);
