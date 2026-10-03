/* Business Tracker – app shell. Works fully offline; data stays on this phone. */
(function () {
  'use strict';
  var C = window.Calc, num = C.num, r2 = C.r2;

  /* ================= Formatting ================= */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v) {
    var n = r2(num(v)), a = Math.abs(n);
    return (n < 0 ? '−' : '') + 'D' + a.toLocaleString('en-GB', { minimumFractionDigits: a % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function compact(v) {
    var n = num(v), a = Math.abs(n);
    var s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'm' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : String(Math.round(a));
    return (n < 0 ? '−' : '') + 'D' + s;
  }
  function parts(s) { var p = String(s).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function ord(d) { var j = d % 10, k = d % 100; return d + (k >= 11 && k <= 13 ? 'th' : j === 1 ? 'st' : j === 2 ? 'nd' : j === 3 ? 'rd' : 'th'); }
  function readable(s) { if (!s) return ''; var p = parts(s); return ord(p.d) + ' ' + MONTHS[p.m - 1] + ' ' + p.y; }
  function shortDate(s) { if (!s) return ''; var p = parts(s); return p.d + ' ' + MONTHS[p.m - 1].slice(0, 3) + ' ' + p.y; }
  function dayHead(s) { var p = parts(s); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] + ', ' + ord(p.d) + ' ' + MONTHS[p.m - 1]; }
  function monthName(m) { if (!m) return ''; var p = m.split('-').map(Number); return MONTHS[p[1] - 1] + ' ' + p[0]; }
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ================= Data ================= */
  var DEFAULT_SETTINGS = {
    countryCode: '220',
    channels: ['Wave', 'APS', 'Afrimoney', 'QMoney', 'Nafa', 'Yonna', 'ComCash', 'Bank Transfer', 'Cash', 'Other'],
    exTypes: ['Bank-to-Wallet', 'Wallet-to-Bank', 'Deposit', 'Other'],
    agentTxTypes: ['Float Transfer/Rebalancing (between wallets)', 'EVC/Voucher Transaction', 'Bank to Bank Exchange', 'Bank to Wallet Exchange', 'Wallet to Bank Exchange', 'Other'],
    wallets: ['Wave', 'APS', 'Afrimoney - Account 1', 'Afrimoney - Account 2', 'QMoney', 'Nafa', 'ComCash', 'Yonna Wallet', 'Xpress Point', 'Suturamoney', 'Other'],
    evcProviders: ['EVC Comium', 'Africell', 'Qcell', 'Other'],
    capitalAccounts: ['Cash in hand', 'Wave', 'APS', 'Afrimoney - Account 1', 'Afrimoney - Account 2', 'QMoney', 'Nafa', 'ComCash', 'Yonna Wallet', 'Xpress Point', 'Suturamoney', 'Bank', 'EVC stock'],
    woReasons: ['Customer unreachable/disappeared', 'Agent defaulted', 'Error-caused loss', 'Fraud/Scam', 'Business decision (waived)', 'Other'],
    errorTypes: ['Wrong amount charged', 'Wrong customer/agent billed', 'Duplicate entry', 'Wrong exchange rate', 'Wrong data bundle', 'Reconciliation mismatch', 'Other'],
    causedBy: ['Customer', 'Agent', 'Owner/Staff', 'System/Technical', 'Unclear']
  };
  var LIST_KEYS = ['sales', 'agents', 'referrals', 'brackets', 'walletComm', 'evc', 'capital', 'errors'];
  function blankState() {
    return { app: 'business-tracker', version: 1, sales: [], agents: [], referrals: [],
      brackets: [{ min: 1, max: 999, comm: 5 }, { min: 1000, max: 9999, comm: 25 }, { min: 10000, max: 17999, comm: 65 }],
      walletComm: [], evc: [], capital: [], errors: [], daily: {}, recon: {}, nextSeq: 1,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), meta: { lastBackup: null } };
  }
  function normalize(s) {
    var out = Object.assign(blankState(), s || {});
    out.settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), (s && s.settings) || {});
    out.meta = Object.assign({ lastBackup: null }, (s && s.meta) || {});
    LIST_KEYS.forEach(function (k) { if (!Array.isArray(out[k])) out[k] = []; });
    if (!out.daily || typeof out.daily !== 'object') out.daily = {};
    if (!out.recon || typeof out.recon !== 'object') out.recon = {};
    var maxSeq = 0;
    LIST_KEYS.forEach(function (k) { out[k].forEach(function (r) { if (r && !r.id && k !== 'brackets') r.id = uid(); if (r && r.seq > maxSeq) maxSeq = r.seq; }); });
    out.nextSeq = Math.max(out.nextSeq || 1, maxSeq + 1);
    return out;
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
  var UI = { stack: [{ v: 'home' }], sheetOpen: false, salesQuery: '', salesFilter: 'all', custQuery: '', custFilter: 'all',
    agentQuery: '', limit: 120, commTab: 'wallet', refTab: 'sales', shareType: 'Customer', shareKey: '', shareText: '' };
  var TITLES = { home: 'Business Tracker', sales: 'Sales', agents: 'Agents', customers: 'Customers', more: 'More',
    share: 'Share a statement', daily: 'Daily cash check', recon: 'Monthly reconciliation', losses: 'Losses and errors',
    comm: 'Commissions', ref: 'Referral agents', capital: 'Capital portfolio', backup: 'Backup and restore',
    settings: 'Settings', help: 'How it works', sync: 'Online sync' };
  function cur() { return UI.stack[UI.stack.length - 1]; }
  function go(v) { UI.stack.push(v); history.pushState({ n: UI.stack.length }, ''); render(); window.scrollTo(0, 0); }
  function setTab(t) { UI.stack = [{ v: t }]; UI.limit = 120; render(); window.scrollTo(0, 0); }
  window.addEventListener('popstate', function () {
    if (UI.sheetOpen) { removeSheet(); return; }
    if (UI.stack.length > 1) { UI.stack.pop(); render(); }
  });

  /* ================= Small UI helpers ================= */
  var ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    sales: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    agents: '<path d="M4 8h14l-3-3"/><path d="M20 16H6l3 3"/>',
    customers: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.5 3.2-5 6-5s5.2 1.5 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6.1 4.3 1.6 5 4.4"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + '</svg>'; }
  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = 'none'; }, 2400);
  }
  var STATUS_CLASS = { 'Paid': 'p-paid', 'Overpaid': 'p-overpaid', 'Outstanding': 'p-outstanding', 'Overdue': 'p-overdue', 'Bad debt': 'p-bad' };
  var TYPE_CLASS = { 'Regular': 'p-regular', 'Irregular': 'p-irregular', 'Inactive (90+ days)': 'p-inactive', 'Bad (high risk)': 'p-overdue', 'Do not give credit': 'p-bad' };
  function pill(text, cls) { return text ? '<span class="pill ' + (cls || 'p-paid') + '">' + esc(text) + '</span>' : ''; }
  function balanceText(b, big) {
    var cls = big ? 'big ' : 'amount ';
    if (b > 0) return '<span class="' + cls + 'c-owed">Owes ' + money(b) + '</span>';
    if (b < 0) return '<span class="' + cls + 'c-credit">Credit ' + money(-b) + '</span>';
    return '<span class="' + (big ? 'big ' : '') + 'c-muted" style="font-weight:600">Settled</span>';
  }
  function agentNetText(n, big) {
    var cls = big ? 'big ' : 'amount ';
    if (n > 0) return '<span class="' + cls + 'c-owed">Owes you ' + money(n) + '</span>';
    if (n < 0) return '<span class="' + cls + '">You owe ' + money(-n) + '</span>';
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
  function byNewest(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.seq || 0) - (a.seq || 0); }

  /* ================= Render ================= */
  function render() {
    var v = cur(), root = document.getElementById('app');
    var title = TITLES[v.v] || '';
    if (v.v === 'customer') { var c = findCustomer(v.key); title = c ? (c.name || c.phone) : 'Customer'; }
    if (v.v === 'agent') { var a = findAgent(v.key); title = a ? a.name : 'Agent'; }
    var top = '<header class="topbar">' + (UI.stack.length > 1 ? '<button class="back" data-act="back" aria-label="Back">‹</button>' : '') +
      '<h1>' + esc(title) + '</h1>' + syncBadge() + '</header>';
    var body = (VIEWS[v.v] || VIEWS.home)(v);
    root.innerHTML = top + '<main>' + body + '</main>' + navBar() + fab(v);
    if (LISTS[v.v]) renderList();
  }
  function navBar() {
    var t = UI.stack[0].v;
    var items = [['home', 'Home'], ['sales', 'Sales'], ['agents', 'Agents'], ['customers', 'Customers'], ['more', 'More']];
    return '<nav class="nav" aria-label="Main">' + items.map(function (i) {
      return '<button data-act="tab" data-v="' + i[0] + '" class="' + (t === i[0] ? 'on' : '') + '"' + (t === i[0] ? ' aria-current="page"' : '') + '>' + icon(i[0]) + '<span>' + i[1] + '</span></button>';
    }).join('') + '</nav>';
  }
  function fab(v) {
    var map = { home: ['newSale', 'New sale'], sales: ['newSale', 'New sale'], customers: ['newSale', 'New sale'], customer: ['newSaleFor', 'New sale'],
      agents: ['newAgent', 'New agent entry'], agent: ['newAgentFor', 'New entry'], losses: ['newError', 'Log an error'],
      capital: ['newCapital', 'New snapshot'] };
    if (v.v === 'comm') map.comm = UI.commTab === 'evc' ? ['newEvc', 'New EVC entry'] : UI.commTab === 'wallet' ? ['newWallet', 'New commission'] : null;
    if (v.v === 'ref' && UI.refTab === 'sales') map.ref = ['newRef', 'New referral sale'];
    var f = map[v.v];
    if (!f) return '';
    return '<button class="fab" data-act="' + f[0] + '" data-key="' + esc(v.key || '') + '"><span class="plus" aria-hidden="true">+</span>' + f[1] + '</button>';
  }

  function findCustomer(key) { for (var i = 0; i < R.customers.length; i++) if (R.customers[i].key === key) return R.customers[i]; return null; }
  function findAgent(key) { for (var i = 0; i < R.agents.balances.length; i++) if (R.agents.balances[i].key === key) return R.agents.balances[i]; return null; }

  /* ================= Views ================= */
  var VIEWS = {};

  VIEWS.home = function () {
    var t = R.totals, today = R.today, month = today.slice(0, 7), h = '';
    var hasData = S.sales.length || S.agents.length;
    var todays = R.sales.filter(function (r) { return r.date === today && r.billedSet; });
    var recvToday = todays.reduce(function (a, r) { return a + num(r.received) + num(r.tip); }, 0);
    h += backupBanner();
    if (!hasData) {
      h += '<div class="card"><b>Welcome.</b><p class="hint" style="margin:6px 0 12px">Add your first sale with the yellow button, or bring in your existing records from the backup file I gave you.</p>' +
        '<button class="btn primary" data-act="go" data-v="backup">Restore my existing records</button></div>';
    }
    h += '<div class="today-strip"><div><div class="label">Received today, ' + esc(shortDate(today)) + '</div><div class="big">' + money(recvToday) + '</div></div>' +
      '<div style="text-align:right"><div class="label">Entries today</div><div class="big">' + todays.length + '</div></div></div>';
    var owingCount = R.customers.filter(function (c) { return c.owed > 0; }).length;
    var lossM = (R.losses.byMonth.filter(function (x) { return x.month === month; })[0] || {}).amount || 0;
    var commM = (R.commMonths.filter(function (x) { return x.month === month; })[0] || {}).total || 0;
    h += '<div class="figures">' +
      '<button class="figure" data-act="custFilterGo" data-v="owing" style="text-align:left"><div class="label">Customers owe you</div><div class="big c-owed">' + money(t.owed) + '</div><div class="sub">' + owingCount + ' customer' + (owingCount === 1 ? '' : 's') + '</div></button>' +
      '<button class="figure" data-act="custFilterGo" data-v="credit" style="text-align:left"><div class="label">Customer credit you hold</div><div class="big c-credit">' + money(t.credit) + '</div><div class="sub">Paid in advance</div></button>' +
      '<button class="figure" data-act="tab" data-v="agents" style="text-align:left"><div class="label">Agents, overall</div><div class="big ' + (t.agentNet > 0 ? 'c-owed' : '') + '">' + money(Math.abs(t.agentNet)) + '</div><div class="sub">' + (t.agentNet > 0 ? 'Agents owe you' : t.agentNet < 0 ? 'You owe agents' : 'Settled') + '</div></button>' +
      '<button class="figure" data-act="salesFilterGo" data-v="overdue" style="text-align:left"><div class="label">Overdue sales</div><div class="big ' + (t.overdue ? 'c-late' : '') + '">' + t.overdue + '</div><div class="sub">Unpaid for over 3 days</div></button>' +
      '<button class="figure" data-act="go" data-v="losses" style="text-align:left"><div class="label">Losses this month</div><div class="big ' + (lossM ? 'c-late' : '') + '">' + money(lossM) + '</div><div class="sub">All time ' + money(R.losses.total) + '</div></button>' +
      '<button class="figure" data-act="go" data-v="comm" style="text-align:left"><div class="label">Commission this month</div><div class="big c-credit">' + money(commM) + '</div><div class="sub">All time ' + money(t.commission) + '</div></button>' +
      '</div>';
    h += chartMonthly() + chartTopOwing() + chartCustomerMix() + chartCommission();
    return h;
  };

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
    R.recon.forEach(function (m) { map[m.month] = m; });
    var max = 1;
    months.forEach(function (k) { var m = map[k] || {}; max = Math.max(max, num(m.billed), num(m.received)); });
    var cols = months.map(function (k) {
      var m = map[k] || {};
      return '<div class="grp" title="' + esc(monthName(k)) + '">' +
        '<div class="bar" style="background:var(--ink);height:' + (num(m.billed) / max * 100).toFixed(1) + '%"></div>' +
        '<div class="bar" style="background:var(--credit);height:' + (num(m.received) / max * 100).toFixed(1) + '%"></div></div>';
    }).join('');
    var labels = months.map(function (k) { return '<span>' + MONTHS[Number(k.slice(5)) - 1].slice(0, 3) + '</span>'; }).join('');
    var cur = map[R.today.slice(0, 7)] || {};
    return '<div class="chart"><h3>Billed and received, last 6 months</h3>' +
      '<div class="legend"><span><i style="background:var(--ink)"></i>Billed</span><span><i style="background:var(--credit)"></i>Received</span>' + (max > 1 ? '<span>Highest: ' + compact(max) + '</span>' : '') + '</div>' +
      '<div class="cols" role="img" aria-label="Billed and received by month">' + cols + '</div><div class="col-labels">' + labels + '</div>' +
      '<p class="hint" style="margin:8px 0 0">This month: billed ' + money(cur.billed || 0) + ', received ' + money(cur.received || 0) + '.</p></div>';
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
    return '<div class="chart"><h3>Who owes you the most</h3><p class="hint" style="margin:0 0 6px">Chase these first.</p>' +
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
    if (!items.length) return '<div class="chart"><h3>Commission by wallet and EVC</h3><p class="hint" style="margin:0">Nothing yet. Add commission entries under More, then Commissions.</p></div>';
    return '<div class="chart"><h3>Commission by wallet and EVC</h3><p class="hint" style="margin:0 0 6px">Net, after royalties and agent shares.</p>' + hbars(items, 'var(--credit)') + '</div>';
  }

  /* ----- Sales ----- */
  VIEWS.sales = function () {
    return '<input class="search" id="q-sales" type="search" placeholder="Search name, phone or ref" aria-label="Search sales" value="' + esc(UI.salesQuery) + '">' +
      '<div class="chips">' + [['all', 'All'], ['owing', 'Owing'], ['overdue', 'Overdue'], ['overpaid', 'Overpaid'], ['DS', 'Data / deposit'], ['WE', 'Wallet exchange']].map(function (c) {
        return '<button data-act="salesFilter" data-v="' + c[0] + '" class="' + (UI.salesFilter === c[0] ? 'on' : '') + '">' + c[1] + '</button>';
      }).join('') + '</div><div id="list"></div>';
  };
  var LISTS = {};
  LISTS.sales = function () {
    var q = UI.salesQuery.trim().toLowerCase(), f = UI.salesFilter;
    var rows = R.sales.filter(function (r) {
      if (f === 'owing' && !(r.balance > 0)) return false;
      if (f === 'overdue' && r.status !== 'Overdue') return false;
      if (f === 'overpaid' && r.status !== 'Overpaid') return false;
      if ((f === 'DS' || f === 'WE') && (r.kind === 'WE' ? 'WE' : 'DS') !== f) return false;
      if (q && (String(r.name) + ' ' + r.phone + ' ' + r.refId + ' ' + r.details + ' ' + r.beneficiary).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(byNewest);
    if (!rows.length) return S.sales.length ? empty('No matching sales', 'Try a different search or filter.') : empty('No sales yet', 'Tap the yellow button to add your first sale.');
    return groupedList(rows, saleRow);
  };
  function groupedList(rows, rowFn) {
    var shown = rows.slice(0, UI.limit), h = '', lastM = '', lastD = '';
    var monthStats = {}; R.recon.forEach(function (m) { monthStats[m.month] = m; });
    var dayStats = {}; R.daily.forEach(function (d) { dayStats[d.date] = d; });
    shown.forEach(function (r) {
      var m = (r.date || '').slice(0, 7);
      if (m !== lastM) {
        var ms = monthStats[m];
        h += '<div class="month-head"><h2>' + esc(monthName(m) || 'No date') + '</h2><span class="meta">' + (ms ? ms.count + (ms.count === 1 ? ' sale' : ' sales') + ', received ' + money(ms.received) : '') + '</span></div>';
        lastM = m; lastD = '';
      }
      if (r.date !== lastD) {
        var ds = dayStats[r.date];
        h += '<div class="day-head"><span>' + esc(r.date ? dayHead(r.date) : 'No date') + '</span><span class="meta">' + (ds ? ds.count + (ds.count === 1 ? ' sale, ' : ' sales, ') + money(ds.received) : '') + '</span></div>';
        lastD = r.date;
      }
      h += rowFn(r);
    });
    if (rows.length > shown.length) h += '<button class="more-btn" data-act="showMore">Show more (' + (rows.length - shown.length) + ' older)</button>';
    return h;
  }
  function saleRow(r) {
    var what = r.details || (r.kind === 'WE' ? (r.exType || 'Wallet exchange') : 'Data / deposit');
    var late = r.daysOverdue ? ', ' + r.daysOverdue + ' days' : '';
    var delayed = r.daysDelayed ? ', paid ' + r.daysDelayed + ' days late' : '';
    return '<button class="row" data-act="editSale" data-id="' + esc(r.id) + '">' +
      '<div class="top"><div><div class="name">' + esc(r.name || 'No name') + '</div><div class="detail">' + esc(what) + ', ' + esc(r.refId) + '</div></div>' + pill(r.status, STATUS_CLASS[r.status]) + '</div>' +
      '<div class="bottom"><span class="c-muted num">Billed ' + money(r.billed) + ', paid ' + money(num(r.received)) + esc(late) + esc(delayed) + '</span>' +
      (r.billedSet ? balanceText(r.balance) : '') + '</div></button>';
  }

  /* ----- Customers ----- */
  VIEWS.customers = function () {
    var t = R.totals;
    return '<input class="search" id="q-cust" type="search" placeholder="Search name or phone" aria-label="Search customers" value="' + esc(UI.custQuery) + '">' +
      '<div class="chips">' + [['all', 'All'], ['owing', 'Owing'], ['credit', 'In credit'], ['Regular', 'Regular'], ['Irregular', 'Irregular'], ['bad', 'Bad or no credit']].map(function (c) {
        return '<button data-act="custFilter" data-v="' + c[0] + '" class="' + (UI.custFilter === c[0] ? 'on' : '') + '">' + c[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="hint">' + R.customers.length + ' customers. They owe you ' + money(t.owed) + '; you hold ' + money(t.credit) + ' of their credit.</p><div id="list"></div>';
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
      return '<button class="row" data-act="openCustomer" data-key="' + esc(c.key) + '"><div class="top"><div><div class="name">' + esc(c.name || 'No name') + '</div><div class="detail">' + esc(c.phone || 'No phone') + '</div></div>' + balanceText(c.balance) + '</div>' +
        '<div class="bottom"><span class="c-muted">' + c.txns + ' sale' + (c.txns === 1 ? '' : 's') + ', last ' + esc(shortDate(c.last)) + (c.daysOverdue ? ', oldest unpaid ' + c.daysOverdue + ' days' : '') + '</span>' + pill(c.type, TYPE_CLASS[c.type]) + '</div></button>';
    }).join('');
  };
  VIEWS.customer = function (v) {
    var c = findCustomer(v.key);
    if (!c) return empty('Customer not found', 'They may have been removed.');
    var h = '<div class="detail-hero"><div class="who">' + esc(c.name || 'No name') + '</div><div class="sub">' + esc(c.phone || 'No phone') + ' ' + pill(c.type, TYPE_CLASS[c.type]) + '</div>' +
      '<div>' + balanceText(c.balance, true) + '</div>' +
      '<div class="stats">' +
      '<div><span>Total billed</span><b>' + money(c.billed) + '</b></div><div><span>Total received</span><b>' + money(c.received) + '</b></div>' +
      '<div><span>Written off</span><b>' + money(c.writtenOff) + '</b></div><div><span>Sales</span><b>' + c.txns + '</b></div>' +
      '<div><span>First sale</span><b>' + esc(shortDate(c.first)) + '</b></div><div><span>Last sale</span><b>' + esc(shortDate(c.last)) + '</b></div>' +
      '<div><span>Sales per month</span><b>' + c.frequency.toFixed(1) + '</b></div><div><span>Risk</span><b>' + esc(c.risk) + '</b></div>' +
      (c.oldestUnpaid ? '<div><span>Oldest unpaid</span><b>' + esc(shortDate(c.oldestUnpaid)) + '</b></div><div><span>Days overdue</span><b>' + c.daysOverdue + '</b></div>' : '') +
      '</div><div class="actions"><button class="btn primary" data-act="shareFor" data-type="Customer" data-key="' + esc(c.key) + '">Share statement</button></div></div>';
    h += '<div class="section-title">Their sales, newest first</div>';
    h += c.rows.slice().sort(byNewest).map(saleRow).join('');
    return h;
  };

  /* ----- Agents ----- */
  VIEWS.agents = function () {
    return '<input class="search" id="q-agents" type="search" placeholder="Search agent, number or ref" aria-label="Search agents" value="' + esc(UI.agentQuery) + '"><div id="list"></div>';
  };
  LISTS.agents = function () {
    var q = UI.agentQuery.trim().toLowerCase(), h = '';
    var bal = R.agents.balances.filter(function (a) { return !q || (a.name + ' ' + a.phone).toLowerCase().indexOf(q) >= 0; });
    if (!R.agents.rows.length) return empty('No agent entries yet', 'Tap the yellow button to record a float transfer, EVC, bank exchange or other agent entry.');
    if (bal.length) {
      h += '<div class="section-title">Balances</div>';
      h += bal.map(function (a) {
        return '<button class="row" data-act="openAgent" data-key="' + esc(a.key) + '"><div class="top"><div><div class="name">' + esc(a.name) + '</div><div class="detail">' + esc(a.phone || 'No number') + ', ' + a.entries + ' entries</div></div>' + agentNetText(a.net) + '</div>' +
          (a.type ? '<div class="bottom"><span></span>' + pill(a.type, /master/i.test(a.type) ? 'p-master' : 'p-irregular') + '</div>' : '') + '</button>';
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
      if (m !== lastM) { h += '<div class="month-head"><h2>' + esc(monthName(m) || 'No date') + '</h2><span class="meta"></span></div>'; lastM = m; lastD = ''; }
      if (r.date !== lastD) { h += '<div class="day-head"><span>' + esc(r.date ? dayHead(r.date) : 'No date') + '</span></div>'; lastD = r.date; }
      h += agentRow(r);
    });
    if (rows.length > shown.length) h += '<button class="more-btn" data-act="showMore">Show more (' + (rows.length - shown.length) + ' older)</button>';
    return h;
  }
  function agentRow(r) {
    var effect = !r.hasNet ? '' : r.net > 0 ? '<span class="amount c-owed">+' + money(r.net) + '</span>' : r.net < 0 ? '<span class="amount">' + money(r.net) + '</span>' : '<span class="c-muted">Even</span>';
    return '<button class="row" data-act="editAgent" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.name || 'No name') + '</div>' +
      '<div class="detail">' + esc(r.desc || r.txType || 'Entry') + (r.txNumber ? ', via ' + esc(r.txNumber) : '') + ', ' + esc(r.refId) + '</div></div>' + effect + '</div>' +
      '<div class="bottom"><span class="c-muted num">Sent ' + money(num(r.toAgent)) + ', received ' + money(num(r.fromAgent)) + '</span></div></button>';
  }
  VIEWS.agent = function (v) {
    var a = findAgent(v.key);
    if (!a) return empty('Agent not found', 'They may have been removed.');
    var rows = R.agents.rows.filter(function (r) { return C.agentKey(r.name) === a.key; }).sort(byNewest);
    return '<div class="detail-hero"><div class="who">' + esc(a.name) + '</div><div class="sub">' + esc(a.phone || 'No number') + ' ' + pill(a.type, /master/i.test(a.type) ? 'p-master' : 'p-irregular') + '</div>' +
      '<div>' + agentNetText(a.net, true) + '</div><div class="stats"><div><span>Entries</span><b>' + a.entries + '</b></div><div><span>Last entry</span><b>' + esc(shortDate(a.last)) + '</b></div>' +
      '<div><span>Written off</span><b>' + money(a.writtenOff) + '</b></div></div>' +
      '<div class="actions"><button class="btn primary" data-act="shareFor" data-type="Agent" data-key="' + esc(a.key) + '">Share statement</button></div></div>' +
      '<p class="hint">A plus amount means that entry added to what the agent owes you. A minus amount means it added to what you owe the agent.</p>' +
      rows.map(agentRow).join('');
  };

  /* ----- More ----- */
  VIEWS.more = function () {
    var ss = window.Sync ? Sync.status() : { configured: false };
    var items = [
      ['sync', 'Online sync', ss.signedIn ? 'On: ' + ss.label + (ss.email ? ', ' + ss.email : '') : ss.configured ? 'Sign in to start syncing' : 'Save your records online, no backups needed'],
      ['share', 'Share a statement', 'Send a customer or agent their balance on WhatsApp'],
      ['daily', 'Daily cash check', 'Opening and closing balances, to catch missing money'],
      ['recon', 'Monthly reconciliation', 'Compare your records with your statements'],
      ['losses', 'Losses and errors', 'Write-offs, error log and losses per month'],
      ['comm', 'Commissions', 'Mobile wallets and EVC, with totals per month'],
      ['ref', 'Referral agents', 'Sales you do for other agents, and what you owe them'],
      ['capital', 'Capital portfolio', 'Available and working capital'],
      ['backup', 'Backup and restore', 'Save your records, or bring them back'],
      ['settings', 'Settings', 'Payment channels, wallets and other lists'],
      ['help', 'How it works', 'Balances, credit, statuses and customer types']
    ];
    var h = '<div class="menu">' + items.map(function (i) { return '<button data-act="go" data-v="' + i[0] + '"><b>' + i[1] + '</b><small>' + i[2] + '</small></button>'; }).join('') + '</div>';
    if (deferredInstall) h += '<button class="btn kiosk block" data-act="install">Install this app on your phone</button>';
    return h;
  };

  /* ----- Share ----- */
  VIEWS.share = function () {
    var isC = UI.shareType === 'Customer';
    var opts = isC ? R.customers.map(function (c) { return [c.key, (c.name || 'No name') + (c.phone ? ' (' + c.phone + ')' : '') + (c.owed > 0 ? ', owes ' + money(c.owed) : c.credit > 0 ? ', credit ' + money(c.credit) : '')]; })
      : R.agents.balances.map(function (a) { return [a.key, a.name + (a.net > 0 ? ', owes you ' + money(a.net) : a.net < 0 ? ', you owe ' + money(-a.net) : ', settled')]; });
    if (UI.shareKey && !opts.some(function (o) { return o[0] === UI.shareKey; })) UI.shareKey = '';
    if (!UI.shareKey && opts.length) UI.shareKey = opts[0][0];
    if (!UI.shareText) UI.shareText = buildMessage();
    var phone = sharePhone();
    return seg('shareType', UI.shareType, [['Customer', 'Customer'], ['Agent', 'Agent']]) +
      '<div class="field"><label for="share-who">' + (isC ? 'Customer' : 'Agent') + '</label><select id="share-who">' +
      (opts.length ? opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === UI.shareKey ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') : '<option>No one yet</option>') + '</select></div>' +
      '<div class="field"><label for="msg">Message. Change any word before sending.</label><textarea id="msg" class="message">' + esc(UI.shareText) + '</textarea></div>' +
      '<div class="actions">' +
      (phone ? '<button class="btn kiosk" data-act="shareWa">Send on WhatsApp</button>' : '') +
      '<button class="btn primary" data-act="shareShare">Share</button><button class="btn" data-act="shareCopy">Copy</button>' +
      '<button class="btn" data-act="shareRegen">Start over</button></div>' +
      (phone ? '<p class="hint">WhatsApp opens a chat with ' + esc(phone) + ' with your message ready. Nothing is sent until you press send there.</p>' : '<p class="hint">No phone number saved for them, so use Share or Copy.</p>');
  };
  function sharePhone() {
    var raw = '';
    if (UI.shareType === 'Customer') { var c = findCustomer(UI.shareKey); raw = c ? c.phone : ''; }
    else { var a = findAgent(UI.shareKey); raw = a ? a.phone : ''; }
    var d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length <= 7 && S.settings.countryCode) d = String(S.settings.countryCode).replace(/\D/g, '') + d;
    return d;
  }
  function buildMessage() {
    if (UI.shareType === 'Customer') { var c = findCustomer(UI.shareKey); return c ? customerMessage(c) : ''; }
    var a = findAgent(UI.shareKey); return a ? agentMessage(a) : '';
  }
  function customerMessage(c) {
    var name = c.name || 'there', date = readable(R.today);
    if (c.balance <= 0) {
      return 'Hello ' + name + ', thank you for doing business with us.\n\nAs of ' + date + ', your account is fully settled' +
        (c.credit > 0 ? ', and you have a credit of ' + money(c.credit) + ' with us. It will be used on your next purchase.' : '.') + '\n\nThank you!';
    }
    var items = c.rows.filter(function (r) { return r.shortfall > 0; }).sort(byNewest);
    var sum = items.reduce(function (a, r) { return a + r.shortfall; }, 0);
    var lines = items.map(function (r, i) { return (i + 1) + '. ' + shortDate(r.date) + ': ' + (r.details || (r.kind === 'WE' ? 'Wallet exchange' : 'Purchase')) + ', ' + money(r.shortfall) + ' unpaid'; });
    return 'Hello ' + name + ', this is a reminder of your outstanding balance with us as of ' + date + '.\n\nUnpaid items:\n' + lines.join('\n') +
      '\n\nTotal outstanding: ' + money(c.balance) +
      (sum - c.balance > 0.005 ? '\n(Your earlier overpayment of ' + money(sum - c.balance) + ' has already been deducted.)' : '') +
      '\n\nKindly settle at your earliest convenience. Thank you!';
  }
  function agentMessage(a) {
    var rows = R.agents.rows.filter(function (r) { return C.agentKey(r.name) === a.key && r.hasNet; }).sort(byNewest);
    var shown = rows.slice(0, 25);
    var lines = shown.map(function (r, i) {
      return (i + 1) + '. ' + shortDate(r.date) + ': ' + (r.desc || r.txType || 'Entry') + ', ' + (r.net > 0 ? 'you owe us ' + money(r.net) : r.net < 0 ? 'we owe you ' + money(-r.net) : 'even');
    });
    var foot = a.net > 0 ? 'Total you owe us: ' + money(a.net) + '\n\nKindly settle at your earliest convenience. Thank you!'
      : a.net < 0 ? 'Total we owe you: ' + money(-a.net) + '\n\nWe will settle this with you soon. Thank you for your patience!'
      : 'Your account with us is fully settled. Thank you!';
    return 'Hello ' + a.name + ', here is a summary of your agent account as of ' + readable(R.today) + '.\n\n' +
      (lines.length ? 'Recent entries:\n' + lines.join('\n') + (rows.length > 25 ? '\n(Showing the 25 most recent of ' + rows.length + ' entries.)' : '') + '\n\n' : '') + foot;
  }

  /* ----- Daily cash ----- */
  VIEWS.daily = function () {
    var has = R.daily.some(function (d) { return d.date === R.today; });
    var h = '<p class="hint">Type your opening balance, money paid out, and what you actually counted at closing. The app works out what you should have. A difference of zero means no money is missing.</p>' +
      '<button class="btn kiosk block" data-act="editDaily" data-date="' + R.today + '">' + (has && R.daily.filter(function (d) { return d.date === R.today; })[0].expected !== null ? 'Update today\'s cash' : 'Record today\'s cash') + '</button><div style="height:12px"></div>';
    var days = R.daily.slice(0, UI.limit);
    if (!days.length) return h + empty('No days yet', 'Days appear here as you add sales.');
    h += days.map(function (d) {
      var v = d.variance;
      return '<button class="row" data-act="editDaily" data-date="' + d.date + '"><div class="top"><div class="name">' + esc(dayHead(d.date)) + ', ' + parts(d.date).y + '</div>' +
        (v === null ? '<span class="c-muted">Not checked</span>' : v === 0 ? pill('Balanced', 'p-overpaid') : pill((v > 0 ? 'Extra ' : 'Missing ') + money(Math.abs(v)), 'p-overdue')) + '</div>' +
        '<div class="bottom"><span class="c-muted">' + d.count + (d.count === 1 ? ' sale' : ' sales') + ', received ' + money(d.received) + '</span>' + (d.expected !== null ? '<span class="num">Expected ' + money(d.expected) + '</span>' : '') + '</div></button>';
    }).join('');
    if (R.daily.length > days.length) h += '<button class="more-btn" data-act="showMore">Show more</button>';
    return h;
  };

  /* ----- Reconciliation ----- */
  VIEWS.recon = function () {
    var h = '<p class="hint">For each month, type the total your bank or mobile money statements show you received. A difference of zero means your records match. If not, something is missing from your sales.</p>';
    if (!R.recon.length) return h + empty('No months yet', 'Months appear here as you add sales.');
    return h + R.recon.map(function (m) {
      var d = m.difference;
      return '<button class="card" data-act="editRecon" data-month="' + m.month + '" style="display:block;width:100%;text-align:left">' +
        '<div class="top" style="display:flex;justify-content:space-between;align-items:center"><b>' + esc(monthName(m.month)) + '</b>' +
        pill(m.status === 'Yes' ? 'Reconciled' : m.status === 'No' ? 'Not reconciled' : 'Pending', m.status === 'Yes' ? 'p-overpaid' : m.status === 'No' ? 'p-overdue' : 'p-outstanding') + '</div>' +
        kv('Sales', m.count) + kv('Billed', money(m.billed)) + kv('Received, with tips', money(m.received)) +
        kv('Statement says', m.statement === null ? 'Not entered' : money(m.statement)) +
        (d === null ? '' : kv('Difference', '<span class="' + (d === 0 ? 'c-credit' : 'c-late') + '">' + money(d) + '</span>')) + '</button>';
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
    var h = seg('commTab', UI.commTab, [['wallet', 'Mobile wallets'], ['evc', 'EVC'], ['month', 'By month']]);
    if (UI.commTab === 'wallet') {
      var rows = R.walletComm.slice().sort(function (a, b) { return (b.month || '').localeCompare(a.month || '') || (b.seq || 0) - (a.seq || 0); });
      h += '<p class="hint">One entry per wallet per month. Net is what you received, minus anything you shared with an agent.</p>';
      h += rows.length ? rows.map(function (r) {
        return '<button class="row" data-act="editWallet" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.wallet || 'No wallet') + '</div><div class="detail">' + esc(monthName(r.month)) + '</div></div><span class="amount c-credit">' + money(r.net) + '</span></div>' +
          '<div class="bottom"><span class="c-muted num">Statement ' + money(num(r.earned)) + ', received ' + money(num(r.received)) + (num(r.shared) ? ', shared ' + money(r.shared) + (r.agentName ? ' with ' + esc(r.agentName) : '') : '') + '</span></div></button>';
      }).join('') : empty('No wallet commissions yet', 'Tap the yellow button to add one.');
    } else if (UI.commTab === 'evc') {
      var ev = R.evc.slice().sort(function (a, b) { return (b.month || '').localeCompare(a.month || '') || (b.seq || 0) - (a.seq || 0); });
      h += '<p class="hint">One row per purchase. Commission is purchase times return rate. On the part sold wholesale, everything above its royalty goes to the wholesaler, so you only earn on the retail part.</p>';
      h += ev.length ? ev.map(function (r) {
        return '<button class="row" data-act="editEvc" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.provider || 'EVC') + '</div><div class="detail">' + esc(monthName(r.month)) + (r.wholesaler ? ', wholesale to ' + esc(r.wholesaler) : '') + '</div></div><span class="amount c-credit">' + money(r.net) + '</span></div>' +
          '<div class="bottom"><span class="c-muted num">Bought ' + money(num(r.purchase)) + ' (retail ' + money(r.retail) + ', wholesale ' + money(num(r.wholesale)) + '), royalty ' + money(r.royalty) + '</span></div></button>';
      }).join('') : empty('No EVC entries yet', 'Tap the yellow button to add one.');
    } else {
      h += R.commMonths.length ? R.commMonths.map(function (m) {
        return '<div class="card"><b>' + esc(monthName(m.month)) + '</b>' + kv('Mobile wallets, net', money(m.wallet)) + kv('EVC, net', money(m.evc)) + kv('Total you earned', '<span class="c-credit">' + money(m.total) + '</span>') + '</div>';
      }).join('') : empty('Nothing yet', 'Monthly totals appear here once you add wallet or EVC commissions.');
    }
    return h;
  };

  /* ----- Referral agents ----- */
  VIEWS.ref = function () {
    var h = seg('refTab', UI.refTab, [['sales', 'Sales'], ['payouts', 'What to pay'], ['rates', 'Deposit rates']]);
    var RF = R.referrals;
    if (UI.refTab === 'sales') {
      h += '<p class="hint">For Data Sending and EVC, log one row per agent per day with that day\'s total. Log each Deposit on its own, because its commission depends on the amount.</p>';
      var rows = RF.rows.slice().sort(byNewest);
      h += rows.length ? rows.map(function (r) {
        return '<button class="row" data-act="editRef" data-id="' + esc(r.id) + '"><div class="top"><div><div class="name">' + esc(r.agent || 'No agent') + '</div><div class="detail">' + esc(shortDate(r.date)) + ', ' + esc(r.service || '') + (r.client ? ', ' + esc(r.client) : '') + ', ' + esc(r.refId) + '</div></div><span class="amount">' + money(num(r.amount)) + '</span></div>' +
          '<div class="bottom"><span class="c-muted num">Commission ' + money(r.commission) + ', their cut ' + money(r.agentCut) + '</span><span class="amount c-credit">' + money(r.net) + '</span></div></button>';
      }).join('') : empty('No referral sales yet', 'Tap the yellow button to add one.');
    } else if (UI.refTab === 'payouts') {
      h += '<p class="hint">Worked out automatically from the sales, per agent per month.</p>';
      h += RF.payouts.length ? RF.payouts.map(function (p) {
        return '<div class="card"><b>' + esc(p.agent || 'No agent') + '</b><div class="hint" style="margin:0">' + esc(monthName(p.month)) + '</div>' +
          kv('Total commission', money(p.commission)) + kv('Pay the agent', '<span class="c-owed">' + money(p.agentCut) + '</span>') + kv('You keep', '<span class="c-credit">' + money(p.net) + '</span>') + '</div>';
      }).join('') : empty('Nothing to pay yet', 'Payouts appear once you add referral sales.');
    } else {
      h += '<p class="hint">Flat deposit commission by amount. A deposit gets the commission of the highest "From" amount it reaches.</p><div class="card" id="brackets">' +
        '<div class="bracket-row" style="font-size:0.8rem;font-weight:700;color:var(--ink-soft)"><span>From (D)</span><span>To (D)</span><span>Commission (D)</span><span></span></div>' +
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
    var h = '<p class="hint">Record your balances whenever you like. Receivables and payables always use today\'s live totals.</p>';
    h += '<div class="figures">' +
      '<div class="figure wide"><div class="label">Working capital' + (latest ? ', from your ' + esc(shortDate(latest.date)) + ' snapshot' : '') + '</div><div class="big ' + (latest && latest.working < 0 ? 'c-late' : 'c-credit') + '">' + (latest ? money(latest.working) : 'Not recorded') + '</div>' +
      '<div class="sub">Available capital plus what you are owed, minus what you owe</div></div>' +
      '<div class="figure"><div class="label">Available capital</div><div class="big">' + (latest ? money(latest.available) : '—') + '</div></div>' +
      '<div class="figure"><div class="label">You are owed</div><div class="big c-owed">' + money(cap.receivables) + '</div><div class="sub">Customers and agents</div></div>' +
      '<div class="figure wide"><div class="label">You owe</div><div class="big">' + money(cap.payables) + '</div><div class="sub">Agents, plus customer credit you hold</div></div></div>';
    h += '<div class="section-title">Snapshots</div>';
    h += cap.rows.length ? cap.rows.map(function (s) {
      return '<button class="row" data-act="editCapital" data-id="' + esc(s.id) + '"><div class="top"><div class="name">' + esc(readable(s.date)) + '</div><span class="amount">' + money(s.available) + '</span></div>' +
        '<div class="bottom"><span class="c-muted">Available capital</span>' + (s.notes ? '<span class="c-muted">' + esc(s.notes) + '</span>' : '') + '</div></button>';
    }).join('') : empty('No snapshots yet', 'Tap the yellow button to record your balances.');
    return h;
  };

  /* ----- Backup ----- */
  VIEWS.backup = function () {
    var lb = S.meta.lastBackup;
    if (window.Sync && Sync.status().signedIn) return '<div class="card"><b>Online sync is on.</b><p class="hint" style="margin:6px 0 0">Your records are saved to your online account automatically. Backups here are optional extra copies.</p></div>' + backupBody(lb);
    return '<div class="card"><b>Your records live only on this phone.</b><p class="hint" style="margin:6px 0 0">If the phone is lost, or the app\'s data is cleared, they are gone unless you have a backup. Save one at least once a week and keep a copy off the phone, for example on Google Drive or sent to yourself on WhatsApp. Or switch on Online sync under More.</p></div>' + backupBody(lb);
  };
  function backupBody(lb) {
    return '<div class="card">' + kv('Last backup', lb ? esc(readable(lb)) : 'Never') + kv('Sales', S.sales.length) + kv('Agent entries', S.agents.length) +
      kv('Referral sales', S.referrals.length) + kv('Commission entries', S.walletComm.length + S.evc.length) + '</div>' +
      '<div class="actions"><button class="btn kiosk" data-act="backupShare">Send backup to Drive or WhatsApp</button><button class="btn primary" data-act="backupDownload">Save backup to phone</button></div>' +
      '<div class="section-title">Restore</div><p class="hint">Use this to bring in your existing records (the file named my-records-PRIVATE.json), or to move to a new phone. It replaces everything currently in the app.</p>' +
      '<button class="btn block" data-act="importBackup">Restore from a backup file</button><input type="file" id="importFile" accept=".json,application/json" hidden>' +
      '<div class="section-title">Spreadsheet</div><p class="hint">Download all sales as a spreadsheet file that opens in Excel.</p>' +
      '<button class="btn block" data-act="exportCsv">Download sales for Excel</button>';
  };

  /* ----- Settings ----- */
  var SETTING_LISTS = [['channels', 'Payment channels'], ['exTypes', 'Wallet exchange types'], ['agentTxTypes', 'Agent transaction types'],
    ['wallets', 'Commission wallets'], ['evcProviders', 'EVC providers'], ['capitalAccounts', 'Capital accounts'],
    ['woReasons', 'Write-off reasons'], ['errorTypes', 'Error types'], ['causedBy', 'Who caused an error']];
  VIEWS.settings = function () {
    var s = S.settings;
    return '<div class="field"><label for="set-cc">Country code for WhatsApp</label><input id="set-cc" inputmode="numeric" value="' + esc(s.countryCode) + '"><div class="note">Added to 7-digit numbers when sending on WhatsApp. The Gambia is 220.</div></div>' +
      '<p class="hint">Edit the choices in each list below. Put one item on each line.</p>' +
      SETTING_LISTS.map(function (l) { return '<div class="field"><label for="set-' + l[0] + '">' + l[1] + '</label><textarea id="set-' + l[0] + '" rows="5">' + esc((s[l[0]] || []).join('\n')) + '</textarea></div>'; }).join('') +
      '<button class="btn primary block" data-act="saveSettings">Save settings</button>';
  };

  /* ----- Help ----- */
  VIEWS.help = function () {
    return '<div class="card help">' +
      '<h3>Balance on a sale</h3><p>Each sale shows the customer\'s whole account up to that day, across data, deposits and wallet exchanges. "Owes" means they still owe you. "Credit" means they paid you in advance or overpaid.</p>' +
      '<h3>Paying in advance</h3><p>Nothing extra to do. If a customer overpaid before, their next sale is covered automatically, even if they pay nothing that day. If the credit only covers part of it, the account shows just what is left.</p>' +
      '<h3>Paying an old debt late</h3><p>Open the old sale and tap "Record a payment", or put the full amount on the new sale. Either way the account comes out right. Recording it on the old sale also saves how many days late it was paid.</p>' +
      '<h3>Statuses</h3><p>Paid: settled. Overpaid: in credit. Outstanding: unpaid for up to 3 days. Overdue: unpaid for more than 3 days. Bad debt: written off.</p>' +
      '<h3>Customer types</h3><p>Regular: 3 or more sales and at least one a month. Irregular: fewer. Inactive: no sale for 90 days. Bad (high risk): oldest unpaid sale is over 60 days old. Do not give credit: something was written off.</p>' +
      '<h3>Agents</h3><p>"Sent" is money or float you paid or sent to the agent. "Received" is what you got back. If you sent more than you received, the agent owes you.</p>' +
      '<h3>EVC</h3><p>Commission = purchase x return rate. Royalty = retail part x retail royalty rate, plus wholesale part x wholesale royalty rate. On the wholesale part, the rest goes to the wholesaler.</p>' +
      '<h3>Your data</h3><p>Everything stays on this phone and works without internet. Back it up every week from More, then Backup and restore.</p></div>';
  };

  /* ================= Online sync ================= */
  var RULES = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId}/{document=**} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}";
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
    var when = s.lastSynced ? new Date(s.lastSynced).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    var cls = s.tone === 'credit' ? 'p-overpaid' : s.tone === 'late' ? 'p-overdue' : s.tone === 'owed' ? 'p-outstanding' : 'p-paid';
    return '<div class="card">' + kv('Status', '<span class="pill ' + cls + '">' + esc(s.label || 'Not set up') + '</span>') +
      (s.email ? kv('Signed in as', esc(s.email)) : '') + kv('Changes waiting to go online', s.pending) +
      (when ? kv('Last synced', esc(when)) : '') +
      (s.error ? '<div class="form-error" style="margin-top:8px">' + esc(s.error) + '</div>' : '') + '</div>';
  }
  VIEWS.sync = function () {
    var s = Sync.status(), h = '';
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
        '<div class="field"><label for="sync-pass">Password, at least 6 characters</label><input id="sync-pass" type="password" autocomplete="current-password"></div>' +
        '<div id="sync-msg"></div><div class="actions"><button class="btn kiosk" data-act="syncSignUp">Create account</button><button class="btn primary" data-act="syncSignIn">Sign in</button></div>' +
        '<button class="btn block" data-act="syncReset" style="border:0;background:none;color:var(--ink-soft)">Forgot password?</button></div>';
      h += '<button class="btn danger block" data-act="syncRemove">Remove online setup</button>';
      return h;
    }
    h += '<div id="sync-live">' + syncLive(s) + '</div>';
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
      toast(kind === 'signUp' ? 'Account created. Uploading your records.' : 'Signed in. Bringing in your records.');
      render();
    }, function (e) { syncMsg(e && e.message ? e.message : 'Something went wrong.'); });
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { toast('Press and hold the text to copy it.'); });
    else toast('Press and hold the text to copy it.');
  }

  /* ================= Forms ================= */
  function opts(src) { return typeof src === 'string' ? (S.settings[src] || []) : src; }
  var SCHEMAS = {
    sale: { title: ['New sale', 'Edit sale'], coll: 'sales', fields: [
      { k: 'kind', t: 'seg', opts: [['DS', 'Data / deposit'], ['WE', 'Wallet exchange']] },
      { k: 'date', t: 'date', label: 'Date', req: 1 },
      { k: 'phone', t: 'tel', label: 'Customer WhatsApp / phone', list: 'custPhones' },
      { k: 'name', t: 'text', label: 'Customer name', req: 1, list: 'custNames' },
      { k: 'beneficiary', t: 'tel', label: 'Number that received it, if different' },
      { k: 'exType', t: 'select', label: 'Exchange type', opts: 'exTypes', show: function (v) { return v.kind === 'WE'; } },
      { k: 'details', t: 'text', label: 'Bundle, deposit or details' },
      { k: 'billed', t: 'num', label: 'Amount billed', req: 1, half: 1 },
      { k: 'received', t: 'num', label: 'Amount received', half: 1 },
      { k: 'tip', t: 'num', label: 'Tip received', half: 1 },
      { k: 'channel', t: 'select', label: 'Paid through', opts: 'channels', half: 1 },
      { k: 'bank', t: 'text', label: 'Bank name', show: function (v) { return v.channel === 'Bank Transfer'; } },
      { k: 'ref', t: 'text', label: 'Reference or transaction ID (optional)' },
      { k: 'datePaid', t: 'date', label: 'Date paid, only if paid later', note: 'Saves how many days late they paid.' },
      { k: 'writtenOff', t: 'num', label: 'Write off as bad debt (D)', note: 'Only if you will never collect it.' },
      { k: 'woReason', t: 'select', label: 'Reason for write-off', opts: 'woReasons', show: function (v) { return num(v.writtenOff) > 0; } },
      { k: 'notes', t: 'area', label: 'Notes' }],
      defaults: function () { return { kind: 'DS', date: R.today, channel: S.settings.channels[0] || '' }; },
      info: saleInfo },
    agent: { title: ['New agent entry', 'Edit agent entry'], coll: 'agents', fields: [
      { k: 'date', t: 'date', label: 'Date', req: 1 },
      { k: 'name', t: 'text', label: 'Agent name', req: 1, list: 'agentNames', note: 'Use the same name every time, even if they use another number.' },
      { k: 'phone', t: 'tel', label: 'Agent WhatsApp / phone', half: 1 },
      { k: 'type', t: 'select', label: 'Agent type', opts: ['Regular Agent', 'Master Agent'], half: 1 },
      { k: 'txType', t: 'select', label: 'Transaction type', opts: 'agentTxTypes' },
      { k: 'txNumber', t: 'tel', label: 'Number used for this entry' },
      { k: 'desc', t: 'text', label: 'Description', note: 'For example: ComCash float, Xpress deposit, GT Bank to Wave.' },
      { k: 'toAgent', t: 'num', label: 'Sent / paid to agent', half: 1 },
      { k: 'fromAgent', t: 'num', label: 'Received from agent', half: 1 },
      { k: 'writtenOff', t: 'num', label: 'Write off as bad debt (D)' },
      { k: 'woReason', t: 'select', label: 'Reason for write-off', opts: 'woReasons', show: function (v) { return num(v.writtenOff) > 0; } },
      { k: 'notes', t: 'area', label: 'Notes' }],
      defaults: function () { return { date: R.today, type: 'Regular Agent' }; },
      info: agentInfo },
    referral: { title: ['New referral sale', 'Edit referral sale'], coll: 'referrals', fields: [
      { k: 'date', t: 'date', label: 'Date', req: 1 },
      { k: 'agent', t: 'text', label: 'Referring agent', req: 1, list: 'refAgents' },
      { k: 'agentPhone', t: 'tel', label: 'Agent WhatsApp / phone' },
      { k: 'service', t: 'select', label: 'Service', opts: ['Data Sending', 'Deposit', 'EVC'], req: 1 },
      { k: 'amount', t: 'num', label: 'Amount (or the day\'s total)', req: 1 },
      { k: 'rate', t: 'num', label: 'Commission rate (%)', show: function (v) { return v.service !== 'Deposit'; }, half: 1 },
      { k: 'share', t: 'num', label: 'Agent\'s share (%)', half: 1 },
      { k: 'client', t: 'text', label: 'Client name (optional)', half: 1 },
      { k: 'clientPhone', t: 'tel', label: 'Client phone (optional)', half: 1 },
      { k: 'notes', t: 'area', label: 'Notes' }],
      defaults: function () { return { date: R.today, service: 'Data Sending', share: 50 }; },
      info: refInfo },
    wallet: { title: ['New wallet commission', 'Edit wallet commission'], coll: 'walletComm', fields: [
      { k: 'month', t: 'month', label: 'Month', req: 1, half: 1 },
      { k: 'wallet', t: 'select', label: 'Wallet', opts: 'wallets', req: 1, half: 1 },
      { k: 'earned', t: 'num', label: 'Commission on statement', half: 1 },
      { k: 'received', t: 'num', label: 'Commission paid to you', half: 1 },
      { k: 'shared', t: 'num', label: 'Shared with an agent', half: 1 },
      { k: 'agentName', t: 'text', label: 'Which agent', list: 'agentNames', half: 1 },
      { k: 'notes', t: 'area', label: 'Notes' }],
      defaults: function () { return { month: R.today.slice(0, 7) }; },
      info: function (v) { return calcBox([['Net commission', money(num(v.received) - num(v.shared))]]); } },
    evc: { title: ['New EVC entry', 'Edit EVC entry'], coll: 'evc', fields: [
      { k: 'month', t: 'month', label: 'Month', req: 1, half: 1 },
      { k: 'provider', t: 'select', label: 'Provider', opts: 'evcProviders', req: 1, half: 1 },
      { k: 'purchase', t: 'num', label: 'Purchase amount', req: 1, half: 1 },
      { k: 'wholesale', t: 'num', label: 'Part sold wholesale', half: 1, note: 'To fellow EVC dealers.' },
      { k: 'rate', t: 'num', label: 'Return rate (%)', half: 1 },
      { k: 'retailRoy', t: 'num', label: 'Retail royalty (%)', half: 1 },
      { k: 'wholesaleRoy', t: 'num', label: 'Wholesale royalty (%)', half: 1 },
      { k: 'wholesaler', t: 'text', label: 'Wholesaler name', half: 1 },
      { k: 'notes', t: 'area', label: 'Notes' }],
      defaults: function () { return { month: R.today.slice(0, 7), rate: 7, retailRoy: 2, wholesaleRoy: 1, provider: S.settings.evcProviders[0] || '' }; },
      info: function (v) {
        var x = C.computeEvc([v])[0];
        return calcBox([['Retail part', money(x.retail)], ['Total commission', money(x.total)], ['Royalty', money(x.royalty)], ['To wholesaler', money(x.toWholesaler)], ['You earn', money(x.net)]]);
      } },
    error: { title: ['Log an error', 'Edit error'], coll: 'errors', fields: [
      { k: 'date', t: 'date', label: 'Date found', req: 1, half: 1 },
      { k: 'status', t: 'select', label: 'Status', opts: ['Open', 'In Progress', 'Fixed'], half: 1 },
      { k: 'type', t: 'select', label: 'Type of error', opts: 'errorTypes' },
      { k: 'ref', t: 'text', label: 'Customer, agent or ref ID' },
      { k: 'desc', t: 'area', label: 'What happened' },
      { k: 'causedBy', t: 'select', label: 'Caused by', opts: 'causedBy', half: 1 },
      { k: 'foundBy', t: 'text', label: 'Found by', half: 1 },
      { k: 'ledToLoss', t: 'select', label: 'Did it cost money?', opts: ['No', 'Yes'], half: 1 },
      { k: 'amountLost', t: 'num', label: 'Amount lost', half: 1, show: function (v) { return v.ledToLoss === 'Yes'; } },
      { k: 'correction', t: 'area', label: 'How it was fixed' },
      { k: 'dateFixed', t: 'date', label: 'Date fixed' }],
      defaults: function () { return { date: R.today, status: 'Open', ledToLoss: 'No' }; } },
    daily: { title: ['Cash check', 'Cash check'], fields: [
      { k: 'openCash', t: 'num', label: 'Opening cash', half: 1 },
      { k: 'openFloat', t: 'num', label: 'Opening wallet float', half: 1 },
      { k: 'paidOut', t: 'num', label: 'Cash or expenses paid out' },
      { k: 'counted', t: 'num', label: 'What you counted at closing' },
      { k: 'notes', t: 'area', label: 'Notes' }],
      info: function (v) {
        var d = R.daily.filter(function (x) { return x.date === FORM.date; })[0] || { received: 0, count: 0 };
        var expected = r2(num(v.openCash) + num(v.openFloat) + d.received - num(v.paidOut));
        var rows = [['Sales that day', d.count], ['Received, with tips', money(d.received)], ['You should have', money(expected)]];
        if (C.has(v.counted)) { var diff = r2(num(v.counted) - expected); rows.push(['Difference', diff === 0 ? 'Balanced' : (diff > 0 ? 'Extra ' : 'Missing ') + money(Math.abs(diff))]); }
        return calcBox(rows);
      } },
    recon: { title: ['Reconcile month', 'Reconcile month'], fields: [
      { k: 'statement', t: 'num', label: 'Total received on your statements' },
      { k: 'status', t: 'select', label: 'Reconciled?', opts: ['Pending', 'Yes', 'No'] },
      { k: 'notes', t: 'area', label: 'Notes' }],
      info: function (v) {
        var m = R.recon.filter(function (x) { return x.month === FORM.month; })[0] || { received: 0 };
        var rows = [['Your records say received', money(m.received)]];
        if (C.has(v.statement)) { var d = r2(m.received - num(v.statement)); rows.push(['Difference', d === 0 ? 'None, it matches' : money(d)]); }
        return calcBox(rows);
      } }
  };
  function calcBox(rows) { return '<div class="calc-box">' + rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span><b>' + r[1] + '</b></div>'; }).join('') + '</div>'; }
  function saleInfo(v) {
    var h = '';
    if (C.has(v.billed)) {
      var sf = r2(num(v.billed) - num(v.received) - num(v.writtenOff));
      h += calcBox([['This sale', sf > 0 ? money(sf) + ' unpaid' : sf < 0 ? 'Overpaid by ' + money(-sf) : 'Fully paid']]);
    }
    if (v.phone || v.name) {
      var c = findCustomer(C.custKey(v));
      if (c && FORM && FORM.isNew) {
        h += '<div class="form-info">' + esc(c.name || 'Known customer') + ' ' + (c.balance > 0 ? 'already owes you ' + money(c.balance) + '.' : c.credit > 0 ? 'has ' + money(c.credit) + ' credit with you. It is used on this sale automatically.' : 'is fully settled.') +
          ' ' + esc(c.type) + ' customer.</div>';
      }
    }
    return h;
  }
  function agentInfo(v) {
    var n = r2(num(v.toAgent) - num(v.fromAgent) - num(v.writtenOff)), h = '';
    if (C.has(v.toAgent) || C.has(v.fromAgent)) h += calcBox([['This entry', n > 0 ? 'Agent owes you ' + money(n) : n < 0 ? 'You owe agent ' + money(-n) : 'Even']]);
    var a = v.name ? findAgent(C.agentKey(v.name)) : null;
    if (a && FORM && FORM.isNew) h += '<div class="form-info">Before this entry: ' + (a.net > 0 ? a.name + ' owes you ' + money(a.net) : a.net < 0 ? 'you owe ' + a.name + ' ' + money(-a.net) : a.name + ' is settled') + '.</div>';
    return h;
  }
  function refInfo(v) {
    var x = C.has(v.amount) ? (v.service === 'Deposit' ? C.bracketCommission(v.amount, S.brackets) : r2(num(v.amount) * num(v.rate) / 100)) : 0;
    var cut = r2(x * num(v.share) / 100);
    return calcBox([['Commission', money(x)], ['Agent\'s cut', money(cut)], ['You keep', money(x - cut)]]);
  }

  var FORM = null;
  function datalists() {
    var names = {}, phones = {}, agents = {}, refAgents = {};
    R.customers.forEach(function (c) { if (c.name) names[c.name] = 1; if (c.phone) phones[c.phone] = c.name; });
    R.agents.balances.forEach(function (a) { agents[a.name] = 1; refAgents[a.name] = 1; });
    R.referrals.rows.forEach(function (r) { if (r.agent) refAgents[String(r.agent).trim()] = 1; });
    function dl(id, obj, labels) { return '<datalist id="' + id + '">' + Object.keys(obj).map(function (k) { return '<option value="' + esc(k) + '"' + (labels && obj[k] ? ' label="' + esc(obj[k]) + '"' : '') + '></option>'; }).join('') + '</datalist>'; }
    return dl('custNames', names) + dl('custPhones', phones, true) + dl('agentNames', agents) + dl('refAgents', refAgents);
  }
  function fieldHTML(f, vals) {
    var v = vals[f.k]; if (v == null) v = '';
    var id = 'f_' + f.k, hide = f.show && !f.show(vals) ? ' hide' : '';
    var lab = f.label ? '<label for="' + id + '">' + esc(f.label) + (f.req ? ' *' : '') + '</label>' : '';
    var inp, list = f.list ? ' list="' + f.list + '"' : '';
    if (f.t === 'seg') {
      return '<div class="field" data-field="' + f.k + '"><div class="seg">' + f.opts.map(function (o) {
        return '<button type="button" data-act="formSeg" data-k="' + f.k + '" data-v="' + esc(o[0]) + '" class="' + (v === o[0] ? 'on' : '') + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div><input type="hidden" name="' + f.k + '" value="' + esc(v) + '"></div>';
    }
    if (f.t === 'select') {
      var o = opts(f.opts).slice(); if (v && o.indexOf(v) < 0) o.unshift(v);
      inp = '<select id="' + id + '" name="' + f.k + '"><option value="">Choose</option>' + o.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
    } else if (f.t === 'area') {
      inp = '<textarea id="' + id + '" name="' + f.k + '">' + esc(v) + '</textarea>';
    } else if (f.t === 'num') {
      inp = '<input id="' + id + '" name="' + f.k + '" type="number" step="any" inputmode="decimal" value="' + esc(v) + '">';
    } else {
      var type = f.t === 'tel' ? 'tel' : f.t === 'date' ? 'date' : f.t === 'month' ? 'month' : 'text';
      inp = '<input id="' + id + '" name="' + f.k + '" type="' + type + '"' + list + ' value="' + esc(v) + '" autocomplete="off">';
    }
    return '<div class="field' + hide + '" data-field="' + f.k + '">' + lab + inp + (f.note ? '<div class="note">' + esc(f.note) + '</div>' : '') + '</div>';
  }
  function formBody(fields, vals) {
    var h = '', i = 0;
    while (i < fields.length) {
      var f = fields[i];
      if (f.half && fields[i + 1] && fields[i + 1].half) { h += '<div class="two">' + fieldHTML(f, vals) + fieldHTML(fields[i + 1], vals) + '</div>'; i += 2; }
      else { h += fieldHTML(f, vals); i++; }
    }
    return h;
  }
  function openForm(type, rec, extra) {
    var sc = SCHEMAS[type], isNew = !rec;
    var vals = Object.assign({}, isNew && sc.defaults ? sc.defaults() : {}, rec || {}, (extra && extra.prefill) || {});
    var title = (extra && extra.title) || sc.title[isNew ? 0 : 1];
    var body = '<div id="form-error"></div>' + formBody(sc.fields, vals) + '<div id="form-info"></div>' + datalists();
    if (type === 'sale' && !isNew) {
      var cs = R.sales.filter(function (x) { return x.id === rec.id; })[0];
      if (cs && cs.shortfall > 0) body += '<button class="btn kiosk block" data-act="recordPayment" style="margin-bottom:10px">Record a payment on this sale</button>';
      if (cs) body += '<p class="hint">Ref ID ' + esc(cs.refId) + '. Account after this sale: ' + (cs.balance > 0 ? 'owes ' + money(cs.balance) : cs.balance < 0 ? 'credit ' + money(-cs.balance) : 'settled') + '.</p>';
    }
    var foot = (!isNew && sc.coll ? '<button class="btn danger" data-act="deleteRec">Delete</button>' : '') + '<button class="btn primary" data-act="saveForm">Save</button>';
    openSheet(title, body, foot);
    FORM = Object.assign({ type: type, schema: sc, rec: rec, isNew: isNew }, extra || {});
    refreshForm();
  }
  function collect() {
    var vals = {}, el = document.getElementById('sheetwrap');
    FORM.schema.fields.forEach(function (f) {
      var inp = el.querySelector('[name="' + f.k + '"]'); if (!inp) return;
      var x = inp.value;
      vals[f.k] = f.t === 'num' ? (String(x).trim() === '' ? '' : Number(x)) : String(x).trim();
    });
    return vals;
  }
  function refreshForm() {
    if (!FORM) return;
    var vals = collect(), el = document.getElementById('sheetwrap');
    FORM.schema.fields.forEach(function (f) {
      if (!f.show) return;
      var box = el.querySelector('[data-field="' + f.k + '"]'); if (box) box.classList.toggle('hide', !f.show(vals));
    });
    var info = el.querySelector('#form-info');
    if (info && FORM.schema.info) info.innerHTML = FORM.schema.info(vals);
  }
  function openSheet(title, body, foot) {
    removeSheet();
    var el = document.createElement('div'); el.id = 'sheetwrap';
    el.innerHTML = '<div class="sheet-back" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<header><h2>' + esc(title) + '</h2><button data-act="closeSheet">Close</button></header><div class="body">' + body + '</div><footer>' + foot + '</footer></div>';
    document.body.appendChild(el);
    UI.sheetOpen = true; document.body.style.overflow = 'hidden';
    history.pushState({ sheet: 1 }, '');
  }
  function removeSheet() {
    var el = document.getElementById('sheetwrap'); if (el) el.remove();
    UI.sheetOpen = false; FORM = null; document.body.style.overflow = '';
    if (UI.pendingRender) { UI.pendingRender = false; render(); }
  }
  function closeSheet() { if (UI.sheetOpen) history.back(); }
  function findRec(coll, id) { var a = S[coll]; for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }

  function saveForm() {
    var F = FORM, vals = collect(), missing = [];
    F.schema.fields.forEach(function (f) {
      if (f.req && (vals[f.k] === '' || vals[f.k] == null) && !(f.show && !f.show(vals))) missing.push(f.label);
    });
    if (missing.length) { document.getElementById('form-error').innerHTML = '<div class="form-error">Fill in: ' + esc(missing.join(', ')) + '.</div>'; document.querySelector('.sheet .body').scrollTop = 0; return; }
    F.schema.fields.forEach(function (f) { if (f.show && !f.show(vals)) vals[f.k] = ''; });
    if (F.type === 'daily') { S.daily[F.date] = vals; }
    else if (F.type === 'recon') { S.recon[F.month] = vals; }
    else if (F.type === 'capital') { saveCapital(vals); }
    else if (F.isNew) { vals.id = uid(); vals.seq = S.nextSeq++; S[F.schema.coll].push(vals); }
    else { Object.assign(F.rec, vals); }
    persist().then(function () { toast('Saved'); });
    closeSheet(); render();
  }

  /* Capital form is built from the account list in Settings */
  function openCapital(rec) {
    var accounts = S.settings.capitalAccounts.slice();
    var prev = rec || (S.capital.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0]);
    if (rec) Object.keys(rec.balances || {}).forEach(function (k) { if (accounts.indexOf(k) < 0) accounts.push(k); });
    var fields = [{ k: 'date', t: 'date', label: 'Date', req: 1 }].concat(accounts.map(function (a, i) { return { k: 'b' + i, t: 'num', label: a, half: 1, acct: a }; }))
      .concat([{ k: 'notes', t: 'area', label: 'Notes' }]);
    var vals = { date: rec ? rec.date : R.today, notes: rec ? rec.notes : '' };
    fields.forEach(function (f) { if (f.acct && prev && prev.balances) vals[f.k] = prev.balances[f.acct]; });
    SCHEMAS.capital = { title: ['New snapshot', 'Edit snapshot'], coll: 'capital', fields: fields,
      info: function (v) { var t = 0; fields.forEach(function (f) { if (f.acct) t += num(v[f.k]); }); return calcBox([['Available capital', money(t)]]); } };
    FORM = null;
    openForm('capital', rec || null, { prefill: vals, title: rec ? 'Edit snapshot' : 'New snapshot' });
    if (!rec && prev) document.querySelector('#form-error').innerHTML = '<div class="form-info">Filled in from your last snapshot. Change what has moved.</div>';
  }
  function saveCapital(vals) {
    var bal = {};
    FORM.schema.fields.forEach(function (f) { if (f.acct) bal[f.acct] = vals[f.k]; });
    if (FORM.isNew) S.capital.push({ id: uid(), seq: S.nextSeq++, date: vals.date, balances: bal, notes: vals.notes });
    else { FORM.rec.date = vals.date; FORM.rec.balances = bal; FORM.rec.notes = vals.notes; }
  }

  /* ================= Actions ================= */
  var deferredInstall = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; if (cur().v === 'more') render(); });

  var ACT = {
    tab: function (d) { setTab(d.v); },
    back: function () { history.back(); },
    go: function (d) { go({ v: d.v }); },
    showMore: function () { UI.limit += 150; if (LISTS[cur().v]) renderList(); else render(); },
    salesFilter: function (d) { UI.salesFilter = d.v; UI.limit = 120; render(); },
    salesFilterGo: function (d) { UI.salesFilter = d.v; setTab('sales'); },
    custFilter: function (d) { UI.custFilter = d.v; render(); },
    custFilterGo: function (d) { UI.custFilter = d.v; setTab('customers'); },
    openCustomer: function (d) { go({ v: 'customer', key: d.key }); },
    openAgent: function (d) { go({ v: 'agent', key: d.key }); },
    newSale: function () { openForm('sale', null); },
    newSaleFor: function (d) { var c = findCustomer(d.key); openForm('sale', null, { prefill: c ? { name: c.name, phone: c.phone } : {} }); },
    editSale: function (d) { var r = findRec('sales', d.id); if (r) openForm('sale', r); },
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
    newCapital: function () { openCapital(null); },
    editCapital: function (d) { var r = findRec('capital', d.id); if (r) openCapital(r); },
    editDaily: function (d) { openForm('daily', S.daily[d.date] || null, { date: d.date, title: 'Cash check, ' + shortDate(d.date), prefill: S.daily[d.date] || {} }); },
    editRecon: function (d) { openForm('recon', S.recon[d.month] || null, { month: d.month, title: 'Reconcile ' + monthName(d.month), prefill: S.recon[d.month] || { status: 'Pending' } }); },
    closeSheet: function () { closeSheet(); },
    saveForm: function () { saveForm(); },
    deleteRec: function () {
      if (!FORM || !FORM.rec || !FORM.schema.coll) return;
      if (!confirm('Delete this entry? This cannot be undone.')) return;
      var arr = S[FORM.schema.coll], i = arr.indexOf(FORM.rec); if (i >= 0) arr.splice(i, 1);
      persist().then(function () { toast('Deleted'); }); closeSheet(); render();
    },
    recordPayment: function () {
      var rec = FORM && FORM.rec; if (!rec) return;
      var cs = R.sales.filter(function (x) { return x.id === rec.id; })[0];
      var ans = prompt('How much did they pay now? (D)', cs ? String(cs.shortfall) : '');
      if (ans === null) return;
      var amt = parseFloat(String(ans).replace(/,/g, ''));
      if (!isFinite(amt) || amt <= 0) { toast('Type an amount greater than 0.'); return; }
      rec.received = r2(num(rec.received) + amt);
      if (num(rec.billed) - num(rec.received) - num(rec.writtenOff) <= 0 && rec.date < R.today && !rec.datePaid) rec.datePaid = R.today;
      persist().then(function () { toast('Payment recorded'); }); closeSheet(); render();
    },
    formSeg: function (d, el) {
      var wrap = el.parentNode; Array.prototype.forEach.call(wrap.children, function (b) { b.classList.toggle('on', b === el); });
      wrap.parentNode.querySelector('input[type=hidden]').value = d.v; refreshForm();
    },
    commTab: function (d) { UI.commTab = d.v; render(); },
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
      if (navigator.share) navigator.share({ text: t }).catch(function () {});
      else ACT.shareCopy();
    },
    shareWa: function () {
      var t = document.getElementById('msg').value, p = sharePhone();
      window.open('https://wa.me/' + p + '?text=' + encodeURIComponent(t), '_blank');
    },
    backupShare: function () {
      var f = backupFile(), file = null;
      try { file = new File([f.blob], f.name, { type: 'application/json' }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Business Tracker backup' }).then(markBackedUp).catch(function () {});
      } else { download(f.blob, f.name); markBackedUp(); }
    },
    backupDownload: function () { var f = backupFile(); download(f.blob, f.name); markBackedUp(); },
    importBackup: function () { document.getElementById('importFile').click(); },
    exportCsv: function () { exportCsv(); },
    saveSettings: function () {
      S.settings.countryCode = document.getElementById('set-cc').value.trim();
      SETTING_LISTS.forEach(function (l) {
        var v = document.getElementById('set-' + l[0]).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        if (v.length) S.settings[l[0]] = v;
      });
      persist().then(function () { toast('Settings saved'); }); render();
    },
    copyRules: function () { copyText(RULES); },
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
      if (!confirm('Sign out? Your records stay on this phone, but stop syncing until you sign in again.')) return;
      Sync.signOut().then(function () { render(); });
    },
    syncRemove: function () {
      if (!confirm('Remove the online setup from this phone? Your records stay on this phone.')) return;
      Sync.removeConfig();
    },
    syncNow: function () { Sync.syncNow(); toast('Syncing'); },
    install: function () { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; render(); } }
  };
  function fallbackCopy() {
    var ta = document.getElementById('msg'); ta.focus(); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Press and hold the message to copy it.'); }
  }
  function backupFile() {
    var name = 'business-tracker-backup-' + R.today + '.json';
    return { blob: new Blob([JSON.stringify(S)], { type: 'application/json' }), name: name };
  }
  function markBackedUp() { S.meta.lastBackup = R.today; persist(); render(); toast('Backup saved'); }
  function download(blob, name) {
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
  function renderList() { var el = document.getElementById('list'); if (el && LISTS[cur().v]) el.innerHTML = LISTS[cur().v](); }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = ACT[el.dataset.act]; if (!a) return;
    e.preventDefault(); a(el.dataset, el);
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q-sales') { UI.salesQuery = t.value; UI.limit = 120; renderList(); return; }
    if (t.id === 'q-cust') { UI.custQuery = t.value; renderList(); return; }
    if (t.id === 'q-agents') { UI.agentQuery = t.value; UI.limit = 120; renderList(); return; }
    if (t.id === 'msg') { UI.shareText = t.value; return; }
    if (FORM && t.closest('#sheetwrap')) { autofill(t); refreshForm(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'share-who') { UI.shareKey = t.value; UI.shareText = ''; render(); return; }
    if (t.id === 'importFile') { importFile(t.files && t.files[0]); t.value = ''; return; }
    if (FORM && t.closest('#sheetwrap')) { autofill(t); refreshForm(); }
  });
  function autofill(t) {
    var sheet = document.getElementById('sheetwrap');
    function set(name, val) { var el = sheet.querySelector('[name="' + name + '"]'); if (el && !el.value && val) el.value = val; }
    if (FORM.type === 'sale') {
      if (t.name === 'phone') { var c = findCustomer(C.custKey({ phone: t.value })); if (c) set('name', c.name); }
      if (t.name === 'name') {
        var nm = t.value.trim().toLowerCase(), hits = R.customers.filter(function (c) { return c.name.toLowerCase() === nm; });
        if (hits.length === 1) set('phone', hits[0].phone);
      }
    }
    if (FORM.type === 'agent' && t.name === 'name') {
      var a = findAgent(C.agentKey(t.value)); if (a) { set('phone', a.phone); var ty = sheet.querySelector('[name="type"]'); if (ty && a.type) ty.value = a.type; }
    }
    if (FORM.type === 'referral' && t.name === 'agent') {
      var prev = R.referrals.rows.filter(function (r) { return C.agentKey(r.agent) === C.agentKey(t.value); }).slice(-1)[0];
      if (prev) set('agentPhone', prev.agentPhone);
    }
  }
  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); } catch (e) { toast('That file is not a backup from this app.'); return; }
      if (!obj || !Array.isArray(obj.sales)) { toast('That file is not a backup from this app.'); return; }
      var msg = 'Restore this file?\n\nIt has ' + obj.sales.length + ' sales and ' + ((obj.agents || []).length) + ' agent entries.\n\nIt will REPLACE everything currently in the app' + (window.Sync && Sync.status().signedIn ? ', and your online records too.' : '.');
      if (!confirm(msg)) return;
      var keepBackup = S.meta.lastBackup, keepFb = S.meta.firebase, keepPend = S.meta.pending;
      S = normalize(obj); S.meta.lastBackup = S.meta.lastBackup || keepBackup;
      if (keepFb) S.meta.firebase = keepFb; else delete S.meta.firebase;
      S.meta.pending = keepPend || {};
      persist().then(function () { toast('Records restored'); });
      setTab('home');
    };
    reader.readAsText(file);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !UI.sheetOpen) { recompute(); render(); } });

  /* ================= Start ================= */
  history.replaceState({ n: 1 }, '');
  Store.get().then(function (saved) {
    S = normalize(saved); recompute(); render();
    if (window.Sync) Sync.init({
      getS: function () { return S; },
      saveLocal: function () { recompute(); return Store.set(S); },
      refresh: function () { if (UI.sheetOpen) UI.pendingRender = true; else { var typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName); if (typing && LISTS[cur().v]) renderList(); else if (!typing) render(); else UI.pendingRender = true; } },
      onStatus: updateSyncBadge
    });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  });
  if ('serviceWorker' in navigator) {
    var hadController = !!navigator.serviceWorker.controller, reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloading && !UI.sheetOpen) { reloading = true; location.reload(); }
    });
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  window.__app = { state: function () { return S; }, results: function () { return R; } };
})();
