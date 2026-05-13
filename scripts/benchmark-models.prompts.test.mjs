// scripts/benchmark-models.prompts.test.mjs — byte-diff guard
//
// Asserts that the benchmark harness's DEFAULT_STANDARD_PROMPT string is BYTE-FOR-BYTE
// equal to the canonical Rust source at src-tauri/src/llm/mod.rs:455. Drift means the
// harness's quality_score measures a fiction, not what users experience.
//
// Plan 20-03 Task 2 Step 4 — BLOCKER-2 fix.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");

function extractRustStringLiteral(text, constName) {
  // Rust: const NAME: &str = "..."; — body is everything between the first " after "=" and the closing ";
  const re = new RegExp(`const\\s+${constName}\\s*:\\s*&str\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*;`, "s");
  const m = text.match(re);
  if (!m) throw new Error(`could not locate ${constName} in Rust source`);
  return m[1];
}

function extractJsStringLiteral(text, constName) {
  // JS: const NAME = "..."; — same backslash-escape rules (we control the harness)
  const re = new RegExp(`const\\s+${constName}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*;`, "s");
  const m = text.match(re);
  if (!m) throw new Error(`could not locate ${constName} in JS harness`);
  return m[1];
}

describe("benchmark harness prompt byte-diff guard", () => {
  it("DEFAULT_STANDARD_PROMPT matches src-tauri/src/llm/mod.rs:455 byte-for-byte", () => {
    const rust = readFileSync(resolve(REPO_ROOT, "src-tauri/src/llm/mod.rs"), "utf8");
    const js = readFileSync(resolve(REPO_ROOT, "scripts/benchmark-models.mjs"), "utf8");
    const rustPrompt = extractRustStringLiteral(rust, "DEFAULT_STANDARD_PROMPT");
    const jsPrompt = extractJsStringLiteral(js, "DEFAULT_STANDARD_PROMPT");
    expect(jsPrompt).toBe(rustPrompt);
  });
});
