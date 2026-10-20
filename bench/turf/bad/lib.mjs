// Shared runner for the bad-data bench: runs one solution file on one check as a real process,
// so exit codes and stderr count. Same env scrubbing as bench/judge.js (PATH only).
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const vowCli = join(here, '..', '..', '..', 'cli.js');

export const langOf = (file) => (file.endsWith('.py') ? 'py' : file.endsWith('.ts') ? 'ts' : file.endsWith('.vow') ? 'vow' : null);

const CMD = {
  py: (f, a) => ['python3', [f, ...a], 15000],
  ts: (f, a) => ['deno', ['run', '--no-prompt', '-q', f, ...a], 15000],
  vow: (f, a) => ['node', [vowCli, f, ...a], 20000],
};

// -> { stdout, stderr, code, timedOut }
export function runOne(file, chk) {
  const [bin, argv, timeout] = CMD[langOf(file)](file, chk.args ?? []);
  const r = spawnSync(bin, argv, { encoding: 'utf8', timeout, input: chk.stdin ?? '', env: { PATH: process.env.PATH } });
  const timedOut = r.error?.code === 'ETIMEDOUT';
  return { stdout: r.stdout ?? '', stderr: (r.stderr ?? '') + (r.error && !timedOut ? String(r.error) : ''), code: timedOut ? null : r.status, timedOut };
}

// A happy check passes when the program exits 0 and stdout (trailing newlines trimmed) is exactly the expect.
export const happyOk = (res, chk) => res.code === 0 && res.stdout.replace(/\n+$/, '') === chk.expect;

// A bad check is LOUD when the program exits nonzero (a crash counts: it did not print a normal answer)
// or says something is wrong in its output. Anything else, including empty output with exit 0, is SILENT.
// The latency report's own counter line (`errors N`: the word plus one token) is normal output, so
// it is dropped before the word test; any other line that mentions errors still counts.
export const LOUD_WORDS = /error|invalid|bad|malformed|missing|cannot|can't|failed|expected|unexpected/i;
const REPORT_LINE = /^errors \S*$/gm;
export const isLoud = (res) => res.code !== 0 || LOUD_WORDS.test(res.stdout.replace(REPORT_LINE, '') + '\n' + res.stderr);
