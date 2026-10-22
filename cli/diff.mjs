#!/usr/bin/env node
// Command line diff: point it at a folder of snapshot JSON files.
// This is the path an AI agent (or a cron job) uses. Same engine as the web page.
//
//   node cli/diff.mjs <folder> [--topics topics.json] [--out result.json] [--js result.js]
//                              [--tz-offset 480] [--max-drop 0.5] [--summary]
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import engine from '../src/engine.js';

const USAGE = `Usage: node cli/diff.mjs <snapshot-folder> [options]

Reads every *.json file in the folder (one snapshot each) and reports which
posts disappeared between captures.

Options:
  --topics <file>     keyword list for topic tags (see data/topics.json)
  --out <file>        write the full JSON result to a file instead of stdout
  --js <file>         also write it as a script the web page can load offline
  --tz-offset <min>   minutes east of UTC used to group by day, -720 to 840
                      (default 480 = Beijing)
  --max-drop <0..1>   share of posts that may vanish at once before a capture is
                      checked for being broken (default 0.5, 1 turns the check off)
  --summary           print one plain line per day instead of JSON
`;

function fail(msg, code = 1) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { folder: null, options: {} };
  const num = (flag, v, min, max) => {
    const n = Number(v);
    if (v === undefined || v === '' || !Number.isFinite(n)) fail(`${flag} needs a number\n\n${USAGE}`, 2);
    // Out-of-range values used to be accepted and silently moved every date (or broke the guard).
    if (n < min || n > max) fail(`${flag} must be between ${min} and ${max}, got ${v}\n\n${USAGE}`, 2);
    return n;
  };
  const val = (flag, v) => {
    if (v === undefined || v.startsWith('--')) fail(`${flag} needs a file name\n\n${USAGE}`, 2);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { process.stdout.write(USAGE); process.exit(0); }
    else if (a === '--topics') args.topics = val(a, argv[++i]);
    else if (a === '--out') args.out = val(a, argv[++i]);
    else if (a === '--js') args.js = val(a, argv[++i]);
    else if (a === '--summary') args.summary = true;
    else if (a === '--tz-offset') args.options.tzOffsetMinutes = num(a, argv[++i], -720, 840);
    else if (a === '--max-drop') args.options.maxDropRatio = num(a, argv[++i], 0, 1);
    else if (a.startsWith('--')) fail(`Unknown option ${a}\n\n${USAGE}`, 2);
    else if (!args.folder) args.folder = a;
    else fail(`Only one folder, please\n\n${USAGE}`, 2);
  }
  if (!args.folder) fail(USAGE, 2);
  return args;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`Could not read ${path}: ${e.message}`);
  }
}

const args = parseArgs(process.argv.slice(2));

let names;
try {
  if (!statSync(args.folder).isDirectory()) fail(`${args.folder} is not a folder`);
  names = readdirSync(args.folder).filter((f) => f.toLowerCase().endsWith('.json')).sort();
} catch (e) {
  fail(`Could not open folder ${args.folder}: ${e.message}`);
}

// A typo'd folder used to print "0 deleted of 0 posts" and exit 0, which looks like a real result.
if (!names.length) fail(`No .json snapshot files found in ${args.folder}`);
if (names.length === 1) process.stderr.write(`Note: only one snapshot (${names[0]}), so there is nothing to compare it with yet. Add a later capture to see deletions.\n`);

const snapshots = names.map((name) => {
  const snap = readJson(join(args.folder, name));
  return snap;
});

if (args.topics) args.options.lexicon = readJson(args.topics);

let result;
try {
  result = engine.diffSnapshots(snapshots, args.options);
} catch (e) {
  // Find which file broke, so the message points somewhere useful.
  let culprit = '';
  for (let i = 0; i < snapshots.length; i++) {
    try { engine.diffSnapshots([snapshots[i]]); } catch { culprit = ` (in ${names[i]})`; break; }
  }
  fail(`${e.message}${culprit}`);
}

const json = JSON.stringify(result, null, 2);
const writeTo = (path, body) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
};
if (args.out) writeTo(args.out, `${json}\n`);
if (args.js) {
  // The page also needs the keyword list, so people can load their own snapshots offline.
  const lex = args.options.lexicon ? `window.CDE_LEXICON = ${JSON.stringify(args.options.lexicon)};\n` : '';
  writeTo(args.js, `window.CDE_DATA = ${json};\n${lex}`);
}

if (args.summary) {
  const lines = result.days.map((d) => `${d.date}  ${d.deleted.length} deleted`);
  if (result.meta.sample) lines.unshift(`NOTE: ${result.meta.notice || 'sample data'}`);
  for (const s of result.meta.skippedSnapshots) lines.push(`ignored capture ${s.captured_at}: ${s.reason}`);
  for (const w of result.meta.warnings) lines.push(`warning: ${w}`);
  lines.push(`total: ${result.stats.deletedCount} deleted of ${result.stats.totalPosts} posts seen`);
  process.stdout.write(`${lines.join('\n')}\n`);
} else if (!args.out) {
  process.stdout.write(`${json}\n`);
}
