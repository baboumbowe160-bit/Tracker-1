/* Countries: dial code, currency and the colour theme that suits each one.
   Format: [ISO, Name, Dial code, Currency symbol, Currency code, Theme id] */
(function (g) {
  'use strict';
  var RAW = [
    ['GM', 'Gambia', '220', 'D', 'GMD', 'gambia'],
    ['SN', 'Senegal', '221', 'FCFA', 'XOF', 'senegal'],
    ['GN', 'Guinea', '224', 'GNF', 'GNF', 'guinea'],
    ['ML', 'Mali', '223', 'FCFA', 'XOF', 'mali'],
    ['GW', 'Guinea-Bissau', '245', 'FCFA', 'XOF', 'classic'],
    ['SL', 'Sierra Leone', '232', 'Le', 'SLE', 'sierraleone'],
    ['LR', 'Liberia', '231', 'L$', 'LRD', 'classic'],
    ['GH', 'Ghana', '233', 'GH₵', 'GHS', 'ghana'],
    ['NG', 'Nigeria', '234', '₦', 'NGN', 'nigeria'],
    ['CI', "Côte d'Ivoire", '225', 'FCFA', 'XOF', 'classic'],
    ['BF', 'Burkina Faso', '226', 'FCFA', 'XOF', 'classic'],
    ['TG', 'Togo', '228', 'FCFA', 'XOF', 'classic'],
    ['BJ', 'Benin', '229', 'FCFA', 'XOF', 'classic'],
    ['NE', 'Niger', '227', 'FCFA', 'XOF', 'classic'],
    ['MR', 'Mauritania', '222', 'UM', 'MRU', 'classic'],
    ['CV', 'Cabo Verde', '238', 'CVE', 'CVE', 'classic'],
    ['MA', 'Morocco', '212', 'MAD', 'MAD', 'classic'],
    ['DZ', 'Algeria', '213', 'DA', 'DZD', 'classic'],
    ['TN', 'Tunisia', '216', 'DT', 'TND', 'classic'],
    ['EG', 'Egypt', '20', 'E£', 'EGP', 'classic'],
    ['CM', 'Cameroon', '237', 'FCFA', 'XAF', 'classic'],
    ['CD', 'DR Congo', '243', 'FC', 'CDF', 'classic'],
    ['CG', 'Congo', '242', 'FCFA', 'XAF', 'classic'],
    ['GA', 'Gabon', '241', 'FCFA', 'XAF', 'classic'],
    ['KE', 'Kenya', '254', 'KSh', 'KES', 'classic'],
    ['UG', 'Uganda', '256', 'USh', 'UGX', 'classic'],
    ['TZ', 'Tanzania', '255', 'TSh', 'TZS', 'classic'],
    ['RW', 'Rwanda', '250', 'FRw', 'RWF', 'classic'],
    ['ET', 'Ethiopia', '251', 'Br', 'ETB', 'classic'],
    ['ZA', 'South Africa', '27', 'R', 'ZAR', 'classic'],
    ['US', 'United States', '1', '$', 'USD', 'classic'],
    ['CA', 'Canada', '1', 'CA$', 'CAD', 'classic'],
    ['GB', 'United Kingdom', '44', '£', 'GBP', 'classic'],
    ['FR', 'France', '33', '€', 'EUR', 'classic'],
    ['DE', 'Germany', '49', '€', 'EUR', 'classic'],
    ['ES', 'Spain', '34', '€', 'EUR', 'classic'],
    ['IT', 'Italy', '39', '€', 'EUR', 'classic'],
    ['NL', 'Netherlands', '31', '€', 'EUR', 'classic'],
    ['BE', 'Belgium', '32', '€', 'EUR', 'classic'],
    ['PT', 'Portugal', '351', '€', 'EUR', 'classic'],
    ['TR', 'Türkiye', '90', '₺', 'TRY', 'classic'],
    ['SA', 'Saudi Arabia', '966', 'SAR', 'SAR', 'classic'],
    ['AE', 'United Arab Emirates', '971', 'AED', 'AED', 'classic'],
    ['IN', 'India', '91', '₹', 'INR', 'classic'],
    ['PK', 'Pakistan', '92', 'Rs', 'PKR', 'classic'],
    ['CN', 'China', '86', '¥', 'CNY', 'classic'],
    ['BR', 'Brazil', '55', 'R$', 'BRL', 'classic'],
    ['AU', 'Australia', '61', 'A$', 'AUD', 'classic']
  ];
  var list = RAW.map(function (r) { return { iso: r[0], name: r[1], dial: r[2], cur: r[3], code: r[4], theme: r[5] }; });
  var byIso = {}; list.forEach(function (c) { byIso[c.iso] = c; });
  // Longest dial code first, so +2201... is never mistaken for +22...
  var byDial = list.slice().sort(function (a, b) { return b.dial.length - a.dial.length; });
  g.COUNTRIES = { list: list, byIso: byIso, byDial: byDial,
    get: function (iso) { return byIso[iso] || null; },
    fromDigits: function (digits) { for (var i = 0; i < byDial.length; i++) if (digits.indexOf(byDial[i].dial) === 0) return byDial[i]; return null; } };
})(typeof window !== 'undefined' ? window : globalThis);
