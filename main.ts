/**
 * Ship It Friday — make.fun entry.
 *
 * A tiny program with one job: take the single funniest commit message an
 * AI coding agent would write right before breaking production on a Friday,
 * check it against the competition's gate, and write it to the output file
 * the grader reads.
 *
 * Usage:
 *   node main.ts [--in <path>] [--out <path>]
 *
 * Defaults:
 *   --in   line.txt next to this file
 *   --out  $MAKEFUN_OUTPUT_DIR/entry.txt, or /output/entry.txt
 *
 * The gate (from the competition rules) is simple but strict:
 *   - the text must be UTF-8, 1 to 159 characters long,
 *   - it must not be only whitespace,
 *   - it must be a single line.
 *
 * Anything that fails the gate is refused loudly, with a non-zero exit
 * code, instead of writing a file the judge would score as invalid.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Constants: the gate, exactly as the competition states it.
// ---------------------------------------------------------------------------

/** Smallest accepted length, in Unicode code points. */
const MIN_CHARS = 1;

/** Largest accepted length, in Unicode code points. */
const MAX_CHARS = 159;

/** Fallback output directory when the harness sets no override. */
const DEFAULT_OUTPUT_DIR = "/output";

/** Name of the file the grader reads. */
const ENTRY_FILENAME = "entry.txt";

/** Name of the file that holds the commit message in this repository. */
const LINE_FILENAME = "line.txt";

// ---------------------------------------------------------------------------
// Small helpers, each doing exactly one thing so the flow stays readable.
// ---------------------------------------------------------------------------

/** Directory this file lives in, resolved even when run from elsewhere. */
function ownDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Read a flag of the form `--name value` from the argument list.
 * Returns null when the flag is absent.
 */
function flagValue(argv: string[], name: string): string | null {
  const at = argv.indexOf(name);
  if (at === -1 || at + 1 >= argv.length) {
    return null;
  }
  return argv[at + 1];
}

/**
 * Count Unicode code points, not UTF-16 code units, so an emoji or an
 * em-dash counts as the one character the reader sees, matching the
 * grader's idea of "characters".
 */
function countChars(text: string): number {
  return [...text].length;
}

/** Count the UTF-8 bytes the text takes on disk. */
function countBytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** True when the text holds at least one character that is not whitespace. */
function hasVisibleText(text: string): boolean {
  return /\S/.test(text);
}

/**
 * Read the commit message, keeping exactly one line.
 *
 * The source file may end with a trailing newline (every text editor adds
 * one); that newline is not part of the message, so it is stripped. Any
 * other newline inside the file means the source is not a single line,
 * and that is an error rather than something to guess about.
 */
function readLine(inputPath: string): string {
  const raw = readFileSync(inputPath, "utf8");
  const stripped = raw.replace(/\r?\n$/, "");
  if (stripped.includes("\n") || stripped.includes("\r")) {
    throw new Error(
      `entry must be a single line, but ${inputPath} holds more than one`,
    );
  }
  return stripped;
}

/**
 * Check the message against the gate and return a list of problems.
 * An empty list means the message is good to ship.
 */
function validateEntry(text: string): string[] {
  const problems: string[] = [];
  const chars = countChars(text);
  if (chars < MIN_CHARS) {
    problems.push(`entry is empty (needs at least ${MIN_CHARS} character)`);
  }
  if (chars > MAX_CHARS) {
    problems.push(
      `entry is ${chars} characters, over the ${MAX_CHARS} limit`,
    );
  }
  if (!hasVisibleText(text)) {
    problems.push("entry is only whitespace");
  }
  if (text !== text.trim()) {
    problems.push("entry has leading or trailing whitespace the judge cannot see");
  }
  return problems;
}

/** Write the message to the output file, creating the directory first. */
function writeEntry(outputPath: string, text: string): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, text, "utf8");
}

/**
 * Resolve where the entry goes.
 *
 * Priority: the --out flag, then $MAKEFUN_OUTPUT_DIR, then /output.
 * The harness sets the variable when it wants the file elsewhere.
 */
function resolveOutputPath(argv: string[]): string {
  const fromFlag = flagValue(argv, "--out");
  if (fromFlag !== null) {
    return resolve(fromFlag);
  }
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return join(resolve(fromEnv), ENTRY_FILENAME);
  }
  return join(DEFAULT_OUTPUT_DIR, ENTRY_FILENAME);
}

/** Resolve where the message is read from: --in, or line.txt beside us. */
function resolveInputPath(argv: string[]): string {
  const fromFlag = flagValue(argv, "--in");
  if (fromFlag !== null) {
    return resolve(fromFlag);
  }
  return join(ownDir(), LINE_FILENAME);
}

// ---------------------------------------------------------------------------
// Main: read, validate, write, report.
// ---------------------------------------------------------------------------

function main(argv: string[]): number {
  const inputPath = resolveInputPath(argv);
  const outputPath = resolveOutputPath(argv);

  const text = readLine(inputPath);
  const problems = validateEntry(text);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`gate failed: ${problem}`);
    }
    return 1;
  }

  writeEntry(outputPath, text);

  console.log(`wrote ${countChars(text)} chars (${countBytes(text)} bytes) to ${outputPath}`);
  console.log(`gate budget: ${MAX_CHARS - countChars(text)} of ${MAX_CHARS} chars spare`);
  console.log(`entry: ${text}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
