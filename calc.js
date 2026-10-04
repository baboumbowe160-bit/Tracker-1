/* Agent & Client Tracker – calculation engine. */
(function (g) {
  'use strict';
  var DAY = 864e5;
  var CT = function () { return g.COUNTRIES; };
  var OPT = { home: 'GM', cur: 'D', tipMode: 'extra' };

  function pad(n) { return String(n).padStart(2, '0'); }
  function pad3(n) { return String(n).padStart(3, '0'); }
  function todayStr() { var t = new Date(); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
  function toDays(s) { if (!s) return null; var p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2] || 1) / DAY; }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function has(v) { return v !== '' && v !== null && v !== undefined && isFinite(parseFloat(v)); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function monthOf(s) { return (s || '').slice(0, 7); }
  function lastDay(month) { var p = month.split('-').map(Number); return month + '-' + pad(new Date(Date.UTC(p[0], p[1], 0)).getUTCDate()); }
  function byDateSeq(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    var ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.seq || 0) - (b.seq || 0);
  }
  function setOptions(settings) {
    var s = settings || {};
    OPT.home = (s.profile && s.profile.country) || 'GM';
    var c = CT() && CT().get(OPT.home);
    OPT.cur = (s.currency && s.currency.symbol) || (c ? c.cur : 'D');
    OPT.tipMode = s.tipMode || 'extra';
  }
  function fm(x) {
    var n = r2(num(x)), a = Math.abs(n);
    return (n < 0 ? '-' : '') + OPT.cur + a.toLocaleString('en-GB', { minimumFractionDigits: a % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  /* ---------- Phone numbers ----------
     Gambia moved to 9-digit numbers on 4 Sep 2026. Strict rules:
       QCell: 83 + 7 digits starting 3 or 5      Africell: 87 + 7 digits starting 2, 4 or 7
       Comium: 86 + 7 digits starting 6 or 8     Gamcel: no prefix, 7 digits starting 9
     A number saved for the home country is stored plainly; any other country is stored as +CODE... */
  var GM_RULES = [
    { name: 'QCell', prefix: '83', first: '35' },
    { name: 'Africell', prefix: '87', first: '247' },
    { name: 'Comium', prefix: '86', first: '68' }
  ];
  function gmParse(d) {
    var rule, i, f;
    if (d.length === 7) {
      f = d.charAt(0);
      if (f === '9') return { ok: true, network: 'Gamcel', prefix: '', local: d };
      for (i = 0; i < GM_RULES.length; i++) if (GM_RULES[i].first.indexOf(f) >= 0) return { ok: true, network: GM_RULES[i].name, prefix: GM_RULES[i].prefix, local: GM_RULES[i].prefix + d };
      return { ok: false, error: 'No Gambian network uses numbers starting with ' + f + '. Africell: 2, 4 or 7. QCell: 3 or 5. Comium: 6 or 8. Gamcel: 9.' };
    }
    if (d.length === 9) {
      for (i = 0; i < GM_RULES.length; i++) if (GM_RULES[i].prefix === d.slice(0, 2)) rule = GM_RULES[i];
      if (!rule) return { ok: false, error: 'A 9-digit Gambian number starts with 83 (QCell), 86 (Comium) or 87 (Africell).' };
      f = d.charAt(2);
      if (rule.first.indexOf(f) < 0) return { ok: false, error: rule.name + ' numbers start with ' + rule.prefix + ' and then ' + rule.first.split('').join(', ') + '.' };
      return { ok: true, network: rule.name, prefix: rule.prefix, local: d };
    }
    return { ok: false, error: 'Gambian numbers have 9 digits (starting 83, 86 or 87), or 7 digits for Gamcel (starting 9).' };
  }
  function parsePhone(raw, iso) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: true, empty: true, value: '', iso: iso || OPT.home };
    var intl = /^(\+|00)/.test(s), digits = s.replace(/\D/g, ''), c;
    if (intl) {
      if (s.charAt(0) !== '+') digits = digits.slice(2);
      c = CT().fromDigits(digits);
      if (!c) return { ok: false, error: 'Country code not recognised. Choose the country from the list instead.' };
      digits = digits.slice(c.dial.length);
    } else {
      c = CT().get(iso || OPT.home) || CT().get('GM');
      if (c.iso === 'GM' && digits.length > 9 && digits.indexOf('220') === 0) digits = digits.slice(3);
    }
    var isHome = c.iso === OPT.home, res = { ok: true, iso: c.iso, country: c.name, dial: c.dial };
    if (c.iso === 'GM') {
      var gm = gmParse(digits);
      if (!gm.ok) return { ok: false, iso: 'GM', error: gm.error };
      res.network = gm.network; res.prefix = gm.prefix; res.local = gm.local;
      res.value = isHome ? gm.local : '+220' + gm.local; res.display = gm.local;
    } else {
      digits = digits.replace(/^0+/, '');
      if (digits.length < 6 || digits.length > 13) return { ok: false, iso: c.iso, error: 'Check the number: it should have 6 to 13 digits without the country code.' };
      res.local = digits; res.value = isHome ? digits : '+' + c.dial + digits; res.display = digits;
    }
    return res;
  }
  // Tolerant: turns anything already saved into its standard form, never fails.
  function normStored(raw) {
    var s = String(raw == null ? '' : raw).trim(); if (!s) return '';
    if (s.charAt(0) === '+') return '+' + s.replace(/\D/g, '');
    var d = s.replace(/\D/g, '');
    if (OPT.home === 'GM') { if (d.length > 9 && d.indexOf('220') === 0) d = d.slice(3); var gm = gmParse(d); return gm.ok ? gm.local : d; }
    return d;
  }
  function phoneKey(raw) {
    var s = normStored(raw); if (!s) return '';
    if (s.charAt(0) === '+') {
      var d = s.slice(1), c = CT().fromDigits(d);
      if (c && c.iso === OPT.home) {
        var rest = d.slice(c.dial.length);
        if (c.iso === 'GM') { var gm = gmParse(rest); return gm.ok ? gm.local : rest; }
        return rest.replace(/^0+/, '');
      }
      return d;
    }
    return s;
  }
  function phoneInfo(raw) {
    var s = normStored(raw); if (!s) return { empty: true, display: '', wa: '' };
    var intl = s.charAt(0) === '+', d = s.replace(/\D/g, '');
    var c = intl ? CT().fromDigits(d) : CT().get(OPT.home);
    var local = intl && c ? d.slice(c.dial.length) : d;
    var out = { iso: c ? c.iso : '', country: c ? c.name : '', local: local, display: intl && c ? '+' + c.dial + ' ' + local : s, wa: intl ? d : (c ? c.dial : '') + d };
    if (c && c.iso === 'GM') {
      var gm = gmParse(local);
      if (gm.ok) { out.network = gm.network; out.local = gm.local; out.display = intl ? '+220 ' + gm.local : gm.local; out.wa = '220' + gm.local; }
    }
    return out;
  }
  function custKey(r) {
    var p = phoneKey(r.phone);
    return p ? 'p:' + p : 'n:' + String(r.name || '').trim().toLowerCase();
  }
  function agentKey(name) { return String(name || '').trim().toLowerCase(); }

  /* ---------- Reference IDs: made once, never change ---------- */
  function mkId(prefix, date, used) {
    var base = prefix + '-' + String(date || '').slice(2).replace(/-/g, '') + '-';
    for (var n = 1; ; n++) { var id = base + pad3(n); if (!used[id]) { used[id] = 1; return id; } }
  }
  function isPay(r) { return r.type === 'payment' || (r.details === 'Payment received' && has(r.billed) && num(r.billed) === 0); }
  function salePrefix(r) { return isPay(r) ? 'PY' : r.kind === 'WE' ? 'WE' : 'DS'; }
  var REF_SOURCES = [['sales', salePrefix], ['agents', function () { return 'AL'; }], ['referrals', function () { return 'RA'; }], ['expenses', function () { return 'EX'; }]];
  function usedIds(state) {
    var used = {};
    REF_SOURCES.forEach(function (s) { (state[s[0]] || []).forEach(function (r) { if (r && r.refId) used[r.refId] = 1; }); });
    return used;
  }
  function assignRefIds(state) {
    var used = usedIds(state), n = 0;
    REF_SOURCES.forEach(function (s) {
      (state[s[0]] || []).filter(function (r) { return r && !r.refId; }).sort(byDateSeq).forEach(function (r) { r.refId = mkId(s[1](r), r.date, used); n++; });
    });
    return n;
  }
  function newRefId(state, prefix, date) { return mkId(prefix, date, usedIds(state)); }
  function fillRefs(rows, prefixOf, used) { rows.forEach(function (r) { if (!r.refId) r.refId = mkId(prefixOf(r), r.date, used); }); }

  /* ---------- Tips ----------
     extra: tip is money on top of the bill. Counted as money in, not applied to the bill.
     included: the amount received already contains the tip, so the tip is taken off before paying the bill.
     passon: tip is money you hold for someone else. Counted as money in, but it is not your income. */
  function paidOf(r) { return Math.max(0, num(r.received) - (OPT.tipMode === 'included' ? num(r.tip) : 0)); }
  function moneyInOf(r) { return num(r.received) + (OPT.tipMode === 'included' ? 0 : num(r.tip)); }

  /* ---------- Sales (Data / Deposits, Wallet Exchange, Payments) ---------- */
  function computeSales(sales, today) {
    var T = toDays(today || todayStr());
    var rows = sales.map(function (r) { return Object.assign({}, r); }).sort(byDateSeq);
    var used = {}; rows.forEach(function (r) { if (r.refId) used[r.refId] = 1; });
    fillRefs(rows, salePrefix, used);
    var groups = {};
    rows.forEach(function (r) {
      r.key = custKey(r);
      r.billedSet = has(r.billed);
      r.isPayment = isPay(r);
      r.paid = paidOf(r); r.moneyIn = moneyInOf(r);
      r.shortfall = r.billedSet ? r2(num(r.billed) - r.paid - num(r.writtenOff)) : 0;
      if (r.billedSet) (groups[r.key] = groups[r.key] || []).push(r);
    });
    Object.keys(groups).forEach(function (k) {
      var list = groups[k], cum = 0, atDate = {};
      list.forEach(function (r) { cum += r.shortfall; atDate[r.date] = cum; });
      list.forEach(function (r) { r.balance = r2(atDate[r.date]); });
    });
    // A payment covers its own sale first, any extra pays the customer's oldest unpaid sales,
    // and what is left over becomes credit that covers their next purchases.
    Object.keys(groups).forEach(function (k) {
      var open = [], credit = 0;
      groups[k].forEach(function (r) {
        var own = r.paid + num(r.writtenOff);
        r.remaining = num(r.billed);
        var use = Math.min(own, r.remaining);
        r.remaining = r2(r.remaining - use); own = r2(own - use);
        if (r.remaining > 0 && credit > 0) { use = Math.min(credit, r.remaining); r.remaining = r2(r.remaining - use); credit = r2(credit - use); }
        if (r.remaining <= 0) r.clearedOn = r.date;
        for (var i = 0; i < open.length && own > 0; i++) {
          var o = open[i]; if (o.remaining <= 0) continue;
          use = Math.min(own, o.remaining); o.remaining = r2(o.remaining - use); own = r2(own - use);
          if (o.remaining <= 0) o.clearedOn = r.date;
        }
        if (own > 0) credit = r2(credit + own);
        if (r.remaining > 0) open.push(r);
        open = open.filter(function (o) { return o.remaining > 0; });
      });
    });
    rows.forEach(function (r) {
      var D = toDays(r.date);
      if (!r.billedSet) { r.balance = null; r.status = ''; r.daysOverdue = null; r.remaining = 0; }
      else if (r.remaining > 0) { r.status = T > D + 3 ? 'Overdue' : 'Outstanding'; r.daysOverdue = Math.max(0, T - D); }
      else { r.status = num(r.writtenOff) > 0 ? 'Bad debt' : (r.balance < 0 ? 'Overpaid' : 'Paid'); r.daysOverdue = null; }
      r.daysDelayed = r.datePaid ? Math.max(0, toDays(r.datePaid) - D)
        : (r.billedSet && r.remaining <= 0 && r.clearedOn && r.clearedOn > r.date ? toDays(r.clearedOn) - D : null);
    });
    return rows;
  }

  /* ---------- Customers ---------- */
  function computeCustomers(csales, today) {
    var T = toDays(today || todayStr()), map = {};
    csales.forEach(function (r) {
      if (!r.billedSet) return;
      var c = map[r.key];
      if (!c) c = map[r.key] = { key: r.key, name: (r.name || '').trim(), phone: normStored(r.phone), billed: 0, received: 0,
        tips: 0, writtenOff: 0, txns: 0, first: r.date, last: r.date, rows: [] };
      if (!c.name && r.name) c.name = r.name.trim();
      if (!c.phone && r.phone) c.phone = normStored(r.phone);
      c.billed += num(r.billed); c.received += r.paid; c.tips += num(r.tip);
      c.writtenOff += num(r.writtenOff); if (num(r.billed) > 0) c.txns++;
      if (r.date < c.first) c.first = r.date;
      if (r.date > c.last) c.last = r.date;
      c.rows.push(r);
    });
    return Object.keys(map).map(function (k) {
      var c = map[k];
      c.billed = r2(c.billed); c.received = r2(c.received); c.writtenOff = r2(c.writtenOff); c.tips = r2(c.tips);
      c.balance = r2(c.billed - c.received - c.writtenOff);
      c.credit = Math.max(0, -c.balance);
      c.owed = Math.max(0, c.balance);
      c.oldestUnpaid = null;
      if (c.balance > 0) c.rows.forEach(function (r) { if (r.remaining > 0 && (!c.oldestUnpaid || r.date < c.oldestUnpaid)) c.oldestUnpaid = r.date; });
      c.daysOverdue = c.oldestUnpaid ? Math.max(0, T - toDays(c.oldestUnpaid)) : null;
      c.risk = c.balance <= 0 || c.daysOverdue === null ? 'None' : c.daysOverdue > 60 ? 'High' : c.daysOverdue > 30 ? 'Medium' : c.daysOverdue > 0 ? 'Low' : 'None';
      c.tenure = Math.max(1, (T - toDays(c.first)) / 30.44);
      c.frequency = c.txns / c.tenure;
      c.type = c.writtenOff > 0 ? 'Do not give credit'
        : c.risk === 'High' ? 'Bad (high risk)'
        : T - toDays(c.last) > 90 ? 'Inactive (90+ days)'
        : (c.frequency >= 1 && c.txns >= 3) ? 'Regular' : 'Irregular';
      return c;
    }).sort(function (a, b) { return b.balance - a.balance || a.name.localeCompare(b.name); });
  }

  /* ---------- Agents ---------- */
  function computeAgents(entries) {
    var rows = entries.map(function (r) { return Object.assign({}, r); }).sort(byDateSeq);
    var used = {}; rows.forEach(function (r) { if (r.refId) used[r.refId] = 1; });
    fillRefs(rows, function () { return 'AL'; }, used);
    var map = {};
    rows.forEach(function (r) {
      r.hasNet = has(r.toAgent) || has(r.fromAgent);
      r.net = r.hasNet ? r2(num(r.toAgent) - num(r.fromAgent) - num(r.writtenOff)) : 0;
      var k = agentKey(r.name);
      if (!k) return;
      var a = map[k] || (map[k] = { key: k, name: String(r.name).trim(), phone: '', type: '', net: 0, entries: 0, last: r.date, writtenOff: 0 });
      if (!a.phone && r.phone) a.phone = normStored(r.phone);
      if (!a.type && r.type) a.type = r.type;
      a.net = r2(a.net + r.net); a.entries++; a.writtenOff += num(r.writtenOff);
      if (r.date > a.last) a.last = r.date;
    });
    var balances = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return Math.abs(b.net) - Math.abs(a.net); });
    return { rows: rows, balances: balances };
  }

  /* ---------- Referral agent sales ---------- */
  function bracketCommission(amount, brackets) {
    var sorted = (brackets || []).slice().sort(function (a, b) { return num(a.min) - num(b.min); });
    var hit = null;
    sorted.forEach(function (b) { if (num(amount) >= num(b.min)) hit = b; });
    return hit ? num(hit.comm) : 0;
  }
  function computeReferrals(refs, brackets) {
    var rows = refs.map(function (r) { return Object.assign({}, r); }).sort(byDateSeq);
    var used = {}; rows.forEach(function (r) { if (r.refId) used[r.refId] = 1; });
    fillRefs(rows, function () { return 'RA'; }, used);
    rows.forEach(function (r) {
      r.commission = !has(r.amount) ? 0 : r.service === 'Deposit' ? bracketCommission(r.amount, brackets) : r2(num(r.amount) * num(r.rate) / 100);
      r.agentCut = r2(r.commission * num(r.share) / 100);
      r.net = r2(r.commission - r.agentCut);
    });
    var pay = {};
    rows.forEach(function (r) {
      var k = monthOf(r.date) + '|' + agentKey(r.agent);
      var p = pay[k] || (pay[k] = { month: monthOf(r.date), agent: String(r.agent || '').trim(), commission: 0, agentCut: 0, net: 0 });
      p.commission = r2(p.commission + r.commission); p.agentCut = r2(p.agentCut + r.agentCut); p.net = r2(p.net + r.net);
    });
    var payouts = Object.keys(pay).map(function (k) { return pay[k]; })
      .sort(function (a, b) { return b.month.localeCompare(a.month) || a.agent.localeCompare(b.agent); });
    return { rows: rows, payouts: payouts };
  }

  /* ---------- Expenses and money paid out ---------- */
  function computeExpenses(list) {
    var rows = list.map(function (r) { return Object.assign({}, r); }).sort(byDateSeq);
    var used = {}; rows.forEach(function (r) { if (r.refId) used[r.refId] = 1; });
    fillRefs(rows, function () { return 'EX'; }, used);
    var total = 0; rows.forEach(function (r) { total += num(r.amount); });
    return { rows: rows, total: r2(total) };
  }

  /* ---------- Commissions ---------- */
  function computeWalletComm(list) {
    return list.map(function (r) { var x = Object.assign({}, r); x.net = r2(num(r.received) - num(r.shared)); return x; });
  }
  // Net = retail part x (operator rate - retail share). The wholesale part is passed on to the dealer.
  function computeEvc(list) {
    return list.map(function (r) {
      var x = Object.assign({}, r);
      var purchase = num(r.purchase), wholesale = num(r.wholesale), rate = num(r.rate) / 100;
      x.retail = r2(purchase - wholesale);
      x.total = r2(purchase * rate);
      x.royalty = r2(x.retail * num(r.retailRoy) / 100 + wholesale * num(r.wholesaleRoy) / 100);
      x.toWholesaler = r2(wholesale * (rate - num(r.wholesaleRoy) / 100));
      x.net = r2(x.total - x.royalty - x.toWholesaler);
      return x;
    });
  }
  function commissionByMonth(wallet, evc) {
    var m = {};
    function get(k) { return m[k] || (m[k] = { month: k, wallet: 0, evc: 0, total: 0 }); }
    wallet.forEach(function (r) { if (!r.month) return; var x = get(r.month); x.wallet = r2(x.wallet + r.net); });
    evc.forEach(function (r) { if (!r.month) return; var x = get(r.month); x.evc = r2(x.evc + r.net); });
    return Object.keys(m).sort().reverse().map(function (k) { var x = m[k]; x.total = r2(x.wallet + x.evc); return x; });
  }

  /* ---------- Capital ---------- */
  function snapEmpty(s) { var b = s.balances || {}; return !Object.keys(b).some(function (k) { return num(b[k]) !== 0; }); }
  function snapTotal(s) { var t = 0; Object.keys(s.balances || {}).forEach(function (k) { t += num(s.balances[k]); }); return r2(t); }
  function computeCapital(snapshots, customers, agentBalances) {
    var receivables = 0, payables = 0;
    customers.forEach(function (c) { receivables += c.owed; payables += c.credit; });
    agentBalances.forEach(function (a) { if (a.net > 0) receivables += a.net; else payables += -a.net; });
    receivables = r2(receivables); payables = r2(payables);
    var rows = snapshots.filter(function (s) { return !snapEmpty(s); }).map(function (s) {
      var x = Object.assign({}, s), avail = snapTotal(s);
      x.available = avail; x.receivables = receivables; x.payables = payables;
      x.working = r2(avail + receivables - payables);
      return x;
    }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.seq || 0) - (a.seq || 0); });
    return { rows: rows, receivables: receivables, payables: payables };
  }

  /* ---------- Days and months of activity ---------- */
  function computeDays(csales) {
    var m = {};
    csales.forEach(function (r) {
      if (!r.billedSet) return;
      var d = m[r.date] || (m[r.date] = { date: r.date, count: 0, billed: 0, paid: 0, tips: 0, received: 0 });
      if (num(r.billed) > 0) d.count++;
      d.billed = r2(d.billed + num(r.billed)); d.paid = r2(d.paid + r.paid); d.tips = r2(d.tips + num(r.tip)); d.received = r2(d.received + r.moneyIn);
    });
    return Object.keys(m).sort().reverse().map(function (k) { return m[k]; });
  }
  function computeMonths(csales) {
    var m = {};
    csales.forEach(function (r) {
      if (!r.billedSet) return;
      var k = monthOf(r.date), x = m[k] || (m[k] = { month: k, count: 0, billed: 0, paid: 0, tips: 0, received: 0 });
      if (num(r.billed) > 0) x.count++;
      x.billed = r2(x.billed + num(r.billed)); x.paid = r2(x.paid + r.paid); x.tips = r2(x.tips + num(r.tip)); x.received = r2(x.received + r.moneyIn);
    });
    return Object.keys(m).sort().reverse().map(function (k) { return m[k]; });
  }

  /* ---------- Balance checks: opening capital + money in - money out = what you should have ---------- */
  function inRange(d, fromEx, toIn) { return !!d && d > fromEx && d <= toIn; }
  function flows(ctx, fromEx, toIn) {
    var f = { customers: 0, tips: 0, agentsGot: 0, commissions: 0, agentsPaid: 0, expenses: 0, costOut: 0 };
    ctx.sales.forEach(function (r) {
      if (!inRange(r.date, fromEx, toIn)) return;
      f.customers += num(r.received);
      if (OPT.tipMode !== 'included') f.tips += num(r.tip);
      f.costOut += num(r.costOut);
    });
    ctx.agentRows.forEach(function (r) { if (inRange(r.date, fromEx, toIn)) { f.agentsGot += num(r.fromAgent); f.agentsPaid += num(r.toAgent); } });
    ctx.expenses.forEach(function (r) { if (inRange(r.date, fromEx, toIn)) f.expenses += num(r.amount); });
    ctx.walletComm.forEach(function (r) {
      if (!r.month) return;
      if ((r.month + '-01') > fromEx && lastDay(r.month) <= toIn) f.commissions += num(r.received);
    });
    Object.keys(f).forEach(function (k) { f[k] = r2(f[k]); });
    f.in = r2(f.customers + f.tips + f.agentsGot + f.commissions);
    f.out = r2(f.agentsPaid + f.expenses + f.costOut);
    return f;
  }
  function sortedSnaps(snapshots) {
    return snapshots.filter(function (s) { return !snapEmpty(s); }).map(function (s) { return Object.assign({}, s, { total: snapTotal(s) }); })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0); });
  }
  function judge(diff) { return Math.abs(diff) < 0.01 ? 'Balanced' : diff < 0 ? 'Missing' : 'Extra'; }
  function computeChecks(snapshots, ctx) {
    var snaps = sortedSnaps(snapshots), out = [];
    snaps.forEach(function (s, i) {
      if (!i) { out.push({ id: s.id, date: s.date, closing: s.total, opening: null, flows: null, expected: null, diff: null, status: 'First record' }); return; }
      var p = snaps[i - 1], f = flows(ctx, p.date, s.date), expected = r2(p.total + f.in - f.out), diff = r2(s.total - expected);
      out.push({ id: s.id, date: s.date, from: p.date, opening: p.total, closing: s.total, flows: f, expected: expected, diff: diff, status: judge(diff) });
    });
    return out.reverse();
  }
  function computeMonthChecks(snapshots, ctx, months) {
    var snaps = sortedSnaps(snapshots);
    var set = {}; months.forEach(function (m) { set[m] = 1; });
    snaps.forEach(function (s) { set[monthOf(s.date)] = 1; });
    return Object.keys(set).filter(Boolean).sort().reverse().map(function (m) {
      var start = m + '-01', end = lastDay(m), opening = null, closing = null, inMonth = [];
      snaps.forEach(function (s) { if (s.date < start) opening = s; if (s.date >= start && s.date <= end) { closing = s; inMonth.push(s); } });
      // First month of use: nothing before the 1st, so the month's first recorded balances are the starting point.
      if (!opening && inMonth.length >= 2) opening = inMonth[0];
      var r = { month: m, opening: opening, closing: closing, status: 'Needs balances' };
      if (opening && closing) {
        r.flows = flows(ctx, opening.date, closing.date);
        r.expected = r2(opening.total + r.flows.in - r.flows.out);
        r.diff = r2(closing.total - r.expected); r.status = judge(r.diff);
      } else if (closing && !opening) r.status = 'No opening balances';
      return r;
    });
  }

  /* ---------- Losses ---------- */
  function computeLosses(csales, agentRows, errors) {
    var items = [];
    csales.forEach(function (r) { if (num(r.writtenOff) > 0) items.push({ date: r.date, source: r.kind === 'WE' ? 'Wallet Exchange' : 'Data / Deposit', who: r.name, what: r.details || '', amount: num(r.writtenOff), reason: r.woReason || '' }); });
    agentRows.forEach(function (r) { if (num(r.writtenOff) > 0) items.push({ date: r.date, source: 'Agent', who: r.name, what: r.desc || '', amount: num(r.writtenOff), reason: r.woReason || '' }); });
    (errors || []).forEach(function (e) { if (e.ledToLoss === 'Yes' && num(e.amountLost) > 0) items.push({ date: e.date, source: 'Error', who: e.causedBy || '', what: e.desc || '', amount: num(e.amountLost), reason: e.type || '' }); });
    items.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var months = {}, total = 0;
    items.forEach(function (i) { var k = monthOf(i.date); months[k] = r2((months[k] || 0) + i.amount); total += i.amount; });
    var byMonth = Object.keys(months).sort().reverse().map(function (k) { return { month: k, amount: months[k] }; });
    return { items: items, byMonth: byMonth, total: r2(total) };
  }

  /* ---------- Risk assessment ---------- */
  function to50(x) { return Math.max(0, Math.round(num(x) / 50) * 50); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function computeRisk(customers, agents, checks, losses, limits, today) {
    var T = toDays(today), out = { customers: [], agents: [], alerts: [] };
    var totalOwed = 0; customers.forEach(function (c) { totalOwed += c.owed; });
    customers.forEach(function (c) {
      var bills = c.rows.filter(function (r) { return num(r.billed) > 0; });
      var avg = bills.length ? bills.reduce(function (a, r) { return a + num(r.billed); }, 0) / bills.length : 0;
      var late = c.rows.filter(function (r) { return r.daysDelayed > 3; }).length;
      var score = 0, why = [];
      if (c.writtenOff > 0) { score += 70; why.push('Had money written off before (' + fm(c.writtenOff) + ')'); }
      var od = c.daysOverdue || 0;
      if (c.owed > 0 && od > 60) { score += 50; why.push('Oldest unpaid sale is ' + od + ' days old'); }
      else if (c.owed > 0 && od > 30) { score += 35; why.push('Oldest unpaid sale is ' + od + ' days old'); }
      else if (c.owed > 0 && od > 7) { score += 20; why.push('Oldest unpaid sale is ' + od + ' days old'); }
      else if (c.owed > 0 && od > 3) { score += 10; why.push('Has not paid for ' + od + ' days'); }
      if (c.owed > 0 && avg > 0) {
        var ratio = c.owed / avg;
        if (ratio > 5) { score += 20; why.push('Has more than 5 times their usual purchase to pay'); }
        else if (ratio > 3) { score += 15; why.push('Has more than 3 times their usual purchase to pay'); }
        else if (ratio > 1.5) { score += 8; why.push('Has more than their usual purchase to pay'); }
      }
      if (late) { score += Math.min(15, late * 5); why.push('Paid late ' + late + (late === 1 ? ' time' : ' times')); }
      if (c.owed > 0 && T - toDays(c.last) > 60) { score += 10; why.push('No purchase for over 60 days but still has money to pay'); }
      score = Math.min(100, score);
      var level = score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low';
      var suggested = (c.writtenOff > 0 || level === 'High') ? 0 : level === 'Medium' ? to50(avg) : to50(avg * (c.type === 'Regular' ? 2 : 1));
      var manual = limits && has(limits[c.key]) ? num(limits[c.key]) : null;
      var limit = manual !== null ? manual : suggested;
      out.customers.push({ key: c.key, name: c.name, phone: c.phone, owed: c.owed, score: score, level: level, reasons: why,
        avg: r2(avg), limit: limit, suggested: suggested, manual: manual, over: c.owed > 0 && c.owed > limit });
    });
    out.customers.sort(function (a, b) { return b.score - a.score || b.owed - a.owed; });
    var agentCollect = 0, agentOwing = 0;
    agents.balances.forEach(function (a) { if (a.net > 0) { agentCollect += a.net; agentOwing++; } });
    agents.balances.forEach(function (a) {
      if (!(a.net > 0)) return;
      var rows = agents.rows.filter(function (r) { return agentKey(r.name) === a.key; });
      var paid = rows.filter(function (r) { return num(r.fromAgent) > 0; }).map(function (r) { return r.date; }).sort();
      var first = rows.map(function (r) { return r.date; }).sort()[0];
      var since = paid.length ? paid[paid.length - 1] : first, days = since ? T - toDays(since) : 0;
      var share = agentCollect ? a.net / agentCollect : 0, score = 0, why = [];
      if (days > 30) { score += 50; } else if (days > 14) { score += 30; } else if (days > 7) { score += 15; }
      if (days > 7) why.push(paid.length ? 'Last paid you ' + days + ' days ago' : 'Has not paid you back in ' + days + ' days');
      if (share > 0.5 && agentOwing > 1) { score += 20; why.push('Owes you ' + fm(a.net) + ', which is ' + pct(a.net, agentCollect) + '% of the ' + fm(agentCollect) + ' that all agents owe you'); }
      score = Math.min(100, score);
      out.agents.push({ key: a.key, name: a.name, net: a.net, days: days, score: score, level: score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low', reasons: why });
    });
    out.agents.sort(function (a, b) { return b.score - a.score || b.net - a.net; });
    var high = out.customers.filter(function (c) { return c.level === 'High' && c.owed > 0; });
    if (high.length) out.alerts.push({ level: 'High', text: high.length + (high.length === 1 ? ' high-risk customer has ' : ' high-risk customers have ') + fm(high.reduce(function (a, c) { return a + c.owed; }, 0)) + ' to pay' });
    var over = out.customers.filter(function (c) { return c.over; });
    if (over.length) out.alerts.push({ level: 'Medium', text: over.length + (over.length === 1 ? ' customer is' : ' customers are') + ' over their credit limit' });
    var owing = customers.filter(function (c) { return c.owed > 0; }).sort(function (a, b) { return b.owed - a.owed; });
    if (owing.length >= 2 && totalOwed > 0 && owing[0].owed / totalOwed > 0.4)
      out.alerts.push({ level: 'Medium', text: 'Too much depends on one customer: ' + owing[0].name + ' owes you ' + fm(owing[0].owed) + ', which is ' + pct(owing[0].owed, totalOwed) + '% of the ' + fm(totalOwed) + ' that all customers owe you. Think twice before giving them more credit.' });
    var short = (checks || []).filter(function (d) { return d.status === 'Missing' && T - toDays(d.date) <= 30; });
    if (short.length) out.alerts.push({ level: 'High', text: 'Money was missing on ' + short.length + (short.length === 1 ? ' check' : ' checks') + ' in the last 30 days (' + fm(-short.reduce(function (a, d) { return a + d.diff; }, 0)) + ' in total). Open Daily Cash Check to see why.' });
    out.agents.filter(function (a) { return a.level === 'High'; }).forEach(function (a) {
      out.alerts.push({ level: 'High', text: a.name + ' has not paid you for ' + a.days + ' days and owes you ' + fm(a.net) });
    });
    var month = String(today).slice(0, 7), lossM = (losses.byMonth.filter(function (m) { return m.month === month; })[0] || {}).amount || 0;
    if (lossM > 0) out.alerts.push({ level: 'Medium', text: 'Losses this month: ' + fm(lossM) });
    var atRisk = 0; out.customers.forEach(function (c) { if (c.level !== 'Low') atRisk += c.owed; });
    out.summary = { high: out.customers.filter(function (c) { return c.level === 'High'; }).length,
      medium: out.customers.filter(function (c) { return c.level === 'Medium'; }).length, atRisk: r2(atRisk) };
    return out;
  }

  /* ---------- Everything at once ---------- */
  function computeAll(state, today) {
    today = today || todayStr();
    setOptions(state.settings);
    var sales = computeSales(state.sales || [], today);
    var customers = computeCustomers(sales, today);
    var agents = computeAgents(state.agents || []);
    var referrals = computeReferrals(state.referrals || [], state.brackets || []);
    var expenses = computeExpenses(state.expenses || []);
    var walletComm = computeWalletComm(state.walletComm || []);
    var evc = computeEvc(state.evc || []);
    var commMonths = commissionByMonth(walletComm, evc);
    var capital = computeCapital(state.capital || [], customers, agents.balances);
    var daily = computeDays(sales), months = computeMonths(sales);
    var ctx = { sales: sales, agentRows: agents.rows, expenses: expenses.rows, walletComm: walletComm };
    var checks = computeChecks(state.capital || [], ctx);
    var monthChecks = computeMonthChecks(state.capital || [], ctx, months.map(function (m) { return m.month; }));
    var losses = computeLosses(sales, agents.rows, state.errors || []);
    var t = { billed: 0, paid: 0, tips: 0, moneyIn: 0, overdue: 0, owed: 0, credit: 0 };
    sales.forEach(function (r) {
      if (!r.billedSet) return;
      t.billed += num(r.billed); t.paid += r.paid; t.tips += num(r.tip); t.moneyIn += r.moneyIn;
      if (r.status === 'Overdue') t.overdue++;
    });
    customers.forEach(function (c) { t.owed += c.owed; t.credit += c.credit; });
    var types = {};
    customers.forEach(function (c) { types[c.type] = (types[c.type] || 0) + 1; });
    var agentNet = 0; agents.balances.forEach(function (a) { agentNet += a.net; });
    var commTotal = 0; commMonths.forEach(function (m) { commTotal += m.total; });
    var risk = computeRisk(customers, agents, checks, losses, state.limits || {}, today);
    return { risk: risk, today: today, sales: sales, customers: customers, agents: agents, referrals: referrals, expenses: expenses,
      walletComm: walletComm, evc: evc, commMonths: commMonths, capital: capital, daily: daily, months: months,
      checks: checks, monthChecks: monthChecks, losses: losses, types: types, tipMode: OPT.tipMode,
      totals: { billed: r2(t.billed), received: r2(t.paid), tips: r2(t.tips), moneyIn: r2(t.moneyIn), overdue: t.overdue,
        owed: r2(t.owed), credit: r2(t.credit), agentNet: r2(agentNet), commission: r2(commTotal) }
    };
  }

  g.Calc = { computeAll: computeAll, computeSales: computeSales, computeCustomers: computeCustomers,
    computeAgents: computeAgents, bracketCommission: bracketCommission, computeEvc: computeEvc, computeRisk: computeRisk,
    setOptions: setOptions, fm: fm, parsePhone: parsePhone, normStored: normStored, phoneKey: phoneKey, phoneInfo: phoneInfo,
    assignRefIds: assignRefIds, newRefId: newRefId, snapEmpty: snapEmpty, isPay: isPay, paidOf: paidOf, moneyInOf: moneyInOf, snapTotal: snapTotal,
    gmNormalize: normStored, GM_RULES: GM_RULES, lastDay: lastDay,
    todayStr: todayStr, toDays: toDays, num: num, has: has, r2: r2, monthOf: monthOf, custKey: custKey, agentKey: agentKey };
})(typeof window !== 'undefined' ? window : globalThis);
