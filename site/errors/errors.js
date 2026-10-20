// Errors page: one bug at a time, the same program in three languages, and what each one printed.
// The data in cases.js is captured by gen.mjs; this file only lays it out.
(function () {
  var data = window.VOW_ERRORS;
  var picker = document.getElementById('err-cases');
  if (!data || !picker) return;
  var NAMES = { vow: 'Vow', ts: 'TypeScript', py: 'Python' };
  var RUNS = { vow: 'vow main.vow', ts: 'deno check main.ts && deno run main.ts', py: 'python3 main.py' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function quoteArg(a) { return a === '' ? "''" : "'" + a + "'"; }
  function withArg(cmd, a) { return a == null ? cmd : cmd + ' ' + quoteArg(a); }

  function show(i) {
    var c = data.cases[i];
    picker.querySelectorAll('button').forEach(function (b, j) {
      b.setAttribute('aria-selected', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    var task = document.getElementById('err-task');
    task.textContent = '';
    if (c.arg == null) task.appendChild(document.createTextNode(c.task + ' No input.'));
    else { task.appendChild(document.createTextNode(c.task + ' Input: ')); task.appendChild(el('code', null, quoteArg(c.arg))); task.appendChild(document.createTextNode('.')); }
    task.appendChild(document.createTextNode(c.want === 'error' ? ' The right result is an error.' : ' The right output is '));
    if (c.want !== 'error') { task.appendChild(el('code', null, c.want)); task.appendChild(document.createTextNode('.')); }

    var grid = document.getElementById('err-grid');
    grid.textContent = '';
    ['vow', 'ts', 'py'].forEach(function (lang) {
      var r = c.langs[lang];
      var col = el('div', 'err-col');
      var head = el('div', 'err-head');
      head.appendChild(el('h2', 'h-small', NAMES[lang]));
      head.appendChild(el('span', 'err-outcome ' + (r.good ? 'is-good' : 'is-bad'), r.label));
      col.appendChild(head);
      col.appendChild(el('pre', 'codeblock err-code', r.code));
      var run = el('div', 'err-run');
      run.appendChild(el('p', 'err-label', '$ ' + withArg(RUNS[lang], c.arg)));
      run.appendChild(el('pre', 'codeblock err-out' + (r.exit ? ' err-demo' : ''), r.out || '(no output)'));
      col.appendChild(run);
      grid.appendChild(col);
    });
  }

  data.cases.forEach(function (c, i) {
    var b = el('button', 'tab', c.title);
    b.setAttribute('role', 'tab');
    b.addEventListener('click', function () { show(i); });
    picker.appendChild(b);
  });
  picker.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var tabs = picker.querySelectorAll('button');
    var cur = [].indexOf.call(tabs, document.activeElement);
    var next = (cur + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    show(next);
    tabs[next].focus();
  });
  show(0);

  var v = data.versions;
  var stamp = document.getElementById('err-measured');
  if (stamp) stamp.textContent = data.measured + ' with Vow ' + v.vow + ', ' + v.deno + ' and ' + v.python;
})();
