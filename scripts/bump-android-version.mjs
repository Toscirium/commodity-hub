#!/usr/bin/env node
// Auto-bump Android versionCode (and patch versionName) in android/app/build.gradle.
// Usage:
//   node scripts/bump-android-version.mjs           # bump patch (1.0.3 -> 1.0.4) + versionCode +1
//   node scripts/bump-android-version.mjs minor     # 1.0.3 -> 1.1.0
//   node scripts/bump-android-version.mjs major     # 1.0.3 -> 2.0.0
//   node scripts/bump-android-version.mjs --code-only  # only bump versionCode
import { readFileSync, writeFileSync } from "node:fs";

const path = "android/app/build.gradle";
const arg = process.argv[2] || "patch";
const codeOnly = process.argv.includes("--code-only");

let src = readFileSync(path, "utf8");
const codeMatch = src.match(/versionCode\s+(\d+)/);
const nameMatch = src.match(/versionName\s+"(\d+)\.(\d+)\.(\d+)"/);
if (!codeMatch || !nameMatch) {
  console.error("Could not find versionCode/versionName in", path);
  process.exit(1);
}

const newCode = parseInt(codeMatch[1], 10) + 1;
let [_, maj, min, pat] = nameMatch.map((x, i) => (i === 0 ? x : parseInt(x, 10)));

if (!codeOnly) {
  if (arg === "major") { maj++; min = 0; pat = 0; }
  else if (arg === "minor") { min++; pat = 0; }
  else { pat++; }
}

const newName = `${maj}.${min}.${pat}`;
src = src.replace(/versionCode\s+\d+/, `versionCode ${newCode}`);
src = src.replace(/versionName\s+"[^"]+"/, `versionName "${newName}"`);
writeFileSync(path, src);
console.log(`Bumped Android: versionCode ${codeMatch[1]} -> ${newCode}, versionName ${nameMatch[0].match(/"([^"]+)"/)[1]} -> ${newName}`);
