/* Business Tracker – online sync with Google Firebase (Cloud Firestore).
   Local-first: every change is saved on the phone at once, then copied to the
   person's private online account. Changes from other phones flow back in.
   Each record is one online document at users/{uid}/records/{collection_id}. */
(function (g) {
  'use strict';
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var COLLS = ['sales', 'agents', 'referrals', 'walletComm', 'evc', 'capital', 'errors'];
  var host = null, cfg = null, db = null, auth = null, user = null, unsub = null;
  var lastDocs = {}, inFlight = {}, firstServerSnap = false, flushTimer = null, ver = 0, booting = false;
  var st = { phase: 'off', error: '', snapPending: false, lastSynced: null, email: '' };

  /* ---------- helpers ---------- */
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort()
      .map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function clean(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }
  function toDocs(S) {
    var out = {};
    COLLS.forEach(function (c) { (S[c] || []).forEach(function (r) { if (r && r.id) out[c + '_' + r.id] = { c: c, d: clean(r) }; }); });
    Object.keys(S.daily || {}).forEach(function (k) { out['daily_' + k] = { c: 'daily', k: k, d: clean(S.daily[k]) }; });
    Object.keys(S.recon || {}).forEach(function (k) { out['recon_' + k] = { c: 'recon', k: k, d: clean(S.recon[k]) }; });
    out.meta_settings = { c: 'meta', d: clean({ settings: S.settings, brackets: S.brackets }) };
    return out;
  }
  function pend(S) {
    if (!S.meta.pending || typeof S.meta.pending !== 'object') S.meta.pending = {};
    return S.meta.pending;
  }
  function recCol() { return db.collection('users').doc(user.uid).collection('records'); }
  function friendly(e) {
    var c = (e && e.code) || '';
    var map = {
      'auth/invalid-email': 'That email address does not look right.',
      'auth/missing-password': 'Type a password.',
      'auth/weak-password': 'Use a password of at least 6 characters.',
      'auth/email-already-in-use': 'An account with this email already exists. Tap Sign in instead.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/user-not-found': 'No account with this email. Tap Create account first.',
      'auth/too-many-requests': 'Too many tries. Wait a few minutes, then try again.',
      'auth/network-request-failed': 'No internet connection. Try again when you are online.',
      'auth/operation-not-allowed': 'Email sign-in is not switched on in your Firebase project (step 2).',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The setup block is not right. Copy it again from Firebase.',
      'permission-denied': 'Firebase refused access. Check the security rules (step 4).',
      'unavailable': 'Cannot reach Firebase right now. Your changes are kept and will sync later.'
    };
    return map[c] || (e && e.message ? String(e.message).replace(/^Firebase:\s*/, '') : 'Something went wrong.');
  }
  function emit() { if (host && host.onStatus) host.onStatus(status()); }

  /* ---------- local changes -> pending list ---------- */
  function track(S) {
    var now = toDocs(S), next = {}, p = cfg ? pend(S) : null;
    Object.keys(now).forEach(function (id) {
      var j = stable(now[id]); next[id] = j;
      if (p && lastDocs[id] !== j) p[id] = { op: 'set', v: ++ver };
    });
    if (p) Object.keys(lastDocs).forEach(function (id) { if (!now[id]) p[id] = { op: 'del', v: ++ver }; });
    lastDocs = next;
  }
  function schedule() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 400); emit(); }

  /* ---------- pending list -> online ---------- */
  function flush() {
    if (!db || !user) { emit(); return; }
    var S = host.getS(), p = pend(S), now = toDocs(S);
    var ids = Object.keys(p).filter(function (id) { return inFlight[id] !== p[id].v; });
    if (!ids.length) { emit(); return; }
    var col = recCol(), sent = {}, commits = [];
    for (var i = 0; i < ids.length; i += 400) {
      var b = db.batch();
      ids.slice(i, i + 400).forEach(function (id) {
        sent[id] = p[id].v; inFlight[id] = p[id].v;
        if (p[id].op === 'del' || !now[id]) b['delete'](col.doc(id));
        else b.set(col.doc(id), Object.assign({ at: Date.now() }, now[id]));
      });
      commits.push(b.commit());
    }
    st.error = ''; emit();
    Promise.all(commits).then(function () {
      var p2 = pend(host.getS());
      Object.keys(sent).forEach(function (id) {
        if (p2[id] && p2[id].v === sent[id]) delete p2[id];
        if (inFlight[id] === sent[id]) delete inFlight[id];
      });
      st.lastSynced = Date.now(); host.saveLocal(); emit();
    }).catch(function (e) {
      Object.keys(sent).forEach(function (id) { if (inFlight[id] === sent[id]) delete inFlight[id]; });
      st.error = friendly(e); emit();
    });
  }

  /* ---------- online -> this phone ---------- */
  function applyLocal(S, id, body) {
    var c = body.c, d = body.d || {};
    if (COLLS.indexOf(c) >= 0) {
      var arr = S[c] || (S[c] = []), rid = d.id || id.slice(c.length + 1), found = false;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === rid) { arr[i] = d; found = true; break; }
      if (!found) arr.push(d);
      if (d.seq && d.seq >= S.nextSeq) S.nextSeq = d.seq + 1;
    } else if (c === 'daily') { S.daily[body.k] = d; }
    else if (c === 'recon') { S.recon[body.k] = d; }
    else if (c === 'meta') {
      if (d.settings) S.settings = Object.assign({}, S.settings, d.settings);
      if (Array.isArray(d.brackets)) S.brackets = d.brackets;
    }
  }
  function removeLocal(S, id) {
    var c = id.split('_')[0], rest = id.slice(c.length + 1);
    if (COLLS.indexOf(c) >= 0) {
      var arr = S[c] || [];
      for (var i = 0; i < arr.length; i++) if (arr[i].id === rest) { arr.splice(i, 1); return true; }
      return false;
    }
    if (c === 'daily' && S.daily[rest]) { delete S.daily[rest]; return true; }
    if (c === 'recon' && S.recon[rest]) { delete S.recon[rest]; return true; }
    return false;
  }
  function listen() {
    stopListen(); firstServerSnap = false;
    unsub = recCol().onSnapshot({ includeMetadataChanges: true }, function (snap) {
      var S = host.getS(), p = pend(S), changed = false;
      snap.docChanges().forEach(function (ch) {
        var id = ch.doc.id;
        if (p[id]) return; // this phone has a newer change waiting to go up
        if (ch.type === 'removed') { if (removeLocal(S, id)) changed = true; delete lastDocs[id]; return; }
        var x = ch.doc.data(), body = { c: x.c, d: x.d };
        if (x.k !== undefined) body.k = x.k;
        var j = stable(body);
        if (lastDocs[id] === j) return;
        applyLocal(S, id, body); lastDocs[id] = j; changed = true;
      });
      // First answer from the server: upload anything that only exists on this phone.
      if (!firstServerSnap && !snap.metadata.fromCache) {
        firstServerSnap = true;
        var online = {}; snap.docs.forEach(function (d) { online[d.id] = 1; });
        var now = toDocs(S);
        Object.keys(now).forEach(function (id) { if (!online[id] && !p[id]) p[id] = { op: 'set', v: ++ver }; });
        changed = true;
      }
      st.snapPending = !!snap.metadata.hasPendingWrites;
      if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) st.lastSynced = Date.now();
      if (changed) { host.saveLocal(); host.refresh(); }
      emit(); flush();
    }, function (e) { st.error = friendly(e); emit(); });
  }
  function stopListen() { if (unsub) { try { unsub(); } catch (e) {} } unsub = null; }

  /* ---------- loading Firebase ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { s.remove(); rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function boot() {
    if (!cfg || db || booting) { emit(); return; }
    booting = true; st.phase = 'loading'; emit();
    var ready = (g.firebase && g.firebase.firestore && g.firebase.auth) ? Promise.resolve()
      : loadScript(SDK + 'firebase-app-compat.js').then(function () {
        return Promise.all([loadScript(SDK + 'firebase-auth-compat.js'), loadScript(SDK + 'firebase-firestore-compat.js')]);
      });
    ready.then(function () {
      var fb = g.firebase, app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(cfg);
      auth = app.auth(); db = app.firestore();
      return db.enablePersistence({ synchronizeTabs: true })['catch'](function () {});
    }).then(function () {
      booting = false;
      auth.onAuthStateChanged(function (u) {
        user = u || null; st.email = u ? (u.email || '') : '';
        st.phase = u ? 'on' : 'signin';
        if (u) listen(); else stopListen();
        emit();
      });
    })['catch'](function () { booting = false; db = null; auth = null; st.phase = 'nosdk'; emit(); });
  }

  /* ---------- status ---------- */
  function status() {
    var S = host ? host.getS() : null, n = S && cfg ? Object.keys(pend(S)).length : 0;
    var online = navigator.onLine !== false, label = '', tone = 'neutral';
    if (!cfg) { label = ''; }
    else if (st.phase === 'loading') { label = 'Connecting'; }
    else if (st.phase === 'nosdk') { label = online ? 'Sync not reachable' : 'Offline, saved on phone'; tone = online ? 'owed' : 'neutral'; }
    else if (st.phase === 'signin') { label = 'Sign in to sync'; tone = 'owed'; }
    else if (st.error) { label = 'Sync problem'; tone = 'late'; }
    else if (!online) { label = n ? 'Offline, ' + n + ' to sync' : 'Offline, saved on phone'; }
    else if (n || st.snapPending || !firstServerSnap) { label = 'Syncing'; }
    else { label = 'Synced'; tone = 'credit'; }
    return { configured: !!cfg, phase: st.phase, label: label, tone: tone, email: st.email, pending: n,
      error: st.error, lastSynced: st.lastSynced, signedIn: !!user };
  }

  /* ---------- setup and sign-in ---------- */
  function parseConfig(text) {
    var out = {}, re = /["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g, m;
    while ((m = re.exec(String(text || '')))) out[m[1]] = m[2].trim();
    var missing = ['apiKey', 'authDomain', 'projectId', 'appId'].filter(function (k) { return !out[k]; });
    if (missing.length) throw new Error('The setup block is missing: ' + missing.join(', ') + '. Copy the whole firebaseConfig block from Firebase.');
    return out;
  }
  function needAuth() { if (!auth) return Promise.reject({ message: 'Still connecting to Firebase. Check your internet, then try again.' }); return null; }

  g.Sync = {
    init: function (h) {
      host = h;
      var S = host.getS(), d = toDocs(S);
      cfg = S.meta.firebase || null;
      lastDocs = {}; Object.keys(d).forEach(function (id) { lastDocs[id] = stable(d[id]); });
      var p = S.meta.pending || {}; Object.keys(p).forEach(function (id) { if (p[id] && p[id].v > ver) ver = p[id].v; });
      window.addEventListener('online', function () { if (cfg && !db) boot(); flush(); emit(); });
      window.addEventListener('offline', emit);
      boot();
    },
    track: track, schedule: schedule, status: status, toDocs: toDocs,
    setConfig: function (text) {
      var c = parseConfig(text), S = host.getS();
      S.meta.firebase = c; cfg = c; host.saveLocal(); boot();
      return c;
    },
    removeConfig: function () {
      var S = host.getS(); delete S.meta.firebase; S.meta.pending = {};
      host.saveLocal();
      var done = function () { location.reload(); };
      if (auth) auth.signOut().then(done, done); else done();
    },
    signUp: function (email, pw) { return needAuth() || auth.createUserWithEmailAndPassword(email, pw)['catch'](function (e) { throw { message: friendly(e) }; }); },
    signIn: function (email, pw) { return needAuth() || auth.signInWithEmailAndPassword(email, pw)['catch'](function (e) { throw { message: friendly(e) }; }); },
    resetPassword: function (email) { return needAuth() || auth.sendPasswordResetEmail(email)['catch'](function (e) { throw { message: friendly(e) }; }); },
    signOut: function () { return auth ? auth.signOut() : Promise.resolve(); },
    syncNow: function () { st.error = ''; if (cfg && !db) boot(); flush(); emit(); },
    retry: function () { if (cfg && !db) boot(); }
  };
})(window);
