/* واجهة المتجر */
(function () {
  'use strict';
  var HZ = window.HZ, $ = HZ.$, esc = HZ.esc, nl = HZ.nl, fmt = HZ.fmt, ic = HZ.ic, zoneOf = HZ.zoneOf;

  var S = {
    state: 'loading', zone: 'all', q: '', sort: 'default', page: 'store',
    settings: { freeFrom: 50, shipFee: 3, notice: '' },
    products: [], pmap: {}, videos: [], partners: [], loadedAt: 0,
    cart: {}, view: 'cart', coupon: null, couponInput: '', couponMsg: '',
    form: { name: '', phone: '', city: HZ.CITIES[0], address: '', note: '' },
    sending: false, formErr: '', done: null
  };
  try {
    var saved = JSON.parse(localStorage.getItem('hz-cart') || '{}');
    for (var k in saved) { if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && saved[k] > 0 && saved[k] % 1 === 0) S.cart[k] = Math.min(saved[k], 20); }
    var sf = JSON.parse(localStorage.getItem('hz-form') || 'null');
    if (sf && typeof sf === 'object') { ['name', 'phone', 'address'].forEach(function (f) { if (typeof sf[f] === 'string') S.form[f] = sf[f].slice(0, 200); }); if (HZ.CITIES.indexOf(sf.city) > -1) S.form.city = sf.city; }
  } catch (e) { /* */ }
  function persist() { try { localStorage.setItem('hz-cart', JSON.stringify(S.cart)); } catch (e) { /* */ } }
  function persistForm() { try { localStorage.setItem('hz-form', JSON.stringify({ name: S.form.name, phone: S.form.phone, city: S.form.city, address: S.form.address })); } catch (e) { /* */ } }

  /* ---------- الخريطة والتصنيفات ---------- */
  function renderMap() {
    $('#map').innerHTML = HZ.ZONES.map(function (z, i) {
      var n = S.products.filter(function (p) { return p.zone === z.id; }).length;
      return '<button class="tile z-' + z.id + '" role="listitem" data-act="go" data-id="' + z.id + '" aria-label="' + z.name + ' ZONE – ' + z.ar + '">' +
        '<span class="tcode">ZONE ' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="tmain">' + z.name + '<i>ZONE</i></span>' +
        '<span class="tfoot"><span>' + z.ar + (S.state === 'ok' ? ' · ' + HZ.countWord(n) : '') + '</span>' + ic(z.icon) + '</span></button>';
    }).join('');
  }
  function renderChips() {
    var h = '<button class="chip" data-act="chip" data-id="all" aria-pressed="' + (S.zone === 'all') + '"><i></i><span>كل الأقسام</span></button>';
    h += HZ.ZONES.map(function (z) {
      return '<button class="chip z-' + z.id + '" data-act="chip" data-id="' + z.id + '" aria-pressed="' + (S.zone === z.id) + '"><i></i><span class="en">' + z.name + ' ZONE</span></button>';
    }).join('');
    $('#chips').innerHTML = h;
  }

  /* ---------- المنتجات ---------- */
  function artHtml(p) { return p.img ? '<img class="photo" src="' + esc(p.img) + '" alt="' + esc(p.name) + '" loading="lazy">' : ic(p.icon); }
  function badgeHtml(p) {
    if (p.old > p.price && p.price > 0) return '<span class="badge num">خصم ' + Math.round((1 - p.price / p.old) * 100) + '%</span>';
    return p.tag ? '<span class="badge">' + esc(p.tag) + '</span>' : '';
  }
  function hasVideo(p) { return !!(p.vid || p.vurl); }
  function card(p) {
    var z = zoneOf(p.zone);
    return '<article class="card z-' + p.zone + '"><button class="art" data-act="detail" data-id="' + esc(p.id) + '" aria-label="تفاصيل ' + esc(p.name) + '">' + badgeHtml(p) + artHtml(p) +
      (hasVideo(p) ? '<span class="hasvid">▶ فيديو</span>' : '') + '<span class="zlabel">' + z.name + ' ZONE</span></button>' +
      '<div class="info"><h3><button class="linkname" data-act="detail" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button></h3><p class="spec">' + esc(p.spec) + '</p>' +
      '<div class="buy"><div class="price num"><b>' + fmt(p.price) + '</b><small>د.أ</small>' + (p.old > p.price ? '<s>' + fmt(p.old) + '</s>' : '') + '</div>' +
      '<button class="add" data-act="add" data-id="' + esc(p.id) + '">أضف للسلة</button></div></div></article>';
  }
  function renderProducts() {
    var list = $('#list');
    if (S.state === 'loading') { list.innerHTML = '<p class="empty">جارٍ تحميل المنتجات…</p>'; return; }
    if (S.state === 'error') { list.innerHTML = '<p class="empty">تعذّر تحميل المنتجات الآن.<br><button class="btn" data-act="reload">إعادة المحاولة</button></p>'; return; }
    if (!S.products.length) { list.innerHTML = '<p class="empty">المتجر قيد التجهيز، عُد بعد قليل.</p>'; return; }
    var q = S.q.trim().toLowerCase(), html = '', total = 0;
    HZ.ZONES.forEach(function (z, i) {
      if (S.zone !== 'all' && S.zone !== z.id) return;
      var items = S.products.filter(function (p) { return p.zone === z.id && (!q || (p.name + ' ' + p.spec + ' ' + z.name + ' ' + z.ar).toLowerCase().indexOf(q) > -1); });
      if (!items.length) return;
      if (S.sort === 'asc') items.sort(function (a, b) { return a.price - b.price; });
      if (S.sort === 'desc') items.sort(function (a, b) { return b.price - a.price; });
      total += items.length;
      html += '<section class="zone z-' + z.id + '" id="zone-' + z.id + '"><header class="zhead"><div><span class="zcode">ZONE ' + String(i + 1).padStart(2, '0') + ' · ' + z.ar + '</span><h2>' + z.name + ' <em>ZONE</em></h2></div>' +
        '<p class="zdesc">' + z.desc + '<b>' + HZ.countWord(items.length) + '</b></p></header><div class="grid">' + items.map(card).join('') + '</div></section>';
    });
    list.innerHTML = total ? html : '<p class="empty">لا توجد أجهزة مطابقة. جرّب كلمة أخرى أو اختر «كل الأقسام».</p>';
  }
  function playIcon() { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'; }
  function renderVideos() {
    $('#watch').hidden = !S.videos.length;
    $('#vlist').innerHTML = S.videos.map(function (v) {
      var p = S.pmap[v.product], box;
      if (v.file) box = '<video controls playsinline preload="metadata" src="' + esc(v.file) + '"></video>';
      else if (HZ.safeUrl(v.url)) box = '<a class="vlink" href="' + esc(v.url) + '" target="_blank" rel="noopener noreferrer">' + playIcon() + '<span>مشاهدة الفيديو</span></a>';
      else box = '<div class="vlink">' + playIcon() + '</div>';
      return '<article class="vcard"><div class="vbox">' + box + '</div><div class="info"><h3>' + esc(v.title) + '</h3>' + (v.desc ? '<p class="spec">' + nl(v.desc) + '</p>' : '') +
        (p ? '<div class="buy"><button class="add" data-act="detail" data-id="' + esc(p.id) + '">عرض المنتج: ' + esc(p.name) + '</button></div>' : '') + '</div></article>';
    }).join('');
  }
  function renderPartners() {
    var el = $('#partnerList');
    if (!S.partners.length) { el.innerHTML = '<p class="empty">لم تُضف شركاء النجاح بعد.</p>'; el.style.display = 'block'; return; }
    el.style.display = '';
    el.innerHTML = S.partners.map(function (p) {
      return '<article class="pcard"><div class="plogo">' + (p.logo ? '<img src="' + esc(p.logo) + '" alt="' + esc(p.name) + '" loading="lazy">' : '<span>' + esc(p.name.slice(0, 2)) + '</span>') + '</div>' +
        '<div class="info"><h3>' + esc(p.name) + '</h3>' + (p.desc ? '<p class="spec">' + nl(p.desc) + '</p>' : '') +
        (HZ.safeUrl(p.url) ? '<div class="buy"><a class="vl" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">زيارة الموقع</a></div>' : '') + '</div></article>';
    }).join('');
  }
  function renderNotice() {
    var n = $('#notice'), t = (S.settings.notice || '').trim();
    n.hidden = !t; n.textContent = t;
  }

  /* ---------- تفاصيل المنتج ---------- */
  function openDetail(id) {
    var p = S.pmap[id]; if (!p) return;
    var z = zoneOf(p.zone), vh = '';
    if (p.vid) vh = '<div class="pm-video"><video controls playsinline preload="metadata" src="' + esc(p.vid) + '"></video></div>';
    else if (HZ.safeUrl(p.vurl)) vh = '<p class="pm-desc"><a href="' + esc(p.vurl) + '" target="_blank" rel="noopener noreferrer">▶ شاهد فيديو شرح المنتج</a></p>';
    $('#pmTitle').textContent = p.name;
    $('#pmBody').innerHTML = '<div class="art pm-art z-' + p.zone + '">' + badgeHtml(p) + artHtml(p) + '<span class="zlabel">' + z.name + ' ZONE</span></div>' +
      (p.spec ? '<p class="spec">' + esc(p.spec) + '</p>' : '') + (p.desc ? '<p class="pm-desc">' + nl(p.desc) + '</p>' : '') + vh;
    $('#pmFoot').innerHTML = '<div class="price num" style="margin-inline-end:auto"><b>' + fmt(p.price) + '</b><small>د.أ</small>' + (p.old > p.price ? '<s>' + fmt(p.old) + '</s>' : '') + '</div>' +
      '<button class="btn" data-act="add" data-id="' + esc(p.id) + '">أضف للسلة</button>';
    $('#pModal').className = 'modal z-' + p.zone;
    openModal('#pModal');
  }
  var modalFocus = null;
  function openModal(sel) {
    modalFocus = document.activeElement;
    $('#mscrim').hidden = false; $(sel).hidden = false;
    var f = $(sel).querySelector('button.iconbtn'); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeModals() {
    $('#pModal').hidden = true; $('#mscrim').hidden = true;
    var v = $('#pmBody video'); if (v) v.pause();
    if (modalFocus && modalFocus.focus && document.contains(modalFocus)) modalFocus.focus();
  }

  /* ---------- السلة ---------- */
  function cleanCart() {
    if (S.state !== 'ok') return;
    var ch = false;
    Object.keys(S.cart).forEach(function (id) { if (!S.pmap[id]) { delete S.cart[id]; ch = true; } });
    if (ch) persist();
  }
  function entries() { return Object.keys(S.cart).filter(function (id) { return S.pmap[id]; }).map(function (id) { return { p: S.pmap[id], q: S.cart[id] }; }); }
  function cityOptions(sel) { return HZ.CITIES.map(function (c) { return '<option' + (c === sel ? ' selected' : '') + '>' + c + '</option>'; }).join(''); }

  function renderCart() {
    cleanCart();
    var list = entries(), t = HZ.price(list, S.settings, S.coupon);
    var body = $('#cartBody'), foot = $('#cartFoot'), title = $('#dTitle');
    var badge = $('#cartCount'); badge.textContent = t.count; badge.hidden = t.count === 0;
    if (t.count === 0 && S.view !== 'done') S.view = 'cart';
    var FREE = S.settings.freeFrom;

    if (S.view === 'cart') {
      title.textContent = 'سلتك';
      if (t.count === 0) {
        body.innerHTML = '<p class="empty">السلة فارغة.<br>اختر منطقة وأضف أول جهاز.</p>';
        foot.innerHTML = '<button class="btn" data-act="browse">تصفّح الأقسام</button>'; return;
      }
      var after = t.afterC / 100, pct = FREE > 0 ? Math.min(100, after / FREE * 100) : 100;
      var msg = after >= FREE ? 'طلبك يحصل على توصيل مجاني.' : 'أضف <span class="num">' + fmt(FREE - after) + '</span> د.أ للحصول على توصيل مجاني.';
      body.innerHTML = '<p class="ship">' + msg + '<span class="bar"><i style="width:' + pct + '%"></i></span></p><ul class="lines">' +
        list.map(function (x) {
          var p = x.p, z = zoneOf(p.zone);
          return '<li class="line z-' + p.zone + '"><div class="lart">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : ic(p.icon)) + '</div>' +
            '<div class="lmain"><b>' + esc(p.name) + '</b><span class="lz">' + z.name + ' ZONE</span>' +
            '<div class="qty"><button data-act="dec" data-id="' + esc(p.id) + '" aria-label="إنقاص الكمية">−</button><span class="num">' + x.q + '</span><button data-act="inc" data-id="' + esc(p.id) + '" aria-label="زيادة الكمية">+</button></div></div>' +
            '<div class="lprice num">' + fmt(p.price * x.q) + ' د.أ<button class="rm" data-act="rm" data-id="' + esc(p.id) + '">حذف</button></div></li>';
        }).join('') + '</ul>';
      var cmsg = t.cerr ? '<p class="cmsg bad">' + esc(t.cerr) + '</p>' : (S.couponMsg ? '<p class="cmsg bad">' + esc(S.couponMsg) + '</p>' : (t.disc > 0 ? '<p class="cmsg good">تم تطبيق الكود ' + esc(S.coupon.code) + '.</p>' : '<p class="cmsg"></p>'));
      foot.innerHTML = '<div class="coupon"><input class="field" id="couponIn" placeholder="كود الخصم" aria-label="كود الخصم" autocomplete="off" maxlength="24"><button class="btn sm ghost" data-act="couponApply">تطبيق</button>' + (S.coupon ? '<button class="btn sm ghost" data-act="couponRemove">إزالة</button>' : '') + '</div>' + cmsg +
        '<div class="sum"><span>المجموع الفرعي</span><span class="num">' + fmt(t.sub) + ' د.أ</span></div>' +
        (t.disc > 0 ? '<div class="sum disc"><span>الخصم</span><span class="num">-' + fmt(t.disc) + ' د.أ</span></div>' : '') +
        '<div class="sum"><span>التوصيل</span><span class="num">' + (t.ship ? fmt(t.ship) + ' د.أ' : 'مجاني') + '</span></div>' +
        '<div class="sum t"><span>الإجمالي</span><span class="num">' + fmt(t.total) + ' د.أ</span></div>' +
        '<button class="btn" data-act="checkout">إتمام الطلب</button>';
      $('#couponIn').value = S.couponInput;
    }
    else if (S.view === 'form') {
      title.textContent = 'بيانات التوصيل';
      body.innerHTML = '<form class="form" id="orderForm" novalidate>' +
        '<label for="fName">الاسم الكامل</label><input class="field" id="fName" autocomplete="name" maxlength="80">' +
        '<label for="fPhone">رقم الهاتف</label><input class="field" id="fPhone" inputmode="tel" dir="ltr" autocomplete="tel" maxlength="20" placeholder="07X XXX XXXX">' +
        '<label for="fCity">المدينة</label><select class="field" id="fCity">' + cityOptions(S.form.city) + '</select>' +
        '<label for="fAddr">العنوان (المنطقة، الشارع، رقم المبنى)</label><input class="field" id="fAddr" autocomplete="street-address" maxlength="200">' +
        '<label for="fNote">ملاحظات للتوصيل (اختياري)</label><textarea class="field" id="fNote" rows="2" maxlength="300"></textarea>' +
        '<div class="hp" aria-hidden="true"><label>الموقع<input id="fWeb" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<p class="err" id="formErr" role="alert"></p>' +
        '<p class="note">الدفع عند الاستلام. سنتصل بك لتأكيد الطلب.</p></form>';
      $('#fName').value = S.form.name; $('#fPhone').value = S.form.phone; $('#fAddr').value = S.form.address; $('#fNote').value = S.form.note;
      $('#formErr').textContent = S.formErr;
      foot.innerHTML = '<div class="sum t"><span>الإجمالي</span><span class="num">' + fmt(t.total) + ' د.أ</span></div>' +
        '<button class="btn" type="submit" form="orderForm" id="sendBtn"' + (S.sending ? ' disabled' : '') + '>' + (S.sending ? 'جارٍ إرسال الطلب…' : 'تأكيد الطلب') + '</button>' +
        '<button class="link" data-act="back">العودة إلى السلة</button>';
    }
    else {
      title.textContent = 'تم استلام طلبك';
      var d = S.done || {};
      body.innerHTML = '<div class="okbox"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l3 3 5-6"/></svg>' +
        '<h3>شكرًا ' + esc(d.name || '') + '</h3><p>رقم طلبك <b class="num" dir="ltr">#' + esc(d.number) + '</b></p>' +
        '<p class="spec">الإجمالي <b class="num">' + fmt(d.total) + ' د.أ</b> يُدفع عند الاستلام.<br>سنتصل بك على الرقم <bdi dir="ltr">' + esc(d.phone) + '</bdi> لتأكيد الطلب وموعد التوصيل.</p></div>';
      foot.innerHTML = (d.wa ? '<a class="btn" href="' + esc(d.wa) + '" target="_blank" rel="noopener">أرسل تفاصيل الطلب عبر واتساب</a>' : '') +
        '<button class="btn ghost" data-act="new">متابعة التسوق</button>';
    }
  }

  var drawer = $('#drawer'), scrim = $('#scrim'), lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement; if (S.view !== 'done') S.view = 'cart'; renderCart();
    scrim.hidden = false; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); drawer.inert = false;
    setTimeout(function () { $('#closeBtn').focus(); }, 30);
  }
  function closeCart() {
    drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); drawer.inert = true; scrim.hidden = true;
    if (S.view === 'done') { S.view = 'cart'; S.done = null; renderCart(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  drawer.inert = true;

  function changeQty(id, d) {
    var n = (S.cart[id] || 0) + d;
    if (n <= 0) delete S.cart[id]; else S.cart[id] = Math.min(n, 20);
    persist(); renderCart();
  }

  /* ---------- الصفحات ---------- */
  function showPage(p) {
    S.page = p;
    $('#store').hidden = p !== 'store'; $('#partners').hidden = p !== 'partners';
    if (p === 'partners') renderPartners();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function routeFromHash() { showPage(location.hash === '#/partners' ? 'partners' : 'store'); }
  window.addEventListener('hashchange', routeFromHash);

  function scrollToEl(sel) { var el = $(sel); if (el) el.scrollIntoView({ behavior: HZ.reduced() ? 'auto' : 'smooth', block: 'start' }); }

  /* ---------- إرسال الطلب ---------- */
  function submitOrder() {
    var f = S.form;
    function stop(m, sel) { S.formErr = m; $('#formErr').textContent = m; if (sel) $(sel).focus(); }
    if (S.sending) return;
    if (f.name.trim().length < 3) return stop('اكتب اسمك الكامل.', '#fName');
    if (f.phone.replace(/\D/g, '').length < 9) return stop('اكتب رقم هاتف صحيحًا من 9 أرقام على الأقل.', '#fPhone');
    if (f.address.trim().length < 5) return stop('اكتب عنوان التوصيل بالتفصيل.', '#fAddr');
    var list = entries(); if (!list.length) return stop('السلة فارغة.');
    S.formErr = ''; S.sending = true; persistForm(); renderCart();
    HZ.api('POST', '/api/orders', {
      name: f.name, phone: f.phone, city: f.city, address: f.address, note: f.note, website: ($('#fWeb') || {}).value || '',
      items: list.map(function (x) { return { id: x.p.id, qty: x.q }; }), code: S.coupon ? S.coupon.code : ''
    }).then(function (r) {
      S.sending = false; S.done = { number: r.number, total: r.total, name: f.name.trim().split(' ')[0], phone: f.phone.trim() };
      if (S.settings.whatsapp) {
        S.done.wa = HZ.waLink(S.settings.whatsapp, 'طلب جديد #' + r.number + ' من HomeZone\n' +
          list.map(function (x) { return x.q + ' × ' + x.p.name; }).join('\n') +
          '\nالإجمالي: ' + fmt(r.total) + ' د.أ\nالاسم: ' + f.name.trim() + '\nالهاتف: ' + f.phone.trim() +
          '\nالعنوان: ' + f.city + ' - ' + f.address.trim());
      }
      S.cart = {}; S.coupon = null; S.couponMsg = ''; S.couponInput = ''; f.note = ''; persist();
      S.view = 'done'; renderCart();
    }).catch(function (e) {
      S.sending = false; S.formErr = e.message;
      if (e.data && e.data.removed) { delete S.cart[e.data.removed]; persist(); loadStore(true); }
      if (/كود/.test(e.message)) { S.coupon = null; }
      S.view = 'form'; renderCart();
    });
  }

  /* ---------- الإجراءات ---------- */
  var ACTIONS = {
    top: function () { if (location.hash) { location.hash = ''; history.replaceState(null, '', location.pathname); } showPage('store'); },
    partnersPage: function () { location.hash = '#/partners'; },
    catalog: function () { scrollToEl('#catalog'); },
    reload: function () { S.state = 'loading'; renderProducts(); loadStore(); },
    go: function (el, id) { S.zone = id; renderChips(); renderProducts(); scrollToEl('#catalog'); },
    chip: function (el, id) { S.zone = id; renderChips(); renderProducts(); },
    detail: function (el, id) { openDetail(id); },
    closeModals: function () { closeModals(); },
    add: function (el, id) {
      var p = S.pmap[id]; if (!p) return;
      S.cart[id] = Math.min((S.cart[id] || 0) + 1, 20); persist(); renderCart();
      if (el.classList.contains('add')) { el.classList.add('ok'); var old = el.textContent; el.textContent = 'تمت الإضافة'; setTimeout(function () { el.classList.remove('ok'); el.textContent = old; }, 1100); }
      var cb = $('#cartBtn'); cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump');
      HZ.toast('أُضيف «' + p.name + '» إلى السلة');
    },
    inc: function (el, id) { changeQty(id, 1); },
    dec: function (el, id) { changeQty(id, -1); },
    rm: function (el, id) { delete S.cart[id]; persist(); renderCart(); },
    open: function () { openCart(); },
    close: function () { closeCart(); },
    browse: function () { closeCart(); scrollToEl('#catalog'); },
    checkout: function () { S.view = 'form'; S.formErr = ''; renderCart(); },
    back: function () { S.view = 'cart'; renderCart(); },
    new: function () { closeCart(); scrollToEl('#catalog'); },
    theme: function () { HZ.toggleTheme(); },
    couponApply: function () {
      var code = S.couponInput.trim();
      if (!code) { S.couponMsg = 'اكتب كود الخصم.'; return renderCart(); }
      HZ.api('POST', '/api/coupon', { code: code }).then(function (c) {
        S.coupon = c; S.couponMsg = ''; S.couponInput = ''; renderCart();
      }).catch(function (e) { S.couponMsg = e.status === 404 ? 'الكود غير صحيح.' : e.message; renderCart(); });
    },
    couponRemove: function () { S.coupon = null; S.couponMsg = ''; renderCart(); }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var fn = ACTIONS[el.getAttribute('data-act')]; if (!fn) return;
    fn(el, el.getAttribute('data-id'));
  });
  document.addEventListener('input', function (e) {
    var id = e.target.id;
    if (id === 'q') { S.q = e.target.value; renderProducts(); }
    else if (id === 'couponIn') S.couponInput = e.target.value;
    else if (id === 'fName') S.form.name = e.target.value;
    else if (id === 'fPhone') S.form.phone = e.target.value;
    else if (id === 'fAddr') S.form.address = e.target.value;
    else if (id === 'fNote') S.form.note = e.target.value;
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'sort') { S.sort = e.target.value; renderProducts(); }
    else if (e.target.id === 'fCity') S.form.city = e.target.value;
  });
  document.addEventListener('submit', function (e) { e.preventDefault(); if (e.target.id === 'orderForm') submitOrder(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('#mscrim').hidden) closeModals(); else if (drawer.classList.contains('open')) closeCart();
  });

  /* ---------- تحميل البيانات ---------- */
  function renderAll() { renderMap(); renderChips(); renderProducts(); renderVideos(); renderNotice(); renderCart(); if (S.page === 'partners') renderPartners(); }
  function loadStore(quiet) {
    return HZ.api('GET', '/api/store').then(function (d) {
      S.settings = d.settings; S.products = d.products; S.videos = d.videos; S.partners = d.partners;
      S.pmap = {}; S.products.forEach(function (p) { S.pmap[p.id] = p; });
      S.state = 'ok'; S.loadedAt = Date.now(); renderAll();
    }).catch(function () { if (!quiet) { S.state = 'error'; renderAll(); } });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.state === 'ok' && Date.now() - S.loadedAt > 120000 && $('#mscrim').hidden && !drawer.classList.contains('open')) loadStore(true);
  });

  renderAll(); routeFromHash(); loadStore();
})();
