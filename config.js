/* =====================================================================
   Business Tracker: settings for the shared version.

   1. Between the two dashed lines below, paste the firebaseConfig block
      from your Firebase project (Project settings > Your apps).
      Pasting Firebase's whole code snippet is fine.
   2. Put your name (or business name) and a contact email below.

   If you leave the space between the dashed lines empty, the app works
   as before: everyone sets up their own Firebase under More.
   ===================================================================== */
window.APP_CONFIG = {
  ownerName: 'YOUR NAME OR BUSINESS NAME',
  supportEmail: 'you@example.com',
  firebaseText: `
---------------- PASTE BELOW THIS LINE ----------------

---------------- PASTE ABOVE THIS LINE ----------------
`
};

/* Nothing to change below. Reads the pasted block. */
(function (c) {
  var out = {}, m, re = /["']?(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["']?\s*:\s*["']([^"']+)["']/g;
  while ((m = re.exec(c.firebaseText || ''))) out[m[1]] = m[2].trim();
  c.firebase = (out.apiKey && out.authDomain && out.projectId && out.appId) ? out : null;
  c.hasOwner = !!(c.ownerName && c.ownerName.indexOf('YOUR NAME') < 0);
  c.hasEmail = !!(c.supportEmail && c.supportEmail.indexOf('example.com') < 0);
})(window.APP_CONFIG);
