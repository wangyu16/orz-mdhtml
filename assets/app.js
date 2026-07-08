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
      // bottom padding so the last content clears the floating reader tools
      + '<style>html,body{margin:0}body{padding-bottom:84px}</style></head><body>'
      + '<article class="markdown-body" id="orz-doc"></article>'
      + '<script src="' + f.hljsJs + '"><\/script>'
      + '<script src="' + f.mermaidJs + '"><\/script>'
      + '<script src="' + f.smilesJs + '"><\/script>'
      + '<script src="' + f.chartJs + '"><\/script>'
      + '<script>try{mermaid.initialize({startOnLoad:false})}catch(e){}<\/script>'
      + '<script>' + guard(CFG.runtime) + '<\/script>'
      + '<script>window.__orzEnhance=function(){'
      + 'try{if(window.hljs){document.querySelectorAll("#orz-doc pre code:not(.hljs)").forEach(function(b){window.hljs.highlightElement(b)})}}catch(e){}'
      + 'try{if(window.mermaid){window.mermaid.run({querySelector:"#orz-doc .mermaid:not([data-processed])"})}}catch(e){}'
      // SMILES: draw each canvas once (tracked via a JS prop so morphdom keeps
      // the drawn canvas across edits — DOM attributes stay identical).
      + 'try{if(window.SmilesDrawer){document.querySelectorAll("#orz-doc canvas[data-smiles]").forEach(function(c){if(c.__orzSmilesDone)return;var s=c.getAttribute("data-smiles");if(!s)return;if(c.__orzOrigW===undefined){c.__orzOrigW=c.width;c.__orzOrigH=c.height;}c.width=c.__orzOrigW;c.height=c.__orzOrigH;c.__orzSmilesDone=true;var dr=new window.SmilesDrawer.Drawer({width:c.__orzOrigW,height:c.__orzOrigH});window.SmilesDrawer.parse(s,function(t){try{dr.draw(t,c,window.__orzSmilesTheme||"light",false)}catch(e){}},function(){})})}}catch(e){}'
      + 'try{if(window.Chart){document.querySelectorAll("#orz-doc canvas.orz-chart[data-chart]").forEach(function(c){if(c.__orzChartDone)return;c.__orzChartDone=true;var w=c.ownerDocument.createElement("div");w.style.cssText="position:relative;width:100%;max-width:520px;margin:.6em auto";c.parentNode.insertBefore(w,c);w.appendChild(c);c.removeAttribute("width");c.removeAttribute("height");try{var cfg=JSON.parse(c.getAttribute("data-chart")||"{}");cfg.options=Object.assign({responsive:true,maintainAspectRatio:true,animation:false},cfg.options||{});new window.Chart(c,cfg)}catch(e){}})}}catch(e){}'
      // Tabs init runs in the runtime on load (empty #orz-doc); re-run now that
      // content is injected, and after each incremental update. Idempotent.
      + 'try{if(window.OrzMarkdownRuntime&&window.OrzMarkdownRuntime.initTabs){window.OrzMarkdownRuntime.initTabs(document)}}catch(e){}'
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
    if (!w) return;
    try { w.__orzSmilesTheme = themeById(currentTheme).scheme === 'dark' ? 'dark' : 'light'; } catch (e) {}
    if (typeof w.__orzEnhance === 'function') { try { w.__orzEnhance(); } catch (e) {} }
  }

  // Re-draw SMILES canvases in the current light/dark theme (after a theme
  // switch). Just clear the done flag; the draw hook resets each canvas to its
  // original dimensions before redrawing, so sizes never drift.
  function redrawSmiles() {
    var doc = frameDoc(); if (!doc) return;
    Array.prototype.forEach.call(doc.querySelectorAll('#orz-doc canvas[data-smiles]'), function (c) {
      c.__orzSmilesDone = false;
    });
    enhance();
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
          // Keep an already-rendered generated construct (mermaid / smiles / qr /
          // youtube) when its source is unchanged. These are client-rendered into
          // canvases / SVGs / iframes, so letting morphdom touch them would wipe
          // the drawing (e.g. a SMILES canvas disappearing when nearby text is
          // edited). data-md carries the source; skip the whole subtree on match.
          var dm = fromEl.getAttribute && fromEl.getAttribute('data-md');
          if (dm != null && toEl.getAttribute && dm === toEl.getAttribute('data-md')) return false;
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
  var syncEnabled = true;  // user-toggleable; persisted in localStorage

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
    if (!syncEnabled || !cm || !isEdit()) return;
    var sc = scroller(); if (!sc) return;
    rebuildAnchors(); // fresh offsets (fonts/images may have changed heights)
    // first visible source line: the line at the top edge of the editor viewport
    var wrapTop = cm.getWrapperElement().getBoundingClientRect().top;
    var line = cm.lineAtHeight(wrapTop, 'window');
    sc.scrollTop = lineToTop(line);
  }
  function syncEditorFromPreview() {
    if (!syncEnabled || !cm || !isEdit()) return;
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
    cm.on('change', function () { markDirty(); scheduleUpdate(); aiHideAll(); });
    cm.on('cursorActivity', function () { aiRefresh(); });
    wireScrollSync();
  }

  // ---- edit mode (slide-in popout) -----------------------------------------
  function isEdit() { return root.getAttribute('data-mode') === 'edit'; }

  // Draggable divider — sets the editor/preview split (relative width). The
  // iframe swallows pointer events, so disable them on the frame while dragging
  // (otherwise the parent stops receiving mousemove/mouseup and the drag sticks).
  var dividerWired = false;
  function wireDivider() {
    if (dividerWired) return; dividerWired = true;
    var d = document.getElementById('orz-divider'); if (!d) return;
    var dragging = false;
    d.addEventListener('mousedown', function (e) {
      dragging = true; d.classList.add('dragging'); e.preventDefault();
      document.body.style.userSelect = 'none'; frame.style.pointerEvents = 'none';
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var pct = Math.max(20, Math.min(78, (e.clientX / window.innerWidth) * 100));
      root.style.setProperty('--orz-split', pct + '%');
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false; d.classList.remove('dragging');
      document.body.style.userSelect = ''; frame.style.pointerEvents = '';
      if (cm) cm.refresh(); scheduleAnchors();
    });
  }

  function enterEdit() {
    root.setAttribute('data-mode', 'edit');
    checkVersion(); // edit view only — broad viewers never see the update banner
    wireDivider();
    ensureLibs().then(function () {
      initEditor();
      if (cm) setTimeout(function () { cm.refresh(); cm.focus(); }, 30);
      scheduleAnchors();
    }).catch(function () {
      // offline / lib load failed: the bare textarea is still editable
      textarea.focus();
      toast('Editor libraries unavailable — basic editing');
    });
  }
  function exitEdit() {
    root.removeAttribute('data-mode');
    aiHideAll();
    if (dirty) toast('Unsaved changes — press ' + (isMac() ? '⌘' : 'Ctrl') + '+S to save');
  }
  function isMac() { return /Mac|iPhone|iPad/.test(navigator.platform || ''); }

  function setSyncEnabled(on) {
    syncEnabled = !!on;
    var btn = document.getElementById('orz-sync');
    if (btn) {
      btn.setAttribute('aria-pressed', syncEnabled ? 'true' : 'false');
      btn.title = syncEnabled ? 'Scroll sync on' : 'Scroll sync off';
    }
    try { localStorage.setItem('orz-mdhtml:scrollsync', syncEnabled ? '1' : '0'); } catch (e) {}
    if (syncEnabled && activePane === 'editor') syncPreviewFromEditor();
  }

  // ---- theme ---------------------------------------------------------------
  function setTheme(id) {
    currentTheme = id;
    var t = themeById(id);
    root.setAttribute('data-chrome', t.scheme);
    if (themeSelect) themeSelect.value = id;
    applyThemeToFrame(t);
    redrawSmiles(); // pick up the new light/dark SMILES palette
    if (cm) cm.setOption('theme', cmTheme(t.scheme));
    markDirty();
  }

  // ---- dirty ---------------------------------------------------------------
  function markDirty() { if (!dirty) { dirty = true; root.setAttribute('data-dirty', '1'); hostPostDirty(true); } }
  function clearDirty() { if (dirty) hostPostDirty(false); dirty = false; root.setAttribute('data-dirty', '0'); }

  // ---- host embedding (orz-host-save@1) -------------------------------------
  // When a platform embeds this file in an iframe and announces the
  // orz-host-save protocol (see PROTOCOL.md), Save posts the document to the
  // host instead of touching the file system. Never enabled without the host's
  // hello; protocol messages are accepted only from window.parent, and after
  // the handshake only from the recorded host origin. Message content is read
  // as data, never evaluated. Export/download keeps working unchanged.
  var HOST_PROTOCOL = 'orz-host-save';
  var HOST_VERSION = 1;
  var hostOrigin = null;    // recorded at handshake; null = unhosted
  var hostSaveTimer = null; // watchdog for a save awaiting acknowledgement

  function isHosted() { return hostOrigin !== null; }
  // An opaque embedder (sandboxed/srcdoc host) serializes as the string 'null',
  // which postMessage rejects as a targetOrigin — fall back to '*' (the payload
  // contains nothing the host doesn't already have).
  function hostTarget() { return hostOrigin && hostOrigin !== 'null' ? hostOrigin : '*'; }
  function hostPost(msg) { try { window.parent.postMessage(msg, hostTarget()); } catch (e) {} }
  function hostPostDirty(d) {
    if (!isHosted()) return;
    hostPost({ type: 'orz-host-dirty', protocol: HOST_PROTOCOL, version: HOST_VERSION, dirty: !!d });
  }
  function hostSave(src, html) {
    if (hostSaveTimer) return; // one save in flight at a time
    hostSaveTimer = setTimeout(function () {
      hostSaveTimer = null;
      toast('Save failed — no response from the host'); // document intact, still dirty
    }, 10000);
    hostPost({ type: 'orz-host-save', protocol: HOST_PROTOCOL, version: HOST_VERSION, source: src, html: html });
  }
  // ---- host AI assistant (orz-host-ai@1) ------------------------------------
  // When the host advertises AI operations, selecting text in the editor shows
  // an "Improve selection" affordance; picking an op sends the passage to the
  // host, which returns a suggested replacement to apply. File owns the UI; the
  // host owns the model + governance. Additive — no host, no affordance.
  var AI_PROTOCOL = 'orz-host-ai';
  var AI_VERSION = 1;
  var aiOps = null;      // advertised operations, or null when no AI host
  var aiOrigin = null;   // recorded at the AI handshake
  var aiSeq = 0;
  var aiPending = {};    // requestId -> resolve
  var aiTrigger = null;  // the floating "Improve selection" chip
  var aiPanel = null;    // the menu / result popover

  function aiTarget() { return aiOrigin && aiOrigin !== 'null' ? aiOrigin : '*'; }
  function aiPost(msg) { try { window.parent.postMessage(msg, aiTarget()); } catch (e) {} }
  function aiRequest(op, text) {
    return new Promise(function (resolve) {
      var id = 'ai' + (++aiSeq);
      aiPending[id] = resolve;
      aiPost({ type: 'orz-host-ai-request', protocol: AI_PROTOCOL, version: AI_VERSION, requestId: id, op: op, text: text, selection: true });
      setTimeout(function () { if (aiPending[id]) { delete aiPending[id]; resolve({ ok: false, error: 'No response from the host.' }); } }, 30000);
    });
  }

  function aiBox() {
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;z-index:60;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.28);font:13px system-ui,sans-serif;padding:4px;';
    return b;
  }
  function aiPlace(el) {
    if (!cm) return;
    var to = cm.cursorCoords(cm.getCursor('to'), 'window');
    el.style.left = Math.max(6, Math.min(to.left, window.innerWidth - 280)) + 'px';
    el.style.top = Math.min(to.bottom + 6, window.innerHeight - 60) + 'px';
  }
  function aiHidePanel() { if (aiPanel) { try { aiPanel.remove(); } catch (e) {} aiPanel = null; } }
  function aiHideTrigger() { if (aiTrigger) { try { aiTrigger.remove(); } catch (e) {} aiTrigger = null; } }
  function aiHideAll() { aiHidePanel(); aiHideTrigger(); }

  function aiShowMenu(sel) {
    aiHideAll();
    aiPanel = aiBox();
    aiOps.forEach(function (op) {
      var btn = document.createElement('button');
      btn.textContent = op.title;
      btn.style.cssText = 'display:block;width:220px;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:6px 10px;border-radius:6px;cursor:pointer;';
      btn.onmouseenter = function () { btn.style.background = 'rgba(127,127,127,.16)'; };
      btn.onmouseleave = function () { btn.style.background = 'none'; };
      btn.onclick = function () { aiRun(op, sel); };
      aiPanel.appendChild(btn);
    });
    aiPlace(aiPanel);
    document.body.appendChild(aiPanel);
  }

  function aiRun(op, sel) {
    aiHideAll();
    aiPanel = aiBox();
    aiPanel.style.padding = '10px';
    aiPanel.style.width = '340px';
    aiPanel.textContent = 'Thinking…';
    aiPlace(aiPanel);
    document.body.appendChild(aiPanel);
    aiRequest(op.id, sel).then(function (r) {
      if (!aiPanel) return;
      aiPanel.textContent = '';
      if (!r.ok) { aiPanel.textContent = r.error || 'That didn’t work.'; return; }
      var label = document.createElement('div');
      label.textContent = 'Suggested replacement — edit before applying';
      label.style.cssText = 'font-size:11px;opacity:.7;margin-bottom:4px;';
      var ta = document.createElement('textarea');
      ta.value = r.proposed || '';
      ta.style.cssText = 'width:100%;height:130px;box-sizing:border-box;font:12px ui-monospace,monospace;resize:vertical;';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;margin-top:6px;';
      var cancel = document.createElement('button');
      cancel.textContent = 'Cancel'; cancel.style.cssText = 'padding:4px 10px;cursor:pointer;';
      cancel.onclick = aiHidePanel;
      var apply = document.createElement('button');
      apply.textContent = 'Replace'; apply.style.cssText = 'padding:4px 10px;cursor:pointer;font-weight:600;';
      apply.onclick = function () { cm.replaceSelection(ta.value); aiHidePanel(); markDirty(); scheduleUpdate(); };
      row.appendChild(cancel); row.appendChild(apply);
      aiPanel.appendChild(label); aiPanel.appendChild(ta); aiPanel.appendChild(row);
      ta.focus();
    });
  }

  // Called on selection change: show the chip when there's a usable selection.
  function aiRefresh() {
    if (!aiOps || !aiOps.length || !cm || !isEdit()) { aiHideAll(); return; }
    if (aiPanel) return; // don't fight an open menu/result
    var sel = cm.getSelection();
    if (!sel || sel.trim().length < 2) { aiHideTrigger(); return; }
    if (!aiTrigger) {
      aiTrigger = document.createElement('button');
      aiTrigger.textContent = '✦ Improve selection';
      aiTrigger.style.cssText = 'position:fixed;z-index:55;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:999px;font:12px system-ui,sans-serif;padding:4px 10px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.22);';
      aiTrigger.onmousedown = function (e) { e.preventDefault(); }; // keep the cm selection
      aiTrigger.onclick = function (e) { e.stopPropagation(); aiShowMenu(cm.getSelection()); };
      document.body.appendChild(aiTrigger);
    }
    aiPlace(aiTrigger);
  }
  document.addEventListener('mousedown', function (e) {
    if (aiPanel && !aiPanel.contains(e.target)) aiHidePanel();
  });

  function onHostMessage(event) {
    // only the embedding parent may speak the protocol
    if (window.parent === window || event.source !== window.parent) return;
    var d = event.data;
    if (!d || typeof d !== 'object') return;
    // after the handshake, hold the parent to the origin it introduced itself with
    if (isHosted() && hostOrigin !== 'null' && event.origin !== hostOrigin) return;
    if (d.type === 'orz-host-hello' && d.protocol === HOST_PROTOCOL && typeof d.version === 'number' && d.version >= 1) {
      hostOrigin = event.origin;
      // reply with the highest version we support ≤ the host's (we speak only 1)
      hostPost({ type: 'orz-host-ready', protocol: HOST_PROTOCOL, version: HOST_VERSION, kind: 'md' });
      if (dirty) hostPostDirty(true); // catch the host up on edits made pre-handshake
    } else if (d.type === 'orz-host-saved' && hostSaveTimer) {
      clearTimeout(hostSaveTimer); hostSaveTimer = null;
      if (d.ok) { clearDirty(); toast('Saved'); }
      else { toast('Save failed' + (d.error ? ' — ' + String(d.error) : '')); }
    } else if (d.type === 'orz-host-ai-hello' && d.protocol === AI_PROTOCOL && Array.isArray(d.operations)) {
      aiOrigin = event.origin;
      aiOps = d.operations.filter(function (o) { return o && o.id && o.title; });
      aiPost({ type: 'orz-host-ai-ready', protocol: AI_PROTOCOL, version: AI_VERSION });
    } else if (d.type === 'orz-host-ai-result' && d.requestId && aiPending[d.requestId]) {
      var aiRes = aiPending[d.requestId]; delete aiPending[d.requestId];
      aiRes({ ok: !!d.ok, proposed: d.proposed, error: d.error });
    }
  }
  // listen from script load so an early hello isn't missed
  window.addEventListener('message', onHostMessage);

  // ---- save (self-reproducing) --------------------------------------------
  function serializeDoc(src) {
    var clone = root.cloneNode(true);
    var s = clone.querySelector('#orz-src');
    if (s) s.textContent = '\n' + escapeSource(src) + '\n';
    clone.removeAttribute('data-mode');
    clone.setAttribute('data-chrome', themeById(currentTheme).scheme);
    clone.setAttribute('data-theme', currentTheme); // persist theme choice
    clone.removeAttribute('data-dirty');
    // never bake in the (edit-only) update banner so a viewer can't see it
    var ub = clone.querySelector('#orz-update'); if (ub) { ub.classList.remove('show'); ub.removeAttribute('data-latest'); }
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

  function isServed() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function save() {
    var src = currentSource();
    var html = serializeDoc(src);
    var s = document.getElementById('orz-src');
    if (s) s.textContent = '\n' + escapeSource(src) + '\n';

    // A hosting platform (verified handshake) receives the save instead of the
    // file system; the host acknowledges with orz-host-saved (see PROTOCOL.md).
    if (isHosted()) { hostSave(src, html); return; }

    // On a published (served) page with no prior file handle, the reader has no
    // write access to the server. Only nag — once they've actually edited — that
    // they should download a local copy. (Never shown on open or on a no-op save.)
    if (isServed() && !fileHandle) { if (dirty) showServedNote(); return; }

    if (window.showSaveFilePicker) {
      acquireHandle()
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return Promise.resolve(w.write(html)).then(function () { return w.close(); }); })
        .then(function () { clearDirty(); toast('Saved'); })
        .catch(function (err) { if (err && err.name === 'AbortError') return; downloadFile(html); clearDirty(); toast('Saved a local copy'); });
    } else {
      downloadFile(html); clearDirty(); toast('Saved a local copy');
    }
  }

  function downloadFile(text) {
    var blob = new Blob([text], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = (CFG.filename || 'document') + '.md.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportCopy() { downloadFile(serializeDoc(currentSource())); toast('Downloaded a local copy'); }

  function showServedNote() {
    var n = document.getElementById('orz-served-note');
    if (n) n.classList.add('show');
  }

  // ---- version check -------------------------------------------------------
  // True only when `a` is a strictly newer semver than `b` (so an older
  // resolved version never shows a bogus "update available").
  function isNewer(a, b) {
    var pa = String(a).split('.'), pb = String(b).split('.');
    for (var i = 0; i < 3; i++) {
      var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }
  // SECURITY: the update source is HARDCODED here, never read from the file's
  // config — a tampered/forged file cannot redirect "Update" to attacker code.
  // Host is fixed to jsDelivr/HTTPS; the exact URLs are confirmed with the user.
  // (Protects genuine files; a wholly-malicious file controls this code too — see
  // the README security note. Clicking Update trusts npm + jsDelivr.)
  var UPD = {
    host: 'https://cdn.jsdelivr.net/npm/',
    manifest: 'https://data.jsdelivr.com/v1/packages/npm/orz-mdhtml-browser/resolved',
    enginePkg: 'orz-mdhtml-browser', engineFile: 'orzmd.browser.js', appPkg: 'orz-mdhtml'
  };
  function checkVersion() {
    if (!CFG.rendererVersion) return;
    try {
      var cached = JSON.parse(localStorage.getItem('orz-mdhtml:vercheck') || 'null');
      if (cached && (Date.now() - cached.t) < 86400000) {
        if (cached.v && isNewer(cached.v, CFG.rendererVersion)) showUpdate(cached.v);
        return;
      }
    } catch (e) {}
    fetch(UPD.manifest).then(function (r) { return r.json(); }).then(function (j) {
      var latest = j && j.version;
      try { localStorage.setItem('orz-mdhtml:vercheck', JSON.stringify({ t: Date.now(), v: latest })); } catch (e) {}
      if (latest && isNewer(latest, CFG.rendererVersion)) showUpdate(latest);
    }).catch(function () {});
  }
  function showUpdate(latest) {
    var bar = document.getElementById('orz-update'); if (!bar) return;
    bar.querySelector('.upd-text').textContent = 'Framework ' + latest + ' available (file uses ' + CFG.rendererVersion + ').';
    bar.setAttribute('data-latest', latest);
    bar.classList.add('show');
  }
  /** One-click update: re-fetch the engine bundle + app.js at the latest version,
   *  re-inline them, bump the version, save in place, and reload. */
  function applyUpdate() {
    var bar = document.getElementById('orz-update'); var latest = bar && bar.getAttribute('data-latest'); if (!latest) return;
    var engineUrl = UPD.host + UPD.enginePkg + '@' + latest + '/' + UPD.engineFile;
    var appUrl = UPD.host + UPD.appPkg + '@' + latest + '/assets/app.js';
    if (!window.confirm('Update the framework to ' + latest + '?\n\nThis downloads and runs code from:\n  ' + engineUrl + '\n  ' + appUrl + '\n\nOnly proceed if you trust this document and its publisher.')) return;
    toast('Downloading framework ' + latest + '…');
    Promise.all([
      fetch(engineUrl).then(function (r) { if (!r.ok) throw new Error('engine'); return r.text(); }),
      fetch(appUrl).then(function (r) { if (!r.ok) throw new Error('app'); return r.text(); }),
    ]).then(function (res) {
      var es = document.querySelector('script[data-orz-asset="engine"]');
      if (es) { if (es.getAttribute('src')) es.setAttribute('src', engineUrl); else es.textContent = res[0]; }
      var as = document.querySelector('script[data-orz-asset="app"]');
      if (as) as.textContent = res[1];
      var cs = document.querySelector('script[data-orz-asset="config"]');
      if (cs) { CFG.version = latest; CFG.rendererVersion = latest; cs.textContent = 'window.__ORZ_MDHTML__ = ' + JSON.stringify(CFG) + ';'; }
      bar.classList.remove('show');
      var html = serializeDoc(currentSource());
      if (isServed() && !fileHandle) { showServedNote(); return; }
      if (window.showSaveFilePicker) {
        return acquireHandle()
          .then(function (h) { return h.createWritable(); })
          .then(function (w) { return Promise.resolve(w.write(html)).then(function () { return w.close(); }); })
          .then(function () { toast('Updated to ' + latest + ' — reloading…'); setTimeout(function () { location.reload(); }, 700); });
      }
      downloadFile(html); toast('Updated copy downloaded — reopen it to use the new framework.');
    }).catch(function () { toast('Update failed — check your connection.'); });
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
    document.getElementById('orz-edit-fab').addEventListener('click', enterEdit);
    document.getElementById('orz-close').addEventListener('click', exitEdit);
    document.getElementById('orz-save').addEventListener('click', save);
    document.getElementById('orz-download').addEventListener('click', exportCopy);
    document.getElementById('orz-served-download').addEventListener('click', function () {
      exportCopy();
      document.getElementById('orz-served-note').classList.remove('show');
    });
    document.getElementById('orz-served-dismiss').addEventListener('click', function () {
      document.getElementById('orz-served-note').classList.remove('show');
    });
    document.getElementById('orz-upd-dismiss').addEventListener('click', function () {
      document.getElementById('orz-update').classList.remove('show');
    });
    var ua = document.getElementById('orz-upd-apply');
    if (ua) ua.addEventListener('click', applyUpdate);
    if (themeSelect) themeSelect.addEventListener('change', function () { setTheme(this.value); });
    var syncBtn = document.getElementById('orz-sync');
    if (syncBtn) syncBtn.addEventListener('click', function () { setSyncEnabled(!syncEnabled); });
    // plain-textarea fallback live updates (when CodeMirror isn't active)
    textarea.addEventListener('input', function () { if (!cm) { markDirty(); scheduleUpdate(); } });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (e.key === 'Escape' && isEdit()) { exitEdit(); }
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
    try { if (localStorage.getItem('orz-mdhtml:scrollsync') === '0') syncEnabled = false; } catch (e) {}
    setSyncEnabled(syncEnabled);
    // version check runs on entering edit (edit view only), not on load
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
