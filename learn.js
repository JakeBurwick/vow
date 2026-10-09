// The Learn tab. A plain script (not a module) so the tutorial still reads even if the
// playground bundle fails to load. Lessons come from site/learn/lessons.js, which is
// generated from site/learn/lessons.json (the single source of truth).
(function () {
  var lessons = window.VOW_LESSONS;
  var listEl = document.getElementById('lesson-list');
  var selectEl = document.getElementById('lesson-select');
  var lessonEl = document.getElementById('lesson');
  var flagsEl = document.getElementById('install-flags');

  if (!Array.isArray(lessons) || lessons.length === 0) {
    lessonEl.innerHTML = '<p class="out-error">The lessons did not load. Reload the page to try again.</p>';
    return;
  }

  var current = 1;
  try {
    var saved = Number(localStorage.getItem('vow-lesson'));
    if (saved >= 1 && saved <= lessons.length) current = saved;
  } catch (e) { /* storage blocked: start at lesson 1 */ }

  function el(tag, cls, text) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

  function codeBlock(code, id, isShell) {
    var wrap = el('div', 'copyable');
    var pre = el('pre', 'codeblock ' + (isShell ? 'shell' : 'vow'));
    pre.id = id;
    var text = code.replace(/\n$/, '');
    if (!isShell && window.vowHighlight) pre.innerHTML = window.vowHighlight(text);
    else pre.textContent = text;
    var copy = el('button', 'copy', 'Copy');
    copy.dataset.copyFrom = id;
    copy.setAttribute('aria-label', 'Copy code');
    wrap.append(pre, copy);
    return wrap;
  }

  function commandList(commands, idPrefix) {
    var dl = el('div', 'cmds');
    commands.forEach(function (c, i) {
      var row = el('div', 'cmd-row');
      row.appendChild(codeBlock(c[0], idPrefix + i, true));
      row.appendChild(el('p', 'cmd-desc', c[1]));
      dl.appendChild(row);
    });
    return dl;
  }

  function renderNav() {
    listEl.innerHTML = '';
    selectEl.innerHTML = '';
    lessons.forEach(function (l) {
      var li = el('li');
      var b = el('button', 'lesson-link');
      b.type = 'button';
      b.innerHTML = '<span class="lesson-n"></span><span class="lesson-t"></span>';
      b.firstChild.textContent = String(l.n).padStart(2, '0');
      b.lastChild.textContent = l.title;
      if (l.n === current) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', function () { select(l.n, { focus: true }); });
      li.appendChild(b);
      listEl.appendChild(li);

      var o = el('option', null, l.n + '. ' + l.title);
      o.value = l.n;
      if (l.n === current) o.selected = true;
      selectEl.appendChild(o);
    });
  }
  selectEl.addEventListener('change', function () { select(Number(selectEl.value), { focus: true }); });

  function runInPlayground(l, statusEl) {
    if (!window.vowPlayground) {
      statusEl.textContent = 'The playground did not load. Reload the page, or copy the code and run it with node cli.js.';
      return;
    }
    window.vowPlayground.load(l.code, { run: true, label: 'Lesson ' + l.n + ': ' + l.title });
    showView('play');
  }

  function renderLesson() {
    var l = lessons[current - 1];
    lessonEl.innerHTML = '';

    var kicker = el('p', 'kicker', 'Lesson ' + l.n + ' of ' + lessons.length);
    var h = el('h1', 'lesson-title', l.title);
    h.tabIndex = -1;
    h.id = 'lesson-title';
    lessonEl.append(kicker, h, el('p', 'prose lesson-intro', l.intro));

    if (!l.cliOnly && l.code) {
      lessonEl.appendChild(codeBlock(l.code, 'lesson-code'));
      var row = el('div', 'lesson-actions');
      var run = el('button', 'primary', 'Run in playground');
      var status = el('p', 'muted lesson-status');
      status.setAttribute('role', 'status');
      run.addEventListener('click', function () { runInPlayground(l, status); });
      row.append(run, el('span', 'muted', 'Opens the code in the playground and runs it. Edit it there and run again.'));
      lessonEl.append(row, status);
    } else if (l.files) {
      lessonEl.appendChild(el('p', 'cli-note', 'This lesson runs in the command-line tool, not in the browser playground, because the playground runs one file at a time.'));
      Object.keys(l.files).forEach(function (name, i) {
        lessonEl.appendChild(el('p', 'file-name mono', name));
        lessonEl.appendChild(codeBlock(l.files[name], 'lesson-file-' + i));
      });
      lessonEl.appendChild(el('p', 'file-name', 'Run it from the repository folder'));
      lessonEl.appendChild(codeBlock('node cli.js site/learn/' + l.file, 'lesson-run', true));
    } else if (l.commands) {
      var note = el('p', 'cli-note');
      note.innerHTML = 'These commands run in the command-line tool. <a href="#install" data-go="install">Install</a> takes one clone and Node.js.';
      lessonEl.appendChild(note);
      lessonEl.appendChild(commandList(l.commands, 'lesson-cmd-'));
    }

    var pager = el('nav', 'pager');
    pager.setAttribute('aria-label', 'Lesson navigation');
    if (current > 1) {
      var prev = el('button', 'pager-prev');
      prev.innerHTML = '<span class="muted">Previous</span><span></span>';
      prev.lastChild.textContent = lessons[current - 2].title;
      prev.addEventListener('click', function () { select(current - 1, { focus: true }); });
      pager.appendChild(prev);
    } else pager.appendChild(el('span'));
    if (current < lessons.length) {
      var next = el('button', 'pager-next');
      next.innerHTML = '<span class="muted">Next</span><span></span>';
      next.lastChild.textContent = lessons[current].title;
      next.addEventListener('click', function () { select(current + 1, { focus: true }); });
      pager.appendChild(next);
    }
    lessonEl.appendChild(pager);
  }

  function select(n, opts) {
    opts = opts || {};
    if (!(n >= 1 && n <= lessons.length)) return;
    current = n;
    try { localStorage.setItem('vow-lesson', String(n)); } catch (e) { /* not essential */ }
    renderNav();
    renderLesson();
    if (!opts.fromHash && !document.getElementById('view-learn').hidden) {
      history.replaceState(null, '', '#learn-' + n);
    }
    if (opts.focus) {
      document.getElementById('view-learn').scrollTop = 0;
      document.getElementById('lesson-title').focus({ preventScroll: true });
    }
  }

  function show() {
    if (location.hash !== '#learn-' + current) history.replaceState(null, '', '#learn-' + current);
  }

  // Install flags on Home come from lesson 11, so the list is written once.
  var cliLesson = lessons.filter(function (l) { return l.commands; })[0];
  if (flagsEl && cliLesson) flagsEl.appendChild(commandList(cliLesson.commands, 'flag-'));

  renderNav();
  renderLesson();
  window.vowLearn = { select: select, show: show, rerender: renderLesson, lessons: lessons };
})();
