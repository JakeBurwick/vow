#!/usr/bin/env node
// Vow CLI — run .vow programs with real I/O.
//   node cli.js program.vow [args...]     run a program
//   node cli.js --check program.vow       type-check only, run nothing
//
// The interpreter is generator-based, so every Vow call costs several JS frames.
// Running it on a worker with a 512 MB stack lets real recursive programs go thousands deep.
import { Worker } from 'node:worker_threads';

// `vow prog.vow | head` closes the pipe early; exit quietly like other CLI tools
// instead of crashing with a Node stack trace.
for (const s of [process.stdout, process.stderr]) {
  s.on('error', (e) => { if (e.code === 'EPIPE') process.exit(process.exitCode ?? 0); throw e; });
}

const w = new Worker(new URL('./cli-main.js', import.meta.url), {
  argv: process.argv.slice(2),
  resourceLimits: { stackSizeMb: 512 },
});
w.on('exit', (code) => { process.exitCode = code; });
w.on('error', (e) => { console.error(e); process.exitCode = 2; });
