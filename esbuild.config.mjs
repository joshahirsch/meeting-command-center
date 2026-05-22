import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "dist");

mkdirSync(distDir, { recursive: true });

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: join(distDir, "Code.js"),
  format: "iife",
  platform: "browser",
  target: "es2019",
  legalComments: "none",
  logLevel: "info",
});

copyFileSync(join(__dirname, "appsscript.json"), join(distDir, "appsscript.json"));
copyFileSync(join(__dirname, "EntryPoints.gs"), join(distDir, "EntryPoints.gs"));

console.log("Build complete: dist/Code.js");
