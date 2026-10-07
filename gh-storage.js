a
  b
/* gh-storage.js - per-user storage for the to-do app.
   Saves to this device instantly and to a JSON file in a GitHub repo (data/<user>.json) when a token is set. */
(function () {
  'use strict';
  function jget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function cfg() {
    var c = jget('todo_gh_cfg', {});
    return { repo: c.repo || 'pauloulsonjenkins-afk/todolist', branch: c.branch || 'main', dir: c.dir || 'data', token: c.token || '' };
  }
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64d(s) { return decodeURIComponent(escape(atob(s.replace(/\s/g, '')))); }
  function url(path, c) { return 'https://api.github.com/repos/' + c.repo + '/contents/' + c.dir + '/' + path; }
  function hdr(c) { var h = { 'Accept': 'application/vnd.github+json' }; if (c.token) h['Authorization'] = 'Bearer ' + c.token; return h; }

  var GH = {
    cfg: cfg,
    status: { state: 'local', msg: 'Saved on this device only' },
    getFile: async function (path) {
      var c = cfg();
      var r = await fetch(url(path, c) + '?ref=' + encodeURIComponent(c.branch) + '&t=' + Date.now(), { headers: hdr(c), cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) { var e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
      var j = await r.json();
      return { data: JSON.parse(b64d(j.content)), sha: j.sha };
    },
    putFile: async function (path, obj, sha, keepalive) {
      var c = cfg();
      if (!c.token) throw new Error('no token');
      var body = { message: 'Update ' + path, content: b64e(JSON.stringify(obj, null, 1)), branch: c.branch };
      if (sha) body.sha = sha;
      var r = await fetch(url(path, c), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr(c)), body: JSON.stringify(body), keepalive: !!keepalive });
      if (!r.ok) { var e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
      return (await r.json()).content.sha;
    }
  };
  window.TodoGH = GH;

  var U = (new URLSearchParams(location.search).get('u') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!U) return;

  var NAMES = { oj: 'OJ', nick: 'Nick' };
  var file = U + '.json';
  var CK = 'todo_cache_' + U;
  var cache = jget(CK, { data: {}, sha: null, dirty: false });
  var data = cache.data || {}, sha = cache.sha || null, dirty = !!cache.dirty;
  var timer = null, busy = false, again = false;

  function persist() { jset(CK, { data: data, sha: sha, dirty: dirty }); }
  function status(s, m) { GH.status = { state: s, msg: m || '' }; window.dispatchEvent(new CustomEvent('todo-sync', { detail: GH.status })); }
  function hhmm() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(function () { push(false); }, ms == null ? 1500 : ms); }

  async function push(keepalive) {
    if (!cfg().token) { status('local', 'Saved on this device only'); return; }
    if (busy) { again = true; return; }
    busy = true; status('syncing', 'Saving...');
    try {
      var snap = JSON.stringify(data);
      try { sha = await GH.putFile(file, data, sha, keepalive); }
      catch (e) {
        if (e.status === 409 || e.status === 422) {
          var f = await GH.getFile(file); sha = f ? f.sha : null;
          sha = await GH.putFile(file, data, sha, keepalive);
        } else throw e;
      }
      if (JSON.stringify(data) === snap) dirty = false;
      persist(); status('ok', 'Saved to GitHub at ' + hhmm());
    } catch (e) {
      persist(); status('error', 'Could not save to GitHub (' + e.message + '). Kept on this device, will retry.');
      schedule(30000);
    } finally {
      busy = false;
      if (again) { again = false; schedule(0); }
    }
  }
  GH.pushNow = function () { clearTimeout(timer); return push(false); };

  var ready = (async function () {
    if (!cfg().token) { status('local', 'Saved on this device only'); return; }
    status('syncing', 'Loading...');
    try {
      var f = await GH.getFile(file);
      if (f) { sha = f.sha; if (!dirty) data = f.data; }
      persist();
      if (dirty) { schedule(0); } else { status('ok', 'Loaded from GitHub at ' + hhmm()); }
    } catch (e) {
      status('error', 'Could not reach GitHub (' + e.message + '). Using this device\'s copy.');
    }
  })();

  window.storage = {
    get: async function (k) { await ready; return Object.prototype.hasOwnProperty.call(data, k) ? { key: k, value: data[k], shared: false } : null; },
    set: async function (k, v) { await ready; data[k] = String(v); dirty = true; persist(); schedule(); return { key: k, value: v, shared: false }; },
    delete: async function (k) { await ready; delete data[k]; dirty = true; persist(); schedule(); return { key: k, deleted: true, shared: false }; },
    list: async function (p) { await ready; return { keys: Object.keys(data).filter(function (k) { return !p || k.indexOf(p) === 0; }), shared: false }; }
  };

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && dirty && cfg().token) { clearTimeout(timer); push(true); }
  });

  function mountBar() {
    var b = document.createElement('div');
    b.id = 'todo-userbar';
    b.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99999;display:flex;gap:10px;align-items:center;padding:7px 12px;border-radius:999px;background:rgba(20,20,25,.92);color:#fff;font:12px/1.2 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3);max-width:calc(100vw - 20px)';
    var who = document.createElement('b'); who.textContent = NAMES[U] || U;
    var dot = document.createElement('span'); dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex:none';
    var msg = document.createElement('span'); msg.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    var sw = document.createElement('a'); sw.href = 'index.html'; sw.textContent = 'Switch user'; sw.style.cssText = 'color:#9cc9ff;text-decoration:underline;flex:none';
    sw.onclick = function () { try { sessionStorage.removeItem('todo_authed_' + U); } catch (e) {} };
    b.appendChild(who); b.appendChild(dot); b.appendChild(msg); b.appendChild(sw);
    document.body.appendChild(b);
    var colors = { ok: '#3ecf6e', syncing: '#f5b942', error: '#ef5b5b', local: '#8a8f98' };
    function show() { dot.style.background = colors[GH.status.state] || '#8a8f98'; msg.textContent = GH.status.msg; b.title = GH.status.msg; }
    window.addEventListener('todo-sync', show); show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBar); else mountBar();
})();
