/* orz-mdhtml in-file runtime.
 *
 * Inlined into every generated .md.html. Responsibilities:
 *   - read embedded markdown source
 *   - render preview (default mode) via window.orzmd.render
 *   - edit mode: textarea + live preview side by side
 *   - save: File System Access API in-place (Chromium), download fallback
 *   - version check: nudge user when a newer renderer is published
 *
 * Config is provided by the generator on window.__ORZ_MDHTML__.
 */
(function () {
  'use strict';

  var CFG = window.__ORZ_MDHTML__ || {};
  var $ = function (sel) { return document.querySelector(sel); };

  // ---- embedded source -----------------------------------------------------
  function unescapeSource(s) {
    // reverse of the generator's </script> guard
    return s.replace(/<\\\/(script)/gi, '</$1');
  }
  function escapeSource(s) {
    return s.replace(/<\/(script)/gi, '<\\/$1');
  }
  function getSource() {
    var el = document.getElementById('orz-src');
    return el ? unescapeSource(el.textContent || '') : '';
  }

  var preview = $('#orz-preview');
  var editor = $('#orz-editor');
  var textarea = $('#orz-source-input');

  // ---- rendering -----------------------------------------------------------
  function render(src) {
    if (!window.orzmd || typeof window.orzmd.render !== 'function') {
      preview.innerHTML = '<p style="color:#c00">Renderer not loaded.</p>';
      return;
    }
    preview.innerHTML = window.orzmd.render(src);
    runEnhancers();
  }

  function runEnhancers() {
    try { if (window.hljs) window.hljs.highlightAll(); } catch (e) {}
    try {
      if (window.mermaid) {
        window.mermaid.run({ querySelector: '#orz-preview .mermaid' });
      }
    } catch (e) {}
  }

  // ---- modes ---------------------------------------------------------------
  function setMode(mode) {
    document.body.setAttribute('data-mode', mode);
    if (mode === 'edit') {
      textarea.focus();
    }
  }

  var renderTimer = null;
  function onEdit() {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      render(textarea.value);
    }, 150);
  }

  // ---- copy: rendered selection -> markdown --------------------------------
  // Handled by orz-markdown's core runtime (OrzMarkdownRuntime): its document
  // `copy` listener converts selections inside #orz-preview (.markdown-body) to
  // Markdown via the bespoke DOM->Markdown walker, honoring data-md breadcrumbs.
  // Nothing to wire up here.

  // ---- save ----------------------------------------------------------------
  function serializeDocument(currentMd) {
    // Self-reproducing: update the embedded source + the pre-rendered preview,
    // then serialize the whole document.
    var clone = document.documentElement.cloneNode(true);
    var srcEl = clone.querySelector('#orz-src');
    if (srcEl) srcEl.textContent = escapeSource(currentMd);
    var prev = clone.querySelector('#orz-preview');
    if (prev && window.orzmd) prev.innerHTML = window.orzmd.render(currentMd);
    // reset transient UI to preview mode in the saved copy
    clone.querySelector('body') && clone.querySelector('body').setAttribute('data-mode', 'preview');
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  var fileHandle = null;
  function currentMarkdown() {
    return document.body.getAttribute('data-mode') === 'edit' ? textarea.value : getSource();
  }

  async function save() {
    var md = currentMarkdown();
    var html = serializeDocument(md);
    // Keep the live #orz-src in sync so subsequent saves are correct.
    var srcEl = document.getElementById('orz-src');
    if (srcEl) srcEl.textContent = escapeSource(md);

    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: (CFG.filename || 'document') + '.md.html',
            types: [{ description: 'Markdown HTML', accept: { 'text/html': ['.md.html', '.html'] } }],
          });
        }
        var writable = await fileHandle.createWritable();
        await writable.write(html);
        await writable.close();
        toast('Saved.');
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        // fall through to download
      }
    }
    downloadFile(html, (CFG.filename || 'document') + '.md.html');
  }

  function downloadFile(text, name) {
    var blob = new Blob([text], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Downloaded ' + name);
  }

  // ---- version check -------------------------------------------------------
  function checkVersion() {
    if (!CFG.versionManifest || !CFG.rendererVersion) return;
    try {
      var cached = JSON.parse(localStorage.getItem('orz-mdhtml:vercheck') || 'null');
      var DAY = 86400000;
      if (cached && (Date.now() - cached.t) < DAY) {
        if (cached.v && cached.v !== CFG.rendererVersion) showUpdateBanner(cached.v);
        return;
      }
    } catch (e) {}
    fetch(CFG.versionManifest).then(function (r) { return r.json(); }).then(function (j) {
      var latest = j && j.version;
      try { localStorage.setItem('orz-mdhtml:vercheck', JSON.stringify({ t: Date.now(), v: latest })); } catch (e) {}
      if (latest && latest !== CFG.rendererVersion) showUpdateBanner(latest);
    }).catch(function () { /* offline: ignore */ });
  }

  function showUpdateBanner(latest) {
    var bar = document.getElementById('orz-update');
    if (!bar) return;
    bar.querySelector('.ver').textContent =
      'Renderer ' + latest + ' available (this file uses ' + CFG.rendererVersion + ').';
    bar.hidden = false;
  }

  // ---- misc ----------------------------------------------------------------
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('orz-toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2000);
  }

  // ---- boot ----------------------------------------------------------------
  function boot() {
    var src = getSource();
    textarea.value = src;
    render(src);
    checkVersion();

    $('#orz-mode-preview').addEventListener('click', function () { setMode('preview'); });
    $('#orz-mode-edit').addEventListener('click', function () { setMode('edit'); });
    $('#orz-save').addEventListener('click', save);
    textarea.addEventListener('input', onEdit);

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });

    setMode('preview');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
