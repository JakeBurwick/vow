// Runs a program's test blocks and formats the report. Both backends hand over the same
// shape (createRun / createCompiledRun → tests: [{ name, node, run }], where run() resolves
// when the test passes and rejects with the VowError when it fails), so the CLI (`vow test`),
// the MCP server (vow_test) and compile-test all print the same lines.

import { VowError, formatDiag } from './diagnostics.js';

const STACK = '✗ RuntimeError: ran out of stack space\n  The test recursed deeper than the machine allows.\n  Likely fix: turn the deepest recursion into a loop.';

// filter: keep the tests whose name contains it. onResult: called as each test finishes.
export async function runTests(tests, { src, filter, onResult } = {}) {
  const chosen = filter ? tests.filter(t => t.name.includes(filter)) : tests;
  const results = [];
  for (const t of chosen) {
    let r;
    try { await t.run(); r = { name: t.name, ok: true }; }
    catch (e) {
      if (e instanceof VowError) r = { name: t.name, ok: false, message: formatDiag(src, e.diag) };
      else if (e instanceof RangeError && /call stack/i.test(e.message)) r = { name: t.name, ok: false, message: STACK };
      else throw e;
    }
    results.push(r);
    if (onResult) onResult(r);
  }
  return results;
}

// one line per test; a failure's diagnostic follows it, indented
export const formatResult = (r) => r.ok ? `✓ ${r.name}` : `✗ ${r.name}\n${r.message.split('\n').map(l => '    ' + l).join('\n')}`;

// the last line of a report, and the exit code (0 only when tests ran and all passed)
export function summary(results, { total, filter, file } = {}) {
  const where = file ? ` in ${file}` : '';
  if (total === 0) return { line: `no tests${where}: write test "name" { ... } blocks at the top level of the file`, code: 1 };
  if (results.length === 0) return { line: `no test name contains "${filter}" (${total} test${total === 1 ? '' : 's'}${where})`, code: 1 };
  const passed = results.filter(r => r.ok).length, failed = results.length - passed;
  const n = results.length;
  return { line: `${n} test${n === 1 ? '' : 's'}, ${passed} passed${failed ? `, ${failed} failed` : ''}`, code: failed ? 1 : 0 };
}

// the whole report as one text (MCP, compile-test)
export function formatReport(results, opts) {
  const s = summary(results, opts);
  return { text: [...results.map(formatResult), s.line].join('\n'), code: s.code };
}
