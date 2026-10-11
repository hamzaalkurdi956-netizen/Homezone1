/* أدوات مشتركة بين المتجر ولوحة الإدارة */
(function () {
  'use strict';
  var HZ = window.HZ = {};

  HZ.ICONS = {
    espresso: '<rect x="18" y="12" width="64" height="62" rx="8"/><rect x="28" y="22" width="44" height="12" rx="3"/><path d="M50 34v10"/><path d="M38 60h24v14H38z"/><path d="M12 86h76"/>',
    grinder: '<path d="M34 12h32l-4 22H38z"/><rect x="30" y="34" width="40" height="48" rx="6"/><circle cx="50" cy="58" r="8"/><path d="M26 90h48"/>',
    pot: '<path d="M34 22h32l-8 50H42z"/><path d="M38 22c0-7 24-7 24 0"/><path d="M66 36c11 0 11 20 0 20"/><path d="M30 84h40"/>',
    kettle: '<path d="M30 30h40l6 48H24z"/><path d="M36 30c0-11 28-11 28 0"/><path d="M76 42c12 0 12 22 0 22"/><path d="M22 78h56v8H22z"/>',
    blender: '<path d="M32 10h36l-6 46H38z"/><path d="M28 10h44"/><rect x="34" y="56" width="32" height="28" rx="5"/><circle cx="50" cy="70" r="4"/><path d="M28 92h44"/>',
    mixer: '<path d="M28 86h50"/><path d="M34 86V42c0-14 8-24 22-24h22v14H60c-6 0-10 4-10 10v44"/><path d="M62 32v22"/><path d="M52 54h22l-4 12H56z"/>',
    processor: '<rect x="24" y="48" width="52" height="38" rx="6"/><path d="M30 48V24h40v24"/><path d="M50 12v12"/><circle cx="50" cy="67" r="6"/>',
    airfryer: '<rect x="22" y="12" width="56" height="68" rx="14"/><rect x="30" y="22" width="40" height="32" rx="8"/><path d="M34 66h32"/><circle cx="50" cy="38" r="6"/><path d="M26 90h48"/>',
    toaster: '<rect x="14" y="36" width="72" height="44" rx="12"/><path d="M30 36v-8h40v8"/><path d="M32 48h36"/><path d="M80 52h6"/>',
    waffle: '<rect x="16" y="36" width="68" height="32" rx="6"/><path d="M16 52h68"/><path d="M36 36v32M50 36v32M64 36v32"/><path d="M24 78h52"/>',
    press: '<path d="M14 52l72-16v22L14 74z"/><path d="M14 74v10h72V58"/><path d="M86 36l4-6"/>',
    vacuum: '<path d="M12 40h42l16-14h18v34H70L54 74H12z"/><path d="M70 26v34"/>',
    steamiron: '<path d="M12 72c0-26 16-42 36-42h20c14 0 20 12 20 42z"/><path d="M12 72h76"/><path d="M40 30c0-11 28-11 28 0"/>',
    hairdryer: '<path d="M14 38c0-10 8-16 18-16h32c10 0 16 6 16 14s-6 14-16 14H32c-10 0-18-6-18-12z"/><path d="M50 50l-6 36h14l6-36"/><path d="M86 30v12"/>',
    shaver: '<rect x="34" y="10" width="32" height="80" rx="14"/><path d="M42 24h16M42 32h16"/><circle cx="50" cy="68" r="6"/>',
    straightener: '<rect x="32" y="10" width="14" height="66" rx="6"/><rect x="54" y="10" width="14" height="66" rx="6"/><path d="M34 76h32l-4 14H38z"/>',
    fan: '<circle cx="50" cy="40" r="28"/><circle cx="50" cy="40" r="4"/><path d="M50 36c-10-16 6-20 8-8M54 42c16 6 10 20-2 14M46 42c-6 16-22 8-14-4"/><path d="M50 68v20M34 92h32"/>',
    heater: '<rect x="22" y="12" width="56" height="72" rx="10"/><path d="M34 26v44M46 26v44M58 26v44M70 26v44"/><path d="M30 92h40"/>',
    purifier: '<rect x="26" y="10" width="48" height="80" rx="10"/><path d="M36 28h28M36 38h28M36 48h28"/><circle cx="50" cy="72" r="6"/>'
  };
  HZ.ICON_LABELS = { espresso: 'ماكينة إسبريسو', grinder: 'مطحنة', pot: 'إبريق / محضّرة', kettle: 'غلاية', blender: 'خلاط', mixer: 'عجانة', processor: 'محضّرة طعام', airfryer: 'قلاية هوائية', toaster: 'محمصة', waffle: 'وافل', press: 'ساندويتش', vacuum: 'مكنسة', steamiron: 'مكواة بخار', hairdryer: 'مجفف شعر', shaver: 'ماكينة حلاقة', straightener: 'مكواة شعر', fan: 'مروحة', heater: 'دفاية', purifier: 'منقّي هواء' };

  HZ.ZONES = [
    { id: 'coffee', name: 'COFFEE', ar: 'القهوة', desc: 'إسبريسو ومطاحن وقهوة تركية', icon: 'espresso' },
    { id: 'tea', name: 'TEA', ar: 'الشاي', desc: 'غلايات ومحضّرات شاي', icon: 'kettle' },
    { id: 'kitchen', name: 'KITCHEN', ar: 'المطبخ', desc: 'خلاطات وعجانات ومحضّرات طعام', icon: 'blender' },
    { id: 'fry', name: 'FRY', ar: 'القلي الهوائي', desc: 'قلايات هوائية بكل الأحجام', icon: 'airfryer' },
    { id: 'toast', name: 'TOAST', ar: 'الفطور', desc: 'محامص ووافل وساندويتش', icon: 'toaster' },
    { id: 'clean', name: 'CLEAN', ar: 'التنظيف', desc: 'مكانس يدوية ومكاوي بخار', icon: 'vacuum' },
    { id: 'care', name: 'CARE', ar: 'العناية', desc: 'مجففات شعر وماكينات حلاقة', icon: 'hairdryer' },
    { id: 'air', name: 'AIR', ar: 'الهواء', desc: 'مراوح ودفايات ومنقّيات', icon: 'fan' }
  ];
  HZ.CITIES = ['عمّان', 'إربد', 'الزرقاء', 'العقبة', 'السلط', 'مادبا', 'جرش', 'أخرى'];
  HZ.STATUS = { new: 'جديد', confirmed: 'مؤكد', delivered: 'تم التسليم', cancelled: 'ملغي' };

  var $ = HZ.$ = function (s) { return document.querySelector(s); };
  HZ.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  HZ.nl = function (s) { return HZ.esc(s).replace(/\n/g, '<br>'); };
  HZ.num = function (v, d) { var n = parseFloat(v); return isFinite(n) ? n : (d || 0); };
  HZ.fmt = function (n) { return HZ.num(n).toFixed(2); };
  HZ.zoneOf = function (id) { for (var i = 0; i < HZ.ZONES.length; i++) { if (HZ.ZONES[i].id === id) return HZ.ZONES[i]; } return HZ.ZONES[0]; };
  HZ.zoneIdx = function (id) { for (var i = 0; i < HZ.ZONES.length; i++) { if (HZ.ZONES[i].id === id) return i; } return 0; };
  HZ.countWord = function (n) { return n === 1 ? 'جهاز واحد' : n === 2 ? 'جهازان' : n <= 10 ? n + ' أجهزة' : n + ' جهازًا'; };
  HZ.safeUrl = function (u) { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; };
  HZ.waNum = function (phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    else if (/^07\d{8}$/.test(d)) d = '962' + d.slice(1);
    return d;
  };
  HZ.waLink = function (num, text) { return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text); };
  HZ.fdate = function (ms) {
    try { return new Date(ms).toLocaleString('ar-JO-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
  };
  HZ.reduced = function () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; };
  HZ.ic = function (n) {
    return '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (HZ.ICONS[n] || HZ.ICONS.processor) + '</svg>';
  };
  HZ.isDark = function () {
    var t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };
  HZ.toggleTheme = function () { document.documentElement.setAttribute('data-theme', HZ.isDark() ? 'light' : 'dark'); };
  HZ.fillSelect = function (sel, items, cur) {
    sel.innerHTML = items.map(function (i) { return '<option value="' + HZ.esc(i[0]) + '">' + HZ.esc(i[1]) + '</option>'; }).join('');
    if (cur != null) sel.value = cur;
  };

  /* حساب الأسعار بالقروش لتفادي أخطاء الفاصلة العشرية. الخادم يعيد الحساب عند الطلب. */
  HZ.price = function (entries, settings, coupon) {
    var subC = 0, count = 0;
    entries.forEach(function (e) { subC += Math.round(e.p.price * 100) * e.q; count += e.q; });
    var discC = 0, cerr = '';
    if (coupon) {
      if (subC < Math.round(coupon.min * 100)) cerr = 'الحد الأدنى للطلب ' + HZ.fmt(coupon.min) + ' د.أ';
      else {
        discC = coupon.type === 'percent' ? Math.round(subC * coupon.amount / 100) : Math.round(coupon.amount * 100);
        discC = Math.min(discC, subC);
      }
    }
    var afterC = subC - discC;
    var shipC = subC === 0 ? 0 : (afterC >= Math.round(settings.freeFrom * 100) ? 0 : Math.round(settings.shipFee * 100));
    return { sub: subC / 100, count: count, disc: discC / 100, ship: shipC / 100, total: (afterC + shipC) / 100, cerr: cerr, afterC: afterC };
  };

  /* ---------- الاتصال بالخادم ---------- */
  function fail(res, data) {
    var e = new Error((data && data.error) || 'تعذّر تنفيذ العملية');
    e.status = res ? res.status : 0; e.data = data || {};
    return e;
  }
  HZ.api = function (method, url, body) {
    var opt = { method: method, credentials: 'same-origin', headers: { 'X-HZ': '1' } };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw fail(res, data);
        return data;
      });
    }, function () { throw fail(null, { error: 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.' }); });
  };
  HZ.upload = function (file, kind, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open('POST', '/api/admin/upload?kind=' + (kind === 'video' ? 'video' : 'image'));
      x.setRequestHeader('X-HZ', '1');
      x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      if (x.upload && onProgress) x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      x.onload = function () {
        var data = {}; try { data = JSON.parse(x.responseText); } catch (e) { /* */ }
        if (x.status >= 200 && x.status < 300) resolve(data); else reject(fail({ status: x.status }, data));
      };
      x.onerror = function () { reject(fail(null, { error: 'انقطع الاتصال أثناء الرفع' })); };
      x.send(file);
    });
  };

  var toastTimer;
  HZ.toast = function (msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  };
  HZ.copyText = function (text, okMsg, field) {
    var fb = function () { if (field) { field.focus(); field.select(); } HZ.toast('حدّد النص وانسخه يدويًا'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { HZ.toast(okMsg); }, fb); else fb();
  };
  HZ.armed = function (el) {
    if (el.getAttribute('data-armed') === '1') return true;
    var old = el.textContent; el.setAttribute('data-armed', '1'); el.textContent = 'تأكيد الحذف';
    setTimeout(function () { if (document.contains(el)) { el.removeAttribute('data-armed'); el.textContent = old; } }, 3500);
    return false;
  };
})();
