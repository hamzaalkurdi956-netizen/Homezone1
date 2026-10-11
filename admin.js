/* لوحة الإدارة */
(function () {
  'use strict';
  var HZ = window.HZ, $ = HZ.$, esc = HZ.esc, nl = HZ.nl, fmt = HZ.fmt, ic = HZ.ic, zoneOf = HZ.zoneOf, api = HZ.api, toast = HZ.toast;

  var TABS = ['orders', 'products', 'coupons', 'videos', 'partners', 'settings'];
  var S = {
    tab: 'orders', ofilter: 'all', orders: [], products: [], coupons: [], videos: [], partners: [], settings: { freeFrom: 50, shipFee: 3, notice: '' },
    pSearch: '', pZone: 'all', editId: null, editing: null, editPid: null, editingP: null, M: { lines: {} }, newCount: -1, busy: false
  };
  var BASE_TITLE = 'لوحة إدارة HomeZone';

  function pad(id) { return String(id).padStart(5, '0'); }
  function sortedProducts(list) { return list.slice().sort(function (a, b) { return HZ.zoneIdx(a.zone) - HZ.zoneIdx(b.zone) || a.sort - b.sort || a.name.localeCompare(b.name, 'ar'); }); }

  /* ---------- الدخول والخروج ---------- */
  function showLogin(msg) {
    $('#admin').hidden = true; $('#login').hidden = false; closeModals();
    $('#lErr').textContent = msg || ''; $('#lPass').value = ''; $('#lBtn').disabled = false;
    setTimeout(function () { $('#lPass').focus(); }, 30);
    document.title = BASE_TITLE;
  }
  function showPanel() {
    $('#login').hidden = true; $('#admin').hidden = false;
    HZ.fillSelect($('#pZone'), [['all', 'كل الأقسام']].concat(HZ.ZONES.map(function (z) { return [z.id, z.name + ' ZONE – ' + z.ar]; })));
    HZ.fillSelect($('#eZone'), HZ.ZONES.map(function (z) { return [z.id, z.name + ' ZONE – ' + z.ar]; }));
    HZ.fillSelect($('#eIcon'), Object.keys(HZ.ICONS).map(function (k) { return [k, HZ.ICON_LABELS[k] || k]; }));
    HZ.fillSelect($('#oCity'), HZ.CITIES.map(function (c) { return [c, c]; }));
    setTab(S.tab);
    pollCount();
  }
  function onErr(e) {
    if (e && e.status === 401) { showLogin('انتهت الجلسة. سجّل الدخول من جديد.'); return; }
    toast(e && e.message ? e.message : 'تعذّر تنفيذ العملية');
  }

  /* ---------- التبويبات ---------- */
  function setTab(t) {
    S.tab = t;
    TABS.forEach(function (n) { $('#pane-' + n).hidden = n !== t; });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-id') === t)); });
    loadTab(t);
  }
  function loadTab(t) {
    var p;
    if (t === 'orders') p = api('GET', '/api/admin/orders').then(function (d) { S.orders = d; renderOrders(); });
    else if (t === 'products') p = api('GET', '/api/admin/products').then(function (d) { S.products = d; renderProducts(); });
    else if (t === 'coupons') p = api('GET', '/api/admin/coupons').then(function (d) { S.coupons = d; renderCoupons(); });
    else if (t === 'videos') p = Promise.all([api('GET', '/api/admin/videos'), api('GET', '/api/admin/products')]).then(function (r) { S.videos = r[0]; S.products = r[1]; renderVideos(); });
    else if (t === 'partners') p = api('GET', '/api/admin/partners').then(function (d) { S.partners = d; renderPartners(); });
    else if (t === 'settings') p = api('GET', '/api/admin/settings').then(function (d) { S.settings = d; $('#sFree').value = d.freeFrom; $('#sShip').value = d.shipFee; $('#sNotice').value = d.notice; $('#sWa').value = d.whatsapp; });
    return p ? p.catch(onErr) : Promise.resolve();
  }

  /* ---------- الطلبات ---------- */
  function renderOrders() {
    var counts = { all: S.orders.length, new: 0, confirmed: 0, delivered: 0, cancelled: 0 };
    S.orders.forEach(function (o) { counts[o.status]++; });
    $('#ostats').innerHTML = ['all', 'new', 'confirmed', 'delivered', 'cancelled'].map(function (k) {
      return '<button class="chip' + (k === 'all' ? '' : ' st-' + k) + '" data-act="ofilter" data-id="' + k + '" aria-pressed="' + (S.ofilter === k) + '"><i style="background:var(--sc,var(--ink))"></i><span>' + (k === 'all' ? 'كل الطلبات' : HZ.STATUS[k]) + ' <span class="num">(' + counts[k] + ')</span></span></button>';
    }).join('');
    var list = S.orders.filter(function (o) { return S.ofilter === 'all' || o.status === S.ofilter; });
    if (!list.length) { $('#ordList').innerHTML = '<p class="empty">' + (S.orders.length ? 'لا توجد طلبات بهذه الحالة.' : 'لا توجد طلبات بعد. ستظهر هنا طلبات الزبائن فور وصولها.') + '</p>'; return; }
    $('#ordList').innerHTML = list.map(function (o) {
      return '<article class="ocard st-' + o.status + '"><div class="ohead"><div><b>#' + pad(o.id) + '</b> <span class="pill">' + HZ.STATUS[o.status] + '</span>' + (o.source === 'manual' ? ' <span class="off">يدوي</span>' : '') + '</div><time>' + esc(HZ.fdate(o.createdAt)) + '</time></div>' +
        '<div class="ocust"><div><span>اسم العميل</span><b>' + esc(o.name) + '</b></div>' +
        '<div><span>رقم الهاتف</span><b class="ph"><bdi>' + esc(o.phone) + '</bdi><a class="btn sm ghost" href="tel:' + esc(o.phone.replace(/[^\d+]/g, '')) + '">اتصال</a><a class="btn sm ghost" target="_blank" rel="noopener" href="' + esc(HZ.waLink(HZ.waNum(o.phone), 'مرحبًا ' + o.name + '، معك HomeZone بخصوص طلبك #' + pad(o.id) + ' بقيمة ' + fmt(o.total) + ' د.أ. نود تأكيد الطلب وموعد التوصيل.')) + '">واتساب</a><button class="btn sm ghost" data-act="copyPhone" data-val="' + esc(o.phone) + '" aria-label="نسخ رقم الهاتف">نسخ</button></b></div>' +
        '<div><span>العنوان</span><b>' + esc(o.city) + (o.address ? ' – ' + esc(o.address) : '') + '</b></div></div>' +
        '<ul class="oitems">' + o.items.map(function (x) { return '<li><span>' + x.qty + ' × ' + esc(x.name) + '</span><span class="num">' + fmt(x.price * x.qty) + ' د.أ</span></li>'; }).join('') + '</ul>' +
        (o.note ? '<p class="onote">ملاحظات: ' + esc(o.note) + '</p>' : '') +
        '<div class="ofoot"><div><span class="tot num">' + fmt(o.total) + ' د.أ</span>' + (o.discount > 0 ? '<span class="note"> (خصم ' + fmt(o.discount) + ' بالكود ' + esc(o.code) + ')</span>' : '') + '</div>' +
        '<div class="acts"><select data-st="' + o.id + '" aria-label="حالة الطلب">' + Object.keys(HZ.STATUS).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + HZ.STATUS[k] + '</option>'; }).join('') + '</select>' +
        '<button class="btn sm danger" data-act="orderDel" data-id="' + o.id + '">حذف</button></div></div></article>';
    }).join('');
  }
  function setBadge(n) {
    var b = $('#newBadge'); b.textContent = n; b.hidden = !n;
    document.title = n ? '(' + n + ') ' + BASE_TITLE : BASE_TITLE;
  }
  var pollTimer;
  function pollCount() {
    clearTimeout(pollTimer);
    if ($('#admin').hidden) return;
    api('GET', '/api/admin/orders/count').then(function (d) {
      if (S.newCount >= 0 && d.new > S.newCount) { toast('وصل طلب جديد'); if (S.tab === 'orders') loadTab('orders'); }
      S.newCount = d.new; setBadge(d.new);
    }).catch(function (e) { if (e.status === 401) onErr(e); }).then(function () { pollTimer = setTimeout(pollCount, 30000); });
  }

  /* ---------- المنتجات ---------- */
  function renderProducts() {
    var q = S.pSearch.trim().toLowerCase();
    var list = sortedProducts(S.products.filter(function (p) { return (S.pZone === 'all' || p.zone === S.pZone) && (!q || (p.name + ' ' + p.spec).toLowerCase().indexOf(q) > -1); }));
    if (!list.length) { $('#prodList').innerHTML = '<p class="empty">' + (S.products.length ? 'لا توجد منتجات مطابقة.' : 'لا توجد منتجات بعد. اضغط «منتج جديد» لإضافة أول جهاز.') + '</p>'; return; }
    $('#prodList').innerHTML = list.map(function (p) {
      var z = zoneOf(p.zone);
      return '<div class="prow z-' + p.zone + '"><div class="pthumb">' + (p.img ? '<img src="' + esc(p.img) + '" alt="">' : ic(p.icon)) + '</div>' +
        '<div class="pmeta"><b>' + esc(p.name) + (p.active ? '' : '<span class="off">مخفي</span>') + '</b><span class="lz">' + z.name + ' ZONE</span></div>' +
        '<div class="pctl"><label class="mini">السعر <input class="field price num" type="number" step="0.01" min="0" inputmode="decimal" value="' + esc(p.price) + '" data-price="' + esc(p.id) + '" aria-label="سعر ' + esc(p.name) + '"> د.أ</label>' +
        '<label class="mini"><input type="checkbox" data-pactive="' + esc(p.id) + '"' + (p.active ? ' checked' : '') + '> ظاهر</label>' +
        '<button class="btn sm ghost" data-act="editProd" data-id="' + esc(p.id) + '">تعديل</button>' +
        '<button class="btn sm danger" data-act="delProd" data-id="' + esc(p.id) + '">حذف</button></div></div>';
    }).join('');
  }
  function openEditor(id) {
    S.editId = id || null;
    var p = id ? S.products.filter(function (x) { return x.id === id; })[0] : null; S.editing = p || null;
    $('#eTitle').textContent = p ? 'تعديل المنتج' : 'منتج جديد';
    $('#eName').value = p ? p.name : '';
    $('#eZone').value = p ? p.zone : (S.pZone !== 'all' ? S.pZone : HZ.ZONES[0].id);
    $('#eIcon').value = p ? p.icon : 'processor';
    $('#ePrice').value = p ? p.price : ''; $('#eOld').value = p && p.old ? p.old : '';
    $('#eTag').value = p ? p.tag : ''; $('#eSpec').value = p ? p.spec : ''; $('#eDesc').value = p ? p.desc : '';
    $('#eImg').value = ''; $('#eVid').value = ''; $('#eVurl').value = p ? p.vurl : '';
    $('#eActive').checked = p ? p.active : true;
    $('#eImgRm').checked = false; $('#eVidRm').checked = false;
    $('#eImgRmWrap').hidden = !(p && p.imgName); $('#eVidRmWrap').hidden = !(p && p.vidName);
    $('#eErr').textContent = ''; $('#eSave').disabled = false; $('#eSave').textContent = 'حفظ المنتج';
    openModal('#eModal');
  }
  function saveProduct() {
    var err = $('#eErr'), btn = $('#eSave'); err.textContent = '';
    var name = $('#eName').value.trim(), priceRaw = $('#ePrice').value, price = parseFloat(priceRaw), old = parseFloat($('#eOld').value) || 0;
    if (name.length < 2) { err.textContent = 'اكتب اسم المنتج.'; $('#eName').focus(); return; }
    if (priceRaw === '' || !isFinite(price) || price < 0) { err.textContent = 'اكتب سعرًا صحيحًا.'; $('#ePrice').focus(); return; }
    if (old && old <= price) { err.textContent = 'السعر قبل الخصم يجب أن يكون أعلى من السعر الحالي.'; $('#eOld').focus(); return; }
    var vurlRaw = $('#eVurl').value.trim();
    if (vurlRaw && !HZ.safeUrl(vurlRaw)) { err.textContent = 'رابط الفيديو يجب أن يبدأ بـ https://'; $('#eVurl').focus(); return; }
    var cur = S.editing, img = cur ? cur.imgName : '', vid = cur ? cur.vidName : '';
    var fImg = $('#eImg').files[0], fVid = $('#eVid').files[0];
    if ($('#eImgRm').checked) img = ''; if ($('#eVidRm').checked) vid = '';
    btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    var chain = Promise.resolve();
    if (fImg) chain = chain.then(function () { btn.textContent = 'جارٍ رفع الصورة…'; return HZ.upload(fImg, 'image'); }).then(function (r) { img = r.name; });
    if (fVid) chain = chain.then(function () { return HZ.upload(fVid, 'video', function (p) { btn.textContent = 'جارٍ رفع الفيديو… ' + p + '%'; }); }).then(function (r) { vid = r.name; });
    chain.then(function () {
      btn.textContent = 'جارٍ الحفظ…';
      var body = { name: name, zone: $('#eZone').value, icon: $('#eIcon').value, price: price, old: old, tag: $('#eTag').value.trim(), spec: $('#eSpec').value.trim(),
        desc: $('#eDesc').value.trim(), imgName: img, vidName: vid, vurl: vurlRaw, active: $('#eActive').checked };
      return S.editId ? api('PUT', '/api/admin/products/' + encodeURIComponent(S.editId), body) : api('POST', '/api/admin/products', body);
    }).then(function () {
      closeModals(); toast(S.editId ? 'تم حفظ التعديلات' : 'تمت إضافة المنتج'); loadTab('products');
    }).catch(function (e) {
      if (e.status === 401) return onErr(e);
      err.textContent = e.message; btn.disabled = false; btn.textContent = 'حفظ المنتج';
    });
  }

  /* ---------- الأكواد ---------- */
  function renderCoupons() {
    if (!S.coupons.length) { $('#cList').innerHTML = '<p class="empty">لا توجد أكواد خصم بعد.</p>'; return; }
    $('#cList').innerHTML = S.coupons.map(function (c) {
      return '<div class="crow"><div><span class="code">' + esc(c.code) + '</span><div class="cdesc num">خصم ' + (c.type === 'percent' ? fmt(c.amount).replace(/\.00$/, '') + '%' : fmt(c.amount) + ' د.أ') + (c.min > 0 ? ' · لطلبات من ' + fmt(c.min) + ' د.أ' : '') + '</div></div>' +
        '<div class="pctl"><label class="mini"><input type="checkbox" data-cactive="' + esc(c.code) + '"' + (c.active ? ' checked' : '') + '> فعّال</label>' +
        '<button class="btn sm danger" data-act="cDel" data-id="' + esc(c.code) + '">حذف</button></div></div>';
    }).join('');
  }

  /* ---------- الفيديوهات ---------- */
  function renderVideos() {
    var sel = $('#vProd'), cur = sel.value;
    sel.innerHTML = '<option value="">بدون ربط</option>' + S.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
    sel.value = cur;
    if (!S.videos.length) { $('#vAdminList').innerHTML = '<p class="empty">لا توجد فيديوهات بعد.</p>'; return; }
    var byId = {}; S.products.forEach(function (p) { byId[p.id] = p; });
    $('#vAdminList').innerHTML = S.videos.map(function (v) {
      var p = byId[v.product];
      return '<div class="crow"><div><b>' + esc(v.title) + '</b><div class="cdesc">' + (v.file ? 'ملف مرفوع' : 'رابط خارجي') + (p ? ' · ' + esc(p.name) : '') + '</div></div>' +
        '<div class="pctl"><button class="btn sm danger" data-act="vDel" data-id="' + v.id + '">حذف</button></div></div>';
    }).join('');
  }

  /* ---------- الشركاء ---------- */
  function renderPartners() {
    if (!S.partners.length) { $('#rList').innerHTML = '<p class="empty">لا يوجد شركاء بعد. اضغط «شريك جديد» لإضافة أول شريك.</p>'; return; }
    $('#rList').innerHTML = S.partners.map(function (p) {
      return '<div class="prow z-ink"><div class="pthumb logo">' + (p.logo ? '<img src="' + esc(p.logo) + '" alt="">' : '<span>' + esc(p.name.slice(0, 2)) + '</span>') + '</div>' +
        '<div class="pmeta"><b>' + esc(p.name) + '</b>' + (p.url ? '<span class="cdesc" dir="ltr" style="display:block;overflow-wrap:anywhere">' + esc(p.url) + '</span>' : '') + '</div>' +
        '<div class="pctl"><button class="btn sm ghost" data-act="editPartner" data-id="' + p.id + '">تعديل</button>' +
        '<button class="btn sm danger" data-act="delPartner" data-id="' + p.id + '">حذف</button></div></div>';
    }).join('');
  }
  function openPartnerEditor(id) {
    S.editPid = id || null;
    var p = id ? S.partners.filter(function (x) { return String(x.id) === String(id); })[0] : null; S.editingP = p || null;
    $('#rTitle').textContent = p ? 'تعديل الشريك' : 'شريك جديد';
    $('#rName').value = p ? p.name : ''; $('#rDesc').value = p ? p.desc : ''; $('#rUrl').value = p ? p.url : '';
    $('#rSort').value = p && p.sort !== 999 ? p.sort : '';
    $('#rLogo').value = ''; $('#rLogoRm').checked = false; $('#rLogoRmWrap').hidden = !(p && p.logoName);
    $('#rErr').textContent = ''; $('#rSave').disabled = false; $('#rSave').textContent = 'حفظ الشريك';
    openModal('#rModal');
  }
  function savePartner() {
    var err = $('#rErr'), btn = $('#rSave'); err.textContent = '';
    var name = $('#rName').value.trim();
    if (name.length < 2) { err.textContent = 'اكتب اسم الشريك.'; $('#rName').focus(); return; }
    var urlRaw = $('#rUrl').value.trim();
    if (urlRaw && !HZ.safeUrl(urlRaw)) { err.textContent = 'رابط الموقع يجب أن يبدأ بـ https://'; $('#rUrl').focus(); return; }
    var cur = S.editingP, logo = cur ? cur.logoName : '', f = $('#rLogo').files[0];
    if ($('#rLogoRm').checked) logo = '';
    btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
    var chain = Promise.resolve();
    if (f) chain = chain.then(function () { return HZ.upload(f, 'image'); }).then(function (r) { logo = r.name; });
    chain.then(function () {
      var body = { name: name, desc: $('#rDesc').value.trim(), url: urlRaw, logoName: logo, sort: $('#rSort').value };
      return S.editPid ? api('PUT', '/api/admin/partners/' + encodeURIComponent(S.editPid), body) : api('POST', '/api/admin/partners', body);
    }).then(function () { closeModals(); toast(S.editPid ? 'تم حفظ التعديلات' : 'تمت إضافة الشريك'); loadTab('partners'); })
      .catch(function (e) { if (e.status === 401) return onErr(e); err.textContent = e.message; btn.disabled = false; btn.textContent = 'حفظ الشريك'; });
  }

  /* ---------- طلب يدوي ---------- */
  function openOrderModal() {
    Promise.all([api('GET', '/api/admin/products'), api('GET', '/api/admin/coupons'), api('GET', '/api/admin/settings')]).then(function (r) {
      S.products = r[0]; S.coupons = r[1]; S.settings = r[2]; S.M = { lines: {} };
      ['#oName', '#oPhone', '#oAddr', '#oNote', '#oCode'].forEach(function (s) { $(s).value = ''; });
      $('#oCity').value = HZ.CITIES[0]; $('#oQty').value = 1; $('#oErr').textContent = ''; $('#oSaveBtn').disabled = false;
      HZ.fillSelect($('#oProd'), S.products.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ar'); }).map(function (p) { return [p.id, p.name + ' – ' + fmt(p.price) + ' د.أ']; }));
      renderOrderLines(); openModal('#oModal');
    }).catch(onErr);
  }
  function manualCoupon() {
    var code = $('#oCode').value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code) return { code: '', c: null, err: '' };
    var c = S.coupons.filter(function (x) { return x.code === code; })[0];
    if (!c || !c.active) return { code: code, c: null, err: 'كود الخصم غير صالح' };
    return { code: code, c: { code: c.code, type: c.type, amount: c.amount, min: c.min }, err: '' };
  }
  function renderOrderLines() {
    var byId = {}; S.products.forEach(function (p) { byId[p.id] = p; });
    var ids = Object.keys(S.M.lines).filter(function (id) { return byId[id]; });
    var mc = manualCoupon(), list = ids.map(function (id) { return { p: byId[id], q: S.M.lines[id] }; });
    var t = HZ.price(list, S.settings, mc.c);
    $('#oLines').innerHTML = list.length ? list.map(function (x) {
      return '<div class="oline"><span>' + x.q + ' × ' + esc(x.p.name) + '</span><span class="num">' + fmt(x.p.price * x.q) + ' د.أ <button class="rm" type="button" data-act="oRmLine" data-id="' + esc(x.p.id) + '">حذف</button></span></div>';
    }).join('') : '<p class="note">لم تُضف أجهزة بعد.</p>';
    var h = '';
    if (list.length) {
      h = '<div class="sum"><span>المجموع الفرعي</span><span class="num">' + fmt(t.sub) + ' د.أ</span></div>';
      if (mc.code && (mc.err || t.cerr)) h += '<p class="cmsg bad">' + esc(mc.err || t.cerr) + '</p>';
      if (t.disc > 0) h += '<div class="sum disc"><span>الخصم</span><span class="num">-' + fmt(t.disc) + ' د.أ</span></div>';
      h += '<div class="sum"><span>التوصيل</span><span class="num">' + (t.ship ? fmt(t.ship) + ' د.أ' : 'مجاني') + '</span></div><div class="sum t"><span>الإجمالي</span><span class="num">' + fmt(t.total) + ' د.أ</span></div>';
    }
    $('#oTotals').innerHTML = h;
  }
  function saveManualOrder() {
    var err = $('#oErr'); err.textContent = '';
    var f = { name: $('#oName').value, phone: $('#oPhone').value, city: $('#oCity').value, address: $('#oAddr').value, note: $('#oNote').value };
    var ids = Object.keys(S.M.lines);
    if (f.name.trim().length < 3) { err.textContent = 'اكتب اسم العميل.'; $('#oName').focus(); return; }
    if (f.phone.replace(/\D/g, '').length < 9) { err.textContent = 'اكتب رقم هاتف صحيحًا.'; $('#oPhone').focus(); return; }
    if (f.address.trim().length < 5) { err.textContent = 'اكتب عنوان التوصيل بالتفصيل.'; $('#oAddr').focus(); return; }
    if (!ids.length) { err.textContent = 'أضف جهازًا واحدًا على الأقل.'; return; }
    $('#oSaveBtn').disabled = true;
    f.items = ids.map(function (id) { return { id: id, qty: S.M.lines[id] }; }); f.code = manualCoupon().code;
    api('POST', '/api/admin/orders', f).then(function () { closeModals(); toast('تم حفظ الطلب'); S.newCount = -1; pollCount(); loadTab('orders'); })
      .catch(function (e) { if (e.status === 401) return onErr(e); err.textContent = e.message; $('#oSaveBtn').disabled = false; });
  }

  /* ---------- نوافذ ---------- */
  var modalFocus = null;
  function openModal(sel) {
    modalFocus = document.activeElement; $('#mscrim').hidden = false; $(sel).hidden = false;
    var f = $(sel).querySelector('input:not([type=file]),select,textarea'); if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function closeModals() {
    ['#eModal', '#oModal', '#rModal'].forEach(function (s) { $(s).hidden = true; });
    $('#mscrim').hidden = true;
    if (modalFocus && modalFocus.focus && document.contains(modalFocus)) modalFocus.focus();
  }

  /* ---------- الإجراءات ---------- */
  function mutate(p, okMsg, reload) {
    return p.then(function () { if (okMsg) toast(okMsg); if (reload) return loadTab(reload); }).catch(onErr);
  }
  var ACTIONS = {
    tab: function (el, id) { setTab(id); },
    logout: function () { api('POST', '/api/admin/logout').catch(function () { /* */ }).then(function () { clearTimeout(pollTimer); S.newCount = -1; showLogin(''); }); },
    ofilter: function (el, id) { S.ofilter = id; renderOrders(); },
    refreshOrders: function () { loadTab('orders'); pollCount(); },
    newOrder: function () { openOrderModal(); },
    oAddLine: function () {
      var id = $('#oProd').value, q = Math.max(1, Math.min(20, parseInt($('#oQty').value, 10) || 1));
      if (!id) return; S.M.lines[id] = Math.min(20, (S.M.lines[id] || 0) + q); renderOrderLines();
    },
    oRmLine: function (el, id) { delete S.M.lines[id]; renderOrderLines(); },
    oSave: function () { saveManualOrder(); },
    copyPhone: function (el) { HZ.copyText(el.getAttribute('data-val'), 'تم نسخ الرقم'); },
    orderDel: function (el, id) { if (!HZ.armed(el)) return; mutate(api('DELETE', '/api/admin/orders/' + id), 'تم حذف الطلب', 'orders').then(pollCount); },
    newProd: function () { openEditor(null); },
    editProd: function (el, id) { openEditor(id); },
    saveProduct: function () { saveProduct(); },
    delProd: function (el, id) { if (!HZ.armed(el)) return; mutate(api('DELETE', '/api/admin/products/' + encodeURIComponent(id)), 'تم حذف المنتج', 'products'); },
    cDel: function (el, id) { if (!HZ.armed(el)) return; mutate(api('DELETE', '/api/admin/coupons/' + encodeURIComponent(id)), 'تم حذف الكود', 'coupons'); },
    vDel: function (el, id) { if (!HZ.armed(el)) return; mutate(api('DELETE', '/api/admin/videos/' + id), 'تم حذف الفيديو', 'videos'); },
    newPartner: function () { openPartnerEditor(null); },
    editPartner: function (el, id) { openPartnerEditor(id); },
    savePartner: function () { savePartner(); },
    delPartner: function (el, id) { if (!HZ.armed(el)) return; mutate(api('DELETE', '/api/admin/partners/' + id), 'تم حذف الشريك', 'partners'); },
    closeModals: function () { closeModals(); }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var fn = ACTIONS[el.getAttribute('data-act')]; if (!fn) return;
    fn(el, el.getAttribute('data-id'));
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'pSearch') { S.pSearch = e.target.value; renderProducts(); }
    else if (e.target.id === 'oCode') renderOrderLines();
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'pZone') { S.pZone = t.value; renderProducts(); }
    else if (t.hasAttribute('data-price')) {
      var v = parseFloat(t.value);
      if (t.value === '' || !isFinite(v) || v < 0) { toast('اكتب سعرًا صحيحًا'); renderProducts(); return; }
      api('PATCH', '/api/admin/products/' + encodeURIComponent(t.getAttribute('data-price')), { price: v }).then(function () { toast('تم تحديث السعر'); }).catch(function (er) { onErr(er); loadTab('products'); });
    }
    else if (t.hasAttribute('data-pactive')) api('PATCH', '/api/admin/products/' + encodeURIComponent(t.getAttribute('data-pactive')), { active: t.checked }).then(function () { loadTab('products'); }).catch(function (er) { onErr(er); loadTab('products'); });
    else if (t.hasAttribute('data-cactive')) api('PATCH', '/api/admin/coupons/' + encodeURIComponent(t.getAttribute('data-cactive')), { active: t.checked }).catch(function (er) { onErr(er); loadTab('coupons'); });
    else if (t.hasAttribute('data-st')) api('PATCH', '/api/admin/orders/' + t.getAttribute('data-st'), { status: t.value }).then(function () { toast('تم تحديث حالة الطلب'); loadTab('orders'); pollCount(); }).catch(function (er) { onErr(er); loadTab('orders'); });
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = e.target.id;
    if (id === 'loginForm') {
      var btn = $('#lBtn'); btn.disabled = true; $('#lErr').textContent = '';
      api('POST', '/api/admin/login', { password: $('#lPass').value }).then(function () { showPanel(); })
        .catch(function (er) { $('#lErr').textContent = er.message; btn.disabled = false; $('#lPass').select(); });
    }
    else if (id === 'cForm') {
      var err = $('#cErr'); err.textContent = '';
      var code = $('#cCode').value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''), val = parseFloat($('#cValue').value), type = $('#cType').value;
      if (code.length < 3) { err.textContent = 'الكود يجب أن يتكوّن من 3 أحرف أو أرقام إنجليزية على الأقل.'; return; }
      if (!isFinite(val) || val <= 0) { err.textContent = 'اكتب قيمة الخصم.'; return; }
      if (type === 'percent' && val > 100) { err.textContent = 'النسبة لا تتجاوز 100%.'; return; }
      api('PUT', '/api/admin/coupons/' + encodeURIComponent(code), { type: type, amount: val, min: $('#cMin').value }).then(function () {
        ['#cCode', '#cValue', '#cMin'].forEach(function (s) { $(s).value = ''; }); toast('تم حفظ الكود'); loadTab('coupons');
      }).catch(function (er) { if (er.status === 401) return onErr(er); err.textContent = er.message; });
    }
    else if (id === 'vForm') {
      var verr = $('#vErr'), vbtn = $('#vBtn'); verr.textContent = '';
      var title = $('#vTitle').value.trim(), file = $('#vFile').files[0], urlRaw = $('#vUrl').value.trim();
      if (title.length < 2) { verr.textContent = 'اكتب عنوان الفيديو.'; return; }
      if (urlRaw && !HZ.safeUrl(urlRaw)) { verr.textContent = 'رابط الفيديو يجب أن يبدأ بـ https://'; return; }
      if (!file && !urlRaw) { verr.textContent = 'ارفع ملف فيديو أو ضع رابطًا.'; return; }
      vbtn.disabled = true; vbtn.textContent = 'جارٍ الرفع…';
      var chain = Promise.resolve('');
      if (file) chain = HZ.upload(file, 'video', function (p) { vbtn.textContent = 'جارٍ رفع الفيديو… ' + p + '%'; }).then(function (r) { return r.name; });
      chain.then(function (name) {
        return api('POST', '/api/admin/videos', { title: title, desc: $('#vDesc').value.trim(), product: $('#vProd').value, file: name, url: urlRaw });
      }).then(function () {
        ['#vTitle', '#vDesc', '#vFile', '#vUrl'].forEach(function (s) { $(s).value = ''; }); toast('تم نشر الفيديو'); loadTab('videos');
      }).catch(function (er) { if (er.status === 401) return onErr(er); verr.textContent = er.message; })
        .then(function () { vbtn.disabled = false; vbtn.textContent = 'نشر الفيديو'; });
    }
    else if (id === 'sForm') {
      var serr = $('#sErr'); serr.textContent = '';
      var free = parseFloat($('#sFree').value), ship = parseFloat($('#sShip').value);
      if (!isFinite(free) || !isFinite(ship) || free < 0 || ship < 0) { serr.textContent = 'اكتب قيمًا صحيحة للتوصيل.'; return; }
      api('PUT', '/api/admin/settings', { freeFrom: free, shipFee: ship, notice: $('#sNotice').value, whatsapp: $('#sWa').value }).then(function () { toast('تم حفظ الإعدادات'); })
        .catch(function (er) { if (er.status === 401) return onErr(er); serr.textContent = er.message; });
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#mscrim').hidden) closeModals(); });

  /* ---------- البدء ---------- */
  api('GET', '/api/admin/me').then(function () { showPanel(); }).catch(function () { showLogin(''); });
})();
