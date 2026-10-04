/* =====================================================================
   Agent & Client Tracker: settings for the shared version.

   1. Between the two dashed lines below, paste the firebaseConfig block
      from your Firebase project (Project settings > Your apps).
      Pasting Firebase's whole code snippet is fine.
   2. Put your name (or business name) and a contact email below.

   If you leave the space between the dashed lines empty, the app works
   as before: everyone sets up their own Firebase under More.
   ===================================================================== */
window.APP_CONFIG = {
  ownerName: 'Babou Mbowe',
  supportEmail: 'baboumbowe160@gmail.com',
  firebaseText: `
---------------- PASTE BELOW THIS LINE ----------------
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDTzQmjAlxfJhVd5apYNzNKtVs64Ns_7iM",
  authDomain: "tracker-ad836.firebaseapp.com",
  projectId: "tracker-ad836",
  storageBucket: "tracker-ad836.firebasestorage.app",
  messagingSenderId: "97668331911",
  appId: "1:97668331911:web:97e5dd12bece61048f3b22"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

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
