/* Colour themes. Red always means money to collect and green always means money received,
   so only the brand colour and the top stripes change from country to country. */
(function (g) {
  'use strict';
  var T = {
    classic:     { name: 'Classic',      brand: '#2453D6', soft: '#EDF2FE', s1: '#2453D6', s3: '#2453D6' },
    gambia:      { name: 'Gambia',       brand: '#0C1C8C', soft: '#E7EAF8', s1: '#CE1126', s3: '#3A7728' },
    senegal:     { name: 'Senegal',      brand: '#00853F', soft: '#E3F4EA', s1: '#FDEF42', s3: '#E31B23' },
    guinea:      { name: 'Guinea',       brand: '#009460', soft: '#E1F5EC', s1: '#CE1126', s3: '#FCD116' },
    mali:        { name: 'Mali',         brand: '#0E8F2E', soft: '#E2F4E6', s1: '#FCD116', s3: '#CE1126' },
    ghana:       { name: 'Ghana',        brand: '#006B3F', soft: '#E0F1E8', s1: '#CE1126', s3: '#FCD116' },
    nigeria:     { name: 'Nigeria',      brand: '#008751', soft: '#E0F3EA', s1: '#BFE3D0', s3: '#BFE3D0' },
    sierraleone: { name: 'Sierra Leone', brand: '#168A2D', soft: '#E1F3E5', s1: '#0072C6', s3: '#1EB53A' }
  };
  function apply(id) {
    var t = T[id] || T.classic, st = document.documentElement.style;
    st.setProperty('--blue', t.brand); st.setProperty('--blue-soft', t.soft);
    st.setProperty('--s1', t.s1); st.setProperty('--s3', t.s3);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', '#FFFFFF');
    document.documentElement.setAttribute('data-theme', T[id] ? id : 'classic');
  }
  g.THEMES = { list: T, apply: apply, ids: Object.keys(T) };
})(window);
