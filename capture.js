/* Agent & Client Tracker: reads a wallet or bank message (SMS or notification) and pulls out
   the amount, the direction (money in or out), the provider, the phone number, the name and the reference.
   Everything happens on the phone. Nothing is sent anywhere. */
(function (g) {
  'use strict';

  var PROVIDERS = [
    ['Wave', 'wallet', /\bwave\b/i],
    ['Afrimoney', 'wallet', /afri\s?money|afrimobile|africell\s?money/i],
    ['QMoney', 'wallet', /\bq\s?-?money\b|qcell\s?money/i],
    ['APS', 'wallet', /\baps\b/i],
    ['Nafa', 'wallet', /\bnafa\b/i],
    ['Yonna', 'wallet', /\byonna\b/i],
    ['ComCach', 'wallet', /com\s?ca[cs]h|comium\s?money/i],
    ['Xpress Point', 'wallet', /xpress\s?point/i],
    ['Suturamoney', 'wallet', /sutura/i],
    ['Access Bank', 'bank', /access\s?bank/i],
    ['Agib Bank', 'bank', /\bagib\b|arab\s?gambian/i],
    ['BSIC', 'bank', /\bbsic\b/i],
    ['Bloom Bank', 'bank', /bloom\s?bank/i],
    ['Ecobank', 'bank', /eco\s?bank/i],
    ['First Bank', 'bank', /first\s?bank|\bfbn\b/i],
    ['GTBank', 'bank', /gt\s?bank|guaranty\s?trust|\bgtco\b/i],
    ['Mega Bank', 'bank', /mega\s?bank/i],
    ['Trust Bank', 'bank', /trust\s?bank|\btbl\b/i],
    ['Vista Bank', 'bank', /vista\s?bank/i],
    ['Zenith Bank', 'bank', /zenith/i]
  ];

  // Words that say money came in, and words that say money went out (English and French).
  var IN_WORDS = [/\breceived\b/i, /you have received/i, /\bcredited\b/i, /\bcredit(?!\s*card)\b/i, /deposit(?:ed)?\s+(?:to|into|in)\s+your/i, /\bcash[\s-]?in\b/i,
    /\bfrom\b/i, /\breçu\b|\brecu\b|vous avez reçu/i, /\bincoming\b/i, /payment received/i, /has sent you/i, /sent you/i];
  var OUT_WORDS = [/\byou (?:have )?(?:sent|paid|transferred)\b/i, /\bsent to\b/i, /\bpaid to\b/i, /\bdebited\b/i, /\bdebit\b/i, /\bwithdraw(?:n|al)?\b/i,
    /\bcash[\s-]?out\b/i, /transfer(?:red)?\s+to\b/i, /payment (?:to|of)\b/i, /\bpurchase\b|\bbought\b/i, /\benvoy[ée]/i, /\bretrait\b/i, /\bto\b/i];

  var CUR = '(?:GMD|D|Dalasis?|Dls?)';
  var NUM = '(\\d{1,3}(?:[,\\s]\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
  var AMOUNT_RE = new RegExp('(?:' + CUR + '\\s?' + NUM + '|' + NUM + '\\s?' + CUR + '\\b)', 'gi');

  function toNum(s) { return Number(String(s).replace(/[,\s]/g, '')); }

  function amounts(text) {
    var out = [], m;
    AMOUNT_RE.lastIndex = 0;
    while ((m = AMOUNT_RE.exec(text))) {
      var raw = m[1] || m[2], v = toNum(raw);
      if (!isFinite(v) || v <= 0) continue;
      var before = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
      var role = /bal(?:ance)?\b|bal\.|solde|available|new bal|current bal/.test(before) ? 'balance'
        : /fee|charge|frais|commission|tax|levy/.test(before) ? 'fee' : 'main';
      out.push({ value: v, role: role, at: m.index });
    }
    return out;
  }

  function score(list, text) { var n = 0; list.forEach(function (re) { if (re.test(text)) n += (re.source === '\\bfrom\\b' || re.source === '\\bto\\b') ? 1 : 2; }); return n; }

  function phones(text) {
    var out = [], re = /(?:\+?220[\s-]?)?(?<!\d)([2-9]\d{2}[\s-]?\d{4})(?!\d)/g, m;
    while ((m = re.exec(text))) out.push({ local: m[1].replace(/\D/g, ''), at: m.index });
    return out;
  }

  var NOT_NAMES = /^(?:your|you|the|a|an|account|wallet|wave|afrimoney|qmoney|aps|nafa|yonna|bank|mobile|money|number|agent|merchant|ref|reference|transaction|balance|gmd|dalasi|on|at|successful|successfully|success|completed|txn|trans|transid|id|new|bal|fee|is|was|has|been|via|for|and|date|time|thank|thanks)$/i;
  function tidyName(words) {
    var n = words.join(' ');
    return n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)[a-z]/g, function (c) { return c.toUpperCase(); }) : n;
  }
  /* A name written right after the phone number, as in "from 7700112 AISHA TOURAY" or "to 3456789 (Lamin Ceesay)". */
  function nameAfterPhone(text, phone) {
    if (!phone) return '';
    var after = text.slice(phone.at).replace(/^[^\d]*[\d\s-]+/, ''), m = /^\s*[(,:-]?\s*((?:[A-Z][A-Za-z'.-]+)(?:\s+[A-Z][A-Za-z'.-]+){0,3})/.exec(after);
    if (!m) return '';
    var words = [];
    m[1].split(/\s+/).some(function (w) { if (NOT_NAMES.test(w)) return true; words.push(w); return false; });
    return words.length ? tidyName(words) : '';
  }
  function nameNear(text) {
    var re = /\b(?:from|to|de|à|by)\s+((?:[A-Z][A-Za-z'.-]+|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z'.-]+|[A-Z]{2,})){0,3})/g, m;
    while ((m = re.exec(text))) {
      var words = m[1].split(/\s+/).filter(function (w) { return !NOT_NAMES.test(w) && !/\d/.test(w); });
      if (words.length) return tidyName(words);
    }
    return '';
  }

  function refOf(text) {
    var m = /(?:ref(?:erence)?|txn\s?id|trans(?:action)?\s?(?:id|no|number)|trx\s?id|\bid)\s*[:#.\-]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{4,})/i.exec(text);
    return m ? { value: m[1].replace(/[.\/-]+$/, ''), from: m.index + m[0].length - m[1].length, to: m.index + m[0].length } : { value: '', from: -1, to: -1 };
  }

  function providerOf(text, appName) {
    var hay = (appName || '') + ' ' + text;
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i][2].test(hay)) return { name: PROVIDERS[i][0], kind: PROVIDERS[i][1] };
    return null;
  }

  /* Is this message about money at all? Used to ignore everything else. */
  function looksLikeMoney(text) {
    if (!text) return false;
    var a = amounts(text).filter(function (x) { return x.role === 'main'; });
    if (!a.length) return false;
    return score(IN_WORDS, text) + score(OUT_WORDS, text) > 0 || !!providerOf(text);
  }

  function parse(text, meta) {
    meta = meta || {};
    text = String(text || '').replace(/\s+/g, ' ').trim();
    var all = amounts(text), main = all.filter(function (x) { return x.role === 'main'; });
    var fee = all.filter(function (x) { return x.role === 'fee'; })[0];
    var bal = all.filter(function (x) { return x.role === 'balance'; })[0];
    var sin = score(IN_WORDS, text), sout = score(OUT_WORDS, text);
    var direction = sin > sout ? 'in' : sout > sin ? 'out' : '';
    var ph = phones(text), rf = refOf(text), ref = rf.value;
    var phone = ph.filter(function (p) { return !(p.at >= rf.from && p.at < rf.to); })[0];
    var when = meta.when ? new Date(meta.when) : new Date();
    return {
      text: text,
      app: meta.app || '',
      provider: providerOf(text, meta.app),
      direction: direction,
      amount: main.length ? main[0].value : null,
      fee: fee ? fee.value : null,
      balance: bal ? bal.value : null,
      phone: phone ? phone.local : '',
      name: nameNear(text) || nameAfterPhone(text, phone),
      ref: ref,
      when: when.getTime(),
      date: when.getFullYear() + '-' + String(when.getMonth() + 1).padStart(2, '0') + '-' + String(when.getDate()).padStart(2, '0'),
      time: String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0')
    };
  }

  g.Capture = { parse: parse, looksLikeMoney: looksLikeMoney, providers: PROVIDERS };
})(typeof window !== 'undefined' ? window : globalThis);
