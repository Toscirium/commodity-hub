#!/usr/bin/env node
// Bump the Android versionName (the marketing string) in android/app/build.gradle.
//
// This script used to bump versionCode too, and that was the source of a long-
// running release bug. `npm run android:release` ran it automatically, so every
// release rewrote a *tracked* file on whichever machine happened to build. Those
// writes were never committed, so git and Play Console told different stories:
//
//   git:  6 -> 7 -> (8 reverted) -> 16 -> 17
//   play: ................................. 28 (1.0.27)
//
// and android/app/build.gradle conflicted on every pull between the two
// checkouts. versionCode is now derived from the git commit count inside
// build.gradle itself, so it can't drift and nothing needs to write it.
//
// versionName is still a human decision - it's cosmetic, and it shouldn't
// change just because someone ran a build. So this is no longer wired into
// android:release; run it deliberately, then COMMIT THE RESULT.
//
// Usage:
//   npm run android:bump            # 1.0.28 -> 1.0.29
//   npm run android:bump minor      # 1.0.28 -> 1.1.0
//   npm run android:bump major      # 1.0.28 -> 2.0.0
import { readFileSync, writeFileSync } from "node:fs";

const path = "android/app/build.gradle";
const arg = process.argv[2] || "patch";

if (process.argv.includes("--code-only")) {
  console.error(
    "--code-only no longer does anything: versionCode is derived from the git\n" +
    "commit count in build.gradle and is not stored in the file. Nothing to bump.",
  );
  process.exit(1);
}

if (!["patch", "minor", "major"].includes(arg)) {
  console.error(`Unknown argument "${arg}". Expected one of: patch, minor, major.`);
  process.exit(1);
}

let src = readFileSync(path, "utf8");
const nameMatch = src.match(/versionName\s+"(\d+)\.(\d+)\.(\d+)"/);
if (!nameMatch) {
  console.error(`Could not find a versionName "x.y.z" line in ${path}`);
  process.exit(1);
}

let [major, minor, patch] = nameMatch.slice(1, 4).map(Number);
if (arg === "major") { major++; minor = 0; patch = 0; }
else if (arg === "minor") { minor++; patch = 0; }
else { patch++; }

const oldName = `${nameMatch[1]}.${nameMatch[2]}.${nameMatch[3]}`;
const newName = `${major}.${minor}.${patch}`;

writeFileSync(path, src.replace(/versionName\s+"[^"]+"/, `versionName "${newName}"`));

console.log(`Bumped versionName ${oldName} -> ${newName}`);
console.log(`versionCode is derived from git and needs no bump.`);
console.log(`\nCommit this before building, or the two machines drift again:`);
console.log(`  git commit -am "Bump Android versionName to ${newName}"`);
