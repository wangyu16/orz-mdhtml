/* orz-mdhtml in-file runtime.
 *
 * A document that is quietly editable. By default it shows the rendered
 * Markdown in an <iframe> (full theme isolation) with one small edit button.
 * Editing reveals a CodeMirror editor beside a live, incrementally-updated
 * preview. The embedded <script type="text/markdown"> is the single source of
 * truth; Save re-serializes the outer document. Editor libraries are
 * lazy-loaded on first edit so reading stays lightweight.
 *
 * Config arrives on window.__ORZ_MDHTML__ (themes, frame/editor CDN assets,
 * the orz-markdown browser runtime).
 */
(function () {
  'use strict';

  var CFG = window.__ORZ_MDHTML__ || {};
  var root = document.documentElement;
  var frame = document.getElementById('orz-frame');
  var textarea = document.getElementById('orz-textarea');
  var themeSelect = document.getElementById('orz-theme');

  var currentTheme = CFG.defaultTheme;
  var cm = null;
  var libsLoading = null;
  var splitInstance = null;
  var dirty = false;
  var fileHandle = null;

  // ---- source helpers ------------------------------------------------------
  function unescapeSource(s) { return s.replace(/<\\\/(script)/gi, '</$1'); }
  function escapeSource(s) { return s.replace(/<\/(script)/gi, '<\\/$1'); }
  function embeddedSource() {
    var el = document.getElementById('orz-src');
    return el ? unescapeSource(el.textContent || '').replace(/^\n/, '').replace(/\n$/, '') : '';
  }
  function currentSource() {
    if (cm) return cm.getValue();
    if (textarea && textarea.value) return textarea.value;
    return embeddedSource();
  }

  function themeById(id) {
    for (var i = 0; i < CFG.themes.length; i++) if (CFG.themes[i].id === id) return CFG.themes[i];
    return CFG.themes[0];
  }

  // ---- preview iframe ------------------------------------------------------
  // Inline scripts written into the iframe must not contain a literal
  // </script>; escape defensively (the orz runtime is JS, so <\/script is fine).
  function guard(js) { return String(js).replace(/<\/(script)/gi, '<\\/$1'); }

  function frameHtml(theme) {
    var f = CFG.frame;
    var hljsCss = theme.scheme === 'dark' ? f.hljsDarkCss : f.hljsLightCss;
    return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<link id="orz-theme-css" rel="stylesheet" href="' + theme.href + '">'
      + '<link rel="stylesheet" href="' + f.katexCss + '">'
      + '<link id="orz-hljs-css" rel="stylesheet" href="' + hljsCss + '">'
      + '<style>html,body{margin:0}</style></head><body>'
      + '<article class="markdown-body" id="orz-doc"></article>'
      + '<script src="' + f.hljsJs + '"><\/script>'
      + '<script src="' + f.mermaidJs + '"><\/script>'
      + '<script>try{mermaid.initialize({startOnLoad:false})}catch(e){}<\/script>'
      + '<script>' + guard(CFG.runtime) + '<\/script>'
      + '<script>window.__orzEnhance=function(){'
      + 'try{if(window.hljs){document.querySelectorAll("#orz-doc pre code:not(.hljs)").forEach(function(b){window.hljs.highlightElement(b)})}}catch(e){}'
      + 'try{if(window.mermaid){window.mermaid.run({querySelector:"#orz-doc .mermaid:not([data-processed])"})}}catch(e){}'
      + '};<\/script></body></html>';
  }

  function frameDoc() { return frame.contentDocument || (frame.contentWindow && frame.contentWindow.document); }

  function buildFrame(theme) {
    var doc = frameDoc();
    doc.open(); doc.write(frameHtml(theme)); doc.close();
  }

  function applyThemeToFrame(theme) {
    var doc = frameDoc(); if (!doc) return;
    var link = doc.getElementById('orz-theme-css'); if (link) link.href = theme.href;
    var hl = doc.getElementById('orz-hljs-css');
    if (hl) hl.href = theme.scheme === 'dark' ? CFG.frame.hljsDarkCss : CFG.frame.hljsLightCss;
  }

  function renderHtml(src) {
    return (window.orzmd && window.orzmd.render) ? window.orzmd.render(src) : '';
  }

  function enhance() {
    var w = frame.contentWindow;
    if (w && typeof w.__orzEnhance === 'function') { try { w.__orzEnhance(); } catch (e) {} }
  }
  // CDN libs inside the iframe load async — retry enhance a few times.
  function enhanceSoon() { enhance(); setTimeout(enhance, 150); setTimeout(enhance, 600); setTimeout(enhance, 1500); }

  function firstPaint() {
    var doc = frameDoc();
    var container = doc.getElementById('orz-doc');
    if (container) container.innerHTML = renderHtml(currentSource());
    enhanceSoon();
    scheduleAnchors();
  }

  function patch(src) {
    var doc = frameDoc(); if (!doc) return;
    var container = doc.getElementById('orz-doc'); if (!container) return;
    var next = doc.createElement('article');
    next.className = 'markdown-body'; next.id = 'orz-doc';
    next.innerHTML = renderHtml(src);
    if (window.morphdom) {
      window.morphdom(container, next, {
        onBeforeElUpdated: function (fromEl, toEl) {
          if (fromEl.isEqualNode && fromEl.isEqualNode(toEl)) return false;
          // keep already-rendered mermaid when its source is unchanged
          if (fromEl.classList && fromEl.classList.contains('mermaid') &&
              fromEl.getAttribute('data-md') === toEl.getAttribute('data-md')) return false;
          // keep highlighted code when the text is unchanged
          if (fromEl.nodeName === 'CODE' && fromEl.classList && fromEl.classList.contains('hljs') &&
              fromEl.textContent === toEl.textContent) return false;
          return true;
        },
      });
    } else {
      container.innerHTML = next.innerHTML;
    }
    enhance();
    scheduleAnchors();
  }

  var updTimer = null;
  function scheduleUpdate() { if (updTimer) clearTimeout(updTimer); updTimer = setTimeout(function () { patch(currentSource()); }, 120); }

  // ---- editor <-> preview scroll sync -------------------------------------
  // Source-line mapped (not percentage): each preview block carries
  // data-src-line (stamped by the renderer). We map between CodeMirror lines
  // and preview offsets, interpolating between anchors.
  var anchors = [];
  var activePane = null;   // 'editor' | 'preview' — whichever the user drives
  var syncWired = false;

  function scroller() { var d = frameDoc(); return d ? (d.scrollingElement || d.documentElement) : null; }

  function rebuildAnchors() {
    var doc = frameDoc(); if (!doc) { anchors = []; return; }
    var sc = scroller();
    var st = sc ? sc.scrollTop : 0;
    var els = doc.querySelectorAll('#orz-doc [data-src-line]');
    var arr = [];
    for (var i = 0; i < els.length; i++) {
      var line = parseInt(els[i].getAttribute('data-src-line'), 10);
      if (isNaN(line)) continue;
      // document-space offset: rect is viewport-relative, add the scroll position
      arr.push({ line: line, top: els[i].getBoundingClientRect().top + st });
    }
    arr.sort(function (a, b) { return a.top - b.top; });
    anchors = arr;
  }
  function scheduleAnchors() {
    requestAnimationFrame(rebuildAnchors);
    setTimeout(rebuildAnchors, 350); // after async mermaid/image layout
  }

  function lineToTop(line) {
    if (!anchors.length) return 0;
    var prev = anchors[0], next = anchors[anchors.length - 1], found = false;
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].line <= line) prev = anchors[i];
      if (anchors[i].line > line) { next = anchors[i]; found = true; break; }
    }
    if (!found || next.line === prev.line) return prev.top;
    var f = (line - prev.line) / (next.line - prev.line);
    return prev.top + f * (next.top - prev.top);
  }
  function topToLine(top) {
    if (!anchors.length) return 0;
    var prev = anchors[0], next = anchors[anchors.length - 1], found = false;
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].top <= top) prev = anchors[i];
      if (anchors[i].top > top) { next = anchors[i]; found = true; break; }
    }
    if (!found || next.top === prev.top) return prev.line;
    var f = (top - prev.top) / (next.top - prev.top);
    return prev.line + f * (next.line - prev.line);
  }

  function syncPreviewFromEditor() {
    if (!cm || root.getAttribute('data-mode') !== 'split') return;
    var sc = scroller(); if (!sc) return;
    rebuildAnchors(); // fresh offsets (fonts/images may have changed heights)
    // first visible source line: the line at the top edge of the editor viewport
    var wrapTop = cm.getWrapperElement().getBoundingClientRect().top;
    var line = cm.lineAtHeight(wrapTop, 'window');
    sc.scrollTop = lineToTop(line);
  }
  function syncEditorFromPreview() {
    if (!cm || root.getAttribute('data-mode') !== 'split') return;
    var sc = scroller(); if (!sc) return;
    rebuildAnchors();
    cm.scrollTo(null, cm.heightAtLine(Math.round(topToLine(sc.scrollTop)), 'local'));
  }

  function rafThrottle(fn) {
    var queued = false;
    return function () { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; fn(); }); };
  }

  function wireScrollSync() {
    if (syncWired || !cm) return;
    syncWired = true;
    var onEd = rafThrottle(function () { if (activePane === 'editor') syncPreviewFromEditor(); });
    var onPv = rafThrottle(function () { if (activePane === 'preview') syncEditorFromPreview(); });
    cm.on('scroll', onEd);
    cm.getWrapperElement().addEventListener('mouseenter', function () { activePane = 'editor'; });
    cm.on('focus', function () { activePane = 'editor'; });
    var fw = frame.contentWindow;
    if (fw) fw.addEventListener('scroll', onPv, { passive: true });
    frame.addEventListener('mouseenter', function () { activePane = 'preview'; });
  }

  // ---- lazy editor libs ----------------------------------------------------
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if (!href) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }

  function ensureLibs() {
    if (libsLoading) return libsLoading;
    var L = CFG.editorLibs;
    loadCss(L.codemirrorCss); loadCss(L.codemirrorLightThemeCss); loadCss(L.codemirrorDarkThemeCss);
    libsLoading = loadScript(L.morphdomJs)
      .then(function () { return loadScript(L.splitJs); })
      .then(function () { return loadScript(L.codemirrorJs); })
      .then(function () { return loadScript(L.codemirrorMarkdownJs); })
      .then(function () { return loadScript(L.codemirrorContinuelistJs); });
    return libsLoading;
  }

  function cmTheme(scheme) { return scheme === 'dark' ? 'material-darker' : 'eclipse'; }

  function initEditor() {
    if (cm || !window.CodeMirror) return;
    textarea.value = currentSource();
    cm = window.CodeMirror.fromTextArea(textarea, {
      mode: 'markdown', lineNumbers: true, lineWrapping: true,
      tabSize: 2, indentUnit: 2, indentWithTabs: false, smartIndent: false,
      theme: cmTheme(themeById(currentTheme).scheme),
      extraKeys: {
        'Enter': 'newlineAndIndentContinueMarkdownList',
        'Tab': function (c) { c.execCommand('indentMore'); },
        'Shift-Tab': function (c) { c.execCommand('indentLess'); },
        'Cmd-S': function () { save(); },
        'Ctrl-S': function () { save(); },
      },
    });
    cm.on('change', function () { markDirty(); scheduleUpdate(); });
    wireScrollSync();
  }

  // ---- view modes ----------------------------------------------------------
  function setMode(mode) {
    root.setAttribute('data-mode', mode);
    if (mode === 'split') enableSplit(); else disableSplit();
    if (cm) setTimeout(function () { cm.refresh(); }, 30);
    if (mode === 'split') scheduleAnchors();
  }
  function enableSplit() {
    if (splitInstance || !window.Split) return;
    splitInstance = window.Split(['#orz-editor', '#orz-frame'], {
      sizes: [50, 50], minSize: 220, gutterSize: 8,
      onDragStart: function () { frame.style.pointerEvents = 'none'; },
      onDragEnd: function () { frame.style.pointerEvents = ''; if (cm) cm.refresh(); scheduleAnchors(); },
    });
  }
  function disableSplit() {
    if (!splitInstance) return;
    splitInstance.destroy();
    splitInstance = null;
    document.getElementById('orz-editor').style.width = '';
    frame.style.width = '';
    document.getElementById('orz-editor').style.flex = '';
    frame.style.flex = '';
  }

  function enterEdit() {
    ensureLibs().then(function () {
      initEditor();
      setMode('split');
      if (cm) cm.focus();
    }).catch(function () {
      // offline / lib load failed: plain-textarea fallback
      setMode('editor');
      textarea.focus();
      toast('Editor libraries unavailable — basic editing');
    });
  }
  function done() {
    setMode('read');
    if (dirty) toast('Unsaved changes — press ' + (isMac() ? '⌘' : 'Ctrl') + '+S to save');
  }
  function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || ''); }

  // ---- theme ---------------------------------------------------------------
  function setTheme(id) {
    currentTheme = id;
    var t = themeById(id);
    root.setAttribute('data-chrome', t.scheme);
    if (themeSelect) themeSelect.value = id;
    applyThemeToFrame(t);
    if (cm) cm.setOption('theme', cmTheme(t.scheme));
    markDirty();
  }

  // ---- dirty ---------------------------------------------------------------
  function markDirty() { if (!dirty) { dirty = true; root.setAttribute('data-dirty', '1'); } }
  function clearDirty() { dirty = false; root.setAttribute('data-dirty', '0'); }

  // ---- save (self-reproducing) --------------------------------------------
  function serializeDoc(src) {
    var clone = root.cloneNode(true);
    var s = clone.querySelector('#orz-src');
    if (s) s.textContent = '\n' + escapeSource(src) + '\n';
    clone.setAttribute('data-mode', 'read');
    clone.setAttribute('data-chrome', themeById(currentTheme).scheme);
    clone.setAttribute('data-theme', currentTheme); // persist theme choice
    clone.removeAttribute('data-dirty');
    // strip live editor DOM (CodeMirror) — restore a clean textarea
    var ed = clone.querySelector('#orz-editor');
    if (ed) ed.innerHTML = '<textarea id="orz-textarea" spellcheck="false"></textarea>';
    return '<!DOCTYPE html>\n' + clone.outerHTML + '\n';
  }

  // IndexedDB: persist the save handle so a reopened file can be saved with a
  // one-click permission grant instead of the full picker. Best-effort — it
  // no-ops gracefully where unavailable (e.g. file:// opaque origins).
  function idbOpen() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('orz-mdhtml', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet(key) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('handles', 'readonly');
        var g = t.objectStore('handles').get(key);
        g.onsuccess = function () { res(g.result || null); };
        g.onerror = function () { rej(g.error); };
      });
    }).catch(function () { return null; });
  }
  function idbPut(key, val) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('handles', 'readwrite');
        var p = t.objectStore('handles').put(val, key);
        p.onsuccess = function () { res(); };
        p.onerror = function () { rej(p.error); };
      });
    }).catch(function () {});
  }

  function pickAndStore() {
    return window.showSaveFilePicker({
      suggestedName: (CFG.filename || 'document') + '.md.html',
      types: [{ description: 'Markdown HTML', accept: { 'text/html': ['.md.html', '.html'] } }],
    }).then(function (h) { fileHandle = h; if (CFG.docId) idbPut(CFG.docId, h); return h; });
  }

  // Resolve a writable handle: in-memory → persisted (re-grant permission) → picker.
  function acquireHandle() {
    if (fileHandle) return Promise.resolve(fileHandle);
    if (!CFG.docId) return pickAndStore();
    return idbGet(CFG.docId).then(function (saved) {
      if (!saved || !saved.queryPermission) return pickAndStore();
      return saved.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return saved;
        // Chrome shows a prompt naming the file — a deliberate one-click gate.
        return saved.requestPermission({ mode: 'readwrite' }).then(function (p2) {
          return p2 === 'granted' ? saved : null;
        });
      }).then(function (h) {
        if (h) { fileHandle = h; return h; }
        return pickAndStore();
      });
    }).catch(function () { return pickAndStore(); });
  }

  function save() {
    var src = currentSource();
    var html = serializeDoc(src);
    var s = document.getElementById('orz-src');
    if (s) s.textContent = '\n' + escapeSource(src) + '\n';

    if (window.showSaveFilePicker) {
      acquireHandle()
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return Promise.resolve(w.write(html)).then(function () { return w.close(); }); })
        .then(function () { clearDirty(); toast('Saved'); })
        .catch(function (err) { if (err && err.name === 'AbortError') return; download(html); });
    } else {
      download(html);
    }
  }

  function download(text) {
    var blob = new Blob([text], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (CFG.filename || 'document') + '.md.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    clearDirty(); toast('Downloaded');
  }

  // ---- version check -------------------------------------------------------
  function checkVersion() {
    if (!CFG.versionManifest || !CFG.rendererVersion) return;
    try {
      var cached = JSON.parse(localStorage.getItem('orz-mdhtml:vercheck') || 'null');
      if (cached && (Date.now() - cached.t) < 86400000) {
        if (cached.v && cached.v !== CFG.rendererVersion) showUpdate(cached.v);
        return;
      }
    } catch (e) {}
    fetch(CFG.versionManifest).then(function (r) { return r.json(); }).then(function (j) {
      var latest = j && j.version;
      try { localStorage.setItem('orz-mdhtml:vercheck', JSON.stringify({ t: Date.now(), v: latest })); } catch (e) {}
      if (latest && latest !== CFG.rendererVersion) showUpdate(latest);
    }).catch(function () {});
  }
  function showUpdate(latest) {
    var bar = document.getElementById('orz-update'); if (!bar) return;
    bar.querySelector('.upd-text').textContent = 'Renderer ' + latest + ' available (file uses ' + CFG.rendererVersion + ').';
    bar.classList.add('show');
  }

  // ---- toast ---------------------------------------------------------------
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('orz-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  // ---- wiring --------------------------------------------------------------
  function wireUi() {
    document.getElementById('orz-fab').addEventListener('click', enterEdit);
    document.getElementById('orz-done').addEventListener('click', done);
    document.getElementById('orz-save').addEventListener('click', save);
    document.getElementById('orz-upd-dismiss').addEventListener('click', function () {
      document.getElementById('orz-update').classList.remove('show');
    });
    if (themeSelect) themeSelect.addEventListener('change', function () { setTheme(this.value); });
    // plain-textarea fallback live updates (when CodeMirror isn't active)
    textarea.addEventListener('input', function () { if (!cm) { markDirty(); scheduleUpdate(); } });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (e.key === 'Escape' && root.getAttribute('data-mode') !== 'read') { done(); }
    });
    // Warn before losing unsaved edits (close / reload / navigate away).
    window.addEventListener('beforeunload', function (e) {
      if (dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  // ---- boot ----------------------------------------------------------------
  function boot() {
    currentTheme = root.getAttribute('data-theme') || CFG.defaultTheme;
    var t = themeById(currentTheme);
    root.setAttribute('data-chrome', t.scheme);
    if (themeSelect) themeSelect.value = currentTheme;
    textarea.value = embeddedSource();
    buildFrame(t);
    firstPaint();
    wireUi();
    checkVersion();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
