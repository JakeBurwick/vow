// Shared by the MCP server and its run worker: turns a tool call's code (+ optional path)
// into a checked-ready program. With a path, imports load from disk relative to it.
import { parse } from '../lang/parser.js';
import { loadProgram, nodeHost } from '../lang/modules.js';

export const NO_PATH = {
  title: 'imports need a path in vow_check / vow_run',
  detail: 'This code arrived as a single string, so there is no folder to resolve "./..." imports against.',
  fix: 'pass path: the absolute path where this file is saved (its imports are read relative to it), or run it with the CLI: node cli.js main.vow',
};

// the program and its imported modules (from disk, relative to path) as { src, ast }
export async function loadCode(code, path) {
  if (!path) return { src: code, ast: parse(code, { noImports: NO_PATH }) };
  return loadProgram(code, path, await nodeHost());
}
