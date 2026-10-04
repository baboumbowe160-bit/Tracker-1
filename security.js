/* App lock: PIN, fingerprint / face (WebAuthn), automatic locking and password expiry.
   This protects the app on this phone. Nothing here is sent anywhere. */
(function (g) {
  'use strict';
  var host = null, enc = new TextEncoder();
  function b64(buf) { var s = '', b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(s) { var d = atob(s), a = new Uint8Array(d.length); for (var i = 0; i < d.length; i++) a[i] = d.charCodeAt(i); return a; }
  function rand(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function sec() { var S = host.getS(); if (!S.meta.security || typeof S.meta.security !== 'object') S.meta.security = {}; return S.meta.security; }
  function hashPin(pin, saltB64) {
    return crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: 120000 }, key, 256);
    }).then(b64);
  }
  var LOCK_AFTER = { now: 0, '1': 60e3, '5': 300e3, '15': 900e3 };

  g.Security = {
    init: function (h) { host = h; },
    cfg: sec,
    enabled: function () { return !!sec().pinHash; },
    setPin: function (pin) {
      var salt = b64(rand(16)), c = sec();
      return hashPin(pin, salt).then(function (h) { c.pinHash = h; c.salt = salt; c.fails = 0; c.lockUntil = 0; return host.saveLocal(); });
    },
    // Returns { ok } or { ok:false, wait:seconds } or { ok:false, tooMany:true }
    checkPin: function (pin) {
      var c = sec(), now = Date.now();
      if (c.lockUntil && now < c.lockUntil) return Promise.resolve({ ok: false, wait: Math.ceil((c.lockUntil - now) / 1000) });
      return hashPin(pin, c.salt).then(function (h) {
        if (h === c.pinHash) { c.fails = 0; c.lockUntil = 0; host.saveLocal(); return { ok: true }; }
        c.fails = (c.fails || 0) + 1;
        var tooMany = c.fails >= 10;
        if (c.fails % 5 === 0) c.lockUntil = Date.now() + 60e3 * Math.min(10, c.fails / 5);
        host.saveLocal();
        return { ok: false, fails: c.fails, tooMany: tooMany, wait: c.lockUntil && c.lockUntil > Date.now() ? Math.ceil((c.lockUntil - Date.now()) / 1000) : 0 };
      });
    },
    resetFails: function () { var c = sec(); c.fails = 0; c.lockUntil = 0; host.saveLocal(); },
    disable: function () { var c = sec(); delete c.pinHash; delete c.salt; delete c.bioId; c.fails = 0; c.lockUntil = 0; return host.saveLocal(); },
    lockDelayMs: function () { var v = sec().lockAfter || 'now'; return v === 'never' ? Infinity : (LOCK_AFTER[v] != null ? LOCK_AFTER[v] : 0); },
    bioSupported: function () {
      if (!g.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
      return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; });
    },
    bioEnabled: function () { return !!sec().bioId; },
    enableBio: function () {
      var c = sec();
      return navigator.credentials.create({ publicKey: {
        challenge: rand(32), rp: { name: 'Agent & Client Tracker', id: location.hostname },
        user: { id: rand(16), name: 'owner', displayName: 'Owner' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000, attestation: 'none' } }).then(function (cred) { c.bioId = b64(cred.rawId); return host.saveLocal(); });
    },
    unlockBio: function () {
      var c = sec(); if (!c.bioId) return Promise.reject(new Error('Fingerprint is not set up'));
      return navigator.credentials.get({ publicKey: {
        challenge: rand(32), rpId: location.hostname, timeout: 60000, userVerification: 'required',
        allowCredentials: [{ type: 'public-key', id: unb64(c.bioId), transports: ['internal'] }] } }).then(function (a) { if (!a) throw new Error('Cancelled'); return true; });
    },
    disableBio: function () { delete sec().bioId; return host.saveLocal(); },
    markPassword: function () { sec().lastPasswordAt = Date.now(); host.saveLocal(); },
    expireDays: function () { return sec().expireDays || 30; },
    passwordDue: function () {
      var c = sec(); if (!c.lastPasswordAt) { c.lastPasswordAt = Date.now(); host.saveLocal(); return false; }
      return Date.now() - c.lastPasswordAt > (c.expireDays || 30) * 864e5;
    }
  };
})(window);
