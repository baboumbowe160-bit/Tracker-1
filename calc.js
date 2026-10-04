/* Business Tracker – calculation engine. Mirrors the workbook's formulas. */
(function (g) {
  'use strict';
  var DAY = 864e5;

  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() { var t = new Date(); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
  function toDays(s) { if (!s) return null; var p = s.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2] || 1) / DAY; }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function has(v) { return v !== '' && v !== null && v !== undefined && isFinite(parseFloat(v)); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function monthOf(s) { return (s || '').slice(0, 7); }
  function byDateSeq(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.seq || 0) - (b.seq || 0); }
  /* Gambia moved to 9-digit mobile numbers on 4 Sep 2026: Africell adds 87, QCell 83, Comium 86.
     Gamcel and Gamtel keep 7 digits. Old and new forms of one number must count as one customer. */
  var GM_NETS = [
    { name: 'Africell', prefix: '87', test: function (d) { return /^[72]/.test(d) || /^40/.test(d); } },
    { name: 'QCell', prefix: '83', test: function (d) { return /^[35]/.test(d); } },
    { name: 'Comium', prefix: '86', test: function (d) { return /^6/.test(d) || /^8[4-7]/.test(d); } }
  ];
  function gmDigits(raw) {
    var d = String(raw || '').replace(/\D/g, '');
    if (d.length > 9 && d.indexOf('220') === 0) d = d.slice(3);
    if (d.length > 9 && d.indexOf('00220') === 0) d = d.slice(5);
    return d;
  }
  function gmNetwork(raw) {
    var d = gmDigits(raw);
    if (d.length === 9) { for (var i = 0; i < GM_NETS.length; i++) if (d.slice(0, 2) === GM_NETS[i].prefix) return GM_NETS[i]; return null; }
    if (d.length === 7) { for (var j = 0; j < GM_NETS.length; j++) if (GM_NETS[j].test(d)) return GM_NETS[j]; return { name: 'Gamcel', prefix: '' }; }
    return null;
  }
  function gmNormalize(raw) {
    var d = gmDigits(raw);
    if (d.length === 7) { var n = gmNetwork(d); if (n && n.prefix) return n.prefix + d; }
    return d;
  }
  function gmCore(raw) { var d = gmNormalize(raw); return d.length === 9 ? d.slice(2) : d; }
  function custKey(r) {
    var p = gmNormalize(r.phone);
    return p ? 'p:' + p : 'n:' + String(r.name || '').trim().toLowerCase();
  }
  function agentKey(name) { return String(name || '').trim().toLowerCase(); }
  function refId(prefix, rows) {
    var cnt = {};
    rows.forEach(function (r) {
      var k = r.date; cnt[k] = (cnt[k] || 0) + 1;
      r.refId = prefix + '-' + String(r.date || '').slice(2).replace(/-/g, '') + '-' + pad3(cnt[k]);
    });
  }
  function pad3(n) { return String(n).padStart(3, '0'); }

  /* ---------- Sales (Data/Deposits + Wallet Exchange) ---------- */
  function computeSales(sales, today) {
    var T = toDays(today || todayStr());
    var rows = sales.map(function (r) { return Object.assign({}, r); }).sort(byDateSeq);
    refId('DS', rows.filter(function (r) { return r.kind !== 'WE'; }));
    refId('WE', rows.filter(function (r) { return r.kind === 'WE'; }));
    var groups = {};
    rows.forEach(function (r) {
      r.key = custKey(r);
      r.billedSet = has(r.billed);
      r.shortfall = r.billedSet ? r2(num(r.billed) - num(r.received) - num(r.writtenOff)) : 0;
      if (r.billedSet) (groups[r.key] = groups[r.key] || []).push(r);
    });
    // Running balance: customer's position across both sheets up to and including this date.
    Object.keys(groups).forEach(function (k) {
      var list = groups[k], cum = 0, atDate = {};
      list.forEach(function (r) { cum += r.shortfall; atDate[r.date] = cum; });
      list.forEach(function (r) { r.balance = r2(atDate[r.date]); });
    });
    // What is still unpaid on each sale: a payment covers its own sale first, any extra pays the
    // customer's oldest unpaid sales, and leftover credit covers their next purchases.
    Object.keys(groups).forEach(function (k) {
      var open = [], credit = 0;
      groups[k].forEach(function (r) {
        var own = num(r.received) + num(r.writtenOff);
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
      else if (r.remaining > 0) {
        r.status = T > D + 3 ? 'Overdue' : 'Outstanding';
        r.daysOverdue = Math.max(0, T - D);
      } else {
        r.status = num(r.writtenOff) > 0 ? 'Bad debt' : (r.balance < 0 ? 'Overpaid' : 'Paid');
        r.daysOverdue = null;
      }
      r.daysDelayed = r.datePaid ? Math.max(0, toDays(r.datePaid) - D)
        : (r.billedSet && r.remaining <= 0 && r.clearedOn && r.clearedOn > r.date ? toDays(r.clearedOn) - D : null);
    });
    return rows;
  }

  /* ---------- Customers (Debtors Summary) ---------- */
  function computeCustomers(csales, today) {
    var T = toDays(today || todayStr()), map = {};
    csales.forEach(function (r) {
      if (!r.billedSet) return;
      var c = map[r.key];
      if (!c) c = map[r.key] = { key: r.key, name: (r.name || '').trim(), phone: gmNormalize(r.phone) || '', billed: 0, received: 0,
        tips: 0, writtenOff: 0, txns: 0, first: r.date, last: r.date, rows: [] };
      if (!c.name && r.name) c.name = r.name.trim();
      c.billed += num(r.billed); c.received += num(r.received); c.tips += num(r.tip);
      c.writtenOff += num(r.writtenOff); if (num(r.billed) > 0) c.txns++; // payments alone are not sales
      if (r.date < c.first) c.first = r.date;
      if (r.date > c.last) c.last = r.date;
      c.rows.push(r);
    });
    return Object.keys(map).map(function (k) {
      var c = map[k];
      c.billed = r2(c.billed); c.received = r2(c.received); c.writtenOff = r2(c.writtenOff);
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

  /* ---------- Agent Ledger ---------- */
  function computeAgents(entries) {
    var rows = entries.map(function (r) { return Object.assign({}, r); }).sort(byDateSeq);
    refId('AL', rows);
    var map = {};
    rows.forEach(function (r) {
      r.hasNet = has(r.toAgent) || has(r.fromAgent);
      r.net = r.hasNet ? r2(num(r.toAgent) - num(r.fromAgent) - num(r.writtenOff)) : 0;
      var k = agentKey(r.name);
      if (!k) return;
      var a = map[k] || (map[k] = { key: k, name: String(r.name).trim(), phone: '', type: '', net: 0, entries: 0, last: r.date, writtenOff: 0 });
      if (!a.phone && r.phone) a.phone = gmNormalize(r.phone);
      if (!a.type && r.type) a.type = r.type;
      a.net = r2(a.net + r.net); a.entries++; a.writtenOff += num(r.writtenOff);
      if (r.date > a.last) a.last = r.date;
    });
    var balances = Object.keys(map).map(function (k) {
      var a = map[k];
      a.position = a.net > 0 ? 'Agent owes you' : a.net < 0 ? 'You owe agent' : 'Settled';
      return a;
    }).sort(function (a, b) { return Math.abs(b.net) - Math.abs(a.net); });
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
    refId('RA', rows);
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

  /* ---------- Commissions ---------- */
  function computeWalletComm(list) {
    return list.map(function (r) { var x = Object.assign({}, r); x.net = r2(num(r.received) - num(r.shared)); return x; });
  }
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

  /* ---------- Capital portfolio ---------- */
  function computeCapital(snapshots, customers, agentBalances) {
    var receivables = 0, payables = 0;
    customers.forEach(function (c) { receivables += c.owed; payables += c.credit; });
    agentBalances.forEach(function (a) { if (a.net > 0) receivables += a.net; else payables += -a.net; });
    receivables = r2(receivables); payables = r2(payables);
    var rows = snapshots.map(function (s) {
      var x = Object.assign({}, s), avail = 0;
      Object.keys(s.balances || {}).forEach(function (k) { avail += num(s.balances[k]); });
      x.available = r2(avail); x.receivables = receivables; x.payables = payables;
      x.working = r2(avail + receivables - payables);
      return x;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return { rows: rows, receivables: receivables, payables: payables };
  }

  /* ---------- Daily summary & cash ---------- */
  function computeDaily(csales, dailyInputs) {
    var m = {};
    csales.forEach(function (r) {
      if (!r.billedSet) return;
      var d = m[r.date] || (m[r.date] = { date: r.date, ds: 0, we: 0, billed: 0, received: 0 });
      if (num(r.billed) > 0) { if (r.kind === 'WE') d.we++; else d.ds++; }
      d.billed = r2(d.billed + num(r.billed)); d.received = r2(d.received + num(r.received) + num(r.tip));
    });
    Object.keys(dailyInputs || {}).forEach(function (k) { if (!m[k]) m[k] = { date: k, ds: 0, we: 0, billed: 0, received: 0 }; });
    return Object.keys(m).sort().reverse().map(function (k) {
      var d = m[k], inp = (dailyInputs || {})[k] || {};
      d.count = d.ds + d.we; d.input = inp;
      var anyInput = has(inp.openCash) || has(inp.openFloat) || has(inp.paidOut) || has(inp.counted);
      d.opening = r2(num(inp.openCash) + num(inp.openFloat));
      d.expected = anyInput ? r2(d.opening + d.received - num(inp.paidOut)) : null;
      d.variance = has(inp.counted) && d.expected !== null ? r2(num(inp.counted) - d.expected) : null;
      return d;
    });
  }

  /* ---------- Reconciliation ---------- */
  function computeRecon(csales, reconInputs) {
    var m = {};
    csales.forEach(function (r) {
      if (!r.billedSet) return;
      var k = monthOf(r.date), x = m[k] || (m[k] = { month: k, count: 0, billed: 0, received: 0 });
      if (num(r.billed) > 0) x.count++; x.billed = r2(x.billed + num(r.billed)); x.received = r2(x.received + num(r.received) + num(r.tip));
    });
    Object.keys(reconInputs || {}).forEach(function (k) { if (!m[k]) m[k] = { month: k, count: 0, billed: 0, received: 0 }; });
    return Object.keys(m).sort().reverse().map(function (k) {
      var x = m[k], inp = (reconInputs || {})[k] || {};
      x.input = inp;
      x.statement = has(inp.statement) ? num(inp.statement) : null;
      x.difference = x.statement === null ? null : r2(x.received - x.statement);
      x.status = inp.status || 'Pending';
      return x;
    });
  }

  /* ---------- Losses ---------- */
  function computeLosses(csales, agentRows, errors) {
    var items = [];
    csales.forEach(function (r) { if (num(r.writtenOff) > 0) items.push({ date: r.date, source: r.kind === 'WE' ? 'Wallet exchange' : 'Data / deposit', who: r.name, what: r.details || '', amount: num(r.writtenOff), reason: r.woReason || '' }); });
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
  function computeRisk(customers, agents, daily, losses, limits, today) {
    var T = toDays(today), out = { customers: [], agents: [], alerts: [] };
    var totalOwed = 0; customers.forEach(function (c) { totalOwed += c.owed; });
    customers.forEach(function (c) {
      var bills = c.rows.filter(function (r) { return num(r.billed) > 0; });
      var avg = bills.length ? bills.reduce(function (a, r) { return a + num(r.billed); }, 0) / bills.length : 0;
      var late = c.rows.filter(function (r) { return r.daysDelayed > 3; }).length;
      var score = 0, why = [];
      if (c.writtenOff > 0) { score += 70; why.push('Had money written off before (' + r2(c.writtenOff) + ')'); }
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
    var agentCollect = 0; agents.balances.forEach(function (a) { if (a.net > 0) agentCollect += a.net; });
    agents.balances.forEach(function (a) {
      if (!(a.net > 0)) return;
      var rows = agents.rows.filter(function (r) { return agentKey(r.name) === a.key; });
      var paid = rows.filter(function (r) { return num(r.fromAgent) > 0; }).map(function (r) { return r.date; }).sort();
      var first = rows.map(function (r) { return r.date; }).sort()[0];
      var since = paid.length ? paid[paid.length - 1] : first, days = since ? T - toDays(since) : 0;
      var share = agentCollect ? a.net / agentCollect : 0, score = 0, why = [];
      if (days > 30) { score += 50; } else if (days > 14) { score += 30; } else if (days > 7) { score += 15; }
      if (days > 7) why.push(paid.length ? 'Last paid you ' + days + ' days ago' : 'Has not paid you back in ' + days + ' days');
      if (share > 0.5 && agents.balances.filter(function (x) { return x.net > 0; }).length > 1) { score += 20; why.push('Holds ' + Math.round(share * 100) + '% of all money agents must pay you'); }
      score = Math.min(100, score);
      out.agents.push({ key: a.key, name: a.name, net: a.net, days: days, score: score, level: score >= 60 ? 'High' : score >= 30 ? 'Medium' : 'Low', reasons: why });
    });
    out.agents.sort(function (a, b) { return b.score - a.score || b.net - a.net; });
    // Warnings
    var high = out.customers.filter(function (c) { return c.level === 'High' && c.owed > 0; });
    if (high.length) out.alerts.push({ level: 'High', text: high.length + (high.length === 1 ? ' high-risk customer has ' : ' high-risk customers have ') + 'D' + r2(high.reduce(function (a, c) { return a + c.owed; }, 0)) + ' to pay' });
    var over = out.customers.filter(function (c) { return c.over; });
    if (over.length) out.alerts.push({ level: 'Medium', text: over.length + (over.length === 1 ? ' customer is' : ' customers are') + ' over their credit limit' });
    var owing = customers.filter(function (c) { return c.owed > 0; }).sort(function (a, b) { return b.owed - a.owed; });
    if (owing.length >= 2 && totalOwed > 0 && owing[0].owed / totalOwed > 0.4)
      out.alerts.push({ level: 'Medium', text: owing[0].name + ' holds ' + Math.round(owing[0].owed / totalOwed * 100) + '% of all money to collect from customers' });
    var short = daily.filter(function (d) { return d.variance !== null && d.variance < 0 && T - toDays(d.date) <= 30; });
    if (short.length) out.alerts.push({ level: 'High', text: 'Cash was short on ' + short.length + (short.length === 1 ? ' day' : ' days') + ' in the last 30 days (D' + r2(-short.reduce(function (a, d) { return a + d.variance; }, 0)) + ' missing)' });
    out.agents.filter(function (a) { return a.level === 'High'; }).forEach(function (a) {
      out.alerts.push({ level: 'High', text: a.name + ' has not paid you for ' + a.days + ' days (D' + a.net + ' to collect)' });
    });
    var month = String(today).slice(0, 7), lossM = (losses.byMonth.filter(function (m) { return m.month === month; })[0] || {}).amount || 0;
    if (lossM > 0) out.alerts.push({ level: 'Medium', text: 'Losses this month: D' + lossM });
    var atRisk = 0; out.customers.forEach(function (c) { if (c.level !== 'Low') atRisk += c.owed; });
    out.summary = { high: out.customers.filter(function (c) { return c.level === 'High'; }).length,
      medium: out.customers.filter(function (c) { return c.level === 'Medium'; }).length, atRisk: r2(atRisk) };
    return out;
  }

  /* ---------- Everything at once ---------- */
  function computeAll(state, today) {
    today = today || todayStr();
    var sales = computeSales(state.sales || [], today);
    var customers = computeCustomers(sales, today);
    var agents = computeAgents(state.agents || []);
    var referrals = computeReferrals(state.referrals || [], state.brackets || []);
    var walletComm = computeWalletComm(state.walletComm || []);
    var evc = computeEvc(state.evc || []);
    var commMonths = commissionByMonth(walletComm, evc);
    var capital = computeCapital(state.capital || [], customers, agents.balances);
    var daily = computeDaily(sales, state.daily || {});
    var recon = computeRecon(sales, state.recon || {});
    var losses = computeLosses(sales, agents.rows, state.errors || []);
    var t = { billed: 0, received: 0, tips: 0, overdue: 0, owed: 0, credit: 0 };
    sales.forEach(function (r) {
      if (!r.billedSet) return;
      t.billed += num(r.billed); t.received += num(r.received); t.tips += num(r.tip);
      if (r.status === 'Overdue') t.overdue++;
    });
    customers.forEach(function (c) { t.owed += c.owed; t.credit += c.credit; });
    var types = {};
    customers.forEach(function (c) { types[c.type] = (types[c.type] || 0) + 1; });
    var agentNet = 0; agents.balances.forEach(function (a) { agentNet += a.net; });
    var commTotal = 0; commMonths.forEach(function (m) { commTotal += m.total; });
    var risk = computeRisk(customers, agents, daily, losses, state.limits || {}, today);
    return { risk: risk,
      today: today, sales: sales, customers: customers, agents: agents, referrals: referrals,
      walletComm: walletComm, evc: evc, commMonths: commMonths, capital: capital,
      daily: daily, recon: recon, losses: losses, types: types,
      totals: { billed: r2(t.billed), received: r2(t.received), tips: r2(t.tips), overdue: t.overdue,
        owed: r2(t.owed), credit: r2(t.credit), agentNet: r2(agentNet), commission: r2(commTotal) }
    };
  }

  g.Calc = { computeAll: computeAll, computeSales: computeSales, computeCustomers: computeCustomers,
    computeAgents: computeAgents, bracketCommission: bracketCommission, computeEvc: computeEvc,
    todayStr: todayStr, toDays: toDays, gmNormalize: gmNormalize, gmNetwork: gmNetwork, gmCore: gmCore, gmDigits: gmDigits, GM_NETS: GM_NETS,
    computeRisk: computeRisk, num: num, has: has, r2: r2, monthOf: monthOf, custKey: custKey, agentKey: agentKey };
})(typeof window !== 'undefined' ? window : globalThis);
