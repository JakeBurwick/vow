// Vow lexer — hand-written, no libraries.
// Newlines end statements (like Go: a NEWLINE token is emitted only when the
// previous token could end an expression, and never inside ( ) or [ ]).

import { VowError } from './diagnostics.js';

export const KEYWORDS = new Set([
  'let', 'fn', 'return', 'if', 'else', 'while', 'for', 'in', 'match', 'struct',
  'expects', 'ensures', 'uses', 'and', 'or', 'not', 'true', 'false', 'break', 'continue', 'import',
]);

const PUNCT2 = ['==', '!=', '<=', '>=', '=>'];
const PUNCT1 = '+-*/%<>=(){}[],:?.';

function endsExpr(tok) {
  if (!tok) return false;
  if (tok.type === 'num' || tok.type === 'str' || tok.type === 'ident' || tok.type === 'istrEnd') return true;
  if (tok.type === 'kw') return ['true', 'false', 'return', 'break', 'continue'].includes(tok.value);
  if (tok.type === 'punct') return [')', ']', '}', '?'].includes(tok.value);
  return false;
}

export function lex(src) {
  const tokens = [];
  let i = 0, line = 1, col = 1;
  // Open brackets, innermost last. Newlines are ignored inside ( and [ but count again
  // inside a { block, even one nested in parens: sortBy(xs, x => {\n ... \n}) works.
  const nest = [];
  const interp = []; // active string interpolations: { braces, strLine, strCol, braceLine, braceCol }

  const err = (title, detail, fix, len = 1) => {
    throw new VowError({ kind: 'SyntaxError', title, line, col, length: len, detail, fix });
  };
  // Blames the "${" that opened the innermost interpolation: when something goes wrong
  // mid-interpolation, the usual cause is a "${" meant as text, or a missing "}".
  const interpErr = (consequence) => {
    const top = interp[interp.length - 1];
    line = top.braceLine; col = top.braceCol;
    err('"${" in a string starts interpolation',
      `The "\${" here (line ${top.braceLine}) opens string interpolation, so everything after it up to the matching "}" is read as Vow code, not text. ${consequence}`,
      'close the interpolation with } right after the expression: "total: ${n} items". If "${" is meant as literal text, escape the dollar: \\${', 2);
  };
  const push = (type, value, startLine, startCol, start, extra) =>
    tokens.push({ type, value, line: startLine, col: startCol, start, end: i, ...extra });

  // Scans string characters starting at i (just past a " or the } closing an interpolation).
  // Emits one token: str (whole plain string), istrStart (text before the first ${expr}),
  // istrMid (text between two), or istrEnd (text after the last).
  // Only "${" interpolates: a plain { or } or $ is just a character.
  // Each token also lists `bare`: literal {ident} spans, which the checker reports when
  // ident is a variable in scope (old-style "hi {name}" silently printing the braces).
  const scanString = (resuming, startLine, startCol, start) => {
    let out = '';
    const bare = [];
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '\n') {
        if (interp.length > 0) interpErr('This string is still inside that interpolation when the line ends, so its "}" or a quote is missing.');
        line = startLine; col = startCol;
        err('unterminated string', `This string starts at line ${startLine} but the line ends before a closing quote.`,
          'add a closing " before the end of the line (write \\n for a newline inside a string, or use a backtick raw string for multi-line text).');
      }
      if (src[i] === '\\') {
        const esc = src[i + 1];
        if (esc === 'n') out += '\n';
        else if (esc === 't') out += '\t';
        else if (esc === '"') out += '"';
        else if (esc === '\\') out += '\\';
        else if (esc === '$') out += '$';
        else if (esc === '{') out += '{'; // not needed any more (a plain { is literal) but still accepted
        else if (esc === '}') out += '}';
        else err(`unknown escape \\${esc}`, 'Vow strings support \\n, \\t, \\", \\\\ and \\$ (\\${ gives a literal "${"). Braces need no escape.',
          /[dDwWsSbB.()[\]^*+?|/]/.test(esc ?? '')
            ? `if this is a regex pattern (matches/find/findAll/replaceAll/splitOn), write it as a backtick raw string, where backslashes are kept as-is: \`\\${esc}\`.`
            : `remove the backslash or use a supported escape.`, 2);
        i += 2; col += 2;
        continue;
      }
      if (src[i] === '$' && src[i + 1] === '{') {
        const braceLine = line, braceCol = col;
        i += 2; col += 2; // consume the ${
        interp.push({ braces: 0, strLine: startLine, strCol: startCol, braceLine, braceCol });
        push(resuming ? 'istrMid' : 'istrStart', out, startLine, startCol, start, { bare });
        return; // the main loop lexes the expression until the matching }
      }
      if (src[i] === '{' && src[i - 1] !== '{' && src[i - 1] !== '$') {
        const m = /^\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(src.slice(i, i + 64));
        if (m && src[i + m[0].length] !== '}') bare.push({ name: m[1], start: i, end: i + m[0].length });
      }
      out += src[i]; i++; col++;
    }
    if (i >= src.length) {
      if (interp.length > 0) interpErr('The file ends while still inside that interpolation, so its "}" or a quote is missing.');
      line = startLine; col = startCol;
      err('unterminated string', 'This string never gets a closing quote.', 'add a closing " at the end of the string.');
    }
    i++; col++; // closing quote
    push(resuming ? 'istrEnd' : 'str', out, startLine, startCol, start, { bare });
  };

  while (i < src.length) {
    const c = src[i];

    if (c === '\n') {
      if ((nest.length === 0 || nest[nest.length - 1] === '{') && interp.length === 0 && endsExpr(tokens[tokens.length - 1])) {
        push('newline', '\n', line, col, i);
      }
      i++; line++; col = 1;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') { i++; col++; continue; }

    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { i++; col++; }
      continue;
    }

    const startLine = line, startCol = col, start = i;

    if (/[0-9]/.test(c)) {
      let s = i;
      while (i < src.length && /[0-9]/.test(src[i])) { i++; col++; }
      if (src[i] === '.' && /[0-9]/.test(src[i + 1])) {
        i++; col++;
        while (i < src.length && /[0-9]/.test(src[i])) { i++; col++; }
      }
      push('num', Number(src.slice(s, i)), startLine, startCol, start);
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let s = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) { i++; col++; }
      const word = src.slice(s, i);
      push(KEYWORDS.has(word) ? 'kw' : 'ident', word, startLine, startCol, start);
      continue;
    }

    // raw string: `...` takes every character literally (no escapes, no interpolation, may span lines),
    // so JSON and other brace-heavy text can be written as-is
    if (c === '`') {
      i++; col++;
      let out = '';
      while (i < src.length && src[i] !== '`') { // may span lines: handy for HTML templates
        if (src[i] === '\n') { line++; col = 1; } else col++;
        out += src[i]; i++;
      }
      if (i >= src.length) err('unterminated raw string', `The raw string starting at line ${startLine} never ends: the file has no closing backtick.`, 'add a closing ` to end the raw string.');
      i++; col++;
      push('str', out, startLine, startCol, start);
      continue;
    }

    if (c === '"') {
      i++; col++;
      scanString(false, startLine, startCol, start);
      continue;
    }

    if (c === '}' && interp.length > 0 && interp[interp.length - 1].braces === 0) {
      interp.pop();
      i++; col++; // consume the } that closes the interpolation
      scanString(true, startLine, startCol, start);
      continue;
    }

    const two = src.slice(i, i + 2);
    if (PUNCT2.includes(two)) {
      i += 2; col += 2;
      push('punct', two, startLine, startCol, start);
      continue;
    }
    if (PUNCT1.includes(c)) {
      const inInterpBraces = interp.length > 0;
      if (c === '(' || c === '[' || (c === '{' && !inInterpBraces)) nest.push(c);
      if ((c === ')' || c === ']' || (c === '}' && !inInterpBraces)) && nest.length) nest.pop();
      if (interp.length > 0) {
        if (c === '{') interp[interp.length - 1].braces++;
        if (c === '}') interp[interp.length - 1].braces--;
      }
      i++; col++;
      push('punct', c, startLine, startCol, start);
      continue;
    }

    // Friendly errors for characters from other languages
    if (c === ';') err('Vow does not use semicolons', 'A newline ends a statement in Vow.', 'delete the semicolon.');
    if (c === '&') err("unknown character '&'", 'Vow uses the word "and" for logical AND.', 'replace && with and.');
    if (c === '|') err("unknown character '|'", 'Vow uses the word "or" for logical OR.', 'replace || with or.');
    if (c === '!') err("unknown character '!'", 'Vow uses the word "not" for negation (use != for "not equal").', 'write not x instead of !x.');
    if (c === "'") err('single quotes are not strings', 'Vow strings use double quotes.', `write "..." instead of '...'.`);
    if (interp.length > 0) interpErr(`The '${c}' after it is not valid Vow code, so this "\${" was probably meant as literal text.`);
    if (c === '$') err("unknown character '$'", 'A $ only means something inside a string, where ${expr} inserts a value: "total: ${n}".',
      'move it into a string, or remove it.');
    err(`unknown character '${c}'`, 'This character is not part of Vow syntax.', 'remove it or check for a typo.');
  }

  if (interp.length > 0) {
    const top = interp[interp.length - 1];
    line = top.braceLine; col = top.braceCol;
    err('unterminated string interpolation', `The "\${" here (line ${top.braceLine}) opens an interpolation in the string starting at line ${top.strLine}, but its closing "}" never arrives.`,
      'add the matching } right after the expression (and the closing "), or write \\${ if "${" is meant as literal text.', 2);
  }
  tokens.push({ type: 'eof', value: null, line, col, start: i, end: i });
  return tokens;
}
