import { copyFileSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "apps/server/dist");
const dest = resolve(root, "functions-deploy");

mkdirSync(dest, { recursive: true });

// Copy all built files
for (const file of readdirSync(src)) {
  copyFileSync(resolve(src, file), resolve(dest, file));
  console.log(`Copied ${file}`);
}

// Copy .env so Firebase picks up GEMINI_API_KEY
try {
  copyFileSync(resolve(root, "apps/server/.env"), resolve(dest, ".env"));
  console.log("Copied .env");
} catch {}

// Install dependencies so Firebase CLI can locally parse the exports
console.log("Installing functions-deploy deps...");
execSync("npm install --prefer-offline", { cwd: dest, stdio: "inherit" });

console.log("Functions deploy directory ready.");
