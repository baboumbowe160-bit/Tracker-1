/* Agent & Client Tracker – languages.
   The app is written in English. Other languages are added by lang-xx.js files.
   The app follows the phone's language unless the person picks one in Settings. */
(function (g) {
  'use strict';
  var FMT = {
    en: { months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
          days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], sep: ',', dec: '.', curAfter: false },
    fr: { months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
          short: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
          days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], sep: '\u202f', dec: ',', curAfter: true },
    pt: { months: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
          short: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
          days: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
          dshort: ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'], sep: '\u00a0', dec: ',', curAfter: true }
  };
  var I = g.I18N = {
    lang: 'en', pref: 'auto', supported: ['en', 'fr', 'pt'],
    names: { en: 'English', fr: 'Français', pt: 'Português' },
    dict: { fr: {}, pt: {} }, pats: { fr: [], pt: [] }
  };
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function parts(s) { var p = String(s).split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
  function wd(p) { return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function L(lang) { return FMT[lang || I.lang] || FMT.en; }
  function ord(d) { var j = d % 10, k = d % 100; return d + (k >= 11 && k <= 13 ? 'th' : j === 1 ? 'st' : j === 2 ? 'nd' : j === 3 ? 'rd' : 'th'); }
  function mShort(i, lang) { var f = L(lang); return f.short ? f.short[i] : f.months[i].slice(0, 3); }

  I.add = function (lang, dict, pats) {
    Object.assign(I.dict[lang], dict || {});
    (pats || []).forEach(function (p) { I.pats[lang].push({ re: p[0], tpl: p[1], digit: /\\d/.test(p[0].source) }); });
  };
  I.detect = function () {
    var list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']);
    for (var i = 0; i < list.length; i++) { var b = String(list[i] || '').slice(0, 2).toLowerCase(); if (I.supported.indexOf(b) >= 0) return b; }
    return 'en';
  };
  I.setPref = function (pref) {
    I.pref = pref && pref !== 'auto' && I.supported.indexOf(pref) >= 0 ? pref : 'auto';
    I.lang = I.pref === 'auto' ? I.detect() : I.pref;
    if (g.document) g.document.documentElement.lang = I.lang;
  };
  I.withLang = function (lang, fn) { var keep = I.lang; I.lang = I.supported.indexOf(lang) >= 0 ? lang : keep; try { return fn(); } finally { I.lang = keep; } };

  /* ---------- dates ---------- */
  I.fmt = {
    readable: function (s) {
      if (!s) return ''; var p = parts(s), f = L();
      if (I.lang === 'fr') return (p.d === 1 ? '1er' : p.d) + ' ' + f.months[p.m - 1] + ' ' + p.y;
      if (I.lang === 'pt') return p.d + ' de ' + f.months[p.m - 1] + ' de ' + p.y;
      return ord(p.d) + ' ' + f.months[p.m - 1] + ' ' + p.y;
    },
    short: function (s) { if (!s) return ''; var p = parts(s); return p.d + ' ' + mShort(p.m - 1) + ' ' + p.y; },
    dayHead: function (s) {
      var p = parts(s), f = L();
      if (I.lang === 'fr') return cap(f.days[wd(p)]) + ' ' + (p.d === 1 ? '1er' : p.d) + ' ' + f.months[p.m - 1];
      if (I.lang === 'pt') return cap(f.days[wd(p)]) + ', ' + p.d + ' de ' + f.months[p.m - 1];
      return f.days[wd(p)] + ', ' + ord(p.d) + ' ' + f.months[p.m - 1];
    },
    dayShort: function (s) {
      var p = parts(s), f = L();
      var day = I.lang === 'pt' ? f.dshort[wd(p)] : I.lang === 'fr' ? f.days[wd(p)].slice(0, 3) + '.' : f.days[wd(p)].slice(0, 3);
      return cap(day) + ' ' + p.d + ' ' + mShort(p.m - 1);
    },
    month: function (m) {
      if (!m) return ''; var p = m.split('-').map(Number), f = L();
      return I.lang === 'pt' ? cap(f.months[p[1] - 1]) + ' de ' + p[0] : cap(f.months[p[1] - 1]) + ' ' + p[0];
    },
    monthShort: function (i) { return cap(mShort(i)); },
    stamp: function (ms) {
      if (!ms) return ''; var t = new Date(ms), time = pad2(t.getHours()) + ':' + pad2(t.getMinutes());
      return t.getDate() + ' ' + mShort(t.getMonth()) + ' ' + t.getFullYear() + (I.lang === 'fr' ? ' à ' : ', ') + time;
    }
  };

  /* ---------- money ---------- */
  I.number = function (n) {
    var f = L(), neg = n < 0, a = Math.abs(Math.round(n * 100) / 100);
    var whole = Math.floor(a), frac = Math.round((a - whole) * 100);
    var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, f.sep);
    if (frac) s += f.dec + String(frac).padStart(2, '0');
    return (neg ? '-' : '') + s;
  };
  I.money = function (n, sym) {
    var s = I.number(Math.abs(n)), neg = n < 0 ? '-' : '';
    return L().curAfter ? neg + s + '\u00a0' + sym : neg + sym + s;
  };
  I.compact = function (n, sym) {
    var a = Math.abs(n), s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'm' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : String(Math.round(a));
    if (L().dec === ',') s = s.replace('.', ',');
    return (n < 0 ? '-' : '') + (L().curAfter ? s + '\u00a0' + sym : sym + s);
  };

  /* ---------- text ---------- */
  function core(key, lang) {
    var D = I.dict[lang];
    if (Object.prototype.hasOwnProperty.call(D, key)) return D[key];
    var m = key.match(/^(.*\S)( \*)$/);
    if (m) { var x = core(m[1], lang); if (x != null) return x + m[2]; }
    if (key.indexOf(', ') > 0 && key.indexOf('. ') < 0) {
      var all = true, parts = key.split(', ').map(function (p) { var y = core(p, lang); if (y == null) all = false; return y; });
      if (all) return parts.join(', ');
    }
    if (key.indexOf(' · ') > 0) {
      var changed = false, out = key.split(' · ').map(function (p) { var y = core(p, lang); if (y != null) { changed = true; return y; } return p; });
      if (changed) return out.join(' · ');
    }
    var P = I.pats[lang], hasDigit = /\d/.test(key);
    for (var i = 0; i < P.length; i++) {
      if (P[i].digit && !hasDigit) continue;
      var mm = key.match(P[i].re);
      if (mm) return P[i].tpl.replace(/\$l(\d)/g, function (_, n) { return (mm[n] || '').split(', ').map(function (p) { var z = core(p, lang); return z == null ? p : z; }).join(', '); })
        .replace(/\$t(\d)/g, function (_, n) { var z = core(mm[n] || '', lang); return z == null ? (mm[n] || '') : z; })
        .replace(/\$(\d)/g, function (_, n) { return mm[n] || ''; });
    }
    return null;
  }
  I.t = function (s, lang) {
    lang = lang || I.lang;
    if (lang === 'en' || s == null || !I.dict[lang]) return s;
    var str = String(s), key = str.trim(); if (!key) return str;
    var out = core(key, lang);
    if (out == null) return str;
    return str.match(/^\s*/)[0] + out + str.match(/\s*$/)[0];
  };
  I.has = function (s, lang) { return core(String(s).trim(), lang || I.lang) != null; };

  /* ---------- the screen ---------- */
  var ATTRS = ['placeholder', 'aria-label', 'title'];
  function skip(el) { return !el || /^(SCRIPT|STYLE|TEXTAREA)$/.test(el.tagName) || (el.closest && el.closest('[data-noi18n]')); }
  function doText(n) {
    if (n.__i18n !== undefined && n.nodeValue === n.__i18n) return;
    if (skip(n.parentElement)) return;
    var v = n.nodeValue; if (!/[A-Za-z]/.test(v)) return;
    // A choice in a list keeps its English value, so records are saved the same in every language. Only the words shown change.
    var pe = n.parentElement;
    if (pe && pe.tagName === 'OPTION' && !pe.hasAttribute('value')) pe.setAttribute('value', v.replace(/\s+/g, ' ').trim());
    var t = I.t(v); n.__i18n = t; if (t !== v) n.nodeValue = t;
  }
  function doEl(el) {
    if (skip(el)) return;
    ATTRS.forEach(function (a) { var v = el.getAttribute(a); if (v && /[A-Za-z]/.test(v)) { var t = I.t(v); if (t !== v) el.setAttribute(a, t); } });
  }
  I.translate = function (root) {
    if (I.lang === 'en' || !root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doEl(root);
    var w = g.document.createTreeWalker(root, 5, null), n;   // elements and text
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
  };
  var obs = null;
  I.watch = function () {
    if (obs || !g.MutationObserver) return;
    obs = new MutationObserver(function (muts) {
      if (I.lang === 'en') return;
      muts.forEach(function (m) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doEl(m.target);
        else m.addedNodes.forEach(function (n) { I.translate(n); });
      });
    });
    obs.observe(g.document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  // Pop-up questions are not part of the page, so they are translated as they are asked.
  if (g.window) {
    ['alert', 'confirm', 'prompt'].forEach(function (k) {
      var orig = g.window[k]; if (!orig) return;
      g.window[k] = function (msg, def) { return orig.call(g.window, I.t(msg), def); };
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
