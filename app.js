/* Agent & Client Tracker – app shell. Works fully offline; data stays on this phone. */
(function () {
  'use strict';
  var C = window.Calc, num = C.num, r2 = C.r2;
  var APP_NAME = 'Agent & Client Tracker';
  /* Set when running inside the self-contained Android app (no browser). */
  var NATIVE = window.AndroidBridge || null;

  /* ================= Formatting ================= */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v) { return C.fm(v); }
  function sym() { return C.cur(); }
  function compact(v) {
    return I18N.compact(num(v), sym());
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function nowTime() { var t = new Date(); return pad2(t.getHours()) + ':' + pad2(t.getMinutes()); }
  function fmtTime(t) { return t || ''; }
  function stamp(ms) { return I18N.fmt.stamp(ms); }

  function parts(s) { var p = String(s).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function ord(d) { var j = d % 10, k = d % 100; return d + (k >= 11 && k <= 13 ? 'th' : j === 1 ? 'st' : j === 2 ? 'nd' : j === 3 ? 'rd' : 'th'); }
  function readable(s) { return I18N.fmt.readable(s); }

  function shortDate(s) { return I18N.fmt.short(s); }

  function dayHead(s) { return I18N.fmt.dayHead(s); }

  function addDays(s, n) { var p = parts(s), t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0'); }
  function dayShort(s) { return I18N.fmt.dayShort(s); }

  function monthName(m) { return I18N.fmt.month(m); }

  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ================= Data ================= */
  var DEFAULT_SETTINGS = {
    profile: { name: '', country: 'GM' },
    currency: { symbol: 'D', code: 'GMD' },
    theme: 'classic',
    tipMode: 'extra',
    payDefault: '',
    channels: ['Wave', 'APS', 'Afrimoney', 'QMoney', 'Nafa', 'Yonna', 'ComCach', 'Bank Transfer', 'Microfinance', 'Cash'],
    banks: ['Access Bank', 'Agib Bank', 'Bloom Bank', 'Ecobank', 'First Bank', 'GTBank', 'Mega Bank', 'Trust Bank', 'Vista Bank', 'Zenith Bank', 'Reliance Financial Services'],
    exTypes: ['Bank-to-Wallet', 'Wallet-to-Bank', 'Deposit', 'Other'],
    agentTxTypes: ['Float Transfer/Rebalancing (between wallets)', 'EVC/Voucher Transaction', 'Bank to Bank Exchange', 'Bank to Wallet Exchange', 'Wallet to Bank Exchange', 'Other'],
    wallets: ['Wave', 'APS', 'Afrimoney', 'QMoney', 'Nafa', 'ComCach', 'Yonna Wallet', 'Suturamoney', 'Other'],
    evcProviders: ['Comium EVC', 'Africell EVC', 'Qcell EVC', 'Gamcel EVC'],
    capitalAccounts: ['Cash in Hand', 'Wave', 'APS', 'Afrimoney', 'QMoney', 'Nafa', 'ComCach', 'Yonna Wallet', 'Suturamoney', 'Bank', 'EVC Stock'],
    expenseCats: ['Data / Airtime Purchase', 'Rent', 'Transport', 'Staff', 'Owner Withdrawal', 'Tips Handed Over', 'Bank Charges', 'Other'],
    woReasons: ['Customer unreachable/disappeared', 'Agent defaulted', 'Error-caused loss', 'Fraud/Scam', 'Business decision (waived)', 'Other'],
    errorTypes: ['Wrong amount charged', 'Wrong customer/agent billed', 'Duplicate entry', 'Wrong exchange rate', 'Wrong data bundle', 'Reconciliation mismatch', 'Other'],
    causedBy: ['Customer', 'Agent', 'Owner/Staff', 'System/Technical', 'Unclear']
  };
  var LIST_KEYS = ['sales', 'agents', 'referrals', 'brackets', 'walletComm', 'evc', 'capital', 'errors', 'expenses'];
  function blankState() {
    return { app: 'business-tracker', version: 2, sales: [], agents: [], referrals: [],
      brackets: [],
      walletComm: [], evc: [], capital: [], errors: [], expenses: [], daily: {}, recon: {}, limits: {}, nextSeq: 1,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), meta: { lastBackup: null } };
  }
  function normalize(s) {
    var out = Object.assign(blankState(), s || {});
    var def = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), given = (s && s.settings) || {};
    out.settings = Object.assign(def, given);
    out.settings.profile = Object.assign({ name: '', country: 'GM' }, given.profile || {});
    out.settings.currency = Object.assign({ symbol: 'D', code: 'GMD' }, given.currency || {});
    out.meta = Object.assign({ lastBackup: null }, (s && s.meta) || {});
    if (!out.limits || typeof out.limits !== 'object') out.limits = {};
    LIST_KEYS.forEach(function (k) { if (!Array.isArray(out[k])) out[k] = []; });
    if (!out.daily || typeof out.daily !== 'object') out.daily = {};
    if (!out.recon || typeof out.recon !== 'object') out.recon = {};
    var maxSeq = 0;
    LIST_KEYS.forEach(function (k) { out[k].forEach(function (r) { if (r && !r.id && k !== 'brackets') r.id = uid(); if (r && r.seq > maxSeq) maxSeq = r.seq; }); });
    out.nextSeq = Math.max(out.nextSeq || 1, maxSeq + 1);
    return out;
  }
  function applyLocale() { C.setOptions(S.settings); if (window.THEMES) THEMES.apply(S.settings.theme); }
  // One-time clean-ups. Run after online sync starts, so changes are saved online too.
  function migrate() {
    var changed = false, m = S.meta.mig || (S.meta.mig = {});
    function fix(v) { return typeof v === 'string' ? v.replace(/comcash/gi, 'ComCach') : v; }
    function fixList(list) { return (list || []).map(fix); }
    if (!m.v2) {
      ['channels', 'wallets', 'capitalAccounts'].forEach(function (k) { S.settings[k] = fixList(S.settings[k]); });
      var caps = { 'Cash in hand': 'Cash in Hand', 'EVC stock': 'EVC Stock' };
      S.settings.capitalAccounts = S.settings.capitalAccounts.map(function (x) { return caps[x] || x; });
      if (JSON.stringify(S.settings.evcProviders) === JSON.stringify(['EVC Comium', 'Africell', 'Qcell', 'Other'])) S.settings.evcProviders = DEFAULT_SETTINGS.evcProviders.slice();
      S.settings.channels = S.settings.channels.filter(function (x) { return x !== 'Other'; });
      S.sales.forEach(function (r) { ['details', 'channel', 'notes', 'bank'].forEach(function (f) { if (r[f]) r[f] = fix(r[f]); }); });
      S.agents.forEach(function (r) { ['desc', 'txType', 'notes'].forEach(function (f) { if (r[f]) r[f] = fix(r[f]); }); });
      S.walletComm.forEach(function (r) { if (r.wallet) r.wallet = fix(r.wallet); });
      var prov = { 'EVC Comium': 'Comium EVC', 'Africell': 'Africell EVC', 'Qcell': 'Qcell EVC' };
      S.evc.forEach(function (r) { if (prov[r.provider]) r.provider = prov[r.provider]; });
      S.capital.forEach(function (r) {
        var b = {}; Object.keys(r.balances || {}).forEach(function (k) { var nk = caps[fix(k)] || fix(k); b[nk] = (b[nk] || 0) + num(r.balances[k]) || r.balances[k]; });
        r.balances = b;
      });
      m.v2 = true; changed = true;
    }
    if (!m.v3) {
      // Blank balance rows copied from the old spreadsheet say nothing and would cause false "money missing" warnings.
      var before = S.capital.length;
      S.capital = S.capital.filter(function (s) { return !C.snapEmpty(s) || (s.notes && String(s.notes).trim()); });
      m.v3 = true; if (S.capital.length !== before) changed = true;
    }
    if (!m.v20) {
      // Only payment options with a real logo stay in the lists. Old records keep the name they were saved with.
      var gone = ['BSIC', 'Xpress Point', 'APS Islamic Microfinance', 'Bayba Financial Services', 'Kolomoni Microfinance', 'NACCUG Credit Union',
        'Salam Financial Services', 'Yonna Islamic Microfinance', 'VISACA (Village Bank)'];
      ['channels', 'wallets', 'banks', 'capitalAccounts'].forEach(function (k) {
        if (Array.isArray(S.settings[k])) S.settings[k] = S.settings[k].filter(function (x) { return gone.indexOf(x) < 0; });
      });
      m.v20 = true; changed = true;
    }
    if (!m.v13) {
      // Microfinance became a way to be paid. Add it once, before Cash.
      var ch = S.settings.channels || [];
      if (ch.indexOf('Microfinance') < 0) { var at = ch.indexOf('Cash'); ch.splice(at < 0 ? ch.length : at, 0, 'Microfinance'); S.settings.channels = ch; }
      m.v13 = true; changed = true;
    }
    if (C.assignRefIds(S)) changed = true;
    return changed;
  }

  var Store = {
    db: null,
    open: function () {
      var self = this;
      if (self.db) return Promise.resolve(self.db);
      return new Promise(function (res, rej) {
        if (!window.indexedDB) return rej(new Error('no indexedDB'));
        var q = indexedDB.open('business-tracker', 1);
        q.onupgradeneeded = function () { q.result.createObjectStore('kv'); };
        q.onsuccess = function () { self.db = q.result; res(self.db); };
        q.onerror = function () { rej(q.error); };
      });
    },
    get: function () {
      return this.open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction('kv', 'readonly').objectStore('kv').get('state');
          t.onsuccess = function () { res(t.result || null); };
          t.onerror = function () { rej(t.error); };
        });
      }).catch(function () {
        try { var x = localStorage.getItem('business-tracker'); return x ? JSON.parse(x) : null; } catch (e) { return null; }
      });
    },
    set: function (v) {
      var plain = JSON.parse(JSON.stringify(v));
      return this.open().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(plain, 'state');
          tx.oncomplete = function () { res(); };
          tx.onerror = function () { rej(tx.error); };
        });
      }).catch(function () { localStorage.setItem('business-tracker', JSON.stringify(plain)); });
    }
  };

  var S = blankState(), R = null;
  function recompute() { R = C.computeAll(S); }
  function persist() {
    if (window.Sync) Sync.track(S);
    recompute();
    return Store.set(S).then(function () { if (window.Sync) Sync.schedule(); })
      .catch(function () { toast('Not saved: your phone storage may be full.'); });
  }

  /* ================= Navigation ================= */
  var UI = { stack: [{ v: 'home' }], sheetOpen: false, custQuery: '', custFilter: 'all',
    agentQuery: '', limit: 120, commTab: 'wallet', refTab: 'sales', shareType: 'Customer', shareKey: '', shareText: '',
    hType: 'all', hRange: 'all', hStatus: 'all', hChannel: '', hQuery: '', hFrom: '', hTo: '',
    locked: false, pin: '', pinBuf: '', pinFirst: '', pinStep: 0, pinMsg: '', changing: false, forgot: false, gName: '', gCountry: 'GM', gateTab: 'create', bioOK: false };
  var TITLES = { reports: 'Reports', language: 'Language', home: APP_NAME, agents: 'Agents', customers: 'Customers', history: 'History', settings: 'Settings',
    share: 'Send a Reminder', daily: 'Daily Cash Check', recon: 'Monthly Balance Check', losses: 'Losses and Errors',
    comm: 'Commissions', ref: 'Referral Agents', capital: 'Capital Portfolio', backup: 'Backup and Restore',
    choices: 'Your Choices', help: 'How It Works', sync: 'Your Account', risk: 'Risk Check', security: 'Security',
    capture: 'Automatic Recording', look: 'Country, Currency and Theme', rules: 'Money Rules', expenses: 'Expenses and Money Out', profile: 'Your Details' };
  function cur() { return UI.stack[UI.stack.length - 1]; }
  function go(v) { UI.stack.push(v); history.pushState({ n: UI.stack.length }, ''); render(); window.scrollTo(0, 0); }
  function setTab(t) { UI.stack = [{ v: t }]; UI.limit = 120; render(); window.scrollTo(0, 0); }
  window.addEventListener('popstate', function () {
    if (closePicker()) return;
    if (UI.sheetOpen) { draftOnClose(); removeSheet(); return; }
    if (UI.stack.length > 1) { UI.stack.pop(); render(); }
  });

  /* ================= Small UI helpers ================= */
  var ICONS = {
    home: '<path class="f" d="M5 10.2L12 4.5l7 5.7V20H5z"/><path d="M3 11l9-7.2L21 11"/><path d="M5 9.6V20h14V9.6"/><path d="M10 20v-5.2h4V20"/>',
    sales: '<path class="f" d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z"/><path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8z"/><path d="M9 8.5h6M9 12h6"/>',
    agents: '<circle class="f" cx="12" cy="12" r="9"/><path d="M6.5 9.5h10.5l-2.6-2.6"/><path d="M17.5 14.5H7l2.6 2.6"/>',
    customers: '<circle class="f" cx="9" cy="8.2" r="3.4"/><circle cx="9" cy="8.2" r="3.4"/><path class="f" d="M3 20c.7-3.6 3.1-5.3 6-5.3s5.3 1.7 6 5.3z"/><path d="M3 20c.7-3.6 3.1-5.3 6-5.3s5.3 1.7 6 5.3"/><path d="M16.2 5.3a3 3 0 010 5.8M18.2 15c1.8.6 2.8 2.2 3.3 4.5"/>',
    more: '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pay: '<circle class="f" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.7L16.2 9.5"/>',
    chat: '<path class="f" d="M4 5.5h16v11H9.5L5 20.5v-4H4z"/><path d="M4 5.5h16v11H9.5L5.5 20v-3.5H4z"/><path d="M8 9.5h8M8 12.8h5"/>',
    cash: '<rect class="f" x="3" y="6" width="18" height="12" rx="2.5"/><rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.7"/><path d="M6.5 12h.01M17.5 12h.01"/>',
    recon: '<path class="f" d="M5 8l-2.6 6.2a3.1 3.1 0 005.2 0zM19 8l-2.6 6.2a3.1 3.1 0 005.2 0z"/><path d="M12 4v16M7 20h10M5 8h14"/><path d="M5 8l-2.6 6.2a3.1 3.1 0 005.2 0zM19 8l-2.6 6.2a3.1 3.1 0 005.2 0z"/>',
    loss: '<path class="f" d="M12 3.6l9 16H3z"/><path d="M12 3.6l9 16H3z"/><path d="M12 10v4.4M12 17.1v.01"/>',
    comm: '<circle class="f" cx="7" cy="7" r="2.8"/><circle class="f" cx="17" cy="17" r="2.8"/><circle cx="7" cy="7" r="2.8"/><circle cx="17" cy="17" r="2.8"/><path d="M19 5L5 19"/>',
    capital: '<circle class="f" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/>',
    backup: '<path class="f" d="M7 18.5a4.5 4.5 0 01-.7-8.9A6 6 0 0118 9.6a4.5 4.5 0 01-1 8.9z"/><path d="M7 18.5a4.5 4.5 0 01-.7-8.9A6 6 0 0118 9.6a4.5 4.5 0 01-1 8.9"/><path d="M12 12.5v6M9.4 15l2.6-2.6 2.6 2.6"/>',
    settings: '<path d="M4 7h9M19 7h1M4 17h3M13 17h7"/><circle class="f" cx="16" cy="7" r="2.6"/><circle cx="16" cy="7" r="2.6"/><circle class="f" cx="10" cy="17" r="2.6"/><circle cx="10" cy="17" r="2.6"/>',
    help: '<circle class="f" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M9.7 9.4a2.4 2.4 0 114 1.9c-.9.6-1.7 1.1-1.7 2.3M12 16.8v.01"/>',
    account: '<circle class="f" cx="12" cy="8.5" r="3.6"/><circle cx="12" cy="8.5" r="3.6"/><path class="f" d="M5 20c.9-3.7 3.8-5.5 7-5.5s6.1 1.8 7 5.5z"/><path d="M5 20c.9-3.7 3.8-5.5 7-5.5s6.1 1.8 7 5.5"/>',
    privacy: '<path class="f" d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.8 12l2.2 2.2 4.2-4.2"/>',
    install: '<rect class="f" x="4" y="17" width="16" height="3.5" rx="1.2"/><path d="M12 3.5v11M7.5 10.2l4.5 4.5 4.5-4.5"/><path d="M4 17.5v1.8c0 .7.5 1.2 1.2 1.2h13.6c.7 0 1.2-.5 1.2-1.2v-1.8"/>',
    chart: '<rect class="f" x="4.5" y="12" width="3.4" height="7.5" rx="1"/><rect class="f" x="10.3" y="6" width="3.4" height="13.5" rx="1"/><rect class="f" x="16.1" y="9.5" width="3.4" height="10" rx="1"/><rect x="4.5" y="12" width="3.4" height="7.5" rx="1"/><rect x="10.3" y="6" width="3.4" height="13.5" rx="1"/><rect x="16.1" y="9.5" width="3.4" height="10" rx="1"/>',
    globe: '<circle class="f" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    history: '<circle class="f" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
    eye: '<path class="f" d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 6.1c.5-.1 1-.1 1.4-.1 6 0 9.5 6 9.5 6a16 16 0 01-3.1 3.8M6.6 7.5A16 16 0 002.5 12S6 18 12 18c1.5 0 2.8-.3 4-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
    lock: '<rect class="f" x="5" y="11" width="14" height="9.5" rx="2.4"/><rect x="5" y="11" width="14" height="9.5" rx="2.4"/><path d="M8 11V8a4 4 0 018 0v3"/><path d="M12 15v2"/>',
    shield: '<path class="f" d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
    finger: '<path d="M7 11a5 5 0 0110 0v2.2"/><path d="M5 14c0-1 .2-2 .5-3M9 21c-.5-1.5-.7-3-.7-4.7V11a3.7 3.7 0 017.4 0v3.5c0 2 .3 3.5 1 5M12 11v5c0 1.8.3 3.2.8 4.5"/>',
    expense: '<rect class="f" x="3" y="6" width="18" height="12" rx="2.5"/><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M12 9v5M9.6 12l2.4 2.4 2.4-2.4"/>',
    look: '<path class="f" d="M12 3a9 9 0 100 18c1.6 0 2.2-1.3 1.5-2.4-.7-1.1-.2-2.5 1.3-2.5H17a4 4 0 004-4c0-5-4-9.1-9-9.1z"/><path d="M12 3a9 9 0 100 18c1.6 0 2.2-1.3 1.5-2.4-.7-1.1-.2-2.5 1.3-2.5H17a4 4 0 004-4c0-5-4-9.1-9-9.1z"/><path d="M7.6 11h.01M10.6 7.6h.01M15 8h.01"/>',
    rules: '<rect class="f" x="5" y="3.5" width="14" height="17" rx="2.4"/><rect x="5" y="3.5" width="14" height="17" rx="2.4"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    device: '<rect class="f" x="7" y="3" width="10" height="18" rx="2.4"/><rect x="7" y="3" width="10" height="18" rx="2.4"/><path d="M11 17.7h2"/>',
    list: '<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><path d="M4.2 6.5h.01M4.2 12h.01M4.2 17.5h.01"/>',
    risk: '<path class="f" d="M3.5 17a8.5 8.5 0 0117 0z"/><path d="M3.5 17a8.5 8.5 0 0117 0"/><path d="M12 17l3.8-5"/><circle cx="12" cy="17" r="1.3"/>',
    bell: '<path class="f" d="M6 17V11a6 6 0 0112 0v6z"/><path d="M6 17V11a6 6 0 0112 0v6l1.5 1.5h-15z"/><path d="M10 21h4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    bank: '<path class="f" d="M3.5 9.5L12 4l8.5 5.5z"/><path d="M3.5 9.5L12 4l8.5 5.5z"/><path d="M5.5 10v7M10 10v7M14 10v7M18.5 10v7M3.5 20h17"/>',
    mfi: '<circle class="f" cx="9" cy="8" r="3"/><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.2 2.7-4.8 5.5-4.8 1.2 0 2.3.3 3.2.9"/><circle class="f" cx="17" cy="15.5" r="4"/><circle cx="17" cy="15.5" r="4"/><path d="M17 13.6v3.8M15.4 15.5h3.2"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }

  /* ================= Payment providers: groups, badges and the picker ================= */
  var PICK_LISTS = { channels: 1, banks: 1, wallets: 1 };
  var PROV_GROUPS = [
    ['wallet', 'Mobile Money', ['Wave', 'APS', 'Afrimoney', 'QMoney', 'Nafa', 'Yonna', 'Yonna Wallet', 'ComCach', 'Suturamoney']],
    ['bank', 'Banks', ['Access Bank', 'Agib Bank', 'Bloom Bank', 'Ecobank', 'First Bank', 'GTBank', 'Mega Bank', 'Trust Bank', 'Vista Bank', 'Zenith Bank']],
    ['mfi', 'Microfinance', ['Reliance Financial Services']],
    ['way', 'Other Ways', ['Bank Transfer', 'Microfinance', 'Cash', 'Cash in Hand']]
  ];
  var PROV_CODE = { 'Wave': 'WV', 'APS': 'APS', 'Afrimoney': 'AM', 'QMoney': 'QM', 'Nafa': 'NF', 'Yonna': 'YN', 'Yonna Wallet': 'YN', 'ComCach': 'CC',
    'Xpress Point': 'XP', 'Suturamoney': 'SM', 'Access Bank': 'AB', 'Agib Bank': 'AG', 'BSIC': 'BS', 'Bloom Bank': 'BB', 'Ecobank': 'EB', 'First Bank': 'FB',
    'GTBank': 'GT', 'Mega Bank': 'MB', 'Trust Bank': 'TB', 'Vista Bank': 'VB', 'Zenith Bank': 'ZB', 'APS Islamic Microfinance': 'APS', 'Bayba Financial Services': 'BF',
    'Kolomoni Microfinance': 'KM', 'NACCUG Credit Union': 'NC', 'Reliance Financial Services': 'RF', 'Salam Financial Services': 'SF',
    'Yonna Islamic Microfinance': 'YM', 'VISACA (Village Bank)': 'VS' };
  /* Official logos supplied by the owner, kept in the logos folder. Providers without one show their badge. */
  var PROV_LOGO = { 'Wave': 'logos/wave.png', 'APS': 'logos/aps.png', 'Nafa': 'logos/nafa.png', 'ComCach': 'logos/comcach.png',
    'Afrimoney': 'logos/afrimoney.png', 'QMoney': 'logos/qmoney.png', 'Yonna': 'logos/yonna.png', 'Yonna Wallet': 'logos/yonna.png',
    'Suturamoney': 'logos/suturamoney.png', 'Access Bank': 'logos/accessbank.png', 'Agib Bank': 'logos/agib.png', 'Vista Bank': 'logos/vista.png',
    'Bloom Bank': 'logos/bloom.png', 'Ecobank': 'logos/ecobank.png', 'First Bank': 'logos/firstbank.png', 'GTBank': 'logos/gtbank.png',
    'Mega Bank': 'logos/megabank.png', 'Trust Bank': 'logos/trustbank.png', 'Zenith Bank': 'logos/zenith.png', 'Reliance Financial Services': 'logos/reliance.png' };
  var PROV_ICON = { 'Bank Transfer': 'bank', 'Microfinance': 'mfi', 'Cash': 'cash', 'Cash in Hand': 'cash' };
  var provIndex = null;
  function provGroup(name) {
    if (!provIndex) { provIndex = {}; PROV_GROUPS.forEach(function (g) { g[2].forEach(function (n) { provIndex[n.toLowerCase()] = g[0]; }); }); }
    var k = String(name || '').toLowerCase();
    if (provIndex[k]) return provIndex[k];
    if (/bank/.test(k)) return 'bank';
    if (/microfinance|credit union|financial services|visaca/.test(k)) return 'mfi';
    return 'own';
  }
  function provCode(name) {
    if (PROV_CODE[name]) return PROV_CODE[name];
    var w = String(name || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : (w[0] || '').charAt(1))).toUpperCase();
  }
  /* A round badge for a payment provider. It shows the provider's short code in the colour of its group, not a company logo. */
  function provBadge(name, size) {
    var cls = 'pbadge g-' + (name === '__other' ? 'own' : provGroup(name)) + (size ? ' ' + size : '');
    if (name === '__other') return '<span class="' + cls + '">' + icon('plus') + '</span>';
    if (name === '__none') return '<span class="pbadge g-none' + (size ? ' ' + size : '') + '">' + icon('list') + '</span>';
    if (PROV_ICON[name]) return '<span class="' + cls + '">' + icon(PROV_ICON[name]) + '</span>';
    var logo = PROV_LOGO[name] || PROV_LOGO[Object.keys(PROV_LOGO).filter(function (k) { return k.toLowerCase() === String(name).toLowerCase(); })[0]];
    if (logo) return '<span class="pbadge plogo' + (size ? ' ' + size : '') + '"><img src="' + logo + '" alt="" loading="lazy" decoding="async"></span>';
    return '<span class="' + cls + '" aria-hidden="true">' + esc(provCode(name)) + '</span>';
  }
  function syncPick(sel) {
    var b = sel._pickBtn; if (!b) return;
    var o = sel.options[sel.selectedIndex], v = sel.value;
    var empty = !v, label = o ? o.text : '';
    b.innerHTML = (empty ? '<span class="pbadge g-none">' + icon('list') + '</span>' : provBadge(v === '__other' ? '__other' : v)) +
      '<span class="pt' + (empty ? ' ph' : '') + '">' + esc(label || 'Choose') + '</span><span class="chev" aria-hidden="true">›</span>';
  }
  function enhancePickers(root) {
    var list = (root || document).querySelectorAll('select[data-pick]:not(.picked)');
    for (var i = 0; i < list.length; i++) (function (sel) {
      sel.classList.add('picked');
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pickbtn';
      var lab = sel.id && document.querySelector('label[for="' + sel.id + '"]');
      b.setAttribute('aria-label', (lab ? lab.textContent : sel.getAttribute('aria-label') || 'Choose').replace(/\s*\*$/, ''));
      sel.parentNode.insertBefore(b, sel.nextSibling); sel._pickBtn = b; syncPick(sel);
      b.addEventListener('click', function () { openPicker(sel); });
      sel.addEventListener('change', function () { syncPick(sel); });
    })(list[i]);
  }
  var PICKER = null;
  function openPicker(sel) {
    closePicker();
    var title = (sel._pickBtn && sel._pickBtn.getAttribute('aria-label')) || 'Choose';
    var groups = {}, order = ['wallet', 'bank', 'mfi', 'way', 'own'], names = { own: 'Your Own' }, blank = null, other = null;
    PROV_GROUPS.forEach(function (g) { names[g[0]] = g[1]; });
    Array.prototype.forEach.call(sel.options, function (o) {
      if (o.value === '') { blank = o; return; }
      if (o.value === '__other') { other = o; return; }
      var g = provGroup(o.value); (groups[g] = groups[g] || []).push(o);
    });
    function tile(value, text, badgeName) {
      return '<button type="button" class="ptile' + (sel.value === value ? ' on' : '') + '" data-val="' + esc(value) + '" data-name="' + esc(text.toLowerCase()) + '">' +
        provBadge(badgeName) + '<span>' + esc(text) + '</span></button>';
    }
    var h = '';
    order.forEach(function (g) {
      if (!groups[g]) return;
      h += '<section class="pgroup"><h3>' + esc(names[g]) + '</h3><div class="pgrid">' + groups[g].map(function (o) { return tile(o.value, o.text, o.value); }).join('') + '</div></section>';
    });
    var extra = '';
    if (blank && (sel.id === 'h-chan' || sel.classList.contains('b-channel'))) extra += tile('', blank.text, '__none');
    if (other) extra += tile('__other', other.text, '__other');
    if (extra) h += '<section class="pgroup"><div class="pgrid">' + extra + '</div></section>';
    var count = sel.options.length;
    var el = document.createElement('div'); el.id = 'pickerwrap';
    el.innerHTML = '<div class="picker-back"></div><div class="picker" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header><h2>' + esc(title) + '</h2><button type="button" class="pclose">Close</button></header>' +
      (count > 9 ? '<div class="psearch"><input type="search" placeholder="Search" aria-label="Search" autocomplete="off"></div>' : '') +
      '<div class="pbody">' + h + '</div></div>';
    document.body.appendChild(el);
    PICKER = { el: el, sel: sel };
    history.pushState({ picker: 1 }, '');
    el.querySelector('.picker-back').addEventListener('click', function () { history.back(); });
    el.querySelector('.pclose').addEventListener('click', function () { history.back(); });
    el.querySelector('.pbody').addEventListener('click', function (e) {
      var t = e.target.closest('.ptile'); if (!t) return;
      sel.value = t.getAttribute('data-val');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      history.back();
      if (sel.value === '__other') setTimeout(function () { var ob = sel.parentNode.querySelector('.otherbox, #b-chan-other'); if (ob) ob.focus(); }, 80);
    });
    var q = el.querySelector('.psearch input');
    if (q) q.addEventListener('input', function () {
      var v = q.value.trim().toLowerCase();
      Array.prototype.forEach.call(el.querySelectorAll('.ptile'), function (t) { t.classList.toggle('hide', !!v && t.getAttribute('data-name').indexOf(v) < 0); });
      Array.prototype.forEach.call(el.querySelectorAll('.pgroup'), function (g) { g.classList.toggle('hide', !g.querySelector('.ptile:not(.hide)')); });
    });
  }
  /* Closes the picker. Returns true if one was open, so the back button only closes the picker. */
  function closePicker() {
    if (!PICKER) return false;
    PICKER.el.remove(); PICKER = null;
    return true;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = 'none'; }, Math.max(2400, msg.length * 65));
  }
  var STATUS_CLASS = { 'Paid': 'p-paid', 'Overpaid': 'p-overpaid', 'Outstanding': 'p-outstanding', 'Overdue': 'p-overdue', 'Bad debt': 'p-bad' };
  var TYPE_CLASS = { 'Regular': 'p-regular', 'Irregular': 'p-irregular', 'Inactive (90+ days)': 'p-inactive', 'Bad (high risk)': 'p-overdue', 'Do not give credit': 'p-bad' };
  var AGENT_TYPES = ['Assistant Agent', 'Master Agent', 'Regular Agent', 'Referral Agent', 'EVC Agent'];
  var TYPE_PILL = { 'Assistant Agent': 'p-assist', 'Master Agent': 'p-master', 'Regular Agent': 'p-irregular', 'Referral Agent': 'p-refer', 'EVC Agent': 'p-evc' };
  function typeList(t) { return String(t || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
  function typePills(t) { return typeList(t).map(function (x) { return pill(x, TYPE_PILL[x] || 'p-irregular'); }).join(' '); }
  function multiHTML(name, opts, value, cls) {
    var on = typeList(value);
    return '<div class="mchips">' + opts.map(function (o) { return '<button type="button" class="mchip' + (on.indexOf(o) >= 0 ? ' on' : '') + '" data-act="multiPick" data-v="' + esc(o) + '">' + esc(o.replace(/ Agent$/, '')) + '</button>'; }).join('') +
      '</div><input type="hidden"' + (name ? ' name="' + name + '"' : '') + (cls ? ' class="' + cls + '"' : '') + ' value="' + esc(on.join(', ')) + '">';
  }
  function setMulti(field, value) {
    if (!field) return;
    var on = typeList(value), hid = field.querySelector('input[type=hidden]');
    Array.prototype.forEach.call(field.querySelectorAll('.mchip'), function (b) { b.classList.toggle('on', on.indexOf(b.getAttribute('data-v')) >= 0); });
    if (hid) hid.value = on.join(', ');
  }
  function pill(text, cls) { return text ? '<span class="pill ' + (cls || 'p-paid') + '">' + esc(text) + '</span>' : ''; }
  function balanceText(b, big) {
    var cls = big ? 'big ' : 'amount ';
    if (b > 0) return '<span class="' + cls + 'c-owed">Owes ' + money(b) + '</span>';
    if (b < 0) return '<span class="' + cls + 'c-credit">Paid Ahead ' + money(-b) + '</span>';
    return '<span class="' + (big ? 'big ' : '') + 'c-muted" style="font-weight:600">Settled</span>';
  }
  function agentNetText(n, big) {
    var cls = big ? 'big ' : 'amount ';
    if (n > 0) return '<span class="' + cls + 'c-owed">Owes Us ' + money(n) + '</span>';
    if (n < 0) return '<span class="' + cls + '" style="color:var(--blue)">We Owe ' + money(-n) + '</span>';
    return '<span class="' + cls + 'c-muted">Settled</span>';
  }
  function kv(label, value) { return '<div class="kv"><span>' + esc(label) + '</span><b>' + value + '</b></div>'; }
  function empty(title, text, btn) { return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(text) + (btn || '') + '</div>'; }
  function seg(act, current, opts) {
    return '<div class="seg">' + opts.map(function (o) { return '<button type="button" data-act="' + act + '" data-v="' + esc(o[0]) + '" class="' + (current === o[0] ? 'on' : '') + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function lastMonths(n) {
    var p = R.today.split('-').map(Number), y = p[0], m = p[1], out = [];
    for (var i = 0; i < n; i++) { out.unshift(y + '-' + String(m).padStart(2, '0')); m--; if (m === 0) { m = 12; y--; } }
    return out;
  }
  function byNewest(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    var ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return (b.seq || 0) - (a.seq || 0);
  }
  function phoneLine(stored) {
    var p = C.phoneInfo(stored);
    if (p.empty) return 'No phone';
    return p.display + (p.network ? ' · ' + p.network : p.country && p.iso !== S.settings.profile.country ? ' · ' + p.country : '');
  }

  /* ================= Render ================= */
  function managed() { return !!(window.Sync && Sync.status().managed); }
  function signedIn() { return !!(window.Sync && Sync.status().signedIn); }
  function setLang(v) {
    S.meta.lang = v; I18N.setPref(v); UI.msgLang = '';
    saveLocal(); render();
  }
  function saveLocal() { return Store.set(S); }
  function langOptions(sel, withAuto) {
    var o = withAuto ? [['auto', I18N.t('Phone language') + ' (' + I18N.names[I18N.detect()] + ')']] : [];
    I18N.supported.forEach(function (k) { o.push([k, I18N.names[k]]); });
    return o.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === sel ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('');
  }
  function gateInstall() {
    if (isInstalled()) return '';
    if (deferredInstall) return '<button class="btn block install-btn" data-act="install">' + icon('install') + '<span>Install the App on This Phone</span></button>';
    if (isIOS()) return '<p class="hint" style="text-align:center">To install: tap the Share button, then Add to Home Screen.</p>';
    return '';
  }
  function langPicker() {
    return '<div class="langpick" data-noi18n><span aria-hidden="true">🌐</span><select id="lang-pick" aria-label="Language">' + langOptions(S.meta.lang || 'auto', true) + '</select></div>';
  }
  function countryOptions(sel) {
    var list = COUNTRIES.list.slice().sort(function (x, y) { return x.iso === 'GM' ? -1 : y.iso === 'GM' ? 1 : x.name.localeCompare(y.name); });
    return list.map(function (c) { return '<option value="' + c.iso + '"' + (c.iso === sel ? ' selected' : '') + '>' + esc(c.name) + ' (+' + c.dial + ')</option>'; }).join('');
  }
  // Sign-up sets the country and its currency but keeps the Classic colours. A country's own colours are a choice (Settings, Look).
  function setCountry(iso, withTheme) {
    var c = COUNTRIES.get(iso) || COUNTRIES.get('GM');
    S.settings.profile.country = c.iso; S.settings.currency = { symbol: c.cur, code: c.code };
    if (withTheme) S.settings.theme = c.theme;
    applyLocale();
  }
  function gateState() {
    if (UI.changing) return 'pinsetup';
    if (UI.forgot && window.Security && Security.enabled()) return 'forgot';
    if (UI.locked && window.Security && Security.enabled()) return 'lock';
    if (signedIn() && Security.passwordDue()) return 'password';
    var st = window.Sync ? Sync.status() : {};
    if (managed() && !st.signedIn && !S.meta.ownerUid && !S.meta.skipAccount) return 'welcome';
    var ready = !st.signedIn || st.ready;
    if (!S.settings.profile.name && !S.meta.profileSkipped && ready) return 'profile';
    if (!Security.enabled() && !S.meta.pinSkipped && (st.signedIn || !managed()) && ready) return 'pinsetup';
    return null;
  }
  var FEATURES = [['sales', 'Record data sales, deposits and wallet transfers'], ['agents', 'Track agent deals and float, both ways'],
    ['risk', 'See who owes you and who might not pay'], ['capital', 'Check that your money balances every day']];
  function featureList() {
    return '<ul class="feat">' + FEATURES.map(function (f) { return '<li><span class="ic">' + icon(f[0]) + '</span>' + esc(f[1]) + '</li>'; }).join('') + '</ul>';
  }
  function gateWelcome() {
    var s = Sync.status(), tab = UI.gateTab;
    var note = s.phase === 'nosdk' ? '<div class="form-info">You are offline. You can use the app on this phone now and create an account later.</div>'
      : s.phase === 'loading' ? '<div class="form-info">Connecting…</div>' : '';
    var panel;
    if (tab === 'create') panel = '<div class="card"><div class="field"><label for="gc-name">Your name or business name</label><input id="gc-name" autocomplete="organization" value="' + esc(UI.gName || '') + '"></div>' +
      '<div class="field"><label for="gc-country">Country</label><select id="gc-country">' + countryOptions(UI.gCountry || 'GM') + '</select></div>' +
      '<div class="field"><label for="sync-email">Email</label><input id="sync-email" type="email" autocomplete="username" value="' + esc(UI.syncEmail || '') + '"></div>' +
      '<div class="field"><label for="sync-pass">Password: 8+ letters and numbers</label><input id="sync-pass" type="password" autocomplete="new-password"></div>' +
      '<div id="sync-msg"></div><button class="btn kiosk block" data-act="gateCreate">Create my account</button>' +
      '<p class="hint" style="text-align:center;margin:10px 0 0">By continuing you accept the <a href="privacy.html" target="_blank" rel="noopener">privacy policy</a>.</p></div>';
    else if (tab === 'signin') panel = '<div class="card"><div class="field"><label for="sync-email">Email</label><input id="sync-email" type="email" autocomplete="username" value="' + esc(UI.syncEmail || '') + '"></div>' +
      '<div class="field"><label for="sync-pass">Password</label><input id="sync-pass" type="password" autocomplete="current-password"></div>' +
      '<div id="sync-msg"></div><button class="btn primary block" data-act="gateSignIn">Sign in</button>' +
      '<button class="btn block" data-act="syncReset" style="border:0;background:none;color:var(--ink-soft)">Forgot password?</button></div>';
    else panel = '<div class="card"><p class="hint" style="margin:0 0 10px">Your records stay only on this phone. You can create an account later to keep them online.</p>' +
      '<div class="field"><label for="gc-name">Your name or business name</label><input id="gc-name" value="' + esc(UI.gName || '') + '"></div>' +
      '<div class="field"><label for="gc-country">Country</label><select id="gc-country">' + countryOptions(UI.gCountry || 'GM') + '</select></div>' +
      '<div id="sync-msg"></div><button class="btn primary block" data-act="gateLocal">Start using the app</button></div>';
    return '<div class="gate bright">' + langPicker() + '<div class="gate-brand"><img src="icon-192.png" alt="" width="92" height="92"><h1>' + esc(APP_NAME) + '</h1>' + gateInstall() +
      '<p>Record data sales, wallet transfers and agent deals. Track every debt. Works without internet.</p></div>' + featureList() + note +
      seg('gateTab', tab, [['create', 'Create account'], ['signin', 'Sign in'], ['local', 'This phone only']]) + panel + '</div>';
  }
  function gateProfile() {
    var p = S.settings.profile;
    return '<div class="gate bright">' + langPicker() + '<div class="gate-brand"><img src="icon-192.png" alt="" width="80" height="80"><h1>Welcome</h1>' +
      '<p>Tell us who this account belongs to. Your name appears on your home screen.</p></div><div class="card">' +
      '<div class="field"><label for="gp-name">Your name or business name</label><input id="gp-name" autocomplete="organization" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label for="gp-country">Country</label><select id="gp-country">' + countryOptions(p.country) + '</select><div class="note">Sets your currency and how phone numbers are checked. You can change them later.</div></div>' +
      '<div id="gp-msg"></div><button class="btn primary block" data-act="saveProfileGate">Continue</button>' +
      '<button class="btn block" data-act="skipProfile" style="border:0;background:none;color:var(--ink-soft)">Skip for now</button></div>' +
      (S.sales.length || S.agents.length ? '' : '<div class="field" style="margin-top:10px"><label for="rs-pass">Backup Password, if it has one</label><input id="rs-pass" type="password" autocomplete="off"></div><button class="btn block" data-act="importBackup">I have a backup file to restore</button><input type="file" id="importFile" accept=".json,application/json" hidden>') + '</div>';
  }
  function dots(n, filled) { var h = ''; for (var i = 0; i < n; i++) h += '<i class="' + (i < filled ? 'on' : '') + '"></i>'; return '<div class="pin-dots">' + h + '</div>'; }
  function keypad(withBio) {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];
    return '<div class="pad">' + keys.map(function (k) {
      if (k === 'bio') return withBio ? '<button class="pk" data-act="pinBio" aria-label="Use fingerprint">' + icon('finger') + '</button>' : '<span></span>';
      if (k === 'del') return '<button class="pk" data-act="pinDel" aria-label="Delete">⌫</button>';
      return '<button class="pk" data-act="pinKey" data-k="' + k + '">' + k + '</button>';
    }).join('') + '</div>';
  }
  function gateLock() {
    var cfg = Security.cfg(), n = cfg.pinLen || 4, name = S.settings.profile.name;
    var wait = cfg.lockUntil && cfg.lockUntil > Date.now() ? Math.ceil((cfg.lockUntil - Date.now()) / 1000) : 0;
    return '<div class="gate lockscreen"><div class="gate-brand"><img src="icon-192.png" alt="" width="72" height="72"><h1>' + (name ? 'Welcome back,<br>' + esc(name) : 'Enter your PIN') + '</h1>' +
      '<p>' + (UI.pinMsg ? esc(UI.pinMsg) : 'Enter your PIN to open your records') + '</p></div>' + dots(n, UI.pin.length) +
      (wait ? '<div class="form-error" style="text-align:center">Too many wrong tries. Wait ' + wait + ' seconds.</div>' : '') +
      keypad(Security.bioEnabled()) +
      '<button class="btn block" data-act="lockForgot" style="border:0;background:none;color:var(--ink-soft)">Forgot PIN?</button></div>';
  }
  function gatePin() {
    var steps = ['', 'Choose a PIN', 'Type the PIN again', 'Use your fingerprint too?'], step = UI.pinStep || (UI.changing ? 0 : 1);
    var title = step === 0 ? 'Enter your current PIN' : steps[step];
    if (step === 3) return '<div class="gate lockscreen"><div class="gate-brand"><span class="bigic">' + icon('finger') + '</span><h1>Use your fingerprint?</h1>' +
      '<p>Open the app with your fingerprint or face, instead of typing the PIN each time. The PIN still works as a back-up.</p></div>' +
      '<button class="btn primary block" data-act="enableBio">Use fingerprint</button><button class="btn block" data-act="pinDone" style="margin-top:8px">Not now</button></div>';
    var n = step === 2 ? UI.pinFirst.length : 6;
    return '<div class="gate lockscreen"><div class="gate-brand"><span class="bigic">' + icon('lock') + '</span><h1>' + title + '</h1>' +
      '<p>' + (UI.pinMsg ? esc(UI.pinMsg) : step === 1 ? 'Protect your records. Choose 4 to 6 digits that only you know.' : step === 2 ? 'Type the same PIN once more.' : 'Type your PIN to continue.') + '</p></div>' +
      dots(step === 0 ? (Security.cfg().pinLen || 4) : n, UI.pinBuf.length) + keypad(false) +
      (step === 1 && UI.pinBuf.length >= 4 && UI.pinBuf.length < 6 ? '<button class="btn primary block" data-act="pinNext">Continue</button>' : '') +
      (!signedIn() && !UI.changing ? '<button class="btn block" data-act="pinSkip" style="border:0;background:none;color:var(--ink-soft)">Not now</button>' : '') +
      (UI.changing ? '<button class="btn block" data-act="pinCancel" style="border:0;background:none;color:var(--ink-soft)">Cancel</button>' : '') + '</div>';
  }
  function gatePassword() {
    var st = Sync.status();
    return '<div class="gate bright"><div class="gate-brand"><span class="bigic">' + icon('shield') + '</span><h1>Please sign in again</h1>' +
      '<p>For your safety, the app asks for your password every ' + Security.expireDays() + ' days.</p></div><div class="card">' +
      '<div class="field"><label>Email</label><input value="' + esc(st.email) + '" readonly></div>' +
      '<div class="field"><label for="gw-pass">Password</label><input id="gw-pass" type="password" autocomplete="current-password"></div>' +
      '<div id="gw-msg"></div><button class="btn primary block" data-act="passwordContinue">Continue</button>' +
      '<button class="btn block" data-act="passwordSignOut" style="border:0;background:none;color:var(--ink-soft)">Sign out</button></div></div>';
  }
  var GATES = { welcome: gateWelcome, profile: gateProfile, lock: gateLock, pinsetup: gatePin, password: gatePassword, forgot: gateForgot };
  function render() {
    var v = cur(), root = document.getElementById('app'), g = gateState(); UI.lastGate = g;
    if (!g) markAlive();
    document.body.classList.toggle('hide-amounts', !!S.meta.hideAmounts);
    if (g) {
      if (UI.sheetOpen) { saveDraft(true); UI.resumeTried = false; removeSheet(); }
      root.innerHTML = GATES[g]();
      if (g === 'lock' && Security.bioEnabled() && !UI.bioTried) { UI.bioTried = true; setTimeout(function () { ACT.pinBio(); }, 300); }
      return;
    }
    var title = TITLES[v.v] || '';
    if (v.v === 'customer') { var c = findCustomer(v.key); title = c ? (c.name || c.phone) : 'Customer'; }
    if (v.v === 'agent') { var a = findAgent(v.key); title = a ? a.name : 'Agent'; }
    var top = '<header class="topbar">' + (UI.stack.length > 1 ? '<button class="back" data-act="back" aria-label="Back">‹</button>' : '') +
      '<h1>' + esc(title) + '</h1>' + syncBadge() +
      '<button class="eye" data-act="toggleHide" aria-label="' + (S.meta.hideAmounts ? 'Show amounts' : 'Hide amounts') + '">' + icon(S.meta.hideAmounts ? 'eyeoff' : 'eye') + '</button></header>';
    var body = (VIEWS[v.v] || VIEWS.home)(v);
    root.innerHTML = top + '<main>' + body + '</main>' + navBar() + fab(v);
    if (LISTS[v.v]) renderList();
    decorateRows(); enhancePickers(root); foldHints(root);
    if (UI.pendingShare && !UI.sheetOpen) { var ps = UI.pendingShare; UI.pendingShare = null; UI.resumeTried = true; setTimeout(function () { openCapture(ps.text, ps.id, ps.when); }, 60); }
    else if (!UI.resumeTried && !UI.sheetOpen) {
      UI.resumeTried = true;
      var act = draftsGet().filter(function (x) { return x.active; }).sort(function (a, b) { return b.at - a.at; })[0];
      if (act) setTimeout(function () { if (!UI.sheetOpen) resumeDraft(act); }, 80);
    }
  }
  function navBar() {
    var t = UI.stack[0].v;
    var items = [['home', 'Home'], ['customers', 'Customers'], ['agents', 'Agents'], ['history', 'History'], ['settings', 'Settings']];
    return '<nav class="nav" aria-label="Main">' + items.map(function (i) {
      return '<button data-act="tab" data-v="' + i[0] + '" class="n-' + i[0] + (t === i[0] ? ' on' : '') + '"' + (t === i[0] ? ' aria-current="page"' : '') + '><span class="ni">' + icon(i[0]) + '</span><span>' + i[1] + '</span></button>';
    }).join('') + '</nav>';
  }
  function fab(v) {
    var map = { history: ['newSale', 'New Sale'], customers: ['newSale', 'New Sale'], customer: ['newSaleFor', 'New Sale'],
      agents: ['newAgent', 'New Agent Entry'], agent: ['newAgentFor', 'New Entry'], losses: ['newError', 'Log an Error'],
      capital: ['newCapital', 'Record Balances'], daily: ['newCapital', 'Record Balances'], expenses: ['newExpense', 'New Expense'] };
    if (v.v === 'comm') map.comm = UI.commTab === 'evc' ? ['newEvc', 'New EVC Entry'] : UI.commTab === 'wallet' ? ['newWallet', 'New Commission'] : null;
    if (v.v === 'ref' && UI.refTab === 'sales') map.ref = ['newRef', 'New Referral Sale'];
    var f = map[v.v];
    if (!f) return '';
    return '<button class="fab" data-act="' + f[0] + '" data-key="' + esc(v.key || '') + '"><span class="plus" aria-hidden="true">+</span>' + f[1] + '</button>';
  }

  function findCustomer(key) { for (var i = 0; i < R.customers.length; i++) if (R.customers[i].key === key) return R.customers[i]; return null; }
  function findAgent(key) { for (var i = 0; i < R.agents.balances.length; i++) if (R.agents.balances[i].key === key) return R.agents.balances[i]; return null; }

  /* ================= Views ================= */
  var VIEWS = {};

  function viaBank(v) { return v.channel === 'Bank Transfer' || v.channel === 'Microfinance'; }
  function bankLabel(v) { return v && v.channel === 'Microfinance' ? 'Which Microfinance?' : 'Which Bank?'; }
  function tip(mode) { return mode === 'included' ? 'Tips (inside payments)' : mode === 'passon' ? 'Tips to Hand Over' : 'Tips (extra income)'; }
  function tile(color, act, v, ic, title, sub) {
    return '<button class="tile ' + color + '" data-act="' + act + '" data-v="' + v + '"><span class="ic">' + icon(ic) + '</span><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></button>';
  }
  function recordSections() {
    var rk = R.risk.summary;
    return '<div class="section-title">Sales and Customers</div><div class="tiles">' +
      tile('green', 'tab', 'history', 'history', 'History', 'Every day, with filters') + tile('blue', 'tab', 'customers', 'customers', 'Customers', R.customers.length + ' customers') +
      tile('red', 'go', 'risk', 'risk', 'Risk Check', rk.high ? rk.high + ' high risk' : 'Who might not pay') + tile('green', 'go', 'share', 'chat', 'Send a Reminder', 'On WhatsApp') + '</div>' +
      '<div class="section-title">Agents and Partners</div><div class="tiles">' +
      tile('blue', 'tab', 'agents', 'agents', 'Agents', 'Float and deals') + tile('blue', 'go', 'ref', 'customers', 'Referral Agents', 'Sales for other agents') +
      tile('green', 'go', 'comm', 'comm', 'Commissions', 'Wallets and EVC') + '</div>' +
      '<div class="section-title">Money</div><div class="tiles">' +
      tile('green', 'go', 'daily', 'cash', 'Daily Cash Check', 'Does your money balance?') + tile('blue', 'go', 'recon', 'recon', 'Monthly Balance Check', 'Month by month') +
      tile('blue', 'go', 'capital', 'capital', 'Capital Portfolio', 'Available and working capital') + tile('red', 'go', 'expenses', 'expense', 'Expenses and Money Out', money(R.expenses.total) + ' recorded') +
      tile('red', 'go', 'losses', 'loss', 'Losses and Errors', 'Write-offs and mistakes') + '</div>';
  }
  function sc(act, ic, label, v, col) {
    return '<button class="sc" data-act="' + act + '"' + (v ? ' data-v="' + v + '"' : '') + '><span class="ic ' + (col || 'c-blue') + '">' + icon(ic) + '</span><span>' + esc(label) + '</span></button>';
  }
  function tool(act, v, ic, label, badge, col) {
    return '<button class="tool" data-act="' + act + '" data-v="' + v + '"><span class="ic ' + (col || 'c-blue') + '">' + icon(ic) + (badge ? '<i class="dot">' + badge + '</i>' : '') + '</span><span>' + esc(label) + '</span></button>';
  }
  VIEWS.home = function () {
    var t = R.totals, today = R.today, h = '', name = S.settings.profile.name;
    var hasData = S.sales.length || S.agents.length || S.expenses.length;
    var dayNow = R.daily.filter(function (d) { return d.date === today; })[0] || { count: 0, received: 0 };
    var ag = { collect: 0, pay: 0, n: 0 };
    R.agents.balances.forEach(function (x) { if (x.net > 0) { ag.collect += x.net; ag.n++; } else ag.pay -= x.net; });
    var owing = R.customers.filter(function (c) { return c.owed > 0; }).length;
    h += installCard() + verifyBanner() + backupBanner() + deviceBanner();
    h += '<div class="hero"><div class="hero-top"><div><div class="hello">' + (name ? 'Welcome, <b>' + esc(name) + '</b>' : 'Welcome') + '</div><div class="hdate">' + esc(readable(today)) + '</div></div>' +
      '<span class="hero-count"><b>' + dayNow.count + '</b> ' + (dayNow.count === 1 ? 'entry today' : 'entries today') + '</span></div>' +
      '<div class="label">Money received today</div><div class="big">' + money(dayNow.received) + '</div>' +
      '<div class="hero-acts"><button class="btn-new" data-act="newSale"><span class="plus">+</span><span>New Sale</span></button>' +
      '<button class="btn-msg" data-act="captureOpen" aria-label="Record from a message">' + icon('chat') + '<span>Message</span></button></div></div>';
    h += '<div class="shortcuts">' + sc('newPayment', 'pay', 'Debt Paid', '', 'c-green') + sc('newAgent', 'agents', 'Agent', '', 'c-purple') + sc('newExpense', 'expense', 'Money Out', '', 'c-orange') +
      sc('newCapital', 'cash', 'Balances', '', 'c-teal') + '</div>';
    h += '<div class="owed"><button data-act="custFilterGo" data-v="owing"><span class="lab">Owed to Us</span><b class="c-owed">' + money(r2(t.owed + ag.collect)) + '</b>' +
      '<small>' + owing + ' ' + (owing === 1 ? 'customer' : 'customers') + ' · ' + ag.n + ' ' + (ag.n === 1 ? 'agent' : 'agents') + '</small></button>' +
      '<button data-act="tab" data-v="agents"><span class="lab">We Owe</span><b>' + money(r2(t.credit + ag.pay)) + '</b><small>Agents and advances</small></button></div>';
    var chips = '', waiting = inboxGet().length, nDrafts = draftsGet().length;
    if (nDrafts) chips += '<button class="chipa draft" data-act="draftsOpen">' + icon('rules') + '<span>' + nDrafts + (nDrafts === 1 ? ' draft' : ' drafts') + '</span></button>';
    if (waiting) chips += '<button class="chipa msg" data-act="capInbox">' + icon('chat') + '<span>' + waiting + (waiting === 1 ? ' message to record' : ' messages to record') + '</span></button>';
    if (R.risk.alerts.length) chips += '<button class="chipa warn" data-act="go" data-v="risk">' + icon('risk') + '<span>' + R.risk.alerts.length + (R.risk.alerts.length === 1 ? ' risk alert' : ' risk alerts') + '</span></button>';
    if (t.overdue) chips += '<button class="chipa" data-act="salesFilterGo" data-v="overdue">' + icon('history') + '<span>' + t.overdue + ' overdue</span></button>';
    if (chips) h += '<div class="chipline">' + chips + '</div>';
    if (!hasData) h += '<p class="hint" style="text-align:center;margin:4px 0 12px">No entries yet. Tap New Sale to start.</p>';
    var rk = R.risk.summary;
    var mainTools = tool('go', 'reports', 'chart', 'Reports', '', 'c-blue') + tool('go', 'share', 'chat', 'Reminders', '', 'c-teal') + tool('go', 'daily', 'cash', 'Cash Check', '', 'c-green') +
      tool('go', 'comm', 'comm', 'Commissions', '', 'c-purple') + tool('go', 'risk', 'risk', 'Risk', rk.high || '', 'c-orange') + tool('go', 'expenses', 'expense', 'Money Out', '', 'c-orange') +
      tool('go', 'capital', 'capital', 'Capital', '', 'c-blue');
    var moreTools = tool('go', 'recon', 'recon', 'Monthly Check', '', 'c-blue') + tool('go', 'ref', 'customers', 'Referrals', '', 'c-teal') + tool('go', 'losses', 'loss', 'Losses', '', 'c-orange') +
      tool('go', 'backup', 'backup', 'Backup', '', 'c-green') + tool('go', 'security', 'lock', 'Security', '', 'c-purple') + tool('go', 'help', 'help', 'Help', '', 'c-blue');
    var toggle = '<button class="tool" data-act="moreTools"><span class="ic c-gray">' + icon(UI.moreTools ? 'plus' : 'more') + '</span><span>' + (UI.moreTools ? 'Less' : 'More') + '</span></button>';
    h += '<div class="toolgrid' + (UI.moreTools ? ' open' : '') + '">' + mainTools + (UI.moreTools ? moreTools : '') + toggle + '</div>';
    var recent = histRows().sort(entryNewer).slice(0, 3);
    if (recent.length) h += '<div class="sec-head"><b>Recent</b><button data-act="tab" data-v="history">See all</button></div><div class="recent">' + recent.map(entryRow).join('') + '</div>';
    return h;
  };
  /* Bad debt: amounts written off as never to be paid, grouped by the customer or agent they belong to. */
  function badDebts() {
    var map = {}, month = R.today.slice(0, 7), total = 0, monthTotal = 0;
    function add(kind, key, name, phone, r, reason) {
      var amt = num(r.writtenOff); if (!(amt > 0)) return;
      var k = kind + '|' + key, g = map[k] || (map[k] = { kind: kind, key: key, name: name, phone: phone || '', amount: 0, count: 0, last: '', reasons: {} });
      g.amount = r2(g.amount + amt); g.count++; if ((r.date || '') > g.last) g.last = r.date || '';
      if (reason) g.reasons[reason] = 1;
      total = r2(total + amt); if ((r.date || '').slice(0, 7) === month) monthTotal = r2(monthTotal + amt);
    }
    R.sales.forEach(function (r) { add('cust', r.key, r.name, r.phone, r, r.woReason); });
    R.agents.rows.forEach(function (r) { add('agent', C.agentKey(r.name), r.name, r.phone, r, r.woReason); });
    var list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.amount - a.amount; });
    return { list: list, total: total, month: monthTotal };
  }
  function badDebtTab() {
    var bd = badDebts(), h = '';
    h += '<div class="figures"><div class="figure"><div class="label">Bad Debt, All Time</div><div class="big ' + (bd.total ? 'c-late' : '') + '">' + money(bd.total) + '</div></div>' +
      '<div class="figure"><div class="label">This Month</div><div class="big ' + (bd.month ? 'c-late' : '') + '">' + money(bd.month) + '</div></div></div>';
    if (!bd.list.length) return h + empty('No bad debt', 'When you write off money that will not be paid, it shows here with the customer or agent it belongs to.');
    h += '<p class="hint">Money written off as never to be paid. Tap a name to see their records.</p>';
    return h + bd.list.map(function (g) {
      var reasons = Object.keys(g.reasons).join(', ');
      return '<button class="row" data-act="' + (g.kind === 'cust' ? 'openCustomer' : 'openAgent') + '" data-key="' + esc(g.key) + '"><div class="top"><div><div class="name">' + esc(g.name || 'No name') + '</div>' +
        '<div class="detail">' + esc((g.kind === 'cust' ? 'Customer' : 'Agent') + (g.phone ? ' · ' + phoneLine(g.phone) : '')) + '</div></div><span class="amount c-late">' + money(g.amount) + '</span></div>' +
        '<div class="bottom"><span class="c-muted">' + esc(g.count + (g.count === 1 ? ' write-off' : ' write-offs') + ', last ' + shortDate(g.last)) + '</span></div>' +
        (reasons ? '<div class="detail" style="margin-top:4px">' + esc(reasons) + '</div>' : '') + '</button>';
    }).join('');
  }
  VIEWS.reports = function () {
    var tabs = seg('repTab', UI.repTab || 'overview', [['overview', 'Overview'], ['baddebt', 'Bad Debt']]);
    if (UI.repTab === 'baddebt') return tabs + badDebtTab();
    var t = R.totals, month = R.today.slice(0, 7), h = tabs;
    var lossM = (R.losses.byMonth.filter(function (x) { return x.month === month; })[0] || {}).amount || 0;
    var commM = (R.commMonths.filter(function (x) { return x.month === month; })[0] || {}).total || 0;
    var mNow = R.months.filter(function (x) { return x.month === month; })[0] || { tips: 0, billed: 0, paid: 0 };
    h += '<div class="figures">' +
      '<button class="figure" data-act="custFilterGo" data-v="owing" style="text-align:left"><div class="label">Customers Owe Us</div><div class="big c-owed">' + money(t.owed) + '</div></button>' +
      '<button class="figure" data-act="custFilterGo" data-v="credit" style="text-align:left"><div class="label">Paid in Advance</div><div class="big c-credit">' + money(t.credit) + '</div></button>' +
      '<button class="figure" data-act="salesFilterGo" data-v="overdue" style="text-align:left"><div class="label">Overdue Sales</div><div class="big ' + (t.overdue ? 'c-late' : '') + '">' + t.overdue + '</div></button>' +
      '<button class="figure" data-act="go" data-v="rules" style="text-align:left"><div class="label">' + tip(R.tipMode) + '</div><div class="big c-credit">' + money(mNow.tips) + '</div><div class="sub">This month. All time ' + money(t.tips) + '</div></button>' +
      '<button class="figure" data-act="go" data-v="comm" style="text-align:left"><div class="label">Commission This Month</div><div class="big c-credit">' + money(commM) + '</div><div class="sub">All time ' + money(t.commission) + '</div></button>' +
      '<button class="figure" data-act="go" data-v="losses" style="text-align:left"><div class="label">Losses This Month</div><div class="big ' + (lossM ? 'c-late' : '') + '">' + money(lossM) + '</div><div class="sub">All time ' + money(R.losses.total) + '</div></button>' +
      '<button class="figure wide" data-act="go" data-v="capital" style="text-align:left"><div class="label">Working Capital</div><div class="big">' + (R.capital.rows[0] ? money(R.capital.rows[0].working) : '—') + '</div><div class="sub">' + (R.capital.rows[0] ? 'From ' + esc(shortDate(R.capital.rows[0].date)) : 'Record your balances') + '</div></button></div>';
    var bdx = badDebts();
    h = h.replace('<div class="figures">', '<div class="figures"><button class="figure" data-act="repTab" data-v="baddebt" style="text-align:left"><div class="label">Bad Debt</div><div class="big ' + (bdx.total ? 'c-late' : '') + '">' + money(bdx.total) + '</div><div class="sub">' + bdx.list.length + (bdx.list.length === 1 ? ' person' : ' people') + '</div></button>');
    h += chartMonthly() + chartTopOwing() + chartCustomerMix() + chartCommission();
    return h;
  };


  function qa(color, act, ic, label, v) {
    return '<button class="qa ' + color + '" data-act="' + act + '"' + (v ? ' data-v="' + v + '"' : '') + '><span class="ic">' + icon(ic) + '</span><span>' + esc(label) + '</span></button>';
  }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream; }
  function isInstalled() { return !!NATIVE || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function installCard() {
    if (isInstalled() || S.meta.installHidden) return '';
    if (deferredInstall) return '<div class="install"><img src="icon-192.png" alt="" width="44" height="44"><div class="tx"><b>Install the app</b><small>Opens like any app on your phone. Free and safe.</small></div>' +
      '<button class="btn primary" data-act="install">Install</button><button class="x" data-act="hideInstall" aria-label="Close">×</button></div>';
    if (isIOS()) return '<div class="install"><img src="icon-192.png" alt="" width="44" height="44"><div class="tx"><b>Install the app</b><small>Tap the Share button, then Add to Home Screen.</small></div><button class="x" data-act="hideInstall" aria-label="Close">×</button></div>';
    return '';
  }
  function verifyCard(s) {
    if (!s.signedIn || s.verified) return '';
    return '<div class="card verify"><b>Confirm your email</b><p class="hint" style="margin:6px 0 10px">Open the link we sent to ' + esc(s.email) + ', then tap below.</p>' +
      '<div id="verify-msg"></div><div class="actions"><button class="btn primary" data-act="verifyCheck">I Have Confirmed</button><button class="btn" data-act="verifySend">Send Link Again</button></div></div>';
  }
  function verifyBanner() {
    var s = window.Sync ? Sync.status() : null;
    if (!s || !s.signedIn || s.verified) return '';
    return '<div class="banner"><span>Confirm your email so your records keep going online.</span><button class="btn" data-act="go" data-v="sync">Confirm</button></div>';
  }
  function backupBanner() {
    if (window.Sync && Sync.status().signedIn) return '';
    if (!S.sales.length && !S.agents.length) return '';
    var lb = S.meta.lastBackup, days = lb ? C.toDays(R.today) - C.toDays(lb) : null;
    if (lb && days < 7) return '';
    return '<div class="banner"><span>' + (lb ? 'Last backup was ' + days + ' days ago.' : 'You have not saved a backup yet.') + ' Your records only live on this phone.</span>' +
      '<button class="btn" data-act="go" data-v="backup">Back up</button></div>';
  }

  function chartMonthly() {
    var months = lastMonths(6), map = {};
    R.months.forEach(function (m) { map[m.month] = m; });
    var max = 1;
    months.forEach(function (k) { var m = map[k] || {}; max = Math.max(max, num(m.billed), num(m.paid)); });
    var cols = months.map(function (k) {
      var m = map[k] || {};
      return '<div class="grp" title="' + esc(monthName(k)) + '">' +
        '<div class="bar" style="background:var(--blue);height:' + (num(m.billed) / max * 100).toFixed(1) + '%"></div>' +
        '<div class="bar" style="background:var(--credit);height:' + (num(m.paid) / max * 100).toFixed(1) + '%"></div></div>';
    }).join('');
    var labels = months.map(function (k) { return '<span>' + I18N.fmt.monthShort(Number(k.slice(5)) - 1) + '</span>'; }).join('');
    var cur = map[R.today.slice(0, 7)] || {};
    return '<div class="chart"><h3>Billed and Paid, Last 6 Months</h3>' +
      '<div class="legend"><span><i style="background:var(--blue)"></i>Billed</span><span><i style="background:var(--credit)"></i>Paid</span>' + (max > 1 ? '<span>Highest: ' + compact(max) + '</span>' : '') + '</div>' +
      '<div class="cols" role="img" aria-label="Billed and received by month">' + cols + '</div><div class="col-labels">' + labels + '</div>' +
      '<p class="hint" style="margin:8px 0 0">This month: billed ' + money(cur.billed || 0) + ', paid ' + money(cur.paid || 0) + (num(cur.tips) ? ', tips ' + money(cur.tips) : '') + '.</p></div>';
  }
  function hbars(items, color) {
    var max = 1; items.forEach(function (i) { max = Math.max(max, Math.abs(i.value)); });
    return items.map(function (i) {
      return '<div class="hbar"><span class="lab">' + esc(i.label) + '</span><div class="track"><div class="fill" style="width:' + (Math.abs(i.value) / max * 100).toFixed(1) + '%;background:' + (i.color || color) + '"></div></div><span class="val">' + (i.text || compact(i.value)) + '</span></div>';
    }).join('');
  }
  function chartTopOwing() {
    var top = R.customers.filter(function (c) { return c.owed > 0; }).slice(0, 5);
    if (!top.length) return '';
    return '<div class="chart"><h3>Biggest amounts to collect</h3><p class="hint" style="margin:0 0 6px">Chase these first.</p>' +
      hbars(top.map(function (c) { return { label: c.name || c.phone, value: c.owed, text: money(c.owed) }; }), 'var(--owed)') + '</div>';
  }
  function chartCustomerMix() {
    var order = [['Regular', 'var(--credit)'], ['Irregular', 'var(--ink-soft)'], ['Inactive (90+ days)', '#9AA7B4'], ['Bad (high risk)', 'var(--late)'], ['Do not give credit', '#3D2A28']];
    var items = order.filter(function (o) { return R.types[o[0]]; }).map(function (o) { return { label: o[0], value: R.types[o[0]], color: o[1], text: String(R.types[o[0]]) }; });
    if (!items.length) return '';
    return '<div class="chart"><h3>Your customers</h3><p class="hint" style="margin:0 0 6px">Regular means 3 or more sales and at least one a month.</p>' + hbars(items) + '</div>';
  }
  function chartCommission() {
    var by = {};
    R.walletComm.forEach(function (r) { if (r.wallet) by[r.wallet] = r2((by[r.wallet] || 0) + r.net); });
    R.evc.forEach(function (r) { if (r.provider) by[r.provider] = r2((by[r.provider] || 0) + r.net); });
    var items = Object.keys(by).filter(function (k) { return by[k]; }).map(function (k) { return { label: k, value: by[k] }; }).sort(function (a, b) { return b.value - a.value; });
    if (!items.length) return '<div class="chart"><h3>Commission by wallet and EVC</h3><p class="hint" style="margin:0">Nothing yet. Add commission entries from the home screen, under Commissions.</p></div>';
    return '<div class="chart"><h3>Commission by wallet and EVC</h3><p class="hint" style="margin:0 0 6px">Net, after partner and agent shares.</p>' + hbars(items, 'var(--credit)') + '</div>';
  }

  /* ----- History: every day, every kind of entry ----- */
  var LISTS = {};
  var H_TYPES = [['all', 'Everything'], ['data', 'Data / Deposit'], ['exchange', 'Wallet Exchange'], ['payment', 'Customer Paid'], ['agent', 'Agent Entries'], ['referral', 'Referral Sales'], ['expense', 'Money Out']];
  var H_RANGES = [['all', 'All Time'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 Days'], ['month', 'This Month'], ['custom', 'Pick Dates']];
  function histRows() {
    var out = [];
    R.sales.forEach(function (r) { out.push({ t: r.isPayment ? 'payment' : r.kind === 'WE' ? 'exchange' : 'data', date: r.date, time: r.time || '', seq: r.seq || 0, rec: r }); });
    R.agents.rows.forEach(function (r) { out.push({ t: 'agent', date: r.date, time: r.time || '', seq: r.seq || 0, rec: r }); });
    R.referrals.rows.forEach(function (r) { out.push({ t: 'referral', date: r.date, time: r.time || '', seq: r.seq || 0, rec: r }); });
    R.expenses.rows.forEach(function (r) { out.push({ t: 'expense', date: r.date, time: r.time || '', seq: r.seq || 0, rec: r }); });
    return out;
  }
  function entryNewer(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : a.time < b.time ? 1 : a.time > b.time ? -1 : b.seq - a.seq; }
  function inHistRange(d) {
    var r = UI.hRange, T = R.today;
    if (r === 'all') return true;
    if (r === 'today') return d === T;
    if (r === 'yesterday') return d === addDays(T, -1);
    if (r === 'week') return d >= addDays(T, -6) && d <= T;
    if (r === 'month') return d.slice(0, 7) === T.slice(0, 7);
    if (r === 'custom') return (!UI.hFrom || d >= UI.hFrom) && (!UI.hTo || d <= UI.hTo);
    return true;
  }
  function channelsUsed() {
    var set = {}; S.sales.forEach(function (r) { if (r.channel) set[r.channel] = 1; });
    return Object.keys(set).sort();
  }
  VIEWS.history = function () {
    var chips = function (act, cur, list) {
      return '<div class="chips">' + list.map(function (c) { return '<button data-act="' + act + '" data-v="' + c[0] + '" class="' + (cur === c[0] ? 'on' : '') + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>';
    };
    return '<input class="search" id="q-hist" type="search" placeholder="Search name, phone, reference or details" aria-label="Search history" value="' + esc(UI.hQuery) + '">' +
      chips('hType', UI.hType, H_TYPES) + chips('hRange', UI.hRange, H_RANGES) +
      (UI.hRange === 'custom' ? '<div class="two"><div class="field"><label for="h-from">From</label><input id="h-from" type="date" value="' + esc(UI.hFrom) + '"></div><div class="field"><label for="h-to">To</label><input id="h-to" type="date" value="' + esc(UI.hTo) + '"></div></div>' : '') +
      '<div class="two"><div class="field"><label for="h-status">Payment Status</label><select id="h-status">' + [['all', 'All'], ['notpaid', 'Not Fully Paid'], ['overdue', 'Overdue'], ['paid', 'Paid or Overpaid']].map(function (o) { return '<option value="' + o[0] + '"' + (UI.hStatus === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="h-chan">Paid Through</label><select id="h-chan" data-pick="1"><option value="">All</option>' + channelsUsed().map(function (c) { return '<option' + (UI.hChannel === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div></div>' +
      '<div id="hist-count" class="hint"></div><div id="list"></div>';
  };
  LISTS.history = function () {
    var q = UI.hQuery.trim().toLowerCase(), t = UI.hType, st = UI.hStatus, ch = UI.hChannel;
    var rows = histRows().filter(function (e) {
      if (t !== 'all' && e.t !== t) return false;
      if (!inHistRange(e.date || '')) return false;
      var r = e.rec, isSale = e.t === 'data' || e.t === 'exchange' || e.t === 'payment';
      if (st !== 'all') {
        if (!isSale) return false;
        if (st === 'notpaid' && !(r.remaining > 0)) return false;
        if (st === 'overdue' && r.status !== 'Overdue') return false;
        if (st === 'paid' && !(r.status === 'Paid' || r.status === 'Overpaid')) return false;
      }
      if (ch) { if (!isSale || r.channel !== ch) return false; }
      if (q && (String(r.name || r.agent || r.client || r.category || '') + ' ' + (r.phone || '') + ' ' + (r.agentPhone || '') + ' ' + (r.refId || '') + ' ' + (r.details || r.desc || r.note || '') + ' ' + (r.beneficiary || '') + ' ' + (r.txNumber || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(entryNewer);
    var cnt = document.getElementById('hist-count'); if (cnt) cnt.textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries');
    if (!rows.length) return histCount() ? empty('Nothing matches', 'Try a different search, day or filter.') : empty('No entries yet', 'Tap the green button to record your first sale.');
    return groupedList(rows);
  };
  function histCount() { return S.sales.length + S.agents.length + S.referrals.length + S.expenses.length; }
  function entryRow(e) {
    return e.t === 'agent' ? agentRow(e.rec) : e.t === 'referral' ? refRow(e.rec) : e.t === 'expense' ? expenseRow(e.rec) : saleRow(e.rec);
  }
  function groupedList(rows) {
    var shown = rows.slice(0, UI.limit), h = '', lastM = '', lastD = '', dayN = {};
    rows.forEach(function (e) { dayN[e.date] = (dayN[e.date] || 0) + 1; });
    var monthStats = {}; R.months.forEach(function (m) { monthStats[m.month] = m; });
    var dayStats = {}; R.daily.forEach(function (d) { dayStats[d.date] = d; });
    shown.forEach(function (e) {
      var m = (e.date || '').slice(0, 7);
      if (m !== lastM) {
        var ms = monthStats[m];
        h += '<div class="month-head"><h2>' + esc(monthName(m) || 'No Date') + '</h2><span class="meta">' + (ms ? ms.count + (ms.count === 1 ? ' sale' : ' sales') + ', paid ' + money(ms.paid) : '') + '</span></div>';
        lastM = m; lastD = '';
      }
      if (e.date !== lastD) {
        var ds = dayStats[e.date];
        h += '<div class="day-head"><span>' + esc(e.date ? dayHead(e.date) : 'No Date') + '</span><span class="meta">' + dayN[e.date] + (dayN[e.date] === 1 ? ' entry' : ' entries') + (ds ? ', money in ' + money(ds.received) : '') + '</span></div>';
        lastD = e.date;
      }
      h += entryRow(e);
    });
    if (rows.length > shown.length) h += '<button class="more-btn" data-act="showMore">Show more (' + (rows.length - shown.length) + ' older)</button>';
    return h;
  }
  /* One short row per sale: who and how much on top, then the state of the money and how it was paid. */
  function viaOf(r) { return r.bank && viaBank(r) ? r.bank : r.channel; }
  function viaChip(r) { var via = viaOf(r); return via ? '<span class="via">' + provBadge(via, 'xs') + '<span>' + esc(via) + '</span></span>' : ''; }
  function saleRow(r) {
    var what = r.isPayment ? 'Debt Payment' : (r.details || (r.kind === 'WE' ? (r.exType || 'Wallet Exchange') : 'Data / Deposit'));
    var amount = r.isPayment ? '<span class="amount c-credit">+' + money(num(r.received)) + '</span>' : '<span class="amount">' + money(r.billed) + '</span>';
    var state = '';
    if (!r.isPayment && r.billedSet) {
      if (r.balance > 0) state = '<span class="state owe">' + (r.status === 'Overdue' ? 'Overdue · ' : '') + 'Owes ' + money(r.balance) + (r.daysOverdue ? ' · ' + r.daysOverdue + ' days' : '') + '</span>';
      else if (r.balance < 0) state = '<span class="state ahead">Paid Ahead ' + money(-r.balance) + '</span>';
      else state = '<span class="state ok">Paid</span>';
    }
    return '<button class="row" data-act="editSale" data-id="' + esc(r.id) + '">' +
      '<div class="top"><div><div class="name">' + esc(r.name || 'No name') + '</div><div class="detail">' + esc(what) + (r.time ? ' · ' + esc(r.time) : '') + '</div></div>' + amount + '</div>' +
      ((state || viaOf(r)) ? '<div class="bottom">' + (state || '<span></span>') + viaChip(r) + '</div>' : '') + '</button>';
  }
  function refRow(r) {
    return '<button class="row" data-act="editRef" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.agent || 'No agent') + '</div><div class="detail">Referral Sale' + (r.time ? ' · ' + esc(r.time) : '') + ' · ' + esc(r.service || '') + ' · ' + esc(r.refId) + '</div></div><span class="amount">' + money(num(r.amount)) + '</span></div>' +
      '<div class="bottom"><span class="c-muted num">Commission ' + money(r.commission) + ', agent\'s share ' + money(r.agentCut) + '</span><span class="amount c-credit">' + money(r.net) + '</span></div></button>';
  }
  function expenseRow(r) {
    return '<button class="row" data-act="editExpense" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.category || 'Money Out') + '</div><div class="detail">' + esc(r.note || '') + (r.time ? ' · ' + esc(r.time) : '') + ' · ' + esc(r.refId) + (r.from ? ' · from ' + esc(r.from) : '') + '</div></div><span class="amount c-late">' + money(num(r.amount)) + '</span></div></button>';
  }

  /* ----- Customers ----- */
  VIEWS.customers = function () {
    var t = R.totals;
    return '<input class="search" id="q-cust" type="search" placeholder="Search name or phone" aria-label="Search customers" value="' + esc(UI.custQuery) + '">' +
      '<div class="chips">' + [['all', 'All'], ['owing', 'Owing'], ['credit', 'Paid Ahead'], ['Regular', 'Regular'], ['Irregular', 'Irregular'], ['bad', 'Bad or No Credit']].map(function (c) {
        return '<button data-act="custFilter" data-v="' + c[0] + '" class="' + (UI.custFilter === c[0] ? 'on' : '') + '">' + c[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="hint">' + R.customers.length + ' customers · owing ' + money(t.owed) + ' · paid ahead ' + money(t.credit) + '</p><div id="list"></div>';
  };
  LISTS.customers = function () {
    var q = UI.custQuery.trim().toLowerCase(), f = UI.custFilter;
    var rows = R.customers.filter(function (c) {
      if (f === 'owing' && !(c.owed > 0)) return false;
      if (f === 'credit' && !(c.credit > 0)) return false;
      if (f === 'Regular' && c.type !== 'Regular') return false;
      if (f === 'Irregular' && c.type.indexOf('Irregular') !== 0 && c.type.indexOf('Inactive') !== 0) return false;
      if (f === 'bad' && c.type !== 'Bad (high risk)' && c.type !== 'Do not give credit') return false;
      if (q && (c.name + ' ' + c.phone).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (!rows.length) return empty(R.customers.length ? 'No matching customers' : 'No customers yet', R.customers.length ? 'Try a different search or filter.' : 'Customers appear here automatically when you add sales.');
    return rows.map(function (c) {
      return '<button class="row" data-act="openCustomer" data-key="' + esc(c.key) + '"><div class="top"><div><div class="name">' + esc(c.name || 'No name') + '</div><div class="detail">' + esc(phoneLine(c.phone)) + '</div></div>' + balanceText(c.balance) + '</div>' +
        '<div class="bottom"><span class="c-muted">' + c.txns + ' sale' + (c.txns === 1 ? '' : 's') + ', last ' + esc(shortDate(c.last)) + (c.daysOverdue ? ', oldest unpaid ' + c.daysOverdue + ' days' : '') + '</span>' + pill(c.type, TYPE_CLASS[c.type]) + '</div></button>';
    }).join('');
  };
  VIEWS.customer = function (v) {
    var c = findCustomer(v.key);
    if (!c) return empty('Customer not found', 'They may have been removed.');
    var h = '<div class="detail-hero"><div class="who">' + esc(c.name || 'No name') + '</div><div class="sub">' + esc(phoneLine(c.phone)) + ' ' + pill(c.type, TYPE_CLASS[c.type]) + '</div>' +
      '<div>' + balanceText(c.balance, true) + '</div>' +
      '<div class="stats">' +
      '<div><span>Total Billed</span><b>' + money(c.billed) + '</b></div><div><span>Total Paid</span><b>' + money(c.received) + '</b></div>' +
      '<div><span>Tips</span><b>' + money(c.tips) + '</b></div><div><span>Written Off</span><b>' + money(c.writtenOff) + '</b></div><div><span>Sales</span><b>' + c.txns + '</b></div><div><span>Sales per Month</span><b>' + c.frequency.toFixed(1) + '</b></div>' +
      '<div><span>First Sale</span><b>' + esc(shortDate(c.first)) + '</b></div><div><span>Last Sale</span><b>' + esc(shortDate(c.last)) + '</b></div>' +
      '<div><span>Risk</span><b>' + esc((riskFor(c.key) || {}).level || 'Low') + '</b></div>' +
      (c.oldestUnpaid ? '<div><span>Oldest Unpaid</span><b>' + esc(shortDate(c.oldestUnpaid)) + '</b></div><div><span>Days Overdue</span><b>' + c.daysOverdue + '</b></div>' : '') +
      '</div><div class="actions"><button class="btn kiosk" data-act="newPaymentFor" data-key="' + esc(c.key) + '">Customer Paid</button>' +
      '<button class="btn primary" data-act="shareFor" data-type="Customer" data-key="' + esc(c.key) + '">Send Reminder</button></div></div>';
    h += riskBlock(riskFor(c.key));
    h += '<div class="section-title">Their Sales, Newest First</div>';
    h += c.rows.slice().sort(byNewest).map(saleRow).join('');
    return h;
  };

  /* ----- Agents ----- */
  VIEWS.agents = function () {
    return '<input class="search" id="q-agents" type="search" placeholder="Search agent, number or reference" aria-label="Search agents" value="' + esc(UI.agentQuery) + '"><button class="btn block" data-act="openAgentBatch" style="margin-bottom:10px">Several Entries at Once</button><div id="list"></div>';
  };
  LISTS.agents = function () {
    var q = UI.agentQuery.trim().toLowerCase(), h = '';
    var ft = UI.agentType || '';
    var bal = R.agents.balances.filter(function (a) { return (!q || (a.name + ' ' + a.phone).toLowerCase().indexOf(q) >= 0) && (!ft || typeList(a.type).indexOf(ft) >= 0); });
    h += '<div class="chips tchips">' + [['', 'All']].concat(AGENT_TYPES.map(function (x) { return [x, x.replace(/ Agent$/, '')]; })).map(function (o) {
      return '<button class="chip' + (ft === o[0] ? ' on' : '') + '" data-act="agentType" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
    if (!R.agents.rows.length) return empty('No agent entries yet', 'Tap the green button to record a float transfer, EVC, bank exchange or other agent entry.');
    if (bal.length) {
      h += '<div class="section-title">Balances</div>';
      h += bal.map(function (a) {
        return '<button class="row" data-act="openAgent" data-key="' + esc(a.key) + '"><div class="top"><div><div class="name">' + esc(a.name) + '</div><div class="detail">' + esc((a.phone ? phoneLine(a.phone) + ' · ' : '') + a.entries + (a.entries === 1 ? ' entry' : ' entries')) + '</div></div>' + agentNetText(a.net) + '</div>' +
          (a.type ? '<div class="bottom"><span class="tpills">' + typePills(a.type) + '</span></div>' : '') + '</button>';
      }).join('');
    }
    var rows = R.agents.rows.filter(function (r) {
      return !q || (String(r.name) + ' ' + r.phone + ' ' + r.txNumber + ' ' + r.refId + ' ' + r.desc).toLowerCase().indexOf(q) >= 0;
    }).sort(byNewest);
    h += '<div class="section-title">Entries</div>';
    h += rows.length ? groupedListAgents(rows) : '<p class="hint">No matching entries.</p>';
    return h;
  };
  function groupedListAgents(rows) {
    var shown = rows.slice(0, UI.limit), h = '', lastM = '', lastD = '';
    shown.forEach(function (r) {
      var m = (r.date || '').slice(0, 7);
      if (m !== lastM) { h += '<div class="month-head"><h2>' + esc(monthName(m) || 'No Date') + '</h2><span class="meta"></span></div>'; lastM = m; lastD = ''; }
      if (r.date !== lastD) { h += '<div class="day-head"><span>' + esc(r.date ? dayHead(r.date) : 'No date') + '</span></div>'; lastD = r.date; }
      h += agentRow(r);
    });
    if (rows.length > shown.length) h += '<button class="more-btn" data-act="showMore">Show more (' + (rows.length - shown.length) + ' older)</button>';
    return h;
  }
  function paidRecv(r) {
    var p = [];
    if (num(r.toAgent)) p.push('Paid to Agent ' + money(num(r.toAgent)));
    if (num(r.fromAgent)) p.push('Received from Agent ' + money(num(r.fromAgent)));
    return p.join(' · ') || 'No amounts';
  }
  function agentRow(r) {
    var to = num(r.toAgent), from = num(r.fromAgent), amt = '';
    if (to && !from) amt = '<span class="amount">' + money(to) + '</span>';
    else if (from && !to) amt = '<span class="amount c-credit">+' + money(from) + '</span>';
    var parts = [];
    if (to) parts.push('Paid ' + money(to)); if (from) parts.push('Received ' + money(from));
    return '<button class="row" data-act="editAgent" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.name || 'No name') + '</div>' +
      '<div class="detail">' + esc(r.txType || r.desc || 'Agent') + (r.time ? ' · ' + esc(r.time) : '') + '</div></div>' + amt + '</div>' +
      '<div class="bottom"><span class="state">' + esc(parts.join(' · ') || '—') + '</span>' + (r.txNumber ? '<span class="c-muted">→ ' + esc(phoneLine(r.txNumber)) + '</span>' : '') + '</div></button>';
  }
  VIEWS.agent = function (v) {
    var a = findAgent(v.key);
    if (!a) return empty('Agent not found', 'They may have been removed.');
    var rows = R.agents.rows.filter(function (r) { return C.agentKey(r.name) === a.key; }).sort(byNewest);
    return '<div class="detail-hero"><div class="who">' + esc(a.name) + '</div><div class="sub">' + esc(phoneLine(a.phone)) + ' ' + typePills(a.type) + '</div>' +
      '<div>' + agentNetText(a.net, true) + '</div><div class="stats"><div><span>Entries</span><b>' + a.entries + '</b></div><div><span>Last Entry</span><b>' + esc(shortDate(a.last)) + '</b></div>' +
      '<div><span>Written Off</span><b>' + money(a.writtenOff) + '</b></div></div>' +
      '<div class="actions"><button class="btn primary" data-act="shareFor" data-type="Agent" data-key="' + esc(a.key) + '">Send Reminder</button></div></div>' +
      rows.map(agentRow).join('');
  };

  /* ----- Settings hub ----- */
  function srow(act, v, ic, title, sub, color) {
    return '<button class="srow" data-act="' + act + '" data-v="' + v + '"><span class="ic ' + (color || 'blue') + '">' + icon(ic) + '</span><span class="tx"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span><span class="chev">›</span></button>';
  }
  VIEWS.language = function () {
    var cur = S.meta.lang || 'auto', opts = [['auto', 'Phone language', 'Follows the language of this phone, now ' + I18N.names[I18N.detect()] + '. If the app does not have that language, it uses English.']];
    I18N.supported.forEach(function (k) { opts.push([k, I18N.names[k], '']); });
    return '<p class="hint">The app can be used in English, French or Portuguese. This choice is only for this phone. Reminder messages have their own language choice when you send them.</p>' +
      opts.map(function (o) {
        return '<button class="opt' + (o[0] === cur ? ' on' : '') + '" data-act="setLang" data-v="' + o[0] + '"><span class="radio"></span><span class="tx"' + (o[0] !== 'auto' ? ' data-noi18n' : '') + '><b>' + esc(o[1]) + '</b>' + (o[2] ? '<small>' + esc(o[2]) + '</small>' : '') + '</span></button>';
      }).join('');
  };
  VIEWS.settings = function () {
    var ss = window.Sync ? Sync.status() : { configured: false }, p = S.settings.profile, c = COUNTRIES.get(p.country) || {};
    var sec = Security.cfg(), h = '';
    h += '<div class="profile-card"><div class="avatar">' + esc((p.name || '?').trim().charAt(0).toUpperCase()) + '</div><div class="pc-tx"><b>' + esc(p.name || 'Add your name') + '</b>' +
      '<small>' + esc((c.name || '') + (ss.email ? ' · ' + ss.email : '')) + '</small></div><button class="btn" data-act="go" data-v="profile">Edit</button></div>';
    h += '<div class="section-title">Account and Security</div><div class="slist">' +
      srow('go', 'sync', 'account', 'Your Account', ss.signedIn ? ss.label : ss.configured ? 'Sign in to keep records online' : 'Keep your records online', 'purple') +
      srow('go', 'security', 'lock', 'Security', Security.enabled() ? 'PIN on' + (Security.bioEnabled() ? ', fingerprint on' : '') : 'Protect your records with a PIN', 'red') + '</div>';
    h += '<div class="section-title">Look and Money</div><div class="slist">' +
      srow('go', 'look', 'look', 'Country, Currency and Theme', (c.name || '') + ' · ' + S.settings.currency.symbol + ' · ' + (THEMES.list[S.settings.theme] || THEMES.list.classic).name, 'teal') +
      srow('go', 'rules', 'rules', 'Money Rules', 'Tips and how you record payments', 'teal') +
      srow('go', 'language', 'globe', 'Language', I18N.pref === 'auto' ? 'Phone language (' + I18N.names[I18N.lang] + ')' : I18N.names[I18N.lang], 'teal') +
      srow('go', 'capture', 'chat', 'Automatic Recording', 'Turn payment messages into entries', 'teal') +
      srow('go', 'choices', 'list', 'Your Choices', 'Payment channels, wallets, EVC operators and other lists', 'teal') + '</div>';
    h += '<div class="section-title">Your Data</div><div class="slist">' +
      srow('go', 'backup', 'backup', 'Backup and Restore', S.meta.lastBackup ? 'Last backup ' + shortDate(S.meta.lastBackup) : 'Save a copy of your records', 'orange') +
      srow('openPrivacy', 'privacy', 'privacy', 'Privacy Policy', 'How your records are protected', 'orange') +
      srow('go', 'help', 'help', 'How It Works', 'Balances, credit, tips, statuses', 'orange') + '</div>';
    if (Security.enabled()) h += '<button class="btn block" data-act="lockNow" style="margin-top:14px">Lock the App Now</button>';
    if (deferredInstall) h += '<button class="btn kiosk block" data-act="install" style="margin-top:10px">Install This App on Your Phone</button>';
    h += '<p class="hint" style="text-align:center;margin-top:16px">' + esc(APP_NAME) + ' · Your records are private to you.</p>';
    return h;
  };
  VIEWS.profile = function () {
    var p = S.settings.profile;
    return '<div class="card"><div class="field"><label for="pf-name">Your Name or Business Name</label><input id="pf-name" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label for="pf-country">Country</label><select id="pf-country">' + countryOptions(p.country) + '</select></div>' +
      '<label class="check" style="margin-bottom:12px"><input type="checkbox" id="pf-apply"><span>Also use this country\'s currency and colours</span></label>' +
      '<button class="btn primary block" data-act="saveProfile">Save</button></div>' +
      '<p class="hint">Your country decides how phone numbers are checked. Contacts in other countries can still be recorded: choose their country next to the phone box.</p>';
  };
  VIEWS.look = function () {
    var p = S.settings.profile, cur = S.settings.currency;
    var sw = THEMES.ids.map(function (id) {
      var t = THEMES.list[id];
      return '<button class="theme' + (S.settings.theme === id ? ' on' : '') + '" data-act="setTheme" data-v="' + id + '"><span class="sw" style="background:linear-gradient(' + t.s1 + ' 0 22%,' + t.brand + ' 22% 78%,' + t.s3 + ' 78%)"></span><b>' + esc(t.name) + '</b></button>';
    }).join('');
    return '<div class="section-title" style="margin-top:0">Colour Theme</div><div class="themes">' + sw + '</div>' +
      '<p class="hint">Classic suits everyone. The country themes use that country\'s flag colours. Red always means money to collect, and green always means money received.</p>' +
      '<div class="section-title">Country</div><div class="card"><div class="field"><label for="lk-country">Country</label><select id="lk-country">' + countryOptions(p.country) + '</select></div>' +
      '<button class="btn block" data-act="applyCountry">Use This Country\'s Currency and Colours</button></div>' +
      '<div class="section-title">Currency</div><div class="card"><div class="two"><div class="field"><label for="lk-sym">Symbol</label><input id="lk-sym" value="' + esc(cur.symbol) + '"></div>' +
      '<div class="field"><label for="lk-code">Code</label><input id="lk-code" value="' + esc(cur.code) + '"></div></div>' +
      '<p class="hint" style="margin:0 0 10px">Example: ' + esc(money(12345.5)) + '</p><button class="btn primary block" data-act="saveCurrency">Save Currency</button></div>';
  };
  function optCard(act, cur, id, title, text) {
    return '<button class="opt' + (cur === id ? ' on' : '') + '" data-act="' + act + '" data-v="' + id + '"><span class="radio"></span><span class="tx"><b>' + esc(title) + '</b><small>' + esc(text) + '</small></span></button>';
  }
  VIEWS.rules = function () {
    var tm = S.settings.tipMode, pd = S.settings.payDefault || '';
    return '<div class="section-title" style="margin-top:0">How Do You Handle Tips?</div>' +
      optCard('setTip', tm, 'extra', 'Extra money on top', 'A tip is on top of the bill. It counts as extra income and is not used to pay the bill. Example: bill 1,000, customer pays 1,000 and gives a tip of 50.') +
      optCard('setTip', tm, 'included', 'Included in the amount received', 'You type the total the customer paid, tip included. The app takes the tip off before paying the bill. Example: customer pays 1,050 with a tip of 50, so the bill gets 1,000.') +
      optCard('setTip', tm, 'passon', 'Not mine, I hand it over', 'Tips belong to staff or someone else. They count as money received, but show as Tips to Hand Over and not as your income.') +
      '<p class="hint">Tips always show on your home screen and are never lost, whichever way you choose.</p>' +
      '<div class="section-title">How Do You Record Sales?</div>' +
      optCard('setPayDefault', pd, '', 'Ask me every time', 'Recommended. You choose Paid in Full, Part Paid or On Credit for each sale, so it is never recorded by mistake.') +
      optCard('setPayDefault', pd, 'full', 'Mostly paid on the spot', 'Paid in Full is pre-selected on new sales. You still see it clearly and can change it.') +
      optCard('setPayDefault', pd, 'credit', 'Mostly on credit (debt recording)', 'On Credit is pre-selected on new sales. Use this if you mainly record who owes you.');
  };
  var LOCK_OPTS = [['now', 'Right away'], ['1', 'After 1 minute'], ['5', 'After 5 minutes'], ['15', 'After 15 minutes'], ['never', 'Only when I lock it']];
  VIEWS.security = function () {
    var c = Security.cfg(), on = Security.enabled(), h = '';
    h += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>App Lock</b>' + pill(on ? 'On' : 'Off', on ? 'p-overpaid' : 'p-outstanding') + '</div>' +
      '<p class="hint" style="margin:6px 0 10px">' + (on ? 'The app asks for your PIN' + (Security.bioEnabled() ? ' or fingerprint' : '') + ' every time it opens or comes back from another app.' : 'Without a lock, anyone who picks up your phone can open your records.') + '</p>' +
      '<div class="actions" style="margin:0">' + (on ? '<button class="btn" data-act="pinChange">Change PIN</button>' : '<button class="btn primary" data-act="pinChange">Set a PIN</button>') +
      (on && !signedIn() ? '<button class="btn danger" data-act="pinOff">Turn Off</button>' : '') + '</div>' + (on && signedIn() ? '<p class="hint" style="margin:10px 0 0">The PIN is required while you are signed in to an account.</p>' : '') + '</div>';
    if (on) {
      h += '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>Fingerprint or Face</b>' + pill(Security.bioEnabled() ? 'On' : 'Off', Security.bioEnabled() ? 'p-overpaid' : 'p-paid') + '</div>' +
        '<p class="hint" style="margin:6px 0 10px">' + (UI.bioOK ? 'Open the app with your fingerprint or face. Your PIN always works as a back-up.' : 'This phone or browser does not offer fingerprint unlock for the app.') + '</p>' +
        (UI.bioOK ? '<button class="btn ' + (Security.bioEnabled() ? 'danger' : 'primary') + '" data-act="' + (Security.bioEnabled() ? 'bioOff' : 'bioOn') + '">' + (Security.bioEnabled() ? 'Turn Off Fingerprint' : 'Turn On Fingerprint') + '</button>' : '') + '</div>';
      h += '<div class="card"><b>Lock Automatically</b><div class="field" style="margin-top:8px"><select id="sec-lock">' + LOCK_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + ((c.lockAfter || '1') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
        '<p class="hint" style="margin:0">How long the app can be out of sight before it asks for your PIN again.</p></div>';
    }
    h += '<div class="card"><b>Hide Amounts</b><p class="hint" style="margin:6px 0 10px">Blur money amounts on screen so people nearby cannot read them. You can also tap the eye at the top of any screen.</p>' +
      '<button class="btn" data-act="toggleHide">' + (S.meta.hideAmounts ? 'Show Amounts' : 'Hide Amounts') + '</button></div>';
    if (signedIn()) {
      h += '<div class="card"><b>Ask for Your Password Again</b><div class="field" style="margin-top:8px"><select id="sec-exp">' + [7, 14, 30, 90].map(function (d) { return '<option value="' + d + '"' + (Security.expireDays() === d ? ' selected' : '') + '>Every ' + d + ' days</option>'; }).join('') + '</select></div>' +
        '<p class="hint" style="margin:0">After this many days the app asks for your email password again, even with the PIN.</p></div>';
      h += '<div class="section-title">Your Devices</div><div id="devices">' + devicesHTML() + '</div>' +
        '<p class="hint">Every phone that signs in to your account is listed here. If you see one you do not know, remove it and change your password.</p>' +
        '<button class="btn block" data-act="syncReset" style="margin-bottom:8px">Send Me a Password Reset Email</button>';
    }
    h += '<div class="card help"><h3 style="margin-top:0">What Protects Your Records</h3><p>Your records are saved on this phone and, if you have an account, in your private online account that only you can open. The PIN and fingerprint stop other people from opening the app on your phone.</p>' +
      '<p>Note: a text-message code for every new phone needs Firebase\'s paid plan. Until then, new phones are protected by your password, and you see every device here.</p></div>';
    return h;
  };
  function devicesHTML() {
    var list = window.Sync && Sync.devices ? Sync.devices() : [];
    if (!list.length) return '<p class="hint">No devices to show yet.</p>';
    return list.map(function (d) {
      return '<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div><b>' + esc(d.name || 'Phone') + '</b>' + (d.me ? ' ' + pill('This Phone', 'p-overpaid') : '') +
        '<div class="hint" style="margin:2px 0 0">Last used ' + esc(stamp(d.last)) + '</div></div>' + (d.me ? '' : '<button class="btn danger" data-act="removeDevice" data-id="' + esc(d.id) + '">Remove</button>') + '</div>';
    }).join('');
  }

  /* ----- Share ----- */
  VIEWS.share = function () {
    var isC = UI.shareType === 'Customer';
    var opts = isC ? R.customers.map(function (c) { return [c.key, (c.name || 'No name') + (c.phone ? ' (' + C.phoneInfo(c.phone).display + ')' : '') + (c.owed > 0 ? ', to collect ' + money(c.owed) : c.credit > 0 ? ', paid in advance ' + money(c.credit) : '')]; })
      : R.agents.balances.map(function (a) { return [a.key, a.name + (a.net > 0 ? ', to collect ' + money(a.net) : a.net < 0 ? ', to pay ' + money(-a.net) : ', settled')]; });
    if (UI.shareKey && !opts.some(function (o) { return o[0] === UI.shareKey; })) UI.shareKey = '';
    if (!UI.shareKey && opts.length) UI.shareKey = opts[0][0];
    if (!UI.shareText) UI.shareText = buildMessage();
    var phone = sharePhone();
    return seg('shareType', UI.shareType, [['Customer', 'Customer'], ['Agent', 'Agent']]) +
      '<div class="field"><label for="share-who">' + (isC ? 'Customer' : 'Agent') + '</label><select id="share-who">' +
      (opts.length ? opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === UI.shareKey ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') : '<option>No one yet</option>') + '</select></div>' +
      '<div class="field"><label for="msg-lang">Message Language</label><select id="msg-lang" data-noi18n>' + langOptions(msgLang(), false) + '</select></div>' +
      '<div class="field"><label for="msg">Message: Change Any Word Before Sending</label><textarea id="msg" class="message">' + esc(UI.shareText) + '</textarea></div>' +
      '<div class="actions">' +
      (phone ? '<button class="btn kiosk" data-act="shareWa">Send on WhatsApp</button>' : '') +
      '<button class="btn primary" data-act="shareShare">Share</button><button class="btn" data-act="shareCopy">Copy</button>' +
      '<button class="btn" data-act="shareRegen">Start Over</button></div>' +
      (phone ? '<p class="hint">WhatsApp opens a chat with +' + esc(phone) + ' with your message ready. Nothing is sent until you press send there.</p>' : '<p class="hint">No phone number saved for them, so use Share or Copy.</p>');
  };
  function sharePhone() {
    var raw = '';
    if (UI.shareType === 'Customer') { var c = findCustomer(UI.shareKey); raw = c ? c.phone : ''; }
    else { var a = findAgent(UI.shareKey); raw = a ? a.phone : ''; }
    return C.phoneInfo(raw).wa || '';
  }
  function signOff() { var n = S.settings.profile.name; return n ? '\n\n' + n : ''; }
  function buildMessage() {
    if (UI.shareType === 'Customer') { var c = findCustomer(UI.shareKey); return c ? customerMessage(c) : ''; }
    var a = findAgent(UI.shareKey); return a ? agentMessage(a) : '';
  }
  var MSG = {
    en: { there: 'there', paidHi: 'Hello {n}, thank you for doing business with us.\n\nAs of {d}, you have nothing to pay', credit: '. You have {a} with us that you paid in advance. It will be used on your next purchase.',
      thanks: 'Thank you!', oweHi: 'Hello {n}, this is a reminder of your outstanding balance with us as of {d}.', items: 'Unpaid items:', notPaid: '{a} not yet paid', exch: 'Wallet Exchange', buy: 'Purchase',
      total: 'Total you need to pay: {a}', over: '(Your earlier overpayment of {a} has already been deducted.)', kindly: 'Kindly pay at your earliest convenience. Thank you!',
      agHi: 'Hello {n}, here is a summary of your agent account as of {d}.', recent: 'Recent entries:', wePaid: 'we paid you {a}', youPaid: 'you paid us {a}', none: 'no amount', entry: 'Entry',
      showing: '(Showing the 25 most recent of {k} entries.)', balCollect: 'Balance: you need to pay us {a}.', balPay: 'Balance: we will pay you {a}.\n\nWe will pay you soon. Thank you for your patience!', balZero: 'Balance: nothing to pay on either side. Thank you!' },
    fr: { there: 'cher client', paidHi: 'Bonjour {n}, merci pour votre confiance.\n\nAu {d}, vous n\'avez rien à payer', credit: '. Vous avez {a} chez nous, payé d\'avance. Ce montant sera utilisé pour votre prochain achat.',
      thanks: 'Merci !', oweHi: 'Bonjour {n}, ceci est un rappel du montant que vous nous devez au {d}.', items: 'Achats non payés :', notPaid: '{a} pas encore payé', exch: 'Échange portefeuille', buy: 'Achat',
      total: 'Total à payer : {a}', over: '(Votre paiement en trop de {a} a déjà été déduit.)', kindly: 'Merci de régler dès que possible.',
      agHi: 'Bonjour {n}, voici le résumé de votre compte agent au {d}.', recent: 'Opérations récentes :', wePaid: 'nous vous avons payé {a}', youPaid: 'vous nous avez payé {a}', none: 'aucun montant', entry: 'Opération',
      showing: '(Les 25 opérations les plus récentes sur {k}.)', balCollect: 'Solde : vous nous devez {a}.', balPay: 'Solde : nous vous devons {a}.\n\nNous vous paierons bientôt. Merci de votre patience !', balZero: 'Solde : rien à payer de part et d\'autre. Merci !' },
    pt: { there: 'caro cliente', paidHi: 'Olá {n}, obrigado pela sua preferência.\n\nEm {d}, não tem nada a pagar', credit: '. Tem {a} connosco, pago adiantado. Este valor será usado na sua próxima compra.',
      thanks: 'Obrigado!', oweHi: 'Olá {n}, este é um lembrete do valor que nos deve em {d}.', items: 'Compras por pagar:', notPaid: '{a} ainda por pagar', exch: 'Câmbio de carteira', buy: 'Compra',
      total: 'Total a pagar: {a}', over: '(O seu pagamento a mais de {a} já foi descontado.)', kindly: 'Por favor, pague assim que possível.',
      agHi: 'Olá {n}, aqui está o resumo da sua conta de agente em {d}.', recent: 'Operações recentes:', wePaid: 'pagámos-lhe {a}', youPaid: 'pagou-nos {a}', none: 'sem valor', entry: 'Operação',
      showing: '(As 25 operações mais recentes de {k}.)', balCollect: 'Saldo: tem de nos pagar {a}.', balPay: 'Saldo: vamos pagar-lhe {a}.\n\nVamos pagar-lhe em breve. Obrigado pela sua paciência!', balZero: 'Saldo: nada a pagar de nenhum dos lados. Obrigado!' }
  };
  function msgLang() { return UI.msgLang || I18N.lang; }
  function M(key, v) {
    var s = (MSG[msgLang()] || MSG.en)[key] || MSG.en[key];
    return s.replace(/\{(\w)\}/g, function (_, k) { return v && v[k] != null ? v[k] : ''; });
  }
  function customerMessage(c) {
    return I18N.withLang(msgLang(), function () {
      var name = c.name || M('there'), date = readable(R.today);
      if (c.balance <= 0) {
        return M('paidHi', { n: name, d: date }) + (c.credit > 0 ? M('credit', { a: money(c.credit) }) : '.') + '\n\n' + M('thanks') + signOff();
      }
      var items = c.rows.filter(function (r) { return r.remaining > 0; }).sort(byNewest);
      var sum = items.reduce(function (a, r) { return a + r.remaining; }, 0);
      var lines = items.map(function (r, i) { return (i + 1) + '. ' + shortDate(r.date) + ': ' + (r.details || (r.kind === 'WE' ? M('exch') : M('buy'))) + ', ' + M('notPaid', { a: money(r.remaining) }); });
      return M('oweHi', { n: name, d: date }) + '\n\n' + M('items') + '\n' + lines.join('\n') +
        '\n\n' + M('total', { a: money(c.balance) }) +
        (sum - c.balance > 0.005 ? '\n' + M('over', { a: money(sum - c.balance) }) : '') +
        '\n\n' + M('kindly') + (msgLang() === 'en' ? '' : ' ' + M('thanks')) + signOff();
    });
  }
  function agentMessage(a) {
    return I18N.withLang(msgLang(), function () {
      var rows = R.agents.rows.filter(function (r) { return C.agentKey(r.name) === a.key && r.hasNet; }).sort(byNewest);
      var shown = rows.slice(0, 25);
      var lines = shown.map(function (r, i) {
        var p = [];
        if (num(r.toAgent)) p.push(M('wePaid', { a: money(num(r.toAgent)) }));
        if (num(r.fromAgent)) p.push(M('youPaid', { a: money(num(r.fromAgent)) }));
        return (i + 1) + '. ' + shortDate(r.date) + ': ' + (r.desc || I18N.t(r.txType || '') || M('entry')) + ', ' + (p.join(', ') || M('none'));
      });
      var foot = a.net > 0 ? M('balCollect', { a: money(a.net) }) + '\n\n' + M('kindly') + (msgLang() === 'en' ? '' : ' ' + M('thanks'))
        : a.net < 0 ? M('balPay', { a: money(-a.net) }) : M('balZero');
      return M('agHi', { n: a.name, d: readable(R.today) }) + '\n\n' +
        (lines.length ? M('recent') + '\n' + lines.join('\n') + (rows.length > 25 ? '\n' + M('showing', { k: rows.length }) : '') + '\n\n' : '') + foot + signOff();
    });
  }


  /* ----- Daily cash check and monthly balance check ----- */
  function checkBadge(c) {
    if (c.status === 'First Record' || c.status === 'First record') return pill('First Record', 'p-paid');
    if (c.status === 'Balanced') return pill('Balanced', 'p-overpaid');
    if (c.status === 'Missing' || c.status === 'Extra') return pill((c.status === 'Missing' ? 'Missing ' : 'Extra ') + money(Math.abs(c.diff)), c.status === 'Missing' ? 'p-overdue' : 'p-outstanding');
    return pill(c.status, 'p-outstanding');
  }
  function flowLines(f) {
    var rows = [];
    if (f.customers) rows.push(['+ Payments from customers', money(f.customers)]);
    if (f.tips) rows.push(['+ Tips', money(f.tips)]);
    if (f.agentsGot) rows.push(['+ Received from agents', money(f.agentsGot)]);
    if (f.commissions) rows.push(['+ Commission received', money(f.commissions)]);
    if (f.agentsPaid) rows.push(['− Paid to agents', money(f.agentsPaid)]);
    if (f.expenses) rows.push(['− Expenses and money out', money(f.expenses)]);
    if (f.costOut) rows.push(['− Cost of data and amounts sent out', money(f.costOut)]);
    return rows.map(function (r) { return kv(r[0], r[1]); }).join('') || '<p class="hint" style="margin:6px 0">No money moved in this period.</p>';
  }
  VIEWS.daily = function () {
    var h = '<p class="hint">Record what you have in every wallet, bank and your cash drawer. The app compares it with what you should have: your last balances, plus money in, minus money out. A difference of zero means no money is missing.</p>' +
      '<button class="btn kiosk block" data-act="newCapital">Record Balances Now</button><div style="height:12px"></div>';
    if (!R.checks.length) return h + empty('No balances yet', 'Record your balances once to begin. From the second time, the app checks that your money adds up.');
    return h + R.checks.slice(0, UI.limit).map(function (c) {
      return '<button class="row" data-act="openCheck" data-id="' + esc(c.id) + '"><div class="top"><div class="name">' + esc(dayHead(c.date)) + ', ' + parts(c.date).y + '</div>' + checkBadge(c) + '</div>' +
        '<div class="bottom"><span class="c-muted num">' + (c.opening === null ? 'Counted ' + money(c.closing) : 'Should have ' + money(c.expected) + ', counted ' + money(c.closing)) + '</span></div></button>';
    }).join('');
  };
  VIEWS.check = function (v) {
    var c = R.checks.filter(function (x) { return x.id === v.id; })[0];
    if (!c) return empty('Not found', 'This record may have been removed.');
    var snaps = S.capital.slice().sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.seq || 0) - (y.seq || 0); });
    var idx = snaps.map(function (s) { return s.id; }).indexOf(c.id), cur = snaps[idx], prev = idx > 0 ? snaps[idx - 1] : null;
    var h = '<div class="detail-hero"><div class="who">' + esc(readable(c.date)) + '</div><div style="margin-top:8px">' + checkBadge(c) + '</div></div>';
    if (c.opening !== null) {
      h += '<div class="card"><b>How It Adds Up</b>' + kv('Balances on ' + shortDate(c.from), money(c.opening)) + flowLines(c.flows) +
        kv('You should have', money(c.expected)) + kv('You counted', money(c.closing)) +
        kv('Difference', '<span class="' + (c.diff === 0 ? 'c-credit' : 'c-late') + '">' + money(c.diff) + '</span>') + '</div>';
      if (c.status === 'Missing') h += '<div class="form-error">' + money(-c.diff) + ' less than expected. Common reasons: data or airtime you bought but did not record, money you took out, a sale or payment you forgot to record, or a wrong balance.</div>';
      if (c.status === 'Extra') h += '<div class="form-info">' + money(c.diff) + ' more than expected. Common reasons: money received that was not recorded, a payment recorded too small, or a wrong balance.</div>';
    } else h += '<div class="form-info">This is your first record, so there is nothing to compare it with yet. It becomes the starting point for the next check.</div>';
    h += '<div class="card"><b>Balances You Recorded</b>' + Object.keys(cur.balances || {}).filter(function (k) { return num(cur.balances[k]) || (prev && num(prev.balances[k])); }).map(function (k) {
      var now = num(cur.balances[k]), was = prev ? num((prev.balances || {})[k]) : null;
      return kv(k, money(now) + (was !== null && was !== now ? ' <span class="c-muted">(was ' + money(was) + ')</span>' : ''));
    }).join('') + kv('Total', money(c.closing)) + '</div>';
    return h + '<button class="btn block" data-act="editCapital" data-id="' + esc(c.id) + '">Change These Balances</button>';
  };
  VIEWS.recon = function () {
    var h = '<p class="hint">For each month: your balances at the start, plus money in, minus money out, is what you should have at the end. This is compared with the balances you recorded. It does not need a bank statement.</p>';
    if (!R.monthChecks.length) return h + empty('No months yet', 'Months appear here as you record sales and balances.');
    var stats = {}; R.months.forEach(function (m) { stats[m.month] = m; });
    return h + R.monthChecks.map(function (m) {
      var st = stats[m.month], c = '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>' + esc(monthName(m.month)) + '</b>' + (m.expected !== undefined ? checkBadge(m) : pill(m.status, 'p-outstanding')) + '</div>';
      if (st) c += kv('Sales', st.count) + kv('Billed', money(st.billed)) + kv('Paid by customers', money(st.paid)) + (st.tips ? kv(tip(R.tipMode), money(st.tips)) : '');
      if (m.expected !== undefined) {
        c += '<div style="height:6px"></div>' + kv('Balances on ' + shortDate(m.opening.date), money(m.opening.total)) + flowLines(m.flows) + kv('You should have', money(m.expected)) +
          kv('You counted on ' + shortDate(m.closing.date), money(m.closing.total)) + kv('Difference', '<span class="' + (m.diff === 0 ? 'c-credit' : 'c-late') + '">' + money(m.diff) + '</span>');
      } else {
        var last = C.lastDay(m.month);
        c += '<p class="hint" style="margin:8px 0">' + (m.status === 'No opening balances' ? 'Record your balances at the start of the month too, so the app can check this month.' : 'Record your balances at the end of this month to check it.') + '</p>' +
          '<button class="btn kiosk" data-act="newCapital" data-date="' + (last > R.today ? R.today : last) + '">Record Balances</button>';
      }
      return c + '</div>';
    }).join('');
  };

  /* ----- Losses and errors ----- */
  VIEWS.losses = function () {
    var L = R.losses, h = '<div class="figures"><div class="figure wide"><div class="label">Total losses, all time</div><div class="big c-late">' + money(L.total) + '</div><div class="sub">Write-offs on sales and agents, plus losses logged as errors</div></div></div>';
    h += '<div class="section-title">Losses per month</div>';
    h += L.byMonth.length ? '<div class="card">' + L.byMonth.map(function (m) { return kv(monthName(m.month), money(m.amount)); }).join('') + '</div>' : '<p class="hint">No losses recorded.</p>';
    if (L.items.length) {
      h += '<div class="section-title">What was lost</div><div class="card">' + L.items.map(function (i) {
        return kv(shortDate(i.date) + ', ' + i.source + (i.who ? ', ' + i.who : '') + (i.reason ? ' (' + i.reason + ')' : ''), money(i.amount));
      }).join('') + '</div>';
    }
    h += '<div class="section-title">Error log</div><p class="hint">To count an error as a loss, set "Did it cost money?" to Yes and fill in the amount.</p>';
    var errs = S.errors.slice().sort(byNewest);
    h += errs.length ? errs.map(function (e) {
      return '<button class="row" data-act="editError" data-id="' + esc(e.id) + '"><div class="top"><div><div class="name">' + esc(e.type || 'Error') + '</div><div class="detail">' + esc(shortDate(e.date)) + (e.causedBy ? ', caused by ' + esc(e.causedBy) : '') + '</div></div>' +
        pill(e.status || 'Open', e.status === 'Fixed' ? 'p-overpaid' : e.status === 'Open' ? 'p-overdue' : 'p-outstanding') + '</div>' +
        '<div class="bottom"><span class="c-muted">' + esc(e.desc || '') + '</span>' + (e.ledToLoss === 'Yes' && num(e.amountLost) ? '<span class="amount c-late">' + money(e.amountLost) + '</span>' : '') + '</div></button>';
    }).join('') : '<p class="hint">No errors logged.</p>';
    return h;
  };

  /* ----- Commissions ----- */
  VIEWS.comm = function () {
    var h = seg('commTab', UI.commTab, [['wallet', 'Mobile Wallets'], ['evc', 'EVC'], ['month', 'By Month']]);
    if (UI.commTab === 'wallet') {
      var rows = R.walletComm.slice().sort(function (a, b) { return (b.month || '').localeCompare(a.month || '') || (b.seq || 0) - (a.seq || 0); });
      h += rows.length ? rows.map(function (r) {
        return '<button class="row" data-act="editWallet" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.wallet || 'No wallet') + '</div><div class="detail">' + esc(monthName(r.month)) + '</div></div><span class="amount c-credit">' + money(r.net) + '</span></div>' +
          '<div class="bottom"><span class="c-muted num">Statement ' + money(num(r.earned)) + ', received ' + money(num(r.received)) + (num(r.shared) ? ', shared with Agent or Partner ' + money(r.shared) + (r.agentName ? ' (' + esc(r.agentName) + ')' : '') : '') + '</span></div></button>';
      }).join('') : empty('No wallet commissions yet', 'Tap the green button to add one.');
    } else if (UI.commTab === 'evc') {
      var ev = R.evc.slice().sort(function (a, b) { return (b.month || '').localeCompare(a.month || '') || (b.seq || 0) - (a.seq || 0); });
      h += ev.length ? ev.map(function (r) {
        return '<button class="row" data-act="editEvc" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.provider || 'EVC') + '</div><div class="detail">' + esc(monthName(r.month)) + (r.wholesaler ? ', wholesale to ' + esc(r.wholesaler) : '') + '</div></div><span class="amount c-credit">' + money(r.net) + '</span></div>' +
          '<div class="bottom"><span class="c-muted num">Bought ' + money(num(r.purchase)) + ' (retail ' + money(r.retail) + ', wholesale ' + money(num(r.wholesale)) + '). You keep ' + money(r.net) + ', shared with partner ' + money(r.royalty) + (num(r.wholesale) ? ', passed to dealer ' + money(r.toWholesaler) : '') + '</span></div></button>';
      }).join('') : empty('No EVC entries yet', 'Tap the green button to add one.');
    } else {
      h += R.commMonths.length ? R.commMonths.map(function (m) {
        return '<div class="card"><b>' + esc(monthName(m.month)) + '</b>' + kv('Mobile Wallets, Net', money(m.wallet)) + kv('EVC, Net', money(m.evc)) + kv('Total You Earned', '<span class="c-credit">' + money(m.total) + '</span>') + '</div>';
      }).join('') : empty('Nothing yet', 'Monthly totals appear here once you add wallet or EVC commissions.');
    }
    return h;
  };

  /* ----- Referral agents ----- */
  VIEWS.ref = function () {
    var h = seg('refTab', UI.refTab, [['sales', 'Sales'], ['payouts', 'What to Pay'], ['rates', 'Deposit Rates']]);
    var RF = R.referrals;
    if (UI.refTab === 'sales') {
      var rows = RF.rows.slice().sort(byNewest);
      h += rows.length ? rows.map(function (r) {
        return '<button class="row" data-act="editRef" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.agent || 'No agent') + '</div><div class="detail">' + esc(shortDate(r.date)) + ', ' + esc(r.service || '') + (r.client ? ', ' + esc(r.client) : '') + ', ' + esc(r.refId) + '</div></div><span class="amount">' + money(num(r.amount)) + '</span></div>' +
          '<div class="bottom"><span class="c-muted num">Commission ' + money(r.commission) + ', their cut ' + money(r.agentCut) + '</span><span class="amount c-credit">' + money(r.net) + '</span></div></button>';
      }).join('') : empty('No referral sales yet', 'Tap the green button to add one.');
    } else if (UI.refTab === 'payouts') {
      h += RF.payouts.length ? RF.payouts.map(function (p) {
        return '<div class="card"><b>' + esc(p.agent || 'No agent') + '</b><div class="hint" style="margin:0">' + esc(monthName(p.month)) + '</div>' +
          kv('Total commission', money(p.commission)) + kv('Pay the agent', '<span class="c-owed">' + money(p.agentCut) + '</span>') + kv('You keep', '<span class="c-credit">' + money(p.net) + '</span>') + '</div>';
      }).join('') : empty('Nothing to pay yet', 'Payouts appear once you add referral sales.');
    } else {
      h += '<p class="hint">Flat deposit commission by amount. A deposit gets the commission of the highest "From" amount it reaches.' +
        (S.brackets.length ? '' : ' No rates yet. Tap Add a row for each range, for example From 1, To 999, Commission 5.') + '</p><div class="card" id="brackets">' +
        '<div class="bracket-row" style="font-size:0.8rem;font-weight:700;color:var(--ink-soft)"><span>From (' + sym() + ')</span><span>To (' + sym() + ')</span><span>Commission (' + sym() + ')</span><span></span></div>' +
        S.brackets.map(bracketRow).join('') + '</div>' +
        '<div class="actions"><button class="btn" data-act="addBracket">Add a row</button><button class="btn primary" data-act="saveBrackets">Save rates</button></div>';
    }
    return h;
  };
  function bracketRow(b) {
    return '<div class="bracket-row"><input type="number" inputmode="decimal" aria-label="From" value="' + esc(b.min) + '"><input type="number" inputmode="decimal" aria-label="To" value="' + esc(b.max) + '">' +
      '<input type="number" inputmode="decimal" aria-label="Commission" value="' + esc(b.comm) + '"><button class="btn danger" data-act="delBracket" aria-label="Remove row">×</button></div>';
  }

  /* ----- Capital ----- */
  VIEWS.capital = function () {
    var cap = R.capital, latest = cap.rows[0];
    var h = '<p class="hint">Record your balances whenever you like. Money to collect and money to pay always use today\'s live totals. The same balances are used for your Daily Cash Check.</p>';
    h += '<div class="figures">' +
      '<div class="figure wide"><div class="label">Working Capital' + (latest ? ', from ' + esc(shortDate(latest.date)) : '') + '</div><div class="big ' + (latest && latest.working < 0 ? 'c-late' : 'c-credit') + '">' + (latest ? money(latest.working) : 'Not recorded') + '</div>' +
      '<div class="sub">Available capital, plus money to collect, minus money to pay</div></div>' +
      '<div class="figure"><div class="label">Available Capital</div><div class="big">' + (latest ? money(latest.available) : '—') + '</div></div>' +
      '<div class="figure"><div class="label">Owed to Us</div><div class="big c-owed">' + money(cap.receivables) + '</div><div class="sub">Customers and agents</div></div>' +
      '<div class="figure wide"><div class="label">We Owe</div><div class="big">' + money(cap.payables) + '</div><div class="sub">Agents and advances</div></div></div>';
    h += '<div class="section-title">Your Recorded Balances</div>';
    h += cap.rows.length ? cap.rows.map(function (s) {
      return '<button class="row" data-act="openCheck" data-id="' + esc(s.id) + '"><div class="top"><div class="name">' + esc(readable(s.date)) + (s.time ? ' · ' + esc(s.time) : '') + '</div><span class="amount">' + money(s.available) + '</span></div>' +
        '<div class="bottom"><span class="c-muted">Available capital</span>' + (s.notes ? '<span class="c-muted">' + esc(s.notes) + '</span>' : '') + '</div></button>';
    }).join('') : empty('No balances yet', 'Tap the green button to record your balances.');
    return h;
  };

  /* ----- Expenses and money out ----- */
  VIEWS.expenses = function () {
    var rows = R.expenses.rows.slice().sort(entryNewer2), h = '<p class="hint">Record money that left your business: data or airtime you bought, rent, transport, withdrawals. These make your Daily Cash Check and Monthly Balance Check accurate.</p>';
    if (!rows.length) return h + empty('Nothing recorded', 'Tap the red button to record money out.');
    var lastM = '';
    rows.slice(0, UI.limit).forEach(function (r) {
      var m = (r.date || '').slice(0, 7);
      if (m !== lastM) {
        var tot = R.expenses.rows.filter(function (x) { return (x.date || '').slice(0, 7) === m; }).reduce(function (s, x) { return s + num(x.amount); }, 0);
        h += '<div class="month-head"><h2>' + esc(monthName(m) || 'No Date') + '</h2><span class="meta">' + money(tot) + ' out</span></div>'; lastM = m;
      }
      h += expenseRow(r);
    });
    return h;
  };
  function entryNewer2(a, b) { return byNewest(a, b); }

  /* ----- Backup ----- */
  VIEWS.backup = function () {
    var lb = S.meta.lastBackup;
    if (window.Sync && Sync.status().signedIn) return '<div class="card"><b>Online sync is on.</b><p class="hint" style="margin:6px 0 0">Your records are saved to your online account automatically. Backups here are optional extra copies.</p></div>' + backupBody(lb);
    return '<div class="card"><b>Your records live only on this phone.</b><p class="hint" style="margin:6px 0 0">If the phone is lost, or the app\'s data is cleared, they are gone unless you have a backup. Save one at least once a week and keep a copy off the phone, for example on Google Drive or sent to yourself on WhatsApp. Or create an account in Settings, then Your Account.</p></div>' + backupBody(lb);
  };
  function backupBody(lb) {
    return '<div class="card">' + kv('Last backup', lb ? esc(readable(lb)) : 'Never') + kv('Sales', S.sales.length) + kv('Agent entries', S.agents.length) +
      kv('Referral sales', S.referrals.length) + kv('Commission entries', S.walletComm.length + S.evc.length) + '</div>' +
      '<div class="field" style="margin-top:12px"><label for="bk-pass">Backup Password</label><input id="bk-pass" type="password" autocomplete="new-password" placeholder="Recommended"></div>' +
      '<p class="hint" style="margin-top:-6px">Without it, anyone who gets the file can read it. Write it down: without it the backup cannot be opened.</p>' +
      '<div class="actions"><button class="btn kiosk" data-act="backupShare">Send backup to Drive or WhatsApp</button><button class="btn primary" data-act="backupDownload">Save backup to phone</button></div>' +
      '<div class="section-title">Restore</div><p class="hint">Use this to bring back a backup, or to move your records to a new phone. It replaces everything currently in the app.</p>' +
      '<div class="field"><label for="rs-pass">Backup Password, if it has one</label><input id="rs-pass" type="password" autocomplete="off"></div>' +
      '<button class="btn block" data-act="importBackup">Restore from a backup file</button><input type="file" id="importFile" accept=".json,application/json" hidden>' +
      '<div class="section-title">Spreadsheet</div><p class="hint">Download all sales as a spreadsheet file that opens in Excel.</p>' +
      '<button class="btn block" data-act="exportCsv">Download sales for Excel</button>';
  };

  /* ----- Your Choices (editable lists) ----- */
  var SETTING_LISTS = [['channels', 'Payment Channels'], ['banks', 'Banks and Microfinance'], ['exTypes', 'Wallet Exchange Types'], ['agentTxTypes', 'Agent Transaction Types'],
    ['wallets', 'Commission Wallets'], ['evcProviders', 'EVC Operators'], ['capitalAccounts', 'Capital and Cash Accounts'],
    ['expenseCats', 'Money Out Categories'], ['woReasons', 'Write-Off Reasons'], ['errorTypes', 'Error Types'], ['causedBy', 'Who Caused an Error']];
  VIEWS.choices = function () {
    var s = S.settings;
    return '<p class="hint" style="margin-top:0">Change the choices that appear in your forms. Put one item on each line. You can add your own, for example another wallet or EVC operator.</p>' +
      SETTING_LISTS.map(function (l) { return '<div class="field"><label for="set-' + l[0] + '">' + l[1] + '</label><textarea id="set-' + l[0] + '" rows="5">' + esc((s[l[0]] || []).join('\n')) + '</textarea></div>'; }).join('') +
      '<button class="btn primary block" data-act="saveSettings">Save My Choices</button>';
  };

  /* ----- Help ----- */
  VIEWS.help = function () {
    return '<div class="card help">' +
      '<h3>Owes and Paid Ahead</h3><p>"Owes" is money a customer must still pay you. "Owes Us" is money an agent must pay you. "We Owe" is money you must pay an agent. "Paid Ahead" means a customer paid you in advance.</p>' +
      '<h3>Choosing the date</h3><p>New entries have no date until you tap Today, Yesterday or Other date, so a past sale is never saved with today\'s date by mistake. The Save button shows the date you chose.</p>' +
      '<h3>Phone numbers</h3><p>Since 4 September 2026, Africell numbers start with 87, QCell with 83 and Comium with 86. Gamcel numbers stay 7 digits. Type the old 7-digit number and the app adds the right start for you when you leave the box. Old and new forms of a number count as the same person.</p>' +
      '<h3>Risk check</h3><p>Each customer gets a risk score from what they owe, how long it has been unpaid, late payments and write-offs. Low risk can get credit up to their limit; High risk should pay on the spot. You can change any customer\'s credit limit.</p>' +
      '<h3>Paying in advance</h3><p>Nothing extra to do. If a customer overpaid before, their next sale is covered automatically, even if they pay nothing that day. If the credit only covers part of it, the account shows just what is left.</p>' +
      '<h3>Recording quickly</h3><p>For every sale you choose Paid in Full, Part Paid or On Credit, so nothing is recorded as paid by mistake. "Save, Add Another" keeps the form open with the same date. Use "Customer Paid" when someone pays off what they owe without buying anything, and "Several Sales at Once" to type many sales together.</p>' +
      '<h3>Paying an old debt late</h3><p>Open the old sale and tap "Record a payment", or put the full amount on the new sale. A payment covers its own sale first, and anything extra pays off the oldest unpaid sales. Either way the old sale turns Paid and the app records how many days late it was paid.</p>' +
      '<h3>Statuses</h3><p>Paid: settled. Overpaid: in credit. Outstanding: unpaid for up to 3 days. Overdue: unpaid for more than 3 days. Bad debt: written off.</p>' +
      '<h3>Customer types</h3><p>Regular: 3 or more sales and at least one a month. Irregular: fewer. Inactive: no sale for 90 days. Bad (high risk): oldest unpaid sale is over 60 days old. Do not give credit: something was written off.</p>' +
      '<h3>Agents</h3><p>"Paid to Agent" is money or float you sent to the agent. "Received from Agent" is what they sent you. If you paid more than you received, it shows as Owes Us. If you received more, it shows as We Owe.</p>' +
      '<h3>EVC</h3><p>Commission = purchase x operator rate. Shared with Partner = retail part x your partner\'s retail share, plus wholesale part x their wholesale share. On the wholesale part, the rest goes to the dealer.</p>' +
      '<h3>Your data</h3><p>Everything is saved on this phone first and works without internet. Signed in, it also goes to your private online account. Give each backup a password so nobody else can open it.</p></div>';
  };

  /* ================= Online sync ================= */
  var RULES = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    function me(uid) { return request.auth != null && request.auth.uid == uid; }\n    function confirmed(uid) { return me(uid) && request.auth.token.email_verified == true; }\n    match /users/{uid}/records/{id} {\n      allow read, delete: if me(uid);\n      allow create, update: if confirmed(uid) && id.size() <= 200\n        && request.resource.data.keys().hasOnly(['c', 'k', 'd', 'del', 'at'])\n        && request.resource.data.c in ['sales', 'agents', 'referrals', 'walletComm', 'evc', 'capital', 'errors', 'expenses', 'daily', 'recon', 'meta'];\n    }\n    match /users/{uid}/devices/{id} {\n      allow read, delete: if me(uid);\n      allow create, update: if confirmed(uid) && id.size() <= 100\n        && request.resource.data.keys().hasOnly(['name', 'first', 'last', 'revoked']);\n    }\n  }\n}";
  function syncBadge() {
    var s = window.Sync ? Sync.status() : null;
    if (!s || !s.configured || !s.label) return '<span id="sync-badge"></span>';
    return '<button id="sync-badge" class="sync-badge t-' + s.tone + '" data-act="go" data-v="sync">' + esc(s.label) + '</button>';
  }
  var lastPhase = '';
  function updateSyncBadge(s) {
    var el = document.getElementById('sync-badge');
    if (el) el.outerHTML = syncBadge();
    var live = document.getElementById('sync-live');
    if (live && s) live.innerHTML = syncLive(s);
    if (s && s.phase !== lastPhase) {
      lastPhase = s.phase;
      var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (['sync', 'home', 'backup', 'more'].indexOf(cur().v) >= 0 && !UI.sheetOpen && !typing) render();
    }
  }
  function syncLive(s) {
    var when = s.lastSynced ? I18N.fmt.stamp(s.lastSynced) : '';
    var cls = s.tone === 'credit' ? 'p-overpaid' : s.tone === 'late' ? 'p-overdue' : s.tone === 'owed' ? 'p-outstanding' : 'p-paid';
    return '<div class="card">' + kv('Status', '<span class="pill ' + cls + '">' + esc(s.label || 'Not set up') + '</span>') +
      (s.email ? kv('Signed in as', esc(s.email)) : '') + kv('Changes waiting to go online', s.pending) +
      (when ? kv('Last synced', esc(when)) : '') +
      (s.error ? '<div class="form-error" style="margin-top:8px">' + esc(s.error) + '</div>' : '') + '</div>';
  }
  VIEWS.sync = function () {
    var s = Sync.status(), h = '';
    if (s.managed) {
      if (!s.signedIn) {
        return signInForm('Create an account or sign in to keep your records online and on any phone. Records already on this phone are added to your account.') +
          '<p class="hint"><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></p>';
      }
      h += verifyCard(s) + '<div id="sync-live">' + syncLive(s) + '</div>';
      h += '<div class="actions"><button class="btn primary" data-act="syncNow">Sync now</button><button class="btn" data-act="syncSignOut">Sign out</button></div>' +
        '<p class="hint">Changes are saved on this phone first, then sent to your account in the background. Signing out removes your records from this phone; they come back when you sign in again.</p>';
      h += '<div class="section-title">Delete account</div><div class="card"><p class="hint" style="margin:0 0 10px">This permanently deletes your account and every record in it, online and on this phone.</p>' +
        '<button class="btn danger block" data-act="deleteAccount">Delete my account and records</button></div>' +
        '<p class="hint"><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a></p>';
      return h;
    }
    if (!s.configured) {
      h += '<div class="card"><b>Keep your records online</b><p class="hint" style="margin:6px 0 0">Once this is set up, every entry is saved to your own private online account automatically. No more backups, and you can sign in on another phone and see the same records.</p></div>';
      h += '<div class="section-title">Setup, about 10 minutes</div><div class="card help">' +
        '<p><b>1.</b> In Chrome, open console.firebase.google.com, sign in with your Google account and create a project. You can switch Google Analytics off.</p>' +
        '<p><b>2.</b> Open Authentication, tap Get started, choose Email/Password, switch it on and save.</p>' +
        '<p><b>3.</b> Open Firestore Database, tap Create database, pick a location near you and start in production mode.</p>' +
        '<p><b>4.</b> In Firestore, open the Rules tab, replace everything with the rules below and tap Publish. They make sure only you can see your records.</p>' +
        '<p><b>5.</b> Open Project settings (the gear), scroll to Your apps, tap the web icon &lt;/&gt;, give it a name and register it. Copy the whole firebaseConfig block it shows and paste it below.</p></div>';
      h += '<div class="field"><label for="rules-box">Security rules for step 4</label><textarea id="rules-box" readonly rows="8" style="font-size:0.82rem">' + esc(RULES) + '</textarea></div>' +
        '<button class="btn block" data-act="copyRules">Copy the rules</button><div style="height:14px"></div>';
      h += '<div class="field"><label for="cfg-box">Paste the firebaseConfig block from step 5</label><textarea id="cfg-box" rows="8" placeholder="const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., appId: ... };"></textarea></div>' +
        '<div id="sync-msg"></div><button class="btn primary block" data-act="syncSaveConfig">Connect</button>';
      return h;
    }
    if (!s.signedIn) {
      h += '<div id="sync-live">' + syncLive(s) + '</div>';
      h += '<div class="card"><b>Sign in</b><p class="hint" style="margin:6px 0 10px">First time? Choose an email and password, then tap Create account. Your records on this phone are then uploaded. On another phone, use the same email and password and tap Sign in.</p>' +
        '<div class="field"><label for="sync-email">Email</label><input id="sync-email" type="email" autocomplete="username" value="' + esc(UI.syncEmail || '') + '"></div>' +
        '<div class="field"><label for="sync-pass">Password: 8+ letters and numbers</label><input id="sync-pass" type="password" autocomplete="current-password"></div>' +
        '<div id="sync-msg"></div><div class="actions"><button class="btn kiosk" data-act="syncSignUp">Create account</button><button class="btn primary" data-act="syncSignIn">Sign in</button></div>' +
        '<button class="btn block" data-act="syncReset" style="border:0;background:none;color:var(--ink-soft)">Forgot password?</button></div>';
      h += '<button class="btn danger block" data-act="syncRemove">Remove online setup</button>';
      return h;
    }
    h += verifyCard(s) + '<div id="sync-live">' + syncLive(s) + '</div>';
    h += '<div class="actions"><button class="btn primary" data-act="syncNow">Sync now</button><button class="btn" data-act="syncSignOut">Sign out</button></div>' +
      '<p class="hint">Changes are saved on this phone first, then sent online in the background. If you are offline, they wait and go up as soon as you are back online.</p>';
    return h;
  };
  function syncMsg(t, ok) { var el = document.getElementById('sync-msg'); if (el) el.innerHTML = '<div class="' + (ok ? 'form-info' : 'form-error') + '">' + esc(t) + '</div>'; }
  function syncAuth(kind) {
    var em = document.getElementById('sync-email').value.trim(), pw = document.getElementById('sync-pass').value;
    UI.syncEmail = em;
    if (!em || !pw) { syncMsg('Type your email and password.'); return; }
    syncMsg(kind === 'signUp' ? 'Creating your account…' : 'Signing in…', true);
    Sync[kind](em, pw).then(function () {
      toast(kind === 'signUp' ? 'Account created. Confirm your email to start syncing.' : 'Signed in. Bringing in your records.');
      render();
    }, function (e) { syncMsg(e && e.message ? e.message : 'Something went wrong.'); });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { toast('Press and hold the text to copy it.'); });
    else toast('Press and hold the text to copy it.');
  }

  /* ================= Phone numbers ================= */
  function ccOptions(sel) {
    var list = COUNTRIES.list.slice().sort(function (x, y) { return x.iso === 'GM' ? -1 : y.iso === 'GM' ? 1 : x.name.localeCompare(y.name); });
    return list.map(function (c) { return '<option value="' + c.iso + '"' + (c.iso === sel ? ' selected' : '') + '>+' + c.dial + ' ' + esc(c.name) + '</option>'; }).join('');
  }
  function phoneNote(raw, iso) {
    var s = String(raw || '').trim(), d = s.replace(/\D/g, '');
    if (!/^(\+|00)/.test(s) && d.length < (iso === 'GM' ? 7 : 6)) return '';
    var p = C.parsePhone(s, iso);
    if (!p.ok) return '<span class="neterr">' + esc(p.error) + '</span>';
    var h = p.network ? '<span class="netpill">' + esc(p.network) + (p.prefix ? ' · ' + p.prefix : '') + '</span>' : '<span class="netpill alt">' + esc(p.country) + '</span>';
    if (p.iso === 'GM' && d !== p.local && !/^(\+|00)/.test(s)) h += '<span class="netq">Will be saved as ' + esc(p.value.charAt(0) === '+' ? '+220 ' + p.local : p.local) + '</span>';
    return h;
  }
  function telHTML(f, v, id, list) {
    var info = C.phoneInfo(v), iso = info.iso || S.settings.profile.country, shown = info.empty ? '' : info.local;
    return '<div class="telrow"><select class="ccsel" name="' + f.k + '__cc" aria-label="Country of this number">' + ccOptions(iso) + '</select>' +
      '<input id="' + id + '" name="' + f.k + '" type="tel" inputmode="tel"' + list + ' value="' + esc(shown) + '" autocomplete="off"></div><div class="netline">' + phoneNote(shown, iso) + '</div>';
  }
  function telBox(el) { return el && el.closest('.field'); }
  function updateNet(el) {
    var box = telBox(el); if (!box) return;
    var inp = box.querySelector('input[type=tel]'), sel = box.querySelector('.ccsel'), line = box.querySelector('.netline');
    if (inp && line) line.innerHTML = phoneNote(inp.value, sel ? sel.value : S.settings.profile.country);
  }
  function telParse(el) {
    var box = telBox(el), inp = box.querySelector('input[type=tel]'), sel = box.querySelector('.ccsel');
    return C.parsePhone(inp.value, sel ? sel.value : S.settings.profile.country);
  }
  function setTel(box, stored) {
    var inp = box.querySelector('input[type=tel]'), sel = box.querySelector('.ccsel'), info = C.phoneInfo(stored);
    if (sel) sel.value = info.iso || S.settings.profile.country;
    inp.value = info.empty ? '' : info.local; updateNet(inp);
  }
  // When someone leaves the box: show the standard form of the number, and pick the country if they typed +code.
  function tidyTel(inp) {
    var box = telBox(inp), sel = box.querySelector('.ccsel'), raw = inp.value.trim(); if (!raw) { updateNet(inp); return; }
    var p = C.parsePhone(raw, sel ? sel.value : S.settings.profile.country);
    if (p.ok && !p.empty) {
      if (sel && p.iso) sel.value = p.iso;
      if (p.iso === 'GM' && raw.replace(/\D/g, '').length === 7 && p.prefix) toast('Changed to the new 9-digit number');
      inp.value = p.local;
    }
    updateNet(inp);
  }

  /* ================= Risk ================= */
  function riskFor(key) { var l = R.risk.customers; for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return null; }
  var RISK_PILL = { High: 'p-overdue', Medium: 'p-outstanding', Low: 'p-paid' };
  function limitText(rk) {
    if (!rk) return '';
    if (rk.limit <= 0) return 'No credit: pay on the spot';
    return 'Credit limit ' + money(rk.limit) + (rk.manual !== null ? ' (set by you)' : ' (suggested)');
  }
  function riskBlock(rk) {
    if (!rk) return '';
    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>Risk</b>' + pill(rk.level + ' risk', RISK_PILL[rk.level]) + '</div>' +
      kv('Credit', esc(limitText(rk))) + (rk.over ? '<div class="form-error" style="margin:8px 0 0">Over the credit limit by ' + money(rk.owed - rk.limit) + '</div>' : '') +
      (rk.reasons.length ? '<ul class="reasons">' + rk.reasons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="hint" style="margin:8px 0 0">No warning signs.</p>') +
      '<div class="actions" style="margin-bottom:0"><button class="btn" data-act="setLimit" data-key="' + esc(rk.key) + '">Set credit limit</button></div></div>';
  }
  function creditWarning(c, sf) {
    if (!FORM || !FORM.isNew || !(sf > 0)) return '';
    var rk = riskFor(c.key); if (!rk) return '';
    var newOwed = r2(c.owed + sf), msgs = [];
    if (rk.level === 'High') msgs.push(esc(c.name) + ' is high risk. Ask for payment now instead of giving credit.');
    if (newOwed > rk.limit) msgs.push('This goes over their credit limit of ' + money(rk.limit) + '. They would have ' + money(newOwed) + ' to pay.');
    return msgs.length ? '<div class="form-error">' + msgs.join(' ') + '</div>' : '';
  }
  function riskCard() {
    var al = R.risk.alerts; if (!al.length) return '';
    return '<div class="card risk-card"><b>Risk alerts</b>' + al.slice(0, 3).map(function (x) {
      return '<div class="alert ' + x.level.toLowerCase() + '"><i></i><span>' + esc(x.text) + '</span></div>';
    }).join('') + '<button class="btn block" data-act="go" data-v="risk" style="margin-top:8px">Open risk check</button></div>';
  }
  VIEWS.risk = function () {
    var rk = R.risk, s = rk.summary, h = '';
    h += '<div class="figures">' +
      '<div class="figure"><div class="label">High risk customers</div><div class="big ' + (s.high ? 'c-owed' : '') + '">' + s.high + '</div></div>' +
      '<div class="figure"><div class="label">Medium risk customers</div><div class="big">' + s.medium + '</div></div>' +
      '<div class="figure wide"><div class="label">Money at risk</div><div class="big ' + (s.atRisk ? 'c-owed' : 'c-credit') + '">' + money(s.atRisk) + '</div><div class="sub">To collect from medium and high risk customers</div></div></div>';
    h += '<div class="section-title">Warnings</div>';
    h += rk.alerts.length ? '<div class="card">' + rk.alerts.map(function (x) { return '<div class="alert ' + x.level.toLowerCase() + '"><i></i><span>' + esc(x.text) + '</span></div>'; }).join('') + '</div>'
      : '<p class="hint">No warnings right now.</p>';
    var list = rk.customers.filter(function (c) { return c.owed > 0 || c.level !== 'Low'; });
    h += '<div class="section-title">Customers</div>';
    h += list.length ? list.map(function (c) {
      return '<div class="card"><div class="top" style="display:flex;justify-content:space-between;gap:10px"><div><b>' + esc(c.name || c.phone) + '</b><div class="hint" style="margin:0">' + esc(limitText(c)) + '</div></div>' +
        '<div style="text-align:right">' + pill(c.level + ' risk', RISK_PILL[c.level]) + '<div class="amount c-owed" style="margin-top:4px">' + (c.owed > 0 ? 'Owes ' + money(c.owed) : '') + '</div></div></div>' +
        (c.over ? '<div class="form-error" style="margin:8px 0 0">Over the credit limit by ' + money(c.owed - c.limit) + '</div>' : '') +
        (c.reasons.length ? '<ul class="reasons">' + c.reasons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
        '<div class="actions" style="margin-bottom:0">' + (c.owed > 0 ? '<button class="btn kiosk" data-act="shareFor" data-type="Customer" data-key="' + esc(c.key) + '">Send reminder</button>' : '') +
        '<button class="btn" data-act="setLimit" data-key="' + esc(c.key) + '">Set credit limit</button></div></div>';
    }).join('') : '<p class="hint">No customer has money to pay. Well done.</p>';
    if (rk.agents.length) {
      h += '<div class="section-title">Agents with money to pay you</div>' + rk.agents.map(function (a) {
        return '<div class="card"><div style="display:flex;justify-content:space-between;gap:10px"><b>' + esc(a.name) + '</b>' + pill(a.level + ' risk', RISK_PILL[a.level]) + '</div>' +
          kv('Owes us', money(a.net)) + (a.reasons.length ? '<ul class="reasons">' + a.reasons.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
      }).join('');
    }
    h += '<div class="card help"><h3 style="margin-top:0">How the risk score works</h3><p>Points are added for: money unpaid for a long time, owing much more than their usual purchase, paying late before, and past write-offs. 60 points or more is High risk, 30 or more is Medium.</p>' +
      '<p>Suggested credit: Low risk regular customers up to two of their usual purchases; other Low risk customers one; Medium risk one; High risk none. Tap "Set credit limit" to choose your own.</p></div>';
    return h;
  };

  /* ================= Forms ================= */
  function opts(src) { return typeof src === 'string' ? (S.settings[src] || []) : src; }
  function labelOf(f, vals) { return typeof f.label === 'function' ? f.label(vals) : (f.label || ''); }
  function isReq(f, vals) { return typeof f.req === 'function' ? !!f.req(vals) : !!f.req; }
  function tipLabel() {
    var m = S.settings.tipMode;
    return m === 'included' ? 'Tip Included in the Amount Received' : m === 'passon' ? 'Tip to Hand Over (Not Your Income)' : 'Tip on Top (Extra Income)';
  }
  function woLabel() { return 'Write Off as Bad Debt (' + sym() + ')'; }
  function isWE(v) { return v.kind === 'WE'; }
  function notWE(v) { return v.kind !== 'WE'; }
  function isPart(v) { return v.payMode === 'part'; }
  function isPaid(v) { return v.payMode === 'full' || v.payMode === 'part'; }
  function inferPay(r) {
    if (r.payMode) return r.payMode;
    if (!(num(r.billed) > 0)) return '';
    return num(r.received) >= num(r.billed) ? 'full' : num(r.received) > 0 ? 'part' : 'credit';
  }
  function lastEvcFor(provider) {
    var rows = S.evc.filter(function (r) { return !provider || r.provider === provider; }).sort(byNewest);
    return rows[0] || null;
  }

  var SCHEMAS = {
    sale: { title: ['New Sale', 'Edit Sale'], coll: 'sales', prefix: function (v) { return v.kind === 'WE' ? 'WE' : 'DS'; }, fields: [
      { k: 'kind', t: 'seg', opts: [['DS', 'Data / Deposit'], ['WE', 'Wallet Exchange']] },
      { k: 'date', t: 'pickdate', label: 'Date', req: 1 },
      { k: 'time', t: 'time', label: 'Time' },
      { k: 'phone', t: 'tel', label: 'Phone', list: 'custPhones' },
      { k: 'name', t: 'text', label: 'Name', req: 1, list: 'custNames' },
      { k: 'exType', t: 'select', label: 'Exchange Type', opts: 'exTypes', show: isWE },
      { k: 'details', t: 'text', label: 'Details' },
      { k: 'billed', t: 'num', label: 'Amount', req: 1 },
      { k: 'costOut', t: 'num', label: 'Sent Out', show: isWE },
      { k: 'payMode', t: 'paymode', label: 'Payment', req: 1 },
      { k: 'received', t: 'num', label: 'Received So Far', req: isPart, show: isPart },
      { k: 'channel', t: 'selectother', label: 'Paid Through', opts: 'channels', req: isPaid, show: isPaid },
      { k: 'bank', t: 'selectother', label: bankLabel, opts: 'banks', show: function (v) { return isPaid(v) && viaBank(v); } },
      { k: 'costDs', t: 'num', label: 'Your Cost', more: 1, show: notWE },
      { k: 'tip', t: 'num', label: tipLabel, more: 1 },
      { k: 'beneficiary', t: 'tel', label: 'Receiving Number', more: 1 },
      { k: 'datePaid', t: 'date', label: 'Date Paid', more: 1 },
      { k: 'writtenOff', t: 'num', label: woLabel, more: 1 },
      { k: 'woReason', t: 'select', label: 'Reason for Write-Off', opts: 'woReasons', show: function (v) { return num(v.writtenOff) > 0; }, more: 1 },
      { k: 'notes', t: 'area', label: 'Notes', more: 1 }],
      defaults: function () { return { kind: 'DS', date: '', payMode: S.settings.payDefault || '', channel: '' }; },
      keep: ['kind', 'date'], info: saleInfo },
    payment: { title: ['Debt Payment', 'Edit Debt Payment'], coll: 'sales', prefix: function () { return 'PY'; }, fields: [
      { k: 'date', t: 'pickdate', label: 'Date', req: 1 },
      { k: 'time', t: 'time', label: 'Time' },
      { k: 'phone', t: 'tel', label: 'Phone', list: 'custPhones' },
      { k: 'name', t: 'text', label: 'Name', req: 1, list: 'custNames' },
      { k: 'received', t: 'num', label: 'Amount Paid', req: 1 },
      { k: 'channel', t: 'selectother', label: 'Paid Through', opts: 'channels', req: 1 },
      { k: 'bank', t: 'selectother', label: bankLabel, opts: 'banks', show: viaBank },
      { k: 'tip', t: 'num', label: tipLabel, more: 1 },
      { k: 'notes', t: 'area', label: 'Notes', more: 1 }],
      defaults: function () { return { date: '', channel: '' }; },
      keep: ['date'], info: paymentInfo,
      check: function (v, errs) { if (!(num(v.received) > 0)) errs.push('Type the amount they paid.'); } },
    agent: { title: ['New Agent Entry', 'Edit Agent Entry'], coll: 'agents', prefix: function () { return 'AL'; }, fields: [
      { k: 'date', t: 'pickdate', label: 'Date', req: 1 },
      { k: 'time', t: 'time', label: 'Time' },
      { k: 'name', t: 'text', label: 'Agent Name', req: 1, list: 'agentNames' },
      { k: 'phone', t: 'tel', label: 'Agent Phone', list: 'agentPhones' },
      { k: 'type', t: 'multi', label: 'Agent Type', opts: AGENT_TYPES },
      { k: 'txNumber', t: 'tel', label: 'Receiving Number' },
      { k: 'txType', t: 'select', label: 'Transaction Type', opts: 'agentTxTypes' },
      { k: 'toAgent', t: 'num', label: 'Paid to Agent', half: 1 },
      { k: 'fromAgent', t: 'num', label: 'Received from Agent', half: 1 },
      { k: 'desc', t: 'text', label: 'Description (Optional)' },
      { k: 'writtenOff', t: 'num', label: woLabel, more: 1 },
      { k: 'woReason', t: 'select', label: 'Reason for Write-Off', opts: 'woReasons', show: function (v) { return num(v.writtenOff) > 0; }, more: 1 },
      { k: 'notes', t: 'area', label: 'Notes', more: 1 }],
      defaults: function () { return { date: '', type: '' }; },
      keep: ['date'], info: agentInfo,
      check: function (v, errs) { if (!C.has(v.toAgent) && !C.has(v.fromAgent) && !(num(v.writtenOff) > 0)) errs.push('Type the amount you paid to the agent, or received from the agent.'); } },
    referral: { title: ['New Referral Sale', 'Edit Referral Sale'], coll: 'referrals', prefix: function () { return 'RA'; }, fields: [
      { k: 'date', t: 'pickdate', label: 'Date', req: 1 },
      { k: 'time', t: 'time', label: 'Time' },
      { k: 'agent', t: 'text', label: 'Referring Agent', req: 1, list: 'refAgents' },
      { k: 'service', t: 'select', label: 'Service', opts: ['Data Sending', 'Deposit', 'EVC'], req: 1 },
      { k: 'amount', t: 'num', label: 'Amount (or the Day\'s Total)', req: 1 },
      { k: 'rate', t: 'num', label: 'Commission Rate (%)', show: function (v) { return v.service !== 'Deposit'; }, half: 1 },
      { k: 'share', t: 'num', label: 'Agent\'s Share (%)', half: 1 },
      { k: 'agentPhone', t: 'tel', label: 'Agent WhatsApp / Phone', more: 1 },
      { k: 'client', t: 'text', label: 'Client Name', more: 1 },
      { k: 'clientPhone', t: 'tel', label: 'Client Phone', more: 1 },
      { k: 'notes', t: 'area', label: 'Notes', more: 1 }],
      defaults: function () { return { date: '', service: 'Data Sending', share: 50 }; },
      keep: ['date', 'agent', 'agentPhone', 'service', 'rate', 'share'], info: refInfo },
    wallet: { title: ['New Wallet Commission', 'Edit Wallet Commission'], coll: 'walletComm', fields: [
      { k: 'month', t: 'month', label: 'Month', req: 1 },
      { k: 'wallet', t: 'selectother', label: 'Wallet', opts: 'wallets', req: 1 },
      { k: 'earned', t: 'num', label: 'Commission on Statement', half: 1 },
      { k: 'received', t: 'num', label: 'Commission Paid to You', half: 1 },
      { k: 'shared', t: 'num', label: 'Shared with an Agent or Partner' },
      { k: 'agentName', t: 'text', label: 'Agent or Partner Name', list: 'agentNames' },
      { k: 'agentPhone', t: 'tel', label: 'Agent or Partner Phone', list: 'agentPhones' },
      { k: 'notes', t: 'area', label: 'Notes', more: 1 }],
      defaults: function () { return { month: R.today.slice(0, 7) }; },
      info: function (v) { return calcBox([['Net Commission', money(num(v.received) - num(v.shared))]]); } },
    evc: { title: ['New EVC Entry', 'Edit EVC Entry'], coll: 'evc', fields: [
      { k: 'month', t: 'month', label: 'Month', req: 1 },
      { k: 'provider', t: 'selectother', label: 'EVC Operator', opts: 'evcProviders', req: 1 },
      { k: 'purchase', t: 'num', label: 'Purchase Amount', req: 1, half: 1 },
      { k: 'wholesale', t: 'num', label: 'Sold to Dealers', half: 1 },
      { k: 'wholesaler', t: 'text', label: 'Dealer Name', list: 'agentNames', show: function (v) { return num(v.wholesale) > 0; } },
      { k: 'rate', t: 'num', label: 'Commission Rate (%)' },
      { k: 'retailRoy', t: 'num', label: 'Partner Share, Retail (%)', more: 1 },
      { k: 'wholesaleRoy', t: 'num', label: 'Partner Share, Wholesale (%)', more: 1 },
      { k: 'notes', t: 'area', label: 'Notes', more: 1 }],
      defaults: function () {
        var last = lastEvcFor(''), d = { month: R.today.slice(0, 7), provider: '' };
        if (last) { d.rate = last.rate; d.retailRoy = last.retailRoy; d.wholesaleRoy = last.wholesaleRoy; }
        return d;
      },
      info: function (v) {
        var x = C.computeEvc([v])[0];
        return calcBox([['Retail Part', money(x.retail)], ['Total Commission', money(x.total)], ['Shared with Partner', money(x.royalty)], ['Passed to Dealer', money(x.toWholesaler)], ['You Keep', money(x.net)]]);
      } },
    expense: { title: ['Money Out', 'Edit Money Out'], coll: 'expenses', prefix: function () { return 'EX'; }, fields: [
      { k: 'date', t: 'pickdate', label: 'Date It Was Paid', req: 1 },
      { k: 'time', t: 'time', label: 'Time' },
      { k: 'category', t: 'selectother', label: 'What Was It For?', opts: 'expenseCats', req: 1 },
      { k: 'amount', t: 'num', label: 'Amount', req: 1 },
      { k: 'paidFrom', t: 'select', label: 'Paid From', opts: 'capitalAccounts' },
      { k: 'note', t: 'text', label: 'Note' }],
      defaults: function () { return { date: '' }; },
      keep: ['date', 'category', 'paidFrom'],
      check: function (v, errs) { if (!(num(v.amount) > 0)) errs.push('Type an amount greater than 0.'); } },
    error: { title: ['Log an Error', 'Edit Error'], coll: 'errors', fields: [
      { k: 'date', t: 'date', label: 'Date Found', req: 1, half: 1 },
      { k: 'status', t: 'select', label: 'Status', opts: ['Open', 'In Progress', 'Fixed'], half: 1 },
      { k: 'type', t: 'select', label: 'Type of Error', opts: 'errorTypes' },
      { k: 'desc', t: 'area', label: 'What Happened' },
      { k: 'ledToLoss', t: 'select', label: 'Did It Cost Money?', opts: ['No', 'Yes'], half: 1 },
      { k: 'amountLost', t: 'num', label: 'Amount Lost', half: 1, show: function (v) { return v.ledToLoss === 'Yes'; } },
      { k: 'causedBy', t: 'select', label: 'Caused By', opts: 'causedBy', half: 1, more: 1 },
      { k: 'foundBy', t: 'text', label: 'Found By', half: 1, more: 1 },
      { k: 'correction', t: 'area', label: 'How It Was Fixed', more: 1 },
      { k: 'dateFixed', t: 'date', label: 'Date Fixed', more: 1 }],
      defaults: function () { return { date: R.today, status: 'Open', ledToLoss: 'No' }; } }
  };
  function calcBox(rows) { return '<div class="calc-box">' + rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>'; }
  function saleInfo(v) {
    var h = '', billed = num(v.billed), rec = v.payMode === 'full' ? billed : v.payMode === 'credit' ? 0 : num(v.received);
    var applied = Math.max(0, rec - (S.settings.tipMode === 'included' ? num(v.tip) : 0));
    var sf = r2(billed - applied - num(v.writtenOff));
    if (C.has(v.billed) && v.payMode) h += calcBox([['This Sale', sf > 0 ? money(sf) + ' to collect' : sf < 0 ? 'Overpaid by ' + money(-sf) : 'Fully paid']]);
    if (v.phone || v.name) {
      var c = findCustomer(C.custKey(v));
      if (c && FORM && FORM.isNew) {
        h += '<div class="form-info">' + esc(c.name || 'Known customer') + ' ' + (c.balance > 0 ? 'still has ' + money(c.balance) + ' to pay.' : c.credit > 0 ? 'paid ' + money(c.credit) + ' in advance. It is used on this sale automatically.' : 'has nothing to pay.') + ' ' + esc(c.type) + ' customer.</div>';
        h += creditWarning(c, sf);
      }
    }
    return h;
  }
  function paymentInfo(v) {
    if (!(v.phone || v.name)) return '';
    var c = findCustomer(C.custKey(v));
    if (!c) return '<div class="form-info">This customer owes nothing. The money is kept as paid ahead.</div>';
    var applied = Math.max(0, num(v.received) - (S.settings.tipMode === 'included' ? num(v.tip) : 0)), after = r2(c.balance - applied);
    return calcBox([['Owes Now', c.balance > 0 ? money(c.balance) : c.balance < 0 ? 'Nothing, paid ahead ' + money(-c.balance) : 'Nothing'],
      ['After This', after > 0 ? 'Still owes ' + money(after) : after < 0 ? 'Paid ahead ' + money(-after) : 'Fully paid']]);
  }
  function agentInfo(v) {
    var n = r2(num(v.toAgent) - num(v.fromAgent) - num(v.writtenOff)), h = '';
    if (C.has(v.toAgent) || C.has(v.fromAgent)) h += calcBox([['This Entry', n > 0 ? 'Agent owes us ' + money(n) : n < 0 ? 'We owe the agent ' + money(-n) : 'Even']]);
    var a = v.name ? findAgent(C.agentKey(v.name)) : null;
    if (a && FORM && FORM.isNew) {
      var after = r2(a.net + n);
      h += '<div class="form-info">' + esc(a.name) + ' now: ' + (a.net > 0 ? 'to collect ' + money(a.net) : a.net < 0 ? 'to pay ' + money(-a.net) : 'settled') +
        '. After this entry: ' + (after > 0 ? 'to collect ' + money(after) : after < 0 ? 'to pay ' + money(-after) : 'settled') + '.</div>';
    }
    return h;
  }
  function refInfo(v) {
    var x = C.has(v.amount) ? (v.service === 'Deposit' ? C.bracketCommission(v.amount, S.brackets) : r2(num(v.amount) * num(v.rate) / 100)) : 0;
    var cut = r2(x * num(v.share) / 100);
    return calcBox([['Commission', money(x)], ['Agent\'s Cut', money(cut)], ['You Keep', money(x - cut)]]);
  }

  var FORM = null;
  // The phone's own suggestion list was replaced by suggestions while typing (see showSuggest).
  function datalists() { return ''; }
  function fieldHTML(f, vals) {
    var v = vals[f.k]; if (v == null) v = '';
    var id = 'f_' + f.k, hide = f.show && !f.show(vals) ? ' hide' : '', text = labelOf(f, vals), req = isReq(f, vals) || f.req ? ' *' : '';
    var lab = text ? '<label for="' + id + '">' + esc(text) + req + '</label>' : '';
    var note = f.note ? '<div class="note">' + esc(f.note) + '</div>' : '';
    var list = f.list ? ' data-suggest="' + SUGGEST_KIND[f.list] + '"' : '';
    if (f.t === 'seg') {
      return '<div class="field" data-field="' + f.k + '"><div class="seg">' + f.opts.map(function (o) {
        return '<button type="button" data-act="formSeg" data-k="' + f.k + '" data-v="' + esc(o[0]) + '" class="' + (v === o[0] ? 'on' : '') + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div><input type="hidden" name="' + f.k + '" value="' + esc(v) + '"></div>';
    }
    if (f.t === 'pickdate') {
      var yd = addDays(R.today, -1), which = !v ? '' : v === R.today ? 'today' : v === yd ? 'yesterday' : 'other';
      var chip = function (w, t1, t2) { return '<button type="button" class="dchip' + (which === w ? ' on' : '') + '" data-act="pickDate" data-v="' + w + '"><b>' + t1 + '</b><small>' + t2 + '</small></button>'; };
      return '<div class="field datefield" data-field="' + f.k + '"><label for="' + id + '">' + esc(text) + ' *</label><div class="datechips">' +
        chip('today', 'Today', dayShort(R.today)) + chip('yesterday', 'Yesterday', dayShort(yd)) + chip('other', 'Other Date', which === 'other' ? dayShort(v) : 'Pick') +
        '</div><input id="' + id + '" name="' + f.k + '" type="date" value="' + esc(v) + '" class="' + (which === 'other' ? '' : 'hide-date') + '">' +
        '' + '</div>';
    }
    if (f.t === 'paymode') {
      var modes = [['full', 'Paid in Full', 'Money received'], ['part', 'Part Paid', 'Some received'], ['credit', 'On Credit', 'Nothing yet']];
      return '<div class="field" data-field="' + f.k + '"><label>' + esc(text) + ' *</label><div class="paychips">' + modes.map(function (m) {
        return '<button type="button" class="pchip ' + m[0] + (v === m[0] ? ' on' : '') + '" data-act="payMode" data-v="' + m[0] + '"><b>' + m[1] + '</b><small>' + m[2] + '</small></button>';
      }).join('') + '</div><input type="hidden" name="' + f.k + '" value="' + esc(v) + '">' + '' + '</div>';
    }
    if (f.t === 'multi') {
      return '<div class="field' + hide + '" data-field="' + f.k + '">' + lab + multiHTML(f.k, f.opts, v) + '</div>';
    }
    if (f.t === 'check') {
      return '<div class="field' + hide + '" data-field="' + f.k + '"><label class="check"><input type="checkbox" name="' + f.k + '"' + (v ? ' checked' : '') + '><span>' + esc(text) + '</span></label></div>';
    }
    var inp;
    if (f.t === 'select' || f.t === 'selectother') {
      var o = opts(f.opts).slice(); if (v && o.indexOf(v) < 0) o.unshift(v);
      inp = '<select id="' + id + '" name="' + f.k + '"' + (PICK_LISTS[f.opts] ? ' data-pick="1"' : '') + '><option value="">Choose</option>' + o.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') +
        (f.t === 'selectother' ? '<option value="__other">Other (type your own)…</option>' : '') + '</select>';
      if (f.t === 'selectother') inp += '<input class="otherbox hide" name="' + f.k + '__other" placeholder="Type it here" aria-label="Other, type your own" autocomplete="off">';
    } else if (f.t === 'area') {
      inp = '<textarea id="' + id + '" name="' + f.k + '">' + esc(v) + '</textarea>';
    } else if (f.t === 'num') {
      inp = '<input id="' + id + '" name="' + f.k + '" type="number" step="any" inputmode="decimal" value="' + esc(v) + '">';
    } else if (f.t === 'tel') {
      inp = telHTML(f, v, id, list);
    } else {
      var type = f.t === 'date' ? 'date' : f.t === 'month' ? 'month' : f.t === 'time' ? 'time' : 'text';
      inp = '<input id="' + id + '" name="' + f.k + '" type="' + type + '"' + list + ' value="' + esc(v) + '" autocomplete="off">';
    }
    return '<div class="field' + hide + '" data-field="' + f.k + '">' + lab + inp + note + '</div>';
  }
  function fieldsHTML(fields, vals) {
    var h = '', i = 0;
    while (i < fields.length) {
      var f = fields[i];
      if (f.half && fields[i + 1] && fields[i + 1].half) { h += '<div class="two">' + fieldHTML(f, vals) + fieldHTML(fields[i + 1], vals) + '</div>'; i += 2; }
      else { h += fieldHTML(f, vals); i++; }
    }
    return h;
  }
  function formBody(fields, vals, openMore) {
    var main = fields.filter(function (f) { return !f.more; }), extra = fields.filter(function (f) { return f.more; });
    var h = fieldsHTML(main, vals);
    if (extra.length) h += '<details class="more-fields"' + (openMore ? ' open' : '') + '><summary>More Details</summary><div class="inner">' + fieldsHTML(extra, vals) + '</div></details>';
    return h;
  }
  function hasMoreValues(fields, vals) {
    return fields.some(function (f) { var v = vals[f.k]; return f.more && v !== '' && v != null && v !== 0 && v !== false; });
  }
  function autoTime(vals) { if (vals.date === R.today && !vals.time) vals.time = nowTime(); return vals; }
  function openForm(type, rec, extra) {
    UI.draftId = null;
    var sc = SCHEMAS[type], isNew = !rec;
    var vals = Object.assign({}, isNew && sc.defaults ? sc.defaults() : {}, rec || {}, (extra && extra.prefill) || {});
    if (type === 'sale') { vals.payMode = isNew ? vals.payMode : inferPay(rec); if (!isNew) vals.costDs = rec.costOut; }
    if (isNew && sc.fields.some(function (f) { return f.k === 'time'; })) autoTime(vals);
    var title = (extra && extra.title) || sc.title[isNew ? 0 : 1];
    var body = (type === 'sale' && isNew ? '<button type="button" class="btn block" data-act="openBatch" data-mode="sale" style="margin-bottom:12px">Several Sales? Record Them All at Once</button>' : '') +
      (type === 'agent' && isNew ? '<button type="button" class="btn block" data-act="openAgentBatch" style="margin-bottom:12px">Several Entries? Record Them All at Once</button>' : '') +
      '<div id="form-error"></div>' + formBody(sc.fields, vals, !isNew && hasMoreValues(sc.fields, vals)) + '<div id="form-info"></div>' + datalists();
    if (!isNew && rec.id && sc.coll === 'sales') {
      var cs = R.sales.filter(function (x) { return x.id === rec.id; })[0];
      if (cs && cs.remaining > 0 && type === 'sale') body += '<button class="btn kiosk block" data-act="recordPayment" style="margin-bottom:10px">Record a Payment on This Sale</button>';
    }
    if (!isNew) {
      body += '<p class="hint">Reference ' + esc(rec.refId || '') + (rec.recordedAt ? '. Recorded ' + esc(stamp(rec.recordedAt)) : '') + (rec.editedAt ? '. Last changed ' + esc(stamp(rec.editedAt)) : '') + '.</p>';
    }
    var foot = (!isNew && sc.coll ? '<button class="btn danger" data-act="deleteRec">Delete</button>' : '') +
      (isNew && sc.keep ? '<button class="btn" data-act="saveAnother">Save, Add Another</button>' : '') +
      '<button class="btn primary" data-act="saveForm">Save</button>';
    openSheet(title, body, foot);
    FORM = Object.assign({ type: type, schema: sc, rec: rec, isNew: isNew }, extra || {});
    refreshForm();
  }
  function collect() {
    var vals = {}, el = document.getElementById('sheetwrap');
    FORM.schema.fields.forEach(function (f) {
      var inp = el.querySelector('[name="' + f.k + '"]'); if (!inp) return;
      if (f.t === 'check') { vals[f.k] = !!inp.checked; return; }
      if (f.t === 'tel') { var p = telParse(inp); vals[f.k] = p.ok ? p.value : inp.value.trim(); vals['__tel_' + f.k] = p; return; }
      var x = inp.value;
      if (f.t === 'selectother') {
        vals['__pick_' + f.k] = x;
        if (x === '__other') { var ob = el.querySelector('[name="' + f.k + '__other"]'); x = ob ? ob.value.trim() : ''; }
        vals[f.k] = x; return;
      }
      vals[f.k] = f.t === 'num' ? (String(x).trim() === '' ? '' : Number(x)) : String(x).trim();
    });
    return vals;
  }
  function refreshForm() {
    if (!FORM) return;
    var vals = collect(), el = document.getElementById('sheetwrap');
    enhancePickers(el); enhanceQuick(el);
    FORM.schema.fields.forEach(function (f) {
      var box = el.querySelector('[data-field="' + f.k + '"]'); if (!box) return;
      if (f.show) box.classList.toggle('hide', !f.show(vals));
      if (f.t === 'selectother') { var ob = box.querySelector('.otherbox'); if (ob) ob.classList.toggle('hide', vals['__pick_' + f.k] !== '__other'); }
      var lb = box.querySelector('label[for]'); if (lb && typeof f.label === 'function') lb.textContent = f.label(vals) + (isReq(f, vals) ? ' *' : '');
      else if (lb && typeof f.req === 'function') lb.textContent = labelOf(f, vals) + (isReq(f, vals) ? ' *' : '');
    });
    var info = el.querySelector('#form-info');
    if (info && FORM.schema.info) info.innerHTML = FORM.schema.info(vals);
    var hasPick = FORM.schema.fields.some(function (f) { return f.t === 'pickdate'; });
    var sb = el.querySelector('[data-act=saveForm]');
    if (sb && hasPick) sb.textContent = vals.date ? 'Save for ' + dayShort(vals.date) : 'Save';
  }
  function openSheet(title, body, foot) {
    removeSheet();
    var el = document.createElement('div'); el.id = 'sheetwrap';
    el.innerHTML = '<div class="sheet-back" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header><h2>' + esc(title) + '</h2><button data-act="closeSheet">Close</button></header><div class="body">' + body + '</div><footer>' + foot + '</footer></div>';
    document.body.appendChild(el);
    UI.sheetOpen = true; document.body.style.overflow = 'hidden'; UI.draftDone = false;
    history.pushState({ sheet: 1 }, '');
    setTimeout(function () { enhancePickers(el); enhanceQuick(el); foldHints(el); }, 0);
  }
  function removeSheet() {
    var el = document.getElementById('sheetwrap'); if (el) el.remove();
    UI.sheetOpen = false; FORM = null; document.body.style.overflow = '';
    if (UI.pendingRender) { UI.pendingRender = false; render(); }
  }
  function closeSheet() { if (UI.sheetOpen) history.back(); }
  function findRec(coll, id) { var a = S[coll]; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function showErr(msgs) {
    var box = document.getElementById('form-error'); if (!box) return;
    box.innerHTML = '<div class="form-error">' + msgs.map(esc).join('<br>') + '</div>';
    var b = document.querySelector('.sheet .body'); if (b) b.scrollTop = 0;
  }
  function refillForm(type, prefill) {
    var sc = SCHEMAS[type], vals = Object.assign({}, sc.defaults ? sc.defaults() : {}, prefill || {}); autoTime(vals);
    var el = document.querySelector('#sheetwrap .body');
    el.innerHTML = '<div id="form-error"></div>' + formBody(sc.fields, vals, false) + '<div id="form-info"></div>' + datalists();
    FORM = { type: type, schema: sc, rec: null, isNew: true };
    refreshForm(); el.scrollTop = 0;
  }
  function recordMeta(F, vals) {
    var pf = F.schema.prefix ? F.schema.prefix(vals) : '';
    if (F.isNew) {
      vals.id = uid(); vals.seq = S.nextSeq++; vals.recordedAt = Date.now();
      if (pf) vals.refId = C.newRefId(S, pf, vals.date);
    }
  }
  function saveForm(addAnother) {
    var F = FORM, vals = collect(), errs = [], missing = [];
    F.schema.fields.forEach(function (f) {
      if (f.show && !f.show(vals)) return;
      if ((isReq(f, vals) || f.req) && (vals[f.k] === '' || vals[f.k] == null)) missing.push(labelOf(f, vals));
      if (f.t === 'tel') { var p = vals['__tel_' + f.k]; if (p && !p.empty && !p.ok) errs.push(labelOf(f, vals) + ': ' + p.error); }
    });
    if (missing.length) errs.unshift('Fill in: ' + missing.join(', ') + '.');
    if (F.type === 'sale' && vals.payMode === 'part') {
      var rcv = num(vals.received), bil = num(vals.billed);
      if (C.has(vals.received) && C.has(vals.billed) && (rcv <= 0 || rcv >= bil)) errs.push('For Part Paid, the amount received must be more than 0 and less than the amount. If they paid it all, choose Paid in Full.');
    }
    if (F.schema.check) F.schema.check(vals, errs);
    if (errs.length) { showErr(errs); return; }
    F.schema.fields.forEach(function (f) { if (f.show && !f.show(vals)) vals[f.k] = ''; });
    // Choices typed under "Other" join the lists for next time.
    F.schema.fields.forEach(function (f) {
      if (f.t === 'selectother' && vals[f.k] && typeof f.opts === 'string') {
        var list = S.settings[f.opts] || []; if (list.indexOf(vals[f.k]) < 0) S.settings[f.opts] = list.concat([vals[f.k]]);
      }
    });
    if (F.type === 'sale') {
      if (vals.payMode === 'full') vals.received = vals.billed;
      else if (vals.payMode === 'credit') { vals.received = 0; vals.channel = ''; vals.bank = ''; }
      if (vals.kind === 'WE') vals.costDs = ''; else { vals.costOut = vals.costDs; vals.exType = ''; }
      delete vals.costDs; vals.type = '';
    }
    if (F.type === 'payment') { vals.kind = 'DS'; vals.type = 'payment'; vals.billed = 0; vals.payMode = ''; vals.details = 'Payment received'; }
    var kept = {}; (F.schema.keep || []).forEach(function (k) { kept[k] = vals[k]; });
    if (vals.channel) S.meta.lastChannel = vals.channel;
    Object.keys(vals).forEach(function (k) { if (k.indexOf('__') === 0) delete vals[k]; });
    undoPoint();
    if (F.captureId) inboxRemove(F.captureId);
    if (F.type === 'agent' && !vals.type) { var ka = findAgent(C.agentKey(vals.name)); vals.type = ka && ka.type ? ka.type : 'Regular Agent'; }
    var savedId = '';
    if (F.type === 'capital') savedId = saveCapital(vals);
    else if (F.isNew) { recordMeta(F, vals); S[F.schema.coll].push(vals); }
    else { Object.assign(F.rec, vals); F.rec.editedAt = Date.now(); if (!F.rec.refId && F.schema.prefix) F.rec.refId = C.newRefId(S, F.schema.prefix(F.rec), F.rec.date); }
    if (addAnother && F.isNew && F.schema.keep) {
      draftDrop(); UI.draftId = null;
      persist(); render(); refillForm(F.type, kept); offerUndo('Saved. Add the next one.');
      return;
    }
    draftFinished();
    persist().then(function () { if (F.type === 'capital') toast(checkMessage(savedId)); else offerUndo(F.isNew ? 'Saved' : 'Changes saved'); });
    closeSheet(); render();
  }
  function checkMessage(id) {
    var ck = R.checks.filter(function (c) { return c.id === id; })[0];
    if (!ck) return 'Saved';
    if (ck.opening === null) return 'Saved. This is your starting point for the next check.';
    if (ck.status === 'Balanced') return 'Saved. Your money balances.';
    return 'Saved. ' + money(Math.abs(ck.diff)) + (ck.status === 'Missing' ? ' is missing' : ' extra') + '. Open Daily Cash Check to see why.';
  }

  /* Balances form: every wallet, bank and cash account, plus any you add yourself */
  function snapPrev(date, skipId) {
    var list = S.capital.filter(function (s) { return s.id !== skipId && (!date || s.date <= date); }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.seq || 0) - (a.seq || 0); });
    return list[0] || null;
  }
  function buildCapital(rec, vals) {
    var accounts = S.settings.capitalAccounts.slice();
    if (rec) Object.keys(rec.balances || {}).forEach(function (k) { if (accounts.indexOf(k) < 0) accounts.push(k); });
    var fields = [{ k: 'date', t: 'pickdate', label: 'Date of These Balances', req: 1 }, { k: 'time', t: 'time', label: 'Time' }]
      .concat(accounts.map(function (a, i) { return { k: 'b' + i, t: 'num', label: a, half: 1, acct: a }; }))
      .concat([{ k: 'notes', t: 'area', label: 'Notes' }]);
    function balancesOf(v) { var b = {}; fields.forEach(function (f) { if (f.acct) b[f.acct] = v[f.k]; }); return b; }
    SCHEMAS.capital = { title: ['Record Balances', 'Change Balances'], coll: 'capital', fields: fields, keep: null,
      info: function (v) {
        var total = 0; fields.forEach(function (f) { if (f.acct) total += num(v[f.k]); });
        var rows = [['Total You Counted', money(total)]], extra = '';
        if (v.date) {
          try {
            var tmp = { id: '__new__', seq: 1e9, date: v.date, balances: balancesOf(v) };
            var st = Object.assign({}, S, { capital: S.capital.filter(function (x) { return !(FORM && FORM.rec && x.id === FORM.rec.id) && x.date !== v.date; }).concat([tmp]) });
            var ck = C.computeAll(st).checks.filter(function (x) { return x.id === '__new__'; })[0];
            if (ck && ck.opening !== null) {
              rows.push(['You Should Have', money(ck.expected)], ['Difference', ck.diff === 0 ? 'None, it balances' : (ck.diff < 0 ? 'Missing ' : 'Extra ') + money(Math.abs(ck.diff))]);
            } else if (ck) extra = '<div class="form-info">This is your first record. The next one will be checked against it.</div>';
          } catch (e) { /* the preview is only a help */ }
        }
        return calcBox(rows) + extra;
      } };
    C.setOptions(S.settings);
    return { fields: fields, vals: vals };
  }
  function openCapital(rec, presetDate) {
    var prev = rec ? snapPrev(rec.date, rec.id) : snapPrev('', '');
    (rec || prev) && Object.keys((rec || prev).balances || {}).forEach(function (k) { if (S.settings.capitalAccounts.indexOf(k) < 0) S.settings.capitalAccounts = S.settings.capitalAccounts.concat([k]); });
    var vals = { date: rec ? rec.date : (presetDate || ''), time: rec ? rec.time || '' : '', notes: rec ? rec.notes || '' : '' };
    var b = buildCapital(rec, vals), src = rec || prev;
    b.fields.forEach(function (f) { if (f.acct && src && src.balances && C.has(src.balances[f.acct])) vals[f.k] = src.balances[f.acct]; });
    FORM = null;
    openForm('capital', rec || null, { prefill: vals, title: rec ? 'Change Balances' : 'Record Balances' });
    var box = document.getElementById('sheetwrap').querySelector('.body');
    box.insertAdjacentHTML('beforeend', '<button type="button" class="btn block" data-act="addAccount" style="margin-top:12px">Add Another Account or Wallet</button>');
    if (!rec && prev) document.getElementById('form-error').innerHTML = '<div class="form-info">Filled in from your last record on ' + esc(shortDate(prev.date)) + '. Change what has moved.</div>';
  }
  function saveCapital(vals) {
    var bal = {}; FORM.schema.fields.forEach(function (f) { if (f.acct) bal[f.acct] = vals[f.k] === '' ? 0 : vals[f.k]; });
    var other = S.capital.filter(function (x) { return x.date === vals.date && !(FORM.rec && x.id === FORM.rec.id); })[0];
    if (FORM.isNew) {
      if (other) { other.balances = bal; other.notes = vals.notes; other.time = vals.time; other.editedAt = Date.now(); return other.id; }
      var rec = { id: uid(), seq: S.nextSeq++, recordedAt: Date.now(), date: vals.date, time: vals.time, balances: bal, notes: vals.notes };
      S.capital.push(rec); return rec.id;
    }
    FORM.rec.date = vals.date; FORM.rec.time = vals.time; FORM.rec.balances = bal; FORM.rec.notes = vals.notes; FORM.rec.editedAt = Date.now();
    if (other) S.capital.splice(S.capital.indexOf(other), 1);
    return FORM.rec.id;
  }

  /* ================= Several at once ================= */
  function payOptions(sel) {
    return [['', 'Choose'], ['full', 'Paid in Full'], ['part', 'Part Paid'], ['credit', 'On Credit']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
  }
  function chanOptions(first, sel) {
    return '<option value="">' + first + '</option>' + S.settings.channels.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }
  function rowTime() { return UI.batchDate === R.today ? nowTime() : ''; }
  function dateTimeRow() {
    return '<div class="two"><div class="field"><label>Date</label><input type="date" class="b-date" aria-label="Date" value="' + esc(UI.batchDate || '') + '"></div>' +
      '<div class="field"><label>Time</label><input type="time" class="b-time" aria-label="Time" value="' + rowTime() + '"></div></div>';
  }
  function saleBatchRow(i) {
    return '<div class="batch-row"><div class="batch-head"><b>Sale ' + (i + 1) + '</b><button type="button" class="linkbtn" data-act="batchRemove">Remove</button></div>' + dateTimeRow() +
      '<div class="field"><label>Phone</label><div class="telrow"><select class="ccsel b-cc" aria-label="Country of this number">' + ccOptions(S.settings.profile.country) + '</select>' +
      '<input type="tel" inputmode="tel" class="b-phone" aria-label="Customer phone" data-suggest="cust" autocomplete="off"></div><div class="netline"></div></div>' +
      '<div class="field"><label>Name</label><input type="text" class="b-name" aria-label="Customer name" data-suggest="cust" autocomplete="off"></div>' +
      '<div class="field"><label>Details</label><input type="text" class="b-details" aria-label="Details"></div>' +
      '<div class="two"><div class="field"><label>Amount</label><input type="number" step="any" inputmode="decimal" class="b-amount" aria-label="Amount"></div>' +
      '<div class="field"><label>Payment</label><select class="b-pay" aria-label="How was it paid">' + payOptions(S.settings.payDefault || '') + '</select></div></div>' +
      '<div class="field b-recv-wrap hide"><label>Received So Far</label><input type="number" step="any" inputmode="decimal" class="b-received" aria-label="Amount received so far"></div>' +
      '<div class="field"><label>Paid Through</label><select class="b-channel" data-pick="1" aria-label="Paid through">' + chanOptions('Same as above') + '</select></div></div>';
  }
  function agentBatchRow(i) {
    return '<div class="batch-row"><div class="batch-head"><b>Entry ' + (i + 1) + '</b><button type="button" class="linkbtn" data-act="batchRemove">Remove</button></div>' + dateTimeRow() +
      '<div class="field"><label>Agent Name</label><input type="text" class="b-agent" aria-label="Agent name" data-suggest="agent" autocomplete="off"></div>' +
      '<div class="field"><label>Agent Phone</label><div class="telrow"><select class="ccsel b-acc" aria-label="Country of this number">' + ccOptions(S.settings.profile.country) + '</select>' +
      '<input type="tel" inputmode="tel" class="b-aphone" aria-label="Agent phone" data-suggest="agent" autocomplete="off"></div><div class="netline"></div></div>' +
      '<div class="field"><label>Agent Type</label>' + multiHTML('', AGENT_TYPES, '', 'b-types') + '</div>' +
      '<div class="field"><label>Receiving Number</label><div class="telrow"><select class="ccsel b-tcc" aria-label="Country of this number">' + ccOptions(S.settings.profile.country) + '</select>' +
      '<input type="tel" inputmode="tel" class="b-txnum" aria-label="Receiving number" autocomplete="off"></div><div class="netline"></div></div>' +
      '<div class="field"><label>Transaction Type</label><select class="b-txtype" aria-label="Transaction type"><option value="">Choose</option>' + opts('agentTxTypes').map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></div>' +
      '<div class="two"><div class="field"><label>Paid to Agent</label><input type="number" step="any" inputmode="decimal" class="b-to" aria-label="Paid to agent"></div>' +
      '<div class="field"><label>Received from Agent</label><input type="number" step="any" inputmode="decimal" class="b-from" aria-label="Received from agent"></div></div>' +
      '<div class="field"><label>Description (Optional)</label><input type="text" class="b-desc" aria-label="Description"></div></div>';
  }
  function batchRowHTML(i) { return UI.batchMode === 'agent' ? agentBatchRow(i) : saleBatchRow(i); }
  function openBatch(mode) {
    if (UI.sheetOpen) draftDrop();
    UI.draftId = null;
    UI.batchMode = mode === 'agent' ? 'agent' : 'sale'; UI.batchDate = ''; UI.batchKind = 'DS';
    var isAgent = UI.batchMode === 'agent', top = '<div id="batch-top">' + (isAgent ? '' : seg('batchKind', 'DS', [['DS', 'Data / Deposit'], ['WE', 'Wallet Exchange']])) +
      fieldHTML({ k: 'bdate', t: 'pickdate', label: 'Date for All Rows' }, {}) +
      (isAgent ? '' : '<div class="field"><label for="b-chan">Paid Through, for All Rows</label><select id="b-chan" data-pick="1">' + chanOptions('Choose', '') + '<option value="__other">Other (type your own)…</option></select>' +
        '<input class="otherbox hide" id="b-chan-other" placeholder="Type it here" aria-label="Other, type your own" autocomplete="off"></div>' +
        '<div class="field hide" id="b-ex-wrap"><label for="b-ex">Exchange Type, for All Rows</label><select id="b-ex"><option value="">Choose</option>' + opts('exTypes').map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></div>') + '</div>';
    var body =       '<div id="form-error"></div>' + top + '<div id="batch-rows">' + batchRowHTML(0) + batchRowHTML(1) + batchRowHTML(2) + '</div>' +
      '<button class="btn block" data-act="batchAdd">Add Another Row</button>' + datalists();
    var foot = '<button class="btn primary" data-act="batchSave">Save All</button>', title = isAgent ? 'Several Agent Entries at Once' : 'Several Sales at Once';
    if (UI.sheetOpen) {
      var sh = document.querySelector('#sheetwrap .sheet');
      sh.querySelector('header h2').textContent = title;
      sh.querySelector('.body').innerHTML = body; sh.querySelector('footer').innerHTML = foot; sh.querySelector('.body').scrollTop = 0;
      FORM = null;
    } else openSheet(title, body, foot);
  }
  function batchDateChanged(v) {
    UI.batchDate = v;
    Array.prototype.forEach.call(document.querySelectorAll('#batch-rows .batch-row'), function (row) {
      var d = row.querySelector('.b-date'), t = row.querySelector('.b-time');
      if (!d.dataset.touched) d.value = v;
      if (t && !t.value && d.value === R.today) t.value = nowTime();
    });
  }
  function renumberBatch() {
    var word = UI.batchMode === 'agent' ? 'Entry ' : 'Sale ';
    Array.prototype.forEach.call(document.querySelectorAll('#batch-rows .batch-head b'), function (b, i) { b.textContent = word + (i + 1); });
  }
  function batchSave() { if (UI.batchMode === 'agent') batchSaveAgents(); else batchSaveSales(); }
  function batchFinish(out, coll, prefixOf, label) {
    var errsBox = document.getElementById('form-error');
    undoPoint();
    out.forEach(function (r) { r.id = uid(); r.seq = S.nextSeq++; r.recordedAt = Date.now(); r.refId = C.newRefId(S, prefixOf(r), r.date); S[coll].push(r); });
    draftFinished();
    persist().then(function () { offerUndo('Saved ' + out.length + (out.length === 1 ? ' ' + label : ' ' + label + 's')); });
    closeSheet(); render();
  }
  function batchSaveSales() {
    var rows = document.querySelectorAll('#batch-rows .batch-row'), errs = [], out = [], kind = UI.batchKind || 'DS';
    var topSel = document.getElementById('b-chan'), topChan = topSel.value === '__other' ? document.getElementById('b-chan-other').value.trim() : topSel.value, ex = document.getElementById('b-ex').value;
    Array.prototype.forEach.call(rows, function (row, i) {
      var g = function (cls) { var el = row.querySelector('.' + cls); return el ? el.value.trim() : ''; };
      var phone = g('b-phone'), name = g('b-name'), amount = g('b-amount'), n = 'Sale ' + (i + 1) + ': ';
      if (!phone && !name && !amount && !g('b-details')) return;
      var date = g('b-date'), miss = [], p = phone ? C.parsePhone(phone, row.querySelector('.b-cc').value) : { ok: true, value: '' }, pay = g('b-pay'), rec = g('b-received');
      if (!date) miss.push('date'); if (!name) miss.push('name'); if (amount === '' || !(Number(amount) >= 0)) miss.push('amount'); if (!pay) miss.push('how it was paid');
      if (miss.length) { errs.push(n + 'add the ' + miss.join(', ')); return; }
      if (!p.ok) { errs.push(n + p.error); return; }
      if (pay === 'part' && !(Number(rec) > 0 && Number(rec) < Number(amount))) { errs.push(n + 'for Part Paid, the amount received must be more than 0 and less than the amount'); return; }
      var chan = g('b-channel') || topChan;
      if (pay !== 'credit' && !chan) { errs.push(n + 'choose what it was paid through'); return; }
      var r = { kind: kind, date: date, time: g('b-time'), phone: p.value || '', name: name, details: g('b-details'), billed: Number(amount),
        received: pay === 'full' ? Number(amount) : pay === 'credit' ? 0 : Number(rec), payMode: pay, channel: pay === 'credit' ? '' : chan, type: '' };
      if (kind === 'WE') r.exType = ex;
      out.push(r);
    });
    var box = document.getElementById('form-error');
    if (errs.length) { box.innerHTML = '<div class="form-error">' + errs.map(esc).join('<br>') + '</div>'; document.querySelector('.sheet .body').scrollTop = 0; return; }
    if (!out.length) { box.innerHTML = '<div class="form-error">Type at least one sale.</div>'; return; }
    var chanUsed = out.map(function (r) { return r.channel; }).filter(Boolean);
    chanUsed.forEach(function (c) { if (S.settings.channels.indexOf(c) < 0) S.settings.channels = S.settings.channels.concat([c]); });
    if (topChan) S.meta.lastChannel = topChan;
    batchFinish(out, 'sales', function (r) { return r.kind === 'WE' ? 'WE' : 'DS'; }, 'sale');
  }
  function batchSaveAgents() {
    var rows = document.querySelectorAll('#batch-rows .batch-row'), errs = [], out = [];
    Array.prototype.forEach.call(rows, function (row, i) {
      var g = function (cls) { var el = row.querySelector('.' + cls); return el ? el.value.trim() : ''; };
      var name = g('b-agent'), to = g('b-to'), from = g('b-from'), n = 'Entry ' + (i + 1) + ': ';
      if (!name && !to && !from && !g('b-desc')) return;
      var date = g('b-date'), miss = [];
      if (!date) miss.push('date'); if (!name) miss.push('agent name'); if (to === '' && from === '') miss.push('amount paid or received');
      if (miss.length) { errs.push(n + 'add the ' + miss.join(', ')); return; }
      var known = findAgent(C.agentKey(name)), ap = g('b-aphone'), tn = g('b-txnum');
      var pa = ap ? C.parsePhone(ap, row.querySelector('.b-acc').value) : { ok: true, value: '' }, pt = tn ? C.parsePhone(tn, row.querySelector('.b-tcc').value) : { ok: true, value: '' };
      if (!pa.ok) { errs.push(n + 'agent phone: ' + pa.error); return; }
      if (!pt.ok) { errs.push(n + 'receiving number: ' + pt.error); return; }
      out.push({ date: date, time: g('b-time'), name: name, txType: g('b-txtype'), desc: g('b-desc'), toAgent: to === '' ? '' : Number(to), fromAgent: from === '' ? '' : Number(from),
        phone: pa.value || (known ? known.phone : ''), txNumber: pt.value || '', type: g('b-types') || (known && known.type ? known.type : 'Regular Agent') });
    });
    var box = document.getElementById('form-error');
    if (errs.length) { box.innerHTML = '<div class="form-error">' + errs.map(esc).join('<br>') + '</div>'; document.querySelector('.sheet .body').scrollTop = 0; return; }
    if (!out.length) { box.innerHTML = '<div class="form-error">Type at least one entry.</div>'; return; }
    batchFinish(out, 'agents', function () { return 'AL'; }, 'entry');
  }

  function val(id, d) { var el = document.getElementById(id); return el ? el.value : d; }
  function signInForm(intro) {
    return '<div class="card"><p class="hint" style="margin:0 0 10px">' + esc(intro) + '</p>' +
      '<div class="field"><label for="sync-email">Email</label><input id="sync-email" type="email" autocomplete="username" value="' + esc(UI.syncEmail || '') + '"></div>' +
      '<div class="field"><label for="sync-pass">Password</label><input id="sync-pass" type="password" autocomplete="current-password"></div>' +
      '<div id="sync-msg"></div><div class="actions"><button class="btn kiosk" data-act="syncSignUp">Create Account</button><button class="btn primary" data-act="syncSignIn">Sign In</button></div>' +
      '<button class="btn block" data-act="syncReset" style="border:0;background:none;color:var(--ink-soft)">Forgot password?</button></div>';
  }
  function deviceBanner() {
    var al = S.meta.deviceAlerts || []; if (!al.length) return '';
    var a = al[al.length - 1];
    return '<div class="banner stack"><span><b>A new phone signed in to your account.</b><br>' + esc(a.name) + ', ' + esc(stamp(a.at)) + '. If this was not you, remove it and change your password.</span>' +
      '<div class="actions" style="margin:8px 0 0"><button class="btn" data-act="go" data-v="security">Review</button><button class="btn" data-act="dismissAlerts">It Was Me</button></div></div>';
  }
  /* ----- PIN pad logic ----- */
  function pinPress(ch) {
    var g = gateState();
    if (g === 'lock') {
      var n = Security.cfg().pinLen || 4;
      if (UI.pin.length >= n) return;
      if (!UI.pin.length) UI.pinMsg = '';
      UI.pin += ch;
      if (UI.pin.length < n) { render(); return; }
      Security.checkPin(UI.pin).then(function (r) {
        UI.pin = '';
        if (r.ok) { UI.locked = false; UI.pinMsg = ''; UI.bioTried = false; render(); return; }
        UI.pinMsg = r.wait ? 'Too many wrong tries. Wait ' + r.wait + ' seconds.' : 'Wrong PIN. Try again.';
        render();
      });
      return;
    }
    if (g !== 'pinsetup') return;
    var step = UI.pinStep || (UI.changing && Security.enabled() ? 0 : 1);
    if (step === 0) {
      var len = Security.cfg().pinLen || 4;
      if (UI.pinBuf.length >= len) return;
      UI.pinBuf += ch;
      if (UI.pinBuf.length < len) { render(); return; }
      Security.checkPin(UI.pinBuf).then(function (r) { UI.pinBuf = ''; if (r.ok) { UI.pinStep = 1; UI.pinMsg = ''; } else UI.pinMsg = r.wait ? 'Too many wrong tries. Wait ' + r.wait + ' seconds.' : 'Wrong PIN. Try again.'; render(); });
    } else if (step === 1) {
      if (UI.pinBuf.length >= 6) return;
      UI.pinBuf += ch; UI.pinMsg = '';
      if (UI.pinBuf.length === 6) ACT.pinNext(); else render();
    } else if (step === 2) {
      UI.pinBuf += ch;
      if (UI.pinBuf.length < UI.pinFirst.length) { render(); return; }
      if (UI.pinBuf !== UI.pinFirst) { UI.pinMsg = 'The two PINs did not match. Start again.'; UI.pinStep = 1; UI.pinBuf = ''; UI.pinFirst = ''; render(); return; }
      var pin = UI.pinFirst; Security.cfg().pinLen = pin.length;
      Security.setPin(pin).then(function () { return Security.bioSupported(); }).then(function (ok) {
        UI.pinBuf = ''; UI.pinFirst = ''; UI.bioOK = ok;
        if (ok && !Security.bioEnabled()) { UI.pinStep = 3; render(); } else ACT.pinDone();
      });
    }
  }
  function gateForgot() {
    var back = '<button class="btn block" data-act="forgotBack" style="border:0;background:none;color:var(--ink-soft)">Back</button>';
    if (signedIn()) {
      return '<div class="gate bright"><div class="gate-brand"><span class="bigic">' + icon('lock') + '</span><h1>Forgot your PIN?</h1><p>Type your account password. Then you can choose a new PIN.</p></div><div class="card">' +
        '<div class="field"><label>Email</label><input value="' + esc(Sync.status().email) + '" readonly></div>' +
        '<div class="field"><label for="gf-pass">Password</label><input id="gf-pass" type="password" autocomplete="current-password"></div><div id="gf-msg"></div>' +
        '<button class="btn primary block" data-act="forgotReset">Reset My PIN</button>' + back + '</div></div>';
    }
    return '<div class="gate bright"><div class="gate-brand"><span class="bigic">' + icon('lock') + '</span><h1>Forgot your PIN?</h1><p>You do not have an account, so there is no way to prove who you are. Your records are only on this phone.</p></div><div class="card">' +
      '<p class="hint" style="margin-top:0">If you saved a backup, you can erase this phone, start over and restore the backup. Anything not in a backup will be lost.</p>' +
      '<button class="btn danger block" data-act="lockErase">Erase This Phone and Start Over</button>' + back + '</div></div>';
  }

  /* ================= Actions ================= */
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; if (!UI.sheetOpen && ['settings', 'home'].indexOf(cur().v) >= 0 || gateState()) render(); });
  window.addEventListener('appinstalled', function () { deferredInstall = null; S.meta.installHidden = true; saveLocal(); toast('Installed. Open it from your home screen.'); render(); });

  var ACT = {
    tab: function (d) { setTab(d.v); },
    setLang: function (d) { setLang(d.v); toast('Language saved'); },
    hType: function (d) { UI.hType = d.v; UI.limit = 120; render(); },
    hRange: function (d) { UI.hRange = d.v; UI.limit = 120; render(); },
    newExpense: function () { openForm('expense', null); },
    editExpense: function (d) { var r = findRec('expenses', d.id); if (r) openForm('expense', r); },
    openCheck: function (d) { go({ v: 'check', id: d.id }); },
    openAgentBatch: function () { openBatch('agent'); },
    addAccount: function () {
      var name = prompt('Name of the new account or wallet. For example: a bank, a new wallet, or money kept at home.');
      if (name === null) return; name = name.trim(); if (!name) return;
      if (S.settings.capitalAccounts.some(function (x) { return x.toLowerCase() === name.toLowerCase(); })) { toast('That account is already in the list.'); return; }
      var cur = FORM && FORM.rec, v = collect(), byAcct = {};
      FORM.schema.fields.forEach(function (f) { if (f.acct) byAcct[f.acct] = v[f.k]; });
      S.settings.capitalAccounts = S.settings.capitalAccounts.concat([name]);
      persist();
      var b = buildCapital(cur || null, {}), vals = { date: v.date, time: v.time, notes: v.notes };
      b.fields.forEach(function (f) { if (f.acct && byAcct[f.acct] !== undefined) vals[f.k] = byAcct[f.acct]; });
      var body = document.querySelector('#sheetwrap .body');
      body.innerHTML = '<div id="form-error"></div>' + formBody(b.fields, vals, false) + '<div id="form-info"></div>' + datalists() +
        '<button type="button" class="btn block" data-act="addAccount" style="margin-top:12px">Add Another Account or Wallet</button>';
      FORM.schema = SCHEMAS.capital; refreshForm(); toast(name + ' added');
    },
    payMode: function (d, el) {
      var field = el.closest('.field');
      Array.prototype.forEach.call(field.querySelectorAll('.pchip'), function (b) { b.classList.toggle('on', b === el); });
      field.querySelector('input[type=hidden]').value = d.v;
      var n = field.querySelector('.datenote'); if (n) n.remove();
      refreshForm();
    },
    applyCountry: function () { setCountry(val('lk-country', 'GM'), true); persist().then(function () { toast('Country, currency and colours updated'); }); render(); },
    saveCurrency: function () {
      var sy = val('lk-sym', '').trim(), code = val('lk-code', '').trim().toUpperCase();
      if (!sy || sy.length > 8) { toast('Type a currency symbol of up to 8 characters.'); return; }
      S.settings.currency = { symbol: sy, code: code }; applyLocale();
      persist().then(function () { toast('Currency saved'); }); render();
    },
    setTheme: function (d) { S.settings.theme = d.v; applyLocale(); persist(); render(); },
    setTip: function (d) { S.settings.tipMode = d.v; applyLocale(); persist().then(function () { toast('Tip rule saved'); }); render(); },
    setPayDefault: function (d) { S.settings.payDefault = d.v; persist().then(function () { toast('Saved'); }); render(); },
    toggleHide: function () { S.meta.hideAmounts = !S.meta.hideAmounts; persist(); render(); },
    saveProfile: function () {
      var name = val('pf-name', '').trim(), iso = val('pf-country', 'GM'), apply = document.getElementById('pf-apply') && document.getElementById('pf-apply').checked;
      if (!name) { toast('Type your name or business name.'); return; }
      S.settings.profile.name = name;
      if (apply) setCountry(iso, true); else { S.settings.profile.country = iso; applyLocale(); }
      persist().then(function () { toast('Saved'); }); history.back();
    },
    gateTab: function (d) { UI.gName = val('gc-name', UI.gName); UI.gCountry = val('gc-country', UI.gCountry); UI.syncEmail = val('sync-email', UI.syncEmail); UI.gateTab = d.v; render(); },
    gateCreate: function () {
      var name = val('gc-name', '').trim(), country = val('gc-country', 'GM'), em = val('sync-email', '').trim(), pw = val('sync-pass', '');
      UI.gName = name; UI.gCountry = country; UI.syncEmail = em;
      if (!name) { syncMsg('Type your name or business name.'); return; }
      if (!em || !pw) { syncMsg('Type your email and a password.'); return; }
      if (!Sync.strong(pw)) { syncMsg('Use at least 8 characters, with letters and numbers.'); return; }
      syncMsg('Creating your account…', true);
      Sync.signUp(em, pw).then(function () {
        S.settings.profile.name = name; setCountry(country); S.meta.profileSkipped = false;
        persist(); toast('Welcome, ' + name); render();
      }, function (e) { syncMsg(e && e.message ? e.message : 'Something went wrong.'); });
    },
    gateSignIn: function () { syncAuth('signIn'); },
    gateLocal: function () {
      var name = val('gc-name', '').trim(), country = val('gc-country', 'GM');
      if (!name) { syncMsg('Type your name or business name.'); return; }
      S.settings.profile.name = name; setCountry(country); S.meta.skipAccount = true; persist(); render();
    },
    saveProfileGate: function () {
      var name = val('gp-name', '').trim(), box = document.getElementById('gp-msg');
      if (!name) { box.innerHTML = '<div class="form-error">Type your name or business name, or tap Skip for now.</div>'; return; }
      S.settings.profile.name = name; setCountry(val('gp-country', 'GM')); persist(); render();
    },
    skipProfile: function () { S.meta.profileSkipped = true; persist(); render(); },
    /* ----- PIN, fingerprint and locking ----- */
    pinKey: function (d) { pinPress(d.k); },
    pinDel: function () { if (gateState() === 'lock') UI.pin = UI.pin.slice(0, -1); else UI.pinBuf = UI.pinBuf.slice(0, -1); render(); },
    pinNext: function () {
      if (UI.pinBuf.length < 4) return;
      UI.pinFirst = UI.pinBuf; UI.pinBuf = ''; UI.pinStep = 2; UI.pinMsg = ''; render();
    },
    pinDone: function () { UI.pinStep = 0; UI.changing = false; UI.locked = false; UI.pinMsg = ''; UI.pinBuf = ''; UI.pinFirst = ''; toast('Your PIN is on'); render(); },
    pinSkip: function () { S.meta.pinSkipped = true; persist(); render(); },
    pinCancel: function () { UI.changing = false; UI.pinStep = 0; UI.pinBuf = ''; UI.pinFirst = ''; UI.pinMsg = ''; render(); },
    pinChange: function () { UI.changing = true; UI.pinBuf = ''; UI.pinFirst = ''; UI.pinMsg = ''; UI.pinStep = Security.enabled() ? 0 : 1; render(); },
    pinOff: function () {
      if (!confirm('Turn off the PIN? Anyone who picks up your phone will be able to open your records.')) return;
      Security.disable().then(function () { S.meta.pinSkipped = true; persist(); toast('PIN turned off'); render(); });
    },
    pinBio: function () {
      Security.unlockBio().then(function () { UI.locked = false; UI.pin = ''; UI.pinMsg = ''; render(); },
        function () { UI.pinMsg = 'Fingerprint did not work. Type your PIN.'; render(); });
    },
    enableBio: function () {
      Security.enableBio().then(function () { toast('Fingerprint is on'); ACT.pinDone(); }, function () { toast('Could not turn on fingerprint. Your PIN still works.'); ACT.pinDone(); });
    },
    bioOn: function () { Security.enableBio().then(function () { toast('Fingerprint is on'); render(); }, function () { toast('Could not turn on fingerprint on this phone.'); }); },
    bioOff: function () { Security.disableBio().then(function () { toast('Fingerprint is off'); render(); }); },
    lockNow: function () { try { sessionStorage.removeItem('act-alive'); } catch (e) {} if (UI.sheetOpen) saveDraft(true); UI.resumeTried = false; UI.locked = true; UI.pin = ''; UI.pinMsg = ''; UI.bioTried = false; UI.stack = [{ v: 'home' }]; render(); },
    lockForgot: function () { UI.forgot = true; render(); },
    forgotBack: function () { UI.forgot = false; render(); },
    forgotReset: function () {
      var pw = val('gf-pass', ''), box = document.getElementById('gf-msg');
      if (!pw) { box.innerHTML = '<div class="form-error">Type your password.</div>'; return; }
      box.innerHTML = '<div class="form-info">Checking…</div>';
      Sync.signIn(Sync.status().email, pw).then(function () {
        return Security.disable();
      }).then(function () { UI.forgot = false; UI.locked = false; UI.changing = true; UI.pinStep = 1; UI.pinBuf = ''; UI.pinMsg = 'Your password is right. Choose a new PIN.'; render(); },
        function (e) { box.innerHTML = '<div class="form-error">' + esc(e && e.message ? e.message : 'Something went wrong.') + '</div>'; });
    },
    lockErase: function () {
      if (!confirm('Erase everything on this phone and start over? Records that are only on this phone, and not in a backup, will be lost for good.')) return;
      if (!confirm('Last check: erase all records on this phone?')) return;
      S = blankState(); applyLocale(); recompute(); Store.set(S);
      UI.forgot = false; UI.locked = false; UI.stack = [{ v: 'home' }]; render();
    },
    passwordContinue: function () {
      var pw = val('gw-pass', ''), box = document.getElementById('gw-msg');
      if (!pw) { box.innerHTML = '<div class="form-error">Type your password.</div>'; return; }
      box.innerHTML = '<div class="form-info">Checking…</div>';
      Sync.signIn(Sync.status().email, pw).then(function () { render(); },
        function (e) { box.innerHTML = '<div class="form-error">' + esc(e && e.message ? e.message : 'Something went wrong.') + '</div>'; });
    },
    passwordSignOut: function () {
      if (!confirm('Sign out? Your records are removed from this phone and come back when you sign in again.')) return;
      Sync.signOut().then(function () { UI.stack = [{ v: 'home' }]; UI.locked = false; render(); });
    },
    removeDevice: function (d) {
      if (!confirm('Remove this phone from your account? It is signed out the next time it connects.')) return;
      Sync.removeDevice(d.id).then(function () { toast('Phone removed'); var el = document.getElementById('devices'); if (el) el.innerHTML = devicesHTML(); }, function (e) { toast(e && e.message ? e.message : 'Could not remove it.'); });
    },
    dismissAlerts: function () { S.meta.deviceAlerts = []; persist(); render(); },
    back: function () { history.back(); },
    go: function (d) { go({ v: d.v }); },
    showMore: function () { UI.limit += 150; if (LISTS[cur().v]) renderList(); else render(); },
    salesFilterGo: function (d) { UI.hStatus = d.v === 'overdue' ? 'overdue' : 'all'; UI.hType = 'all'; UI.hRange = 'all'; UI.hQuery = ''; UI.hChannel = ''; setTab('history'); },
    custFilter: function (d) { UI.custFilter = d.v; render(); },
    custFilterGo: function (d) { UI.custFilter = d.v; setTab('customers'); },
    openCustomer: function (d) { go({ v: 'customer', key: d.key }); },
    openAgent: function (d) { go({ v: 'agent', key: d.key }); },
    newSale: function () { openForm('sale', null); },
    newPayment: function () { openForm('payment', null); },
    newPaymentFor: function (d) { var c = findCustomer(d.key); openForm('payment', null, { prefill: c ? { name: c.name, phone: c.phone, received: c.owed || '' } : {} }); },
    saveAnother: function () { saveForm(true); },
    pickDate: function (d, el) {
      var field = el.closest('.field'), inp = field.querySelector('input[type=date]');
      Array.prototype.forEach.call(field.querySelectorAll('.dchip'), function (b) { b.classList.toggle('on', b === el); });
      var note = field.querySelector('.datenote'); if (note) note.remove();
      var fe = document.getElementById('form-error'); if (fe && /Date/.test(fe.textContent)) fe.innerHTML = '';
      var ti = document.querySelector('#sheetwrap [name=time]');
      if (d.v === 'today') { inp.value = R.today; inp.classList.add('hide-date'); if (ti && !ti.value && !field.closest('#batch-top')) { ti.value = nowTime(); ti.dataset.auto = '1'; } }
      else if (d.v === 'yesterday') { inp.value = addDays(R.today, -1); inp.classList.add('hide-date'); if (ti && ti.dataset.auto) { ti.value = ''; delete ti.dataset.auto; } }
      else { inp.classList.remove('hide-date'); if (ti && ti.dataset.auto) { ti.value = ''; delete ti.dataset.auto; } inp.focus(); try { if (inp.showPicker) inp.showPicker(); } catch (e) {} }
      if (field.closest('#batch-top')) batchDateChanged(inp.value);
      refreshForm();
    },
    setLimit: function (d) {
      var rk = riskFor(d.key); if (!rk) return;
      var ans = prompt('Credit limit for ' + (rk.name || 'this customer') + ', in ' + sym() + '. Type 0 for no credit.\nSuggested: ' + money(rk.suggested) + '. Leave it empty to use the suggestion.', rk.manual !== null ? String(rk.manual) : '');
      if (ans === null) return;
      if (String(ans).trim() === '') delete S.limits[d.key];
      else { var v = parseFloat(String(ans).replace(/,/g, '')); if (!(v >= 0)) { toast('Type a number, for example 500.'); return; } S.limits[d.key] = v; }
      persist().then(function () { toast('Credit limit saved'); }); render();
    },
    openBatch: function (d) { openBatch(d && d.mode); },
    batchKind: function (d, el) {
      UI.batchKind = d.v; Array.prototype.forEach.call(el.parentNode.children, function (b) { b.classList.toggle('on', b === el); });
      document.getElementById('b-ex-wrap').classList.toggle('hide', d.v !== 'WE');
    },
    batchAdd: function () {
      var box = document.getElementById('batch-rows'), n = box.querySelectorAll('.batch-row').length;
      box.insertAdjacentHTML('beforeend', batchRowHTML(n)); enhancePickers(box); enhanceQuick(box);
      var last = box.lastElementChild; last.scrollIntoView({ block: 'start' }); var first = last.querySelector('.b-phone, .b-agent'); if (first) first.focus();
    },
    batchRemove: function (d, el) { el.closest('.batch-row').remove(); renumberBatch(); },
    batchSave: function () { batchSave(); },
    newSaleFor: function (d) { var c = findCustomer(d.key); openForm('sale', null, { prefill: c ? { name: c.name, phone: c.phone } : {} }); },
    editSale: function (d) {
      var r = findRec('sales', d.id); if (!r) return;
      openForm(C.isPay(r) ? 'payment' : 'sale', r);
    },
    newAgent: function () { openForm('agent', null); },
    newAgentFor: function (d) { var a = findAgent(d.key); openForm('agent', null, { prefill: a ? { name: a.name, phone: a.phone, type: a.type || 'Regular Agent' } : {} }); },
    editAgent: function (d) { var r = findRec('agents', d.id); if (r) openForm('agent', r); },
    newRef: function () { openForm('referral', null); },
    editRef: function (d) { var r = findRec('referrals', d.id); if (r) openForm('referral', r); },
    newWallet: function () { openForm('wallet', null); },
    editWallet: function (d) { var r = findRec('walletComm', d.id); if (r) openForm('wallet', r); },
    newEvc: function () { openForm('evc', null); },
    editEvc: function (d) { var r = findRec('evc', d.id); if (r) openForm('evc', r); },
    newError: function () { openForm('error', null); },
    editError: function (d) { var r = findRec('errors', d.id); if (r) openForm('error', r); },
    newCapital: function (d) { openCapital(null, d && d.date); },
    editCapital: function (d) { var r = findRec('capital', d.id); if (r) openCapital(r); },
    closeSheet: function () { closeSheet(); },
    saveForm: function () { saveForm(false); },
    deleteRec: function () {
      if (!FORM || !FORM.rec || !FORM.schema.coll) return;
      if (!confirm('Delete this entry?')) return;
      undoPoint();
      var arr = S[FORM.schema.coll], i = arr.indexOf(FORM.rec); if (i >= 0) arr.splice(i, 1);
      draftFinished();
      persist().then(function () { offerUndo('Deleted'); }); closeSheet(); render();
    },
    recordPayment: function () {
      var rec = FORM && FORM.rec; if (!rec) return;
      var cs = R.sales.filter(function (x) { return x.id === rec.id; })[0];
      var ans = prompt('How much did they pay now? (' + sym() + ')', cs ? String(cs.remaining) : '');
      if (ans === null) return;
      var amt = parseFloat(String(ans).replace(/,/g, ''));
      if (!isFinite(amt) || amt <= 0) { toast('Type an amount greater than 0.'); return; }
      undoPoint();
      rec.received = r2(num(rec.received) + amt);
      if (num(rec.billed) - num(rec.received) - num(rec.writtenOff) <= 0 && rec.date < R.today && !rec.datePaid) rec.datePaid = R.today;
      draftFinished();
      persist().then(function () { offerUndo('Payment recorded'); }); closeSheet(); render();
    },
    formSeg: function (d, el) {
      var wrap = el.parentNode; Array.prototype.forEach.call(wrap.children, function (b) { b.classList.toggle('on', b === el); });
      wrap.parentNode.querySelector('input[type=hidden]').value = d.v; refreshForm();
    },
    commTab: function (d) { UI.commTab = d.v; render(); },
    undoLast: function () { undoLast(); },
    draftsOpen: function () { openDrafts(); },
    draftOpen: function (d) { var x = draftsGet().filter(function (y) { return y.id === d.id; })[0]; UI.draftDone = true; if (UI.sheetOpen) removeSheet(); if (x) setTimeout(function () { resumeDraft(x); }, 30); },
    draftDelete: function (d) { draftDrop(d.id); if (draftsGet().length) openDrafts(); else { UI.draftDone = true; closeSheet(); render(); } },
    moreTools: function () { UI.moreTools = !UI.moreTools; render(); },
    repTab: function (d) { UI.repTab = d.v; render(); window.scrollTo(0, 0); },
    agentType: function (d) { UI.agentType = d.v; UI.limit = 120; render(); },
    multiPick: function (d, el) {
      var field = el.closest('.field'); el.classList.toggle('on');
      var on = Array.prototype.filter.call(field.querySelectorAll('.mchip'), function (b) { return b.classList.contains('on'); }).map(function (b) { return b.getAttribute('data-v'); });
      var hid = field.querySelector('input[type=hidden]'); if (hid) hid.value = on.join(', ');
      if (FORM) refreshForm();
      if (typeof draftSoon === 'function') draftSoon();
    },
    refTab: function (d) { UI.refTab = d.v; render(); },
    addBracket: function () { var box = document.getElementById('brackets'); box.insertAdjacentHTML('beforeend', bracketRow({ min: '', max: '', comm: '' })); },
    delBracket: function (d, el) { el.parentNode.remove(); },
    saveBrackets: function () {
      var rows = document.querySelectorAll('#brackets .bracket-row'), out = [];
      Array.prototype.forEach.call(rows, function (row) {
        var i = row.querySelectorAll('input'); if (i.length < 3) return;
        if (i[0].value === '' || i[2].value === '') return;
        out.push({ min: Number(i[0].value), max: i[1].value === '' ? '' : Number(i[1].value), comm: Number(i[2].value) });
      });
      out.sort(function (a, b) { return a.min - b.min; });
      S.brackets = out; persist().then(function () { toast('Rates saved'); }); render();
    },
    shareType: function (d) { UI.shareType = d.v; UI.shareKey = ''; UI.shareText = ''; render(); },
    shareFor: function (d) { UI.shareType = d.type; UI.shareKey = d.key; UI.shareText = ''; go({ v: 'share' }); },
    shareRegen: function () { UI.shareText = buildMessage(); render(); },
    shareCopy: function () {
      var t = document.getElementById('msg').value;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, fallbackCopy);
      else fallbackCopy();
    },
    shareShare: function () {
      var t = document.getElementById('msg').value;
      if (NATIVE) NATIVE.shareText(t);
      else if (navigator.share) navigator.share({ text: t }).catch(function () {});
      else ACT.shareCopy();
    },
    shareWa: function () {
      var t = document.getElementById('msg').value, p = sharePhone();
      var wa = 'https://wa.me/' + p + '?text=' + encodeURIComponent(t);
      if (NATIVE) NATIVE.openUrl(wa); else window.open(wa, '_blank');
    },
    backupShare: function () {
      backupFile().then(shareBackup, function () { toast('Could not make the backup.'); });
    },
    backupDownload: function () { backupFile().then(function (f) { download(f.blob, f.name); markBackedUp(); }, function () { toast('Could not make the backup.'); }); },
    importBackup: function () { document.getElementById('importFile').click(); },
    exportCsv: function () { exportCsv(); },
    saveSettings: function () {
      SETTING_LISTS.forEach(function (l) {
        var el = document.getElementById('set-' + l[0]); if (!el) return;
        var v = el.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        if (v.length) S.settings[l[0]] = v;
      });
      persist().then(function () { toast('Your choices are saved'); }); render();
    },
    copyRules: function () { copyText(RULES); },
    verifySend: function () {
      var m = document.getElementById('verify-msg');
      Sync.sendVerify().then(function () { if (m) m.innerHTML = '<div class="form-info">' + esc(I18N.t('Link sent. Check your inbox and spam folder.')) + '</div>'; },
        function (e) { if (m) m.innerHTML = '<div class="form-error">' + esc(e.message) + '</div>'; });
    },
    verifyCheck: function () {
      var m = document.getElementById('verify-msg');
      Sync.checkVerified().then(function (ok) {
        if (ok) { toast('Email confirmed'); render(); }
        else if (m) m.innerHTML = '<div class="form-error">' + esc(I18N.t('Not confirmed yet. Open the link in the email first.')) + '</div>';
      });
    },
    syncSaveConfig: function () {
      var t = document.getElementById('cfg-box').value;
      try { Sync.setConfig(t); toast('Connected to your Firebase project'); render(); }
      catch (e) { syncMsg(e.message); }
    },
    syncSignUp: function () { syncAuth('signUp'); },
    syncSignIn: function () { syncAuth('signIn'); },
    syncReset: function () {
      var em = document.getElementById('sync-email').value.trim();
      if (!em) { syncMsg('Type your email first.'); return; }
      Sync.resetPassword(em).then(function () { syncMsg('Password reset email sent to ' + em + '.', true); }, function (e) { syncMsg(e.message); });
    },
    syncSignOut: function () {
      var s = Sync.status(), msg;
      if (s.managed) msg = s.pending ? s.pending + ' change(s) have not reached your account yet. If you sign out now they will be lost. Sign out anyway?'
        : 'Sign out? Your records are removed from this phone and come back when you sign in again.';
      else msg = 'Sign out? Your records stay on this phone, but stop syncing until you sign in again.';
      if (!confirm(msg)) return;
      Sync.signOut().then(function () { UI.stack = [{ v: 'home' }]; render(); });
    },
    skipAccount: function () { S.meta.skipAccount = true; persist(); render(); },
    openPrivacy: function () { if (NATIVE) location.href = 'privacy.html'; else window.open('privacy.html', '_blank'); },
    deleteAccount: function () {
      openSheet('Delete account',
        '<div class="form-error">This permanently deletes your account and all your records, online and on this phone. It cannot be undone.</div>' +
        '<p class="hint">If you want to keep a copy, save a backup first in Settings, then Backup and Restore.</p>' +
        '<div class="field"><label for="del-pass">Type your password to confirm</label><input id="del-pass" type="password" autocomplete="current-password"></div><div id="del-msg"></div>',
        '<button class="btn" data-act="closeSheet">Cancel</button><button class="btn danger" data-act="confirmDeleteAccount">Delete everything</button>');
    },
    confirmDeleteAccount: function () {
      var pw = document.getElementById('del-pass').value, box = document.getElementById('del-msg');
      if (!pw) { box.innerHTML = '<div class="form-error">Type your password.</div>'; return; }
      if (!confirm('Last check: delete your account and every record for good?')) return;
      box.innerHTML = '<div class="form-info">Deleting…</div>';
      Sync.deleteAccount(pw).then(function () {
        UI.stack = [{ v: 'home' }]; closeSheet(); toast('Your account and records were deleted'); render();
      }, function (e) { box.innerHTML = '<div class="form-error">' + esc(e && e.message ? e.message : 'Something went wrong.') + '</div>'; });
    },
    syncRemove: function () {
      if (!confirm('Remove the online setup from this phone? Your records stay on this phone.')) return;
      Sync.removeConfig();
    },
    syncNow: function () { Sync.syncNow(); toast('Syncing'); },
    install: function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function (c) { if (c && c.outcome === 'accepted') toast('Installing. The app will appear on your home screen.'); })['catch'](function () {});
      deferredInstall = null; render();
    },
    hideInstall: function () { S.meta.installHidden = true; saveLocal(); render(); }
  };
  function fallbackCopy() {
    var ta = document.getElementById('msg'); ta.focus(); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Press and hold the message to copy it.'); }
  }
  /* Backups can be locked with a password (AES-GCM, key made from the password with PBKDF2). */
  var BK_ITER = 250000;
  function bkKey(pw, salt) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: BK_ITER }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function b64of(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); }
  function bytesOf(b64) { var d = atob(b64), a = new Uint8Array(d.length); for (var i = 0; i < d.length; i++) a[i] = d.charCodeAt(i); return a; }
  function lockBackup(text, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return bkKey(pw, salt).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(text)); })
      .then(function (ct) { return JSON.stringify({ app: 'agent-client-tracker', locked: 1, iter: BK_ITER, salt: b64of(salt), iv: b64of(iv), data: b64of(ct) }); });
  }
  function unlockBackup(obj, pw) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: bytesOf(obj.salt), iterations: obj.iter || BK_ITER }, k, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }).then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesOf(obj.iv) }, key, bytesOf(obj.data)); })
      .then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
  }
  function backupFile() {
    var pwEl = document.getElementById('bk-pass'), pw = pwEl ? pwEl.value : '';
    var name = 'agent-client-tracker-backup-' + R.today + (pw ? '-locked' : '') + '.json';
    var copy = Object.assign({}, S, { meta: { lastBackup: S.meta.lastBackup } }), text = JSON.stringify(copy);
    return (pw ? lockBackup(text, pw) : Promise.resolve(text)).then(function (out) {
      if (pwEl) pwEl.value = '';
      return { blob: new Blob([out], { type: 'application/json' }), name: name };
    });
  }
  function shareBackup(f) {
    var file = null;
    if (NATIVE) { var rd = new FileReader(); rd.onload = function () { NATIVE.shareFile(f.name, 'application/json', String(rd.result).split(',')[1] || ''); markBackedUp(); }; rd.readAsDataURL(f.blob); return; }
    try { file = new File([f.blob], f.name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: APP_NAME + ' backup' }).then(markBackedUp).catch(function () {});
    } else { download(f.blob, f.name); markBackedUp(); }
  }
  function markBackedUp() { S.meta.lastBackup = R.today; persist(); render(); toast('Backup saved'); }
  function download(blob, name) {
    if (NATIVE) {
      var rd = new FileReader();
      rd.onload = function () { NATIVE.saveFile(name, blob.type || 'application/octet-stream', String(rd.result).split(',')[1] || ''); };
      rd.readAsDataURL(blob); return;
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function exportCsv() {
    var head = ['Ref ID', 'Date', 'Type', 'Customer', 'Phone', 'Beneficiary', 'Details', 'Exchange type', 'Billed', 'Tip', 'Received', 'Written off', 'Account balance', 'Status', 'Days overdue', 'Date paid', 'Days delayed', 'Paid through', 'Bank', 'Reference', 'Notes'];
    var lines = [head].concat(R.sales.map(function (r) {
      return [r.refId, r.date, r.kind === 'WE' ? 'Wallet exchange' : 'Data / deposit', r.name, r.phone, r.beneficiary, r.details, r.exType, r.billed, r.tip, r.received, r.writtenOff,
        r.balance, r.status, r.daysOverdue, r.datePaid, r.daysDelayed, r.channel, r.bank, r.ref, r.notes];
    })).map(function (row) {
      return row.map(function (x) { var s = x == null ? '' : String(x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    });
    download(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv' }), 'sales-' + R.today + '.csv');
  }

  /* ================= Events ================= */
  /* Long explanations are folded behind a small "More info" so screens stay short. */
  function foldHints(root) {
    var list = (root || document).querySelectorAll('p.hint:not(.folded)');
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.closest('.banner, .capcard, #pickerwrap, details.tip, .form-error')) continue;
      if (p.textContent.trim().length < 95) continue;
      p.classList.add('folded');
      var d = document.createElement('details'); d.className = 'tip';
      d.innerHTML = '<summary>' + icon('help') + '<span>More info</span></summary>';
      p.parentNode.insertBefore(d, p); d.appendChild(p);
    }
  }
  var ROW_ICON = { editExpense: 'expense', editError: 'loss', openCheck: 'cash', editWallet: 'comm', editEvc: 'comm' };
  function decorateRows() {
    var rows = document.querySelectorAll('.row:not(.has-av)');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], n = r.querySelector('.name'), act = r.getAttribute('data-act'), a = document.createElement('span');
      a.className = 'av'; a.setAttribute('aria-hidden', 'true');
      if (ROW_ICON[act] || !n) { a.className += ' ico'; a.innerHTML = icon(ROW_ICON[act] || 'list'); }
      else {
        var w = n.textContent.replace(/[^A-Za-z\u00C0-\u024F0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
        a.textContent = ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
      }
      r.classList.add('has-av'); r.insertBefore(a, r.firstChild);
    }
  }
  function renderList() { var el = document.getElementById('list'); if (el && LISTS[cur().v]) { el.innerHTML = LISTS[cur().v](); decorateRows(); } }
  function saveLocalOnly() { return Store.set(S); }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = ACT[el.dataset.act]; if (!a) return;
    e.preventDefault(); a(el.dataset, el);
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'cap-text') { capRefresh(); return; }
    if (t.id === 'q-hist') { UI.hQuery = t.value; UI.limit = 120; renderList(); return; }
    if (t.id === 'q-cust') { UI.custQuery = t.value; renderList(); return; }
    if (t.id === 'q-agents') { UI.agentQuery = t.value; UI.limit = 120; renderList(); return; }
    if (t.id === 'msg') { UI.shareText = t.value; return; }
    if (t.type === 'tel' && t.closest('.field')) updateNet(t);
    if (t.classList.contains('b-agent')) {
      var arow = t.closest('.batch-row'), ka2 = findAgent(C.agentKey(t.value)), tf = arow && arow.querySelector('.b-types');
      if (ka2 && tf && !tf.value && ka2.type) setMulti(tf.closest('.field'), ka2.type);
      if (ka2 && ka2.phone) { var apf = arow.querySelector('.b-aphone'); if (apf && !apf.value) setTel(telBox(apf), ka2.phone); }
    }
    if (t.classList.contains('b-phone')) {
      var row = t.closest('.batch-row'), nm = row.querySelector('.b-name'), p = telParse(t);
      var cu = p.ok && !p.empty ? findCustomer(C.custKey({ phone: p.value })) : null;
      if (cu && !nm.value) nm.value = cu.name;
    }
    if (FORM && t.closest('#sheetwrap')) { autofill(t); refreshForm(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'share-who') { UI.shareKey = t.value; UI.shareText = ''; render(); return; }
    if (t.id === 'importFile') { importFile(t.files && t.files[0]); t.value = ''; return; }
    if (t.id === 'lang-pick') { setLang(t.value); return; }
    if (t.id === 'msg-lang') { UI.msgLang = t.value; UI.shareText = ''; render(); return; }
    if (t.id === 'h-status') { UI.hStatus = t.value; UI.limit = 120; render(); return; }
    if (t.id === 'h-chan') { UI.hChannel = t.value; UI.limit = 120; render(); return; }
    if (t.id === 'h-from') { UI.hFrom = t.value; UI.limit = 120; render(); return; }
    if (t.id === 'h-to') { UI.hTo = t.value; UI.limit = 120; render(); return; }
    if (t.id === 'sec-lock') { Security.cfg().lockAfter = t.value; saveLocalOnly(); toast('Saved'); return; }
    if (t.id === 'sec-exp') { Security.cfg().expireDays = Number(t.value); saveLocalOnly(); toast('Saved'); return; }
    if (t.type === 'tel' && t.closest('.field')) tidyTel(t);
    if (t.classList.contains('ccsel')) updateNet(t);
    if (t.type === 'date' && t.closest('.datefield')) {
      var f = t.closest('.datefield'), other = f.querySelector('.dchip[data-v=other] small');
      if (other && t.value) other.textContent = dayShort(t.value);
      if (f.closest('#batch-top')) batchDateChanged(t.value);
      else { var ti = document.querySelector('#sheetwrap [name=time]'); if (ti && ti.dataset.auto && t.value !== R.today) { ti.value = ''; delete ti.dataset.auto; } }
    }
    if (t.classList.contains('b-date')) t.dataset.touched = '1';
    if (t.classList.contains('b-pay')) t.closest('.batch-row').querySelector('.b-recv-wrap').classList.toggle('hide', t.value !== 'part');
    if (t.id === 'b-chan') document.getElementById('b-chan-other').classList.toggle('hide', t.value !== '__other');
    if (FORM && t.closest('#sheetwrap')) { autofill(t); refreshForm(); }
  });
  document.addEventListener('keydown', function (e) {
    var g = gateState(); if (g !== 'lock' && g !== 'pinsetup') return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pinPress(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); ACT.pinDel(); }
  });
  function autofill(t) {
    var sheet = document.getElementById('sheetwrap');
    function set(name, val) {
      var el = sheet.querySelector('[name="' + name + '"]'); if (!el || !val) return;
      if (el.type === 'tel') { if (!el.value) setTel(telBox(el), val); } else if (!el.value) el.value = val;
    }
    if (FORM.type === 'sale' || FORM.type === 'payment') {
      if (t.name === 'phone') { var p = telParse(t), c = p.ok && !p.empty ? findCustomer(C.custKey({ phone: p.value })) : null; if (c) set('name', c.name); }
      if (t.name === 'name') {
        var nm = t.value.trim().toLowerCase(), hits = R.customers.filter(function (c) { return c.name.toLowerCase() === nm; });
        if (hits.length === 1) set('phone', hits[0].phone);
      }
    }
    if (FORM.type === 'agent' && t.name === 'name') {
      var a = findAgent(C.agentKey(t.value));
      if (a) { set('phone', a.phone); var ty = sheet.querySelector('[name="type"]'); if (ty && !ty.value && a.type) setMulti(ty.closest('.field'), a.type); }
    }
    if (FORM.type === 'referral' && t.name === 'agent') {
      var prev = R.referrals.rows.filter(function (r) { return C.agentKey(r.agent) === C.agentKey(t.value); }).slice(-1)[0];
      if (prev) set('agentPhone', prev.agentPhone);
    }
    if (FORM.type === 'evc' && t.name === 'provider') {
      var last = lastEvcFor(t.value);
      if (last) ['rate', 'retailRoy', 'wholesaleRoy'].forEach(function (k) { var el = sheet.querySelector('[name="' + k + '"]'); if (el && el.value === '' && last[k] !== '' && last[k] != null) el.value = last[k]; });
    }
  }

  /* ================= Suggestions while typing =================
     Replaces the phone's own list, which opened with every customer as soon as the box was tapped.
     Nothing shows until a few letters or digits are typed, and only matching people are shown. */
  var SUGGEST_KIND = { custNames: 'cust', custPhones: 'cust', agentNames: 'agent', agentPhones: 'agent', refAgents: 'ref' };
  function suggestPool(kind) {
    if (kind === 'cust') return R.customers.filter(function (c) { return c.name || c.phone; }).map(function (c) { return { name: c.name || '', phone: c.phone || '' }; });
    if (kind === 'agent') {
      var seenA = {}, outA = [];
      function addA(n, ph) { n = String(n || '').trim(); var k = n.toLowerCase(); if (!n) return; if (seenA[k]) { if (!seenA[k].phone && ph) seenA[k].phone = ph; return; } seenA[k] = { name: n, phone: ph || '' }; outA.push(seenA[k]); }
      R.agents.balances.forEach(function (a) { addA(a.name, a.phone); });
      (S.walletComm || []).forEach(function (r) { addA(r.agentName, r.agentPhone); });
      (S.evc || []).forEach(function (r) { addA(r.wholesaler, ''); });
      (S.referrals || []).forEach(function (r) { addA(r.agent, r.agentPhone); });
      return outA;
    }
    var seen = {}, out = [];
    R.referrals.rows.slice().reverse().forEach(function (r) {
      var n = String(r.agent || '').trim(), k = n.toLowerCase(); if (!n || seen[k]) return; seen[k] = 1; out.push({ name: n, phone: r.agentPhone || '' });
    });
    R.agents.balances.forEach(function (a) { var k = a.name.toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push({ name: a.name, phone: a.phone || '' }); } });
    return out;
  }
  function suggestMatches(inp) {
    var kind = inp.getAttribute('data-suggest'), isTel = inp.type === 'tel', q = inp.value.trim().toLowerCase();
    var pool = suggestPool(kind), hits;
    if (isTel) {
      var d = q.replace(/\D/g, ''); if (d.length < 3) return [];
      hits = pool.filter(function (x) { return x.phone && String(x.phone).replace(/\D/g, '').indexOf(d) >= 0; });
      if (hits.length === 1 && C.phoneInfo(hits[0].phone).local === inp.value.trim()) return [];
    } else {
      if (q.length < 2) return [];
      hits = pool.filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0; });
      hits.sort(function (a, b) {
        var sa = (' ' + a.name.toLowerCase()).indexOf(' ' + q) >= 0 ? 0 : 1, sb = (' ' + b.name.toLowerCase()).indexOf(' ' + q) >= 0 ? 0 : 1;
        return sa - sb || a.name.localeCompare(b.name);
      });
      if (hits.length && hits[0].name.toLowerCase() === q && (hits.length === 1 || hits[1].name.toLowerCase() !== q)) return [];
    }
    return hits.slice(0, 4);
  }
  function suggestBox(inp) {
    var field = inp.closest('.field'); if (!field) return null;
    var box = field.querySelector('.suggest');
    if (!box) {
      box = document.createElement('div'); box.className = 'suggest'; box.setAttribute('role', 'listbox');
      var after = inp.closest('.telrow') || inp; after.parentNode.insertBefore(box, after.nextSibling);
      box.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the keyboard open while tapping
      box.addEventListener('click', function (e) {
        var b = e.target.closest('.sugg'); if (!b) return;
        pickSuggestion(box._inp, box._hits[Number(b.getAttribute('data-i'))]);
      });
    }
    return box;
  }
  function showSuggest(inp) {
    var hits = suggestMatches(inp), box = suggestBox(inp); if (!box) return;
    box._inp = inp; box._hits = hits;
    if (!hits.length) { box.innerHTML = ''; box.classList.remove('on'); return; }
    box.innerHTML = '<div class="sugg-head">Already saved</div>' + hits.map(function (x, i) {
      var w = x.name.replace(/[^A-Za-zÀ-ɏ0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
      var ini = ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
      return '<button type="button" class="sugg" role="option" data-i="' + i + '"><span class="av">' + esc(ini) + '</span><span class="tx"><b>' + esc(x.name || 'No name') + '</b>' +
        (x.phone ? '<small>' + esc(phoneLine(x.phone)) + '</small>' : '') + '</span></button>';
    }).join('');
    box.classList.add('on');
  }
  function hideSuggest(inp) {
    var field = inp && inp.closest('.field'), box = field && field.querySelector('.suggest');
    if (box) { box.classList.remove('on'); box.innerHTML = ''; }
  }
  function pickSuggestion(inp, x) {
    if (!inp || !x) return;
    var scope = inp.closest('.batch-row') || inp.closest('#sheetwrap') || document, kind = inp.getAttribute('data-suggest');
    var others = scope.querySelectorAll('[data-suggest="' + kind + '"]'), nameEl = null, telEl = null;
    for (var i = 0; i < others.length; i++) { if (others[i].type === 'tel') telEl = telEl || others[i]; else nameEl = nameEl || others[i]; }
    if (inp.type === 'tel') telEl = inp; else nameEl = inp;
    function fire(el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    if (nameEl && x.name && (nameEl === inp || !nameEl.value.trim())) { nameEl.value = x.name; fire(nameEl); }
    if (telEl && x.phone && (telEl === inp || !telEl.value.trim())) { setTel(telBox(telEl), x.phone); fire(telEl); }
    hideSuggest(inp);
    if (telEl && telEl !== inp && !x.phone) telEl.focus();
  }
  document.addEventListener('input', function (e) {
    var t = e.target; if (!t.getAttribute || !t.hasAttribute('data-suggest') || !e.isTrusted) return;
    showSuggest(t);
  });
  document.addEventListener('focusout', function (e) {
    var t = e.target; if (t.hasAttribute && t.hasAttribute('data-suggest')) setTimeout(function () { if (document.activeElement !== t) hideSuggest(t); }, 120);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && e.target.hasAttribute && e.target.hasAttribute('data-suggest')) hideSuggest(e.target);
  });


  /* Recent people as small buttons above a name box, plus a button that opens the full list.
     Nothing pops up by itself, so typing a new name is never in the way. */
  var QUICK_WORD = { cust: ['All customers', 'Customers'], agent: ['All agents', 'Agents'], ref: ['All agents', 'Referral Agents'] };
  function recentPool(kind) {
    var pool = suggestPool(kind).map(function (x) { return x; });
    if (kind === 'cust') {
      var info = {}; R.customers.forEach(function (c) { info[(c.name || '') + '|' + (c.phone || '')] = c; });
      pool.forEach(function (x) { var c = info[x.name + '|' + x.phone]; x.last = c ? c.last : ''; x.n = c ? c.txns : 0; x.owed = c ? c.owed : 0; });
    } else if (kind === 'agent') {
      var ag = {}; R.agents.balances.forEach(function (a) { ag[a.name] = a; });
      pool.forEach(function (x) { var a = ag[x.name]; x.last = a ? a.last : ''; x.n = a ? a.entries : 0; x.net = a ? a.net : 0; });
    }
    return pool.sort(function (a, b) { return String(b.last || '').localeCompare(String(a.last || '')) || (b.n || 0) - (a.n || 0); });
  }
  function initials(name) {
    var w = String(name || '').replace(/[^A-Za-zÀ-ɏ0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  }
  function enhanceQuick(root) {
    var list = (root || document).querySelectorAll('input[data-suggest]:not([type=tel]):not(.qp)');
    for (var i = 0; i < list.length; i++) (function (inp) {
      inp.classList.add('qp');
      var kind = inp.getAttribute('data-suggest'), pool = recentPool(kind); if (!pool.length) return;
      var row = document.createElement('div'); row.className = 'quickpick';
      row.innerHTML = '<button type="button" class="qchip all">' + icon('list') + '<span>' + esc(QUICK_WORD[kind][0]) + '</span><span class="qn">' + pool.length + '</span></button>' +
        pool.slice(0, 5).map(function (x, j) {
          return '<button type="button" class="qchip" data-j="' + j + '"><span class="av">' + esc(initials(x.name)) + '</span><span>' + esc(x.name.split(' ')[0] || x.name) + '</span></button>';
        }).join('');
      inp.parentNode.insertBefore(row, inp);
      row.addEventListener('click', function (e) {
        var b = e.target.closest('.qchip'); if (!b) return;
        if (b.classList.contains('all')) { openPeople(inp, kind); return; }
        pickSuggestion(inp, pool[Number(b.getAttribute('data-j'))]);
      });
    })(list[i]);
  }
  function openPeople(inp, kind) {
    closePicker();
    var pool = recentPool(kind), title = QUICK_WORD[kind][1];
    function rowHTML(x, i) {
      var extra = x.owed > 0 ? '<em class="c-owed">' + esc(money(x.owed)) + '</em>' : '';
      return '<button type="button" class="prow" data-i="' + i + '" data-name="' + esc((x.name + ' ' + String(x.phone || '').replace(/\D/g, '')).toLowerCase()) + '">' +
        '<span class="av">' + esc(initials(x.name)) + '</span><span class="tx"><b>' + esc(x.name || 'No name') + '</b>' +
        (x.phone ? '<small>' + esc(phoneLine(x.phone)) + '</small>' : '') + '</span>' + extra + '</button>';
    }
    var el = document.createElement('div'); el.id = 'pickerwrap';
    el.innerHTML = '<div class="picker-back"></div><div class="picker" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header><h2><span>' + esc(title) + '</span> <span class="qn">' + pool.length + '</span></h2><button type="button" class="pclose">Close</button></header>' +
      '<div class="psearch"><input type="search" placeholder="Search name or number" aria-label="Search name or number" autocomplete="off"></div>' +
      '<div class="pbody plist">' + pool.map(rowHTML).join('') + '<p class="hint pnone hide" style="text-align:center;margin:18px 0">No match. Close this and type the new name.</p></div></div>';
    document.body.appendChild(el);
    PICKER = { el: el, sel: null };
    history.pushState({ picker: 1 }, '');
    el.querySelector('.picker-back').addEventListener('click', function () { history.back(); });
    el.querySelector('.pclose').addEventListener('click', function () { history.back(); });
    el.querySelector('.pbody').addEventListener('click', function (e) {
      var t = e.target.closest('.prow'); if (!t) return;
      pickSuggestion(inp, pool[Number(t.getAttribute('data-i'))]); history.back();
    });
    var q = el.querySelector('.psearch input');
    q.addEventListener('input', function () {
      var v = q.value.trim().toLowerCase(), d = v.replace(/\D/g, ''), shown = 0;
      Array.prototype.forEach.call(el.querySelectorAll('.prow'), function (t) {
        var hay = t.getAttribute('data-name'), ok = !v || hay.indexOf(v) >= 0 || (d.length >= 3 && hay.indexOf(d) >= 0);
        t.classList.toggle('hide', !ok); if (ok) shown++;
      });
      el.querySelector('.pnone').classList.toggle('hide', shown > 0);
    });
  }


  /* ================= Recording from wallet and bank messages =================
     A message can arrive three ways: pasted, shared to the app, or read from notifications by the Android app.
     Each one opens "Record from a Message", which shows what was read and opens a filled-in entry to check and save. */
  var INBOX_KEY = 'capture-inbox';
  function inboxGet() { try { return JSON.parse(localStorage.getItem(INBOX_KEY) || '[]') || []; } catch (e) { return []; } }
  function inboxSet(a) { try { localStorage.setItem(INBOX_KEY, JSON.stringify(a.slice(-100))); } catch (e) {} }
  function inboxRemove(id) { if (id) inboxSet(inboxGet().filter(function (x) { return x.id !== id; })); }
  function pullCaptured() {
    if (!NATIVE || !NATIVE.takeCaptured || !window.Capture) return;
    var raw = []; try { raw = JSON.parse(NATIVE.takeCaptured() || '[]') || []; } catch (e) { raw = []; }
    if (!raw.length) return;
    var a = inboxGet(), seen = {}; a.forEach(function (x) { seen[x.id] = 1; });
    raw.forEach(function (x) { if (x && x.text && !seen[x.id] && Capture.looksLikeMoney(x.text)) { seen[x.id] = 1; a.push({ id: x.id, text: x.text, app: x.app || '', when: x.when || Date.now() }); } });
    inboxSet(a);
    if (!UI.sheetOpen) render();
  }
  function pullShared() {
    if (!NATIVE || !NATIVE.getSharedText) return;
    var t = ''; try { t = NATIVE.getSharedText() || ''; } catch (e) { t = ''; }
    if (t) { UI.pendingShare = { text: t }; if (!UI.sheetOpen) render(); }
  }
  window.__captureArrived = pullCaptured;
  window.__sharedArrived = pullShared;
  (function () {   // shared from another app to the website version (installed web app)
    try {
      var q = new URLSearchParams(location.search), t = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join(' ').trim();
      if (t) { UI.pendingShare = { text: t }; history.replaceState(null, '', location.pathname); }
    } catch (e) {}
  })();

  function capPerson(r) {
    var p = r.phone ? C.parsePhone(r.phone, S.settings.profile.country) : null, phone = p && p.ok ? p.value : '';
    var c = phone ? findCustomer(C.custKey({ phone: phone })) : null;
    var key = phone.replace(/\D/g, '').slice(-7), ag = null;
    if (key) R.agents.balances.forEach(function (a) { if (!ag && String(a.phone || '').replace(/\D/g, '').slice(-7) === key) ag = a; });
    return { phone: phone, customer: c, agent: ag, name: c ? c.name : ag ? ag.name : r.name };
  }
  function capChannel(r) {
    if (!r.provider) return {};
    return r.provider.kind === 'bank' ? { channel: 'Bank Transfer', bank: r.provider.name } : { channel: r.provider.name };
  }
  function capNote(r) { return [r.provider ? r.provider.name : '', r.ref ? 'Ref ' + r.ref : ''].filter(Boolean).join(' · '); }
  function capRow(label, value) { return value ? '<div class="caprow"><span>' + esc(label) + '</span><b>' + value + '</b></div>' : ''; }
  function capCard(r) {
    var who = capPerson(r), dir = r.direction === 'in' ? '<span class="pill p-paid">Money in</span>' : r.direction === 'out' ? '<span class="pill p-overdue">Money out</span>' : '<span class="pill">Check: in or out?</span>';
    return '<div class="capcard"><div class="caphead">' + (r.provider ? provBadge(r.provider.name, 'lg') + '<b>' + esc(r.provider.name) + '</b>' : '<span class="pbadge g-none lg">' + icon('chat') + '</span><b>Message</b>') + dir + '</div>' +
      '<div class="capamt' + (r.direction === 'out' ? ' out' : '') + '">' + (r.amount != null ? money(r.amount) : '<span class="hint">No amount found. Type it in the entry.</span>') + '</div>' +
      capRow('Number', r.phone ? esc(phoneLine(who.phone || r.phone)) : '') +
      capRow(who.customer ? 'Customer' : who.agent ? 'Agent' : 'Name', who.name ? esc(who.name) + (who.customer && who.customer.owed > 0 ? ' <em class="c-owed">owes ' + esc(money(who.customer.owed)) + '</em>' : '') : '') +
      capRow('Reference', r.ref ? esc(r.ref) : '') + capRow('Fee', r.fee != null ? esc(money(r.fee)) : '') + capRow('Balance after', r.balance != null ? esc(money(r.balance)) : '') +
      capRow('When', esc(dayShort(r.date) + ', ' + r.time)) + '</div>';
  }
  function capOpt(act, ic, col, title, sub) {
    return '<button type="button" class="capopt" data-act="' + act + '"><span class="ic ' + col + '">' + icon(ic) + '</span><span class="tx"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span><span class="chev">›</span></button>';
  }
  function capActions(r) {
    var who = capPerson(r), owes = who.customer && who.customer.owed > 0;
    var ins = (owes ? capOpt('capPayment', 'pay', 'c-green', 'Payment of a Debt', who.name + ' is paying what they owe') : '') +
      capOpt('capSale', 'sales', 'c-blue', 'New Sale, Paid', 'A customer paid for data, airtime or a deposit') +
      (owes ? '' : capOpt('capPayment', 'pay', 'c-green', 'Payment of a Debt', 'A customer paying for an earlier sale')) +
      capOpt('capAgentIn', 'agents', 'c-purple', 'Received from an Agent', 'An agent sent you money or float');
    var outs = capOpt('capAgentOut', 'agents', 'c-purple', 'Paid to an Agent', 'You sent money or float to an agent') +
      capOpt('capExchange', 'recon', 'c-teal', 'Wallet Exchange', 'You sent money to a customer\'s wallet or bank') +
      capOpt('capExpense', 'expense', 'c-orange', 'Money Out', 'Rent, transport, purchases or other spending');
    if (r.direction === 'in') return '<div class="sec-head"><b>Record it as</b></div>' + ins;
    if (r.direction === 'out') return '<div class="sec-head"><b>Record it as</b></div>' + outs;
    return '<div class="sec-head"><b>Money in</b></div>' + ins + '<div class="sec-head"><b>Money out</b></div>' + outs;
  }
  function openCapture(text, id, when) {
    UI.cap = { id: id || '', when: when || 0 };
    var canPaste = !!(navigator.clipboard && navigator.clipboard.readText);
    var body = '<div class="field"><label for="cap-text">Message from your wallet or bank</label>' +
      '<textarea id="cap-text" rows="4" placeholder="Paste the SMS or notification here">' + esc(text || '') + '</textarea></div>' +
      (canPaste ? '<button type="button" class="btn block capbtn" data-act="capPaste">' + icon('rules') + '<span>Paste the Copied Message</span></button>' : '') +
      '<div id="cap-out"></div>';
    openSheet('Record from a Message', body, '<button class="btn" data-act="closeSheet">Cancel</button>');
    capRefresh();
  }
  function capRefresh() {
    var t = document.getElementById('cap-text'), out = document.getElementById('cap-out'); if (!t || !out || !window.Capture) return;
    var txt = t.value.trim();
    if (!txt) { out.innerHTML = '<p class="hint" style="margin-top:12px">Copy the message in your SMS or wallet app, then tap Paste. You check the entry before it is saved.</p>'; UI.capParsed = null; return; }
    var r = Capture.parse(txt, { when: UI.cap && UI.cap.when }); UI.capParsed = r;
    out.innerHTML = capCard(r) + capActions(r);
  }
  function capOpen(type, prefill) {
    var r = UI.capParsed; if (!r) return;
    var base = { date: r.date, time: r.time };
    openForm(type, null, { prefill: Object.assign(base, prefill), captureId: UI.cap && UI.cap.id });
  }
  function capAmt(r) { return r.amount != null ? r.amount : ''; }
  Object.assign(ACT, {
    captureOpen: function () { openCapture(''); },
    capPaste: function () {
      navigator.clipboard.readText().then(function (t) { var el = document.getElementById('cap-text'); if (el) { el.value = t || ''; capRefresh(); } })
        .catch(function () { toast('Press and hold the box, then tap Paste.'); var el = document.getElementById('cap-text'); if (el) el.focus(); });
    },
    capSale: function () { var r = UI.capParsed, w = capPerson(r); capOpen('sale', Object.assign({ kind: 'DS', phone: w.phone, name: w.name, billed: capAmt(r), payMode: 'full', notes: capNote(r) }, capChannel(r))); },
    capPayment: function () { var r = UI.capParsed, w = capPerson(r); capOpen('payment', Object.assign({ phone: w.phone, name: w.name, received: capAmt(r), notes: capNote(r) }, capChannel(r))); },
    capAgentIn: function () { var r = UI.capParsed, w = capPerson(r); capOpen('agent', { name: w.agent ? w.agent.name : w.name, phone: w.phone, fromAgent: capAmt(r), desc: capNote(r) }); },
    capAgentOut: function () { var r = UI.capParsed, w = capPerson(r); capOpen('agent', { name: w.agent ? w.agent.name : w.name, phone: w.phone, toAgent: capAmt(r), desc: capNote(r) }); },
    capExchange: function () { var r = UI.capParsed, w = capPerson(r); capOpen('sale', { kind: 'WE', phone: w.phone, name: w.name, billed: capAmt(r), costOut: capAmt(r), payMode: 'full', notes: 'Sent ' + capNote(r) }); },
    capExpense: function () {
      var r = UI.capParsed, from = r.provider && (S.settings.capitalAccounts || []).indexOf(r.provider.name) >= 0 ? r.provider.name : '';
      capOpen('expense', { amount: capAmt(r), paidFrom: from, note: capNote(r) });
    },
    capInbox: function () { openInbox(); },
    capFromInbox: function (d) { var it = inboxGet().filter(function (x) { return x.id === d.id; })[0]; if (it) openCapture(it.text, it.id, it.when); },
    capIgnore: function (d) { inboxRemove(d.id); if (inboxGet().length) openInbox(); else { closeSheet(); render(); } },
    capIgnoreAll: function () { if (!confirm('Ignore all waiting messages?')) return; inboxSet([]); closeSheet(); render(); },
    capAppInfo: function () { if (NATIVE && NATIVE.openAppInfo) NATIVE.openAppInfo(); },
    capSettings: function () { if (NATIVE && NATIVE.openCaptureSettings) NATIVE.openCaptureSettings(); },
    capAlerts: function () { if (NATIVE && NATIVE.setAlerts) { var st = captureStatus(); NATIVE.setAlerts(!st.alerts); setTimeout(render, 600); } },
    capGetApp: function () {
      var u = 'https://github.com/baboumbowe160-bit/Tracker-1/releases/latest/download/agent-client-tracker-app.apk';
      if (NATIVE) NATIVE.openUrl(u); else window.open(u, '_blank');
    }
  });
  function openInbox() {
    var items = inboxGet().slice().reverse();
    var body = items.length ? items.map(function (x) {
      var r = Capture.parse(x.text, { when: x.when, app: x.app });
      return '<div class="inboxitem"><div class="caphead">' + (r.provider ? provBadge(r.provider.name) : '<span class="pbadge g-none">' + icon('chat') + '</span>') +
        '<div class="tx"><b>' + (r.amount != null ? esc(money(r.amount)) : esc(r.provider ? r.provider.name : (x.app || 'Message'))) + '</b><small>' +
        esc((r.direction === 'in' ? 'Money in' : r.direction === 'out' ? 'Money out' : 'Check') + ' · ' + dayShort(r.date) + ', ' + r.time) + '</small></div></div>' +
        '<p class="inboxtext">' + esc(x.text.length > 160 ? x.text.slice(0, 160) + '…' : x.text) + '</p>' +
        '<div class="inboxacts"><button class="btn" data-act="capIgnore" data-id="' + esc(x.id) + '">Ignore</button><button class="btn primary" data-act="capFromInbox" data-id="' + esc(x.id) + '">Record</button></div></div>';
    }).join('') : '<p class="hint">No payment messages are waiting.</p>';
    openSheet('Messages to Record', body, items.length ? '<button class="btn" data-act="capIgnoreAll">Ignore All</button>' : '<button class="btn" data-act="closeSheet">Close</button>');
  }
  function captureStatus() {
    if (!NATIVE || !NATIVE.captureStatus) return { native: false };
    try { var s = JSON.parse(NATIVE.captureStatus()); s.native = true; return s; } catch (e) { return { native: true }; }
  }
  VIEWS.capture = function () {
    var st = captureStatus(), waiting = inboxGet().length, h = '';
    if (st.native) {
      h += '<div class="card"><div class="capset"><b>Read payment notifications</b>' + pill(st.listener ? 'On' : 'Off', st.listener ? 'p-paid' : 'p-outstanding') + '</div>' +
        '<p class="hint">When a message from Wave, Afrimoney, QMoney, APS, your bank or your SMS app shows a payment, the app keeps it ready for you to record with one tap.</p>' +
        '<button class="btn ' + (st.listener ? '' : 'primary') + ' block" data-act="capSettings">' + (st.listener ? 'Change in Phone Settings' : 'Turn On in Phone Settings') + '</button>' +
        (st.listener ? '' : '<p class="hint" style="margin-top:8px">Turn on Agent &amp; Client Tracker in the page that opens.</p>' +
          '<div class="banner" style="display:block"><b>Android says "Restricted setting"?</b><br>Tap Open App Info below, then the ⋮ menu at the top right, then Allow restricted settings. Come back and tap Turn On again.</div>' +
          '<button class="btn block" data-act="capAppInfo" style="margin-top:8px">Open App Info</button>') + '</div>';
      h += '<div class="card"><div class="capset"><b>Alert me</b>' + pill(st.alerts ? 'On' : 'Off', st.alerts ? 'p-paid' : 'p-outstanding') + '</div>' +
        '<p class="hint">Shows a notification when a payment message is ready to record, even when the app is closed.</p>' +
        '<button class="btn block" data-act="capAlerts">' + (st.alerts ? 'Turn Off Alerts' : 'Turn On Alerts') + '</button></div>';
    } else {
      h += '<div class="card"><b>Share a message to the app</b><p class="hint">Press and hold a payment SMS or notification, tap Share, then choose Agent &amp; Client Tracker. Or copy it and tap Message on the home screen.</p></div>';
    }
    h += '<button class="btn block" data-act="captureOpen" style="margin-bottom:10px">Record from a Message Now</button>';
    if (waiting) h += '<button class="btn kiosk block" data-act="capInbox">Messages to Record (' + waiting + ')</button>';
    h += '<p class="hint">Messages stay on this phone. Chats such as WhatsApp are never read. You always check an entry before it is saved.</p>';
    return h;
  };


  /* ================= Never lose an entry =================
     Every open form (one entry or several at once) saves itself as a draft while you type.
     If the app locks, goes to the background or is closed, the entry reopens where you stopped.
     Closing a form yourself asks whether to keep what you typed as a draft. */
  var DRAFT_KEY = 'entry-drafts', draftTimer = null;
  function draftsGet() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]') || []; } catch (e) { return []; } }
  function draftsSet(a) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(a.slice(-15))); } catch (e) {} }
  function draftDrop(id) { id = id || UI.draftId; if (id) draftsSet(draftsGet().filter(function (x) { return x.id !== id; })); }
  function batchSnap() {
    var rows = Array.prototype.map.call(document.querySelectorAll('#batch-rows .batch-row'), function (row) {
      var o = {};
      Array.prototype.forEach.call(row.querySelectorAll('input, select, textarea'), function (el) {
        var k = (String(el.className).match(/\bb-[a-z]+/) || [])[0]; if (!k) return;
        o[k] = el.value; if (k === 'b-date' && el.dataset.touched) o.__dt = 1;
      });
      return o;
    });
    var bd = document.querySelector('#batch-top input[type=date]');
    return { mode: UI.batchMode, kind: UI.batchKind, date: bd ? bd.value : (UI.batchDate || ''), chan: val('b-chan', ''), chanOther: val('b-chan-other', ''), ex: val('b-ex', ''), rows: rows };
  }
  function batchFilled(b) {
    return b.rows.some(function (r) { return Object.keys(r).some(function (k) { return ['b-date', 'b-time', 'b-cc', 'b-acc', 'b-tcc', 'b-pay', '__dt'].indexOf(k) < 0 && String(r[k] || '').trim() !== ''; }); });
  }
  function draftSnapshot() {
    if (!UI.sheetOpen) return null;
    if (FORM && FORM.schema && SCHEMAS[FORM.type] && FORM.type !== 'capital' && document.querySelector('#sheetwrap [name]')) {
      var vals = collect(); Object.keys(vals).forEach(function (k) { if (k.indexOf('__') === 0) delete vals[k]; });
      var filled = FORM.schema.fields.some(function (f) { return ['text', 'num', 'tel', 'area'].indexOf(f.t) >= 0 && String(vals[f.k] == null ? '' : vals[f.k]).trim() !== ''; });
      return { kind: 'form', type: FORM.type, recId: FORM.rec && FORM.rec.id || '', coll: FORM.schema.coll || '', isNew: !!FORM.isNew, captureId: FORM.captureId || '',
        title: FORM.schema.title[FORM.isNew ? 0 : 1], vals: vals, filled: filled };
    }
    if (document.getElementById('batch-rows')) {
      var b = batchSnap();
      return { kind: 'batch', title: b.mode === 'agent' ? 'Several Agent Entries at Once' : 'Several Sales at Once', snap: b, filled: batchFilled(b) };
    }
    return null;
  }
  function saveDraft(active) {
    clearTimeout(draftTimer);
    var d = draftSnapshot(); if (!d) return;
    if (!UI.draftId) UI.draftId = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var all = draftsGet().filter(function (x) { return x.id !== UI.draftId; });
    if (d.filled) { d.id = UI.draftId; d.at = Date.now(); d.active = active !== false; all.push(d); }
    draftsSet(all);
  }
  function draftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(function () { saveDraft(true); }, 400); }
  /* The person closed the form themselves (Close or the back button). */
  function draftOnClose() {
    if (UI.draftDone) { UI.draftDone = false; UI.draftId = null; return; }
    var d = draftSnapshot();
    if (d && d.filled && confirm('Keep what you typed as a draft?')) saveDraft(false); else draftDrop();
    UI.draftId = null;
  }
  /* A form was saved, deleted or replaced: its draft is no longer needed. */
  function draftFinished() { draftDrop(); UI.draftId = null; UI.draftDone = true; }
  function batchRestore(b) {
    openBatch(b.mode);
    if (b.mode !== 'agent' && b.kind === 'WE') { var wb = document.querySelector('#batch-top [data-act="batchKind"][data-v="WE"]'); if (wb) wb.click(); }
    var bd = document.querySelector('#batch-top input[type=date]');
    if (bd && b.date) {
      bd.value = b.date; UI.batchDate = b.date;
      var which = b.date === R.today ? 'today' : b.date === addDays(R.today, -1) ? 'yesterday' : 'other';
      Array.prototype.forEach.call(document.querySelectorAll('#batch-top .dchip'), function (c) { c.classList.toggle('on', c.getAttribute('data-v') === which); });
      if (which !== 'other') bd.classList.add('hide-date'); else bd.classList.remove('hide-date');
    }
    var box = document.getElementById('batch-rows');
    while (box.querySelectorAll('.batch-row').length < b.rows.length) ACT.batchAdd();
    while (box.querySelectorAll('.batch-row').length > Math.max(1, b.rows.length)) box.lastElementChild.remove();
    var rowsEl = box.querySelectorAll('.batch-row');
    b.rows.forEach(function (o, i) {
      var row = rowsEl[i]; if (!row) return;
      Object.keys(o).forEach(function (k) {
        if (k === '__dt') return;
        var el = row.querySelector('.' + k); if (!el) return;
        el.value = o[k];
        if (k === 'b-types') setMulti(el.closest('.field'), o[k]);
        if (el.tagName === 'SELECT') el.dispatchEvent(new Event('change', { bubbles: true }));
        if (el.type === 'tel') updateNet(el);
      });
      if (o.__dt) { var dt = row.querySelector('.b-date'); if (dt) dt.dataset.touched = '1'; }
      var pay = row.querySelector('.b-pay'), rw = row.querySelector('.b-recv-wrap'); if (pay && rw) rw.classList.toggle('hide', pay.value !== 'part');
    });
    var tc = document.getElementById('b-chan');
    if (tc) { tc.value = b.chan || ''; tc.dispatchEvent(new Event('change', { bubbles: true })); }
    var to = document.getElementById('b-chan-other'); if (to) to.value = b.chanOther || '';
    var ex = document.getElementById('b-ex'); if (ex) ex.value = b.ex || '';
    renumberBatch();
  }
  function resumeDraft(d) {
    if (!d) return;
    if (d.kind === 'form') {
      var rec = d.recId ? findRec(d.coll, d.recId) : null;
      if (!d.isNew && !rec) { draftDrop(d.id); toast('That entry no longer exists, so its draft was removed.'); return; }
      openForm(d.type, rec, { prefill: d.vals, captureId: d.captureId });
    } else if (d.kind === 'batch') batchRestore(d.snap);
    UI.draftId = d.id; UI.draftDone = false;
    saveDraft(true);
    toast('Continuing where you stopped');
  }
  document.addEventListener('input', function (e) { if (UI.sheetOpen && e.target.closest && e.target.closest('#sheetwrap')) draftSoon(); }, true);
  document.addEventListener('change', function (e) { if (UI.sheetOpen && e.target.closest && e.target.closest('#sheetwrap')) draftSoon(); }, true);
  document.addEventListener('click', function (e) { if (UI.sheetOpen && e.target.closest && e.target.closest('#sheetwrap [data-act]')) draftSoon(); }, true);
  function openDrafts() {
    var list = draftsGet().slice().reverse();
    var body = list.length ? list.map(function (d) {
      var what = d.kind === 'batch' ? d.snap.rows.filter(function (r) { return r['b-name'] || r['b-agent'] || r['b-amount'] || r['b-to'] || r['b-from']; }).length + ' rows' :
        [d.vals.name || d.vals.agent || d.vals.category || '', d.vals.billed || d.vals.received || d.vals.amount || d.vals.toAgent || d.vals.fromAgent ? money(num(d.vals.billed || d.vals.received || d.vals.amount || d.vals.toAgent || d.vals.fromAgent)) : ''].filter(Boolean).join(' · ');
      return '<div class="inboxitem"><div class="caphead"><span class="pbadge g-none">' + icon('rules') + '</span><div class="tx"><b>' + esc(d.title) + '</b><small>' + esc(stamp(d.at)) + '</small></div></div>' +
        (what ? '<p class="inboxtext">' + esc(what) + '</p>' : '') +
        '<div class="inboxacts"><button class="btn" data-act="draftDelete" data-id="' + esc(d.id) + '">Delete</button><button class="btn primary" data-act="draftOpen" data-id="' + esc(d.id) + '">Continue</button></div></div>';
    }).join('') : '<p class="hint">No drafts.</p>';
    openSheet('Drafts', body, '<button class="btn" data-act="closeSheet">Close</button>');
  }

  /* ================= Undo =================
     Deleting, editing, restoring a backup and saving can be undone for a few seconds. */
  var UNDO = null, undoTimer = null;
  function undoPoint() { UNDO = JSON.stringify(S); }
  function offerUndo(msg) {
    if (!UNDO) { toast(msg); return; }
    var bar = document.getElementById('undobar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'undobar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
    bar.innerHTML = '<span>' + esc(msg) + '</span><button type="button" data-act="undoLast">Undo</button>';
    bar.classList.add('on');
    clearTimeout(undoTimer); undoTimer = setTimeout(function () { bar.classList.remove('on'); UNDO = null; }, 9000);
  }
  function undoLast() {
    if (!UNDO) return;
    var old = JSON.parse(UNDO); UNDO = null;
    LIST_KEYS.forEach(function (k) { S[k] = old[k] || []; });
    ['settings', 'daily', 'recon', 'limits'].forEach(function (k) { if (old[k] !== undefined) S[k] = old[k]; });
    S.nextSeq = Math.max(S.nextSeq || 1, old.nextSeq || 1);
    var bar = document.getElementById('undobar'); if (bar) bar.classList.remove('on');
    persist().then(function () { toast('Undone'); });
    if (UI.sheetOpen) { UI.draftDone = true; closeSheet(); }
    render();
  }

  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); } catch (e) { toast('That file is not a backup from this app.'); return; }
      if (obj && obj.locked) {
        var pwEl = document.getElementById('rs-pass'), pw = pwEl ? pwEl.value : '';
        if (!pw) { toast('This backup has a password. Type it, then tap Restore again.'); if (pwEl) pwEl.focus(); return; }
        unlockBackup(obj, pw).then(function (o) { if (pwEl) pwEl.value = ''; restoreObj(o); }, function () { toast('Wrong backup password.'); });
        return;
      }
      restoreObj(obj);
    };
    reader.readAsText(file);
  }
  function restoreObj(obj) {
    {
      if (!obj || !Array.isArray(obj.sales)) { toast('That file is not a backup from this app.'); return; }
      var msg = 'Restore this file?\n\nIt has ' + obj.sales.length + ' sales and ' + ((obj.agents || []).length) + ' agent entries.\n\nIt will REPLACE everything currently in the app' + (window.Sync && Sync.status().signedIn ? ', and your online records too.' : '.');
      if (!confirm(msg)) return;
      var keep = { lastBackup: S.meta.lastBackup, firebase: S.meta.firebase, pending: S.meta.pending, security: S.meta.security, ownerUid: S.meta.ownerUid,
        sync: S.meta.sync, hideAmounts: S.meta.hideAmounts, pinSkipped: S.meta.pinSkipped, knownDevices: S.meta.knownDevices, devSince: S.meta.devSince,
        lang: S.meta.lang, skipAccount: S.meta.skipAccount, profileSkipped: S.meta.profileSkipped, lastChannel: S.meta.lastChannel, deviceAlerts: S.meta.deviceAlerts };
      var mine = S.settings.profile;
      undoPoint();
      S = normalize(obj); S.meta = Object.assign({ lastBackup: null }, S.meta);
      Object.keys(keep).forEach(function (k) { if (keep[k] !== undefined) S.meta[k] = keep[k]; else delete S.meta[k]; });
      if (!S.meta.pending) S.meta.pending = {};
      if (!S.settings.profile.name && mine && mine.name) S.settings.profile = mine;
      applyLocale(); migrate();
      persist().then(function () { offerUndo('Records restored'); });
      setTab('home');
    }
  }
  /* The app hides itself when you switch away, and locks again after the time you chose. */
  /* A refresh or an app update reloads the page. That is not leaving the app, so it does not ask for the PIN again.
     Closing the app clears this note, so opening it fresh still asks. */
  function markAlive() { try { if (Security.enabled() && !UI.locked) sessionStorage.setItem('act-alive', String(Date.now())); else sessionStorage.removeItem('act-alive'); } catch (e) {} }
  function resumeGrace() {
    try {
      var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
      if (nav.type !== 'reload') return false;   // opening the app fresh always asks
      var at = Number(sessionStorage.getItem('act-alive') || 0); if (!at) return false;
      var d = Security.lockDelayMs(), allow = Math.max(d === Infinity ? 12 * 3600e3 : d, 60e3);
      return Date.now() - at < allow;
    } catch (e) { return false; }
  }
  var cover = null;
  function showCover() {
    if (cover || !(window.Security && Security.enabled())) return;
    cover = document.createElement('div'); cover.id = 'privacy-cover';
    cover.innerHTML = '<div><img src="icon-192.png" alt="" width="72" height="72"><p>' + esc(APP_NAME) + '</p></div>';
    document.body.appendChild(cover);
  }
  function hideCover() { if (cover) { cover.remove(); cover = null; } }
  var appHidden = false;
  function appHide() { if (appHidden) return; appHidden = true; UI.hiddenAt = Date.now(); if (UI.sheetOpen) saveDraft(true); markAlive(); showCover(); }
  function appShow() {
    if (!appHidden) return; appHidden = false;
    hideCover();
    if (Security.enabled() && !UI.locked && UI.hiddenAt) {
      var delay = Security.lockDelayMs();
      if (delay !== Infinity && Date.now() - UI.hiddenAt >= delay) { try { sessionStorage.removeItem('act-alive'); } catch (e) {} UI.locked = true; UI.pin = ''; UI.pinMsg = ''; UI.bioTried = false; UI.resumeTried = false; render(); return; }
    }
    pullCaptured(); pullShared();
    if (!UI.sheetOpen) { recompute(); render(); }
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) appHide(); else appShow(); });
  /* The Android app calls these when it goes to the background and comes back. */
  window.__appHidden = appHide; window.__appShown = appShow;
  window.addEventListener('pagehide', function () { markAlive(); showCover(); });
  window.addEventListener('pageshow', function () { if (!document.hidden) hideCover(); });

  /* ================= Start ================= */
  function onSyncStatus(s) {
    updateSyncBadge(s);
    var g = gateState();
    if (g !== UI.lastGate && !UI.sheetOpen) render();
  }
  history.replaceState({ n: 1 }, '');
  Store.get().then(function (saved) {
    S = normalize(saved); I18N.setPref(S.meta.lang || 'auto'); I18N.watch(); applyLocale();
    Security.init({ getS: function () { return S; }, saveLocal: function () { return Store.set(S); } });
    UI.locked = Security.enabled() && !resumeGrace();
    Security.bioSupported().then(function (ok) { UI.bioOK = ok; });
    pullCaptured(); pullShared();
    recompute(); render();
    if (window.Sync) Sync.init({
      getS: function () { return S; },
      saveLocal: function () { recompute(); return Store.set(S); },
      refresh: function () {
        applyLocale(); recompute();
        if (UI.sheetOpen || gateState()) { UI.pendingRender = true; return; }
        var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
        if (typing && LISTS[cur().v]) renderList(); else if (!typing) render(); else UI.pendingRender = true;
      },
      onStatus: onSyncStatus,
      resetLocal: function () { S = blankState(); applyLocale(); recompute(); Store.set(S); UI.locked = false; return S; },
      onAuth: function (signedIn) {
        // Redraw only when sign-in status really changes, so typing is never wiped.
        var first = UI.lastAuth === undefined, changed = UI.lastAuth !== signedIn;
        UI.lastAuth = signedIn;
        if (!changed || (first && !signedIn)) return;
        if (UI.sheetOpen) UI.pendingRender = true; else render();
      },
      onDevices: function () { var el = document.getElementById('devices'); if (el) el.innerHTML = devicesHTML(); },
      onRevoked: function () {
        Sync.signOut().then(function () { UI.stack = [{ v: 'home' }]; UI.locked = false; toast('This phone was removed from the account.'); render(); });
      }
    });
    if (migrate()) persist();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  });
  if (!NATIVE && 'serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller, reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloading && !UI.sheetOpen) { reloading = true; location.reload(); }
    });
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.__app = { state: function () { return S; }, results: function () { return R; }, ui: UI, gate: gateState, acts: function () { return Object.keys(ACT); }, views: function () { return Object.keys(VIEWS); } };
})();
