(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);

  function h(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'value') n.value = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  }

  let meta = { statuses: [], contactMethods: {}, priceUnits: {} };
  let tab = 'requests';
  const TABS = [
    ['requests', 'Заявки'], ['services', 'Услуги'], ['packages', 'Пакеты и цены'], ['gallery', 'Галерея'],
    ['faq', 'FAQ'], ['site', 'Сайт и контакты'], ['integrations', 'Уведомления'], ['account', 'Аккаунт'],
  ];
  const statusLabel = (k) => (meta.statuses.find((s) => s.key === k) || {}).label || k;

  // ───────── API ─────────
  async function api(path, { method = 'GET', body, form } = {}) {
    const opts = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
    if (form) opts.body = form;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch('/api/admin' + path, opts);
    if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Требуется вход'); }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Ошибка ' + res.status);
    return out;
  }

  let toastT;
  function toast(msg, bad = false) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, 3000);
  }
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

  const dlg = $('#dlg');
  function openDlg(...content) { $('#dlgBox').replaceChildren(...content); if (!dlg.open) dlg.showModal(); }
  const closeDlg = () => dlg.open && dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  const confirmDlg = (text) => window.confirm(text);

  const fmtDT = (s) => new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtD = (s) => (s ? new Date(s).toLocaleDateString('ru-RU', { timeZone: 'UTC' }) : '—');

  // ───────── вход ─────────
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; $('#loginErr').textContent = '';
    try {
      await api('/login', { method: 'POST', body: { username: f.username.value, password: f.password.value } });
      f.password.value = ''; await boot();
    } catch (err) { $('#loginErr').textContent = err.message; }
  });
  $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  async function boot() {
    try { await api('/me'); } catch { return showLogin(); }
    meta = await api('/meta');
    $('#login').hidden = true; $('#app').hidden = false;
    renderTabs(); go(tab);
  }

  let newCount = 0;
  function renderTabs() {
    const box = $('#tabs'); box.replaceChildren();
    TABS.forEach(([k, label]) => box.append(h('button', { class: 'tab', type: 'button', 'aria-current': k === tab ? 'page' : null, onclick: () => go(k) },
      label, k === 'requests' && newCount ? h('span', { class: 'badge', text: newCount }) : null)));
  }
  function go(k) { tab = k; renderTabs(); const v = $('#view'); v.replaceChildren(h('p', { class: 'muted', text: 'Загрузка…' })); views[k]().catch((e) => v.replaceChildren(h('p', { class: 'err', text: e.message }))); }

  const view = () => $('#view');
  const setView = (...c) => view().replaceChildren(...c);

  // ───────── заявки ─────────
  let reqFilter = ''; let reqQuery = '';
  async function viewRequests() {
    const qs = new URLSearchParams(); if (reqFilter) qs.set('status', reqFilter); if (reqQuery) qs.set('q', reqQuery);
    const { requests, counts } = await api('/requests?' + qs);
    newCount = counts.new || 0; renderTabs();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const search = h('input', { type: 'search', placeholder: 'Поиск по имени, телефону, пожеланиям', value: reqQuery, style: 'max-width:340px' });
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { reqQuery = search.value.trim(); go('requests'); } });
    const pill = (key, label, n) => h('button', { type: 'button', class: 'pill', 'aria-pressed': String(reqFilter === key), onclick: () => { reqFilter = key; go('requests'); } }, `${label} · ${n}`);
    const body = requests.length
      ? h('table', {}, h('thead', {}, h('tr', {}, ['№', 'Получена', 'Клиент', 'Мероприятие', 'Услуги / пакет', 'Статус'].map((t) => h('th', { text: t })))),
        h('tbody', {}, requests.map((r) => h('tr', { onclick: guard(() => openRequest(r.id)) },
          h('td', { 'data-l': '№', text: '#' + r.id }),
          h('td', { 'data-l': 'Получена', text: fmtDT(r.created_at) }),
          h('td', { 'data-l': 'Клиент' }, h('strong', { text: r.name }), h('br'), r.phone, ' · ', meta.contactMethods[r.contact_method] || r.contact_method),
          h('td', { 'data-l': 'Мероприятие' }, `${fmtD(r.event_date)}${r.event_time ? ' ' + r.event_time : ''}`, h('br'), `${r.participants} чел. · ${r.event_type}`),
          h('td', { 'data-l': 'Услуги' }, (r.services || []).join(', ') || '—', h('br'), h('span', { class: 'muted', text: 'Пакет: ' + r.package }),
            r.comments_count ? h('span', { class: 'muted', text: ` · 💬 ${r.comments_count}` }) : null),
          h('td', { 'data-l': 'Статус' }, h('span', { class: 'st st--' + r.status, text: statusLabel(r.status) }), r.notified ? null : h('div', { class: 'note-warn', style: 'font-size:.75rem', text: 'не отправлено менеджеру' }))))))
      : h('div', { class: 'empty', text: 'Заявок пока нет' });
    setView(
      h('div', { class: 'bar' }, h('h2', { class: 'grow', text: 'Заявки' }), search,
        h('a', { class: 'btn btn--ghost btn--sm', href: '/api/admin/requests.csv', text: 'Экспорт в CSV' })),
      h('div', { class: 'pills', style: 'margin-bottom:16px' }, pill('', 'Все', total), meta.statuses.map((s) => pill(s.key, s.label, counts[s.key] || 0))),
      body);
  }

  async function openRequest(id) {
    const { request: r, comments } = await api('/requests/' + id);
    const digits = String(r.phone).replace(/\D/g, '');
    const statusSel = h('select', { onchange: guard(async (e) => { await api('/requests/' + id, { method: 'PATCH', body: { status: e.target.value } }); toast('Статус обновлён'); }) },
      meta.statuses.map((s) => h('option', { value: s.key, text: s.label, ...(s.key === r.status ? { selected: '' } : {}) })));
    const list = h('div', {}, comments.map(commentEl));
    const ta = h('textarea', { placeholder: 'Внутренний комментарий (клиент его не видит)', maxlength: 2000 });
    const row = (k, v) => [h('dt', { text: k }), h('dd', {}, v)];
    openDlg(
      h('h2', { text: `Заявка №${r.id}` }),
      h('p', { class: 'muted', text: 'Получена ' + fmtDT(r.created_at) }),
      h('dl', { class: 'kv' },
        row('Имя', r.name),
        row('Телефон', [h('a', { href: 'tel:' + r.phone.replace(/[^\d+]/g, ''), text: r.phone }), ' · ', h('a', { href: 'https://wa.me/' + digits, target: '_blank', rel: 'noopener', text: 'WhatsApp' })]),
        row('Способ связи', meta.contactMethods[r.contact_method] || r.contact_method),
        row('Дата и время', `${fmtD(r.event_date)}${r.event_time ? ' в ' + r.event_time : ''}`),
        row('Участников', String(r.participants)), row('Формат', r.event_type),
        row('Услуги', (r.services || []).join(', ') || '—'), row('Пакет', r.package),
        row('Пожелания', r.wishes || '—'),
        row('Уведомление', r.notified ? 'Отправлено менеджеру' : 'Не отправлено' + (r.notify_info ? ` (${r.notify_info})` : ''))),
      h('label', { class: 'f' }, 'Статус заявки', statusSel),
      h('h3', { text: 'Внутренние комментарии' }), list, ta,
      h('div', { class: 'bar', style: 'margin-top:10px' },
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Добавить комментарий', onclick: guard(async () => {
          const { comment } = await api(`/requests/${id}/comments`, { method: 'POST', body: { text: ta.value } });
          list.append(commentEl(comment)); ta.value = '';
        }) }),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Удалить заявку', onclick: guard(async () => {
          if (!confirmDlg('Удалить заявку и все комментарии без возможности восстановления?')) return;
          await api('/requests/' + id, { method: 'DELETE' }); closeDlg(); toast('Заявка удалена'); go('requests');
        }) }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Закрыть', onclick: () => { closeDlg(); go('requests'); } })));
  }
  const commentEl = (c) => h('div', { class: 'comment' }, h('small', { text: `${c.author} · ${fmtDT(c.created_at)}` }), h('span', { text: c.text, style: 'white-space:pre-wrap' }));

  // ───────── загрузка файлов ─────────
  async function uploadFile(file, extra = {}, endpoint = '/upload') {
    const fd = new FormData(); Object.entries(extra).forEach(([k, v]) => fd.append(k, v)); fd.append('file', file);
    return api(endpoint, { method: 'POST', form: fd });
  }
  const pickFiles = (multiple, cb) => {
    const i = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', ...(multiple ? { multiple: '' } : {}) });
    i.addEventListener('change', () => cb([...i.files])); i.click();
  };

  // ───────── услуги ─────────
  async function viewServices() {
    const { services } = await api('/content');
    setView(
      h('div', { class: 'bar' }, h('h2', { class: 'grow', text: 'Услуги и мастер-классы' }),
        h('button', { class: 'btn btn--primary', type: 'button', text: '+ Добавить услугу', onclick: () => editService({ category: services[0]?.category || '', title: '', short: '', description: '', image: '', examples: [], sort: 0, active: true }, services) })),
      h('div', { class: 'list' }, services.map((s) => h('div', { class: 'item' + (s.active ? '' : ' item--off') },
        h('img', { src: s.image, alt: '' }),
        h('div', { class: 'item__body' }, h('strong', { text: s.title }), h('span', { class: 'muted', text: s.category + (s.active ? '' : ' · скрыта') })),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Изменить', onclick: () => editService(s, services) }),
        h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Удалить', onclick: guard(async () => {
          if (!confirmDlg(`Удалить услугу «${s.title}»?`)) return;
          await api('/services/' + s.id, { method: 'DELETE' }); toast('Удалено'); go('services');
        }) })))));
  }

  function editService(s, all) {
    const cur = { ...s, examples: [...(s.examples || [])] };
    const cats = [...new Set(['Арт-живопись', 'Роспись и декор', 'Handmade', ...all.map((x) => x.category)])];
    const category = h('input', { list: 'cats', value: cur.category, required: '' });
    const dl = h('datalist', { id: 'cats' }, cats.map((c) => h('option', { value: c })));
    const title = h('input', { value: cur.title, maxlength: 160 });
    const short = h('input', { value: cur.short, maxlength: 300 });
    const desc = h('textarea', { rows: 6, value: cur.description });
    const sort = h('input', { type: 'number', value: cur.sort });
    const active = h('input', { type: 'checkbox', ...(cur.active ? { checked: '' } : {}) });
    const cover = h('div', { class: 'imgs' }); const ex = h('div', { class: 'imgs' });
    const draw = () => {
      cover.replaceChildren(cur.image ? h('div', { class: 'im' }, h('img', { src: cur.image, alt: '' })) : h('span', { class: 'muted', text: 'Обложка не выбрана' }));
      ex.replaceChildren(...cur.examples.map((u, i) => h('div', { class: 'im' }, h('img', { src: u, alt: '' }),
        h('button', { type: 'button', 'aria-label': 'Убрать', text: '×', onclick: () => { cur.examples.splice(i, 1); draw(); } }))));
    };
    draw();
    openDlg(
      h('h2', { text: s.id ? 'Изменить услугу' : 'Новая услуга' }), dl,
      h('div', { class: 'row' }, h('label', { class: 'f' }, 'Категория', category), h('label', { class: 'f' }, 'Порядок (меньше — выше)', sort)),
      h('label', { class: 'f' }, 'Название', title),
      h('label', { class: 'f' }, 'Краткое описание (для карточки)', short),
      h('label', { class: 'f' }, 'Подробное описание', desc),
      h('div', { class: 'f' }, h('b', { text: 'Фото для карточки' }), cover,
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Загрузить фото', onclick: () => pickFiles(false, guard(async ([f]) => { if (!f) return; cur.image = (await uploadFile(f)).url; draw(); })) })),
      h('div', { class: 'f' }, h('b', { text: 'Примеры готовых работ' }), ex,
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Добавить фото', onclick: () => pickFiles(true, guard(async (files) => { for (const f of files) cur.examples.push((await uploadFile(f)).url); draw(); })) })),
      h('label', { class: 'check' }, active, 'Показывать на сайте'),
      h('div', { class: 'bar' }, h('span', { class: 'grow' }),
        h('button', { class: 'btn btn--ghost', type: 'button', text: 'Отмена', onclick: closeDlg }),
        h('button', { class: 'btn btn--primary', type: 'button', text: 'Сохранить', onclick: guard(async () => {
          const body = { category: category.value, title: title.value, short: short.value, description: desc.value, image: cur.image, examples: cur.examples, sort: Number(sort.value) || 0, active: active.checked };
          await api(s.id ? '/services/' + s.id : '/services', { method: s.id ? 'PUT' : 'POST', body });
          closeDlg(); toast('Сохранено'); go('services');
        }) })));
  }

  // ───────── пакеты ─────────
  async function viewPackages() {
    const { packages, site } = await api('/content');
    setView(h('h2', { text: 'Пакеты и цены' }),
      h('p', { class: 'muted', text: 'Пока реальные цены не внесены, на сайте показаны демонстрационные значения («от …»). Замените их и нажмите «Сохранить».' }),
      h('div', { class: 'pkgs' }, packages.map((p) => {
        const name = h('input', { value: p.name }); const desc = h('textarea', { rows: 2, value: p.description });
        const inc = h('input', { value: p.includes, placeholder: 'Например: Всё, что входит в MINI, плюс:' });
        const feats = h('textarea', { rows: 6, value: (p.features || []).join('\n') });
        const price = h('input', { type: 'number', min: 0, value: p.price_from ?? '', placeholder: 'пусто = по запросу' });
        const unit = h('select', {}, Object.entries(meta.priceUnits).map(([k, v]) => h('option', { value: k, text: v, ...(k === p.price_unit ? { selected: '' } : {}) })));
        const note = h('input', { value: p.price_note, placeholder: 'Например: Демонстрационная цена' });
        const hl = h('input', { type: 'checkbox', ...(p.highlighted ? { checked: '' } : {}) });
        return h('div', { class: 'card' }, h('h3', { text: 'Пакет ' + p.code }),
          h('label', { class: 'f' }, 'Название', name), h('label', { class: 'f' }, 'Краткое описание', desc), h('label', { class: 'f' }, 'Строка «Всё, что входит…»', inc),
          h('label', { class: 'f' }, 'Что включено', h('small', { text: 'по одному пункту в строке' }), feats),
          h('div', { class: 'row' }, h('label', { class: 'f' }, `Цена «от», ${site.currency || '₸'}`, price), h('label', { class: 'f' }, 'Единица цены', unit)),
          h('label', { class: 'f' }, 'Пометка под ценой', note),
          h('label', { class: 'check' }, hl, 'Выделить как «Популярный выбор»'),
          h('button', { class: 'btn btn--primary', type: 'button', text: 'Сохранить', onclick: guard(async () => {
            await api('/packages/' + p.id, { method: 'PUT', body: { name: name.value, description: desc.value, includes: inc.value, features: feats.value.split('\n'), price_from: price.value, price_unit: unit.value, price_note: note.value, highlighted: hl.checked } });
            toast('Пакет «' + name.value + '» сохранён');
          }) }));
      })),
      h('p', { class: 'muted', text: 'Примечание под пакетами редактируется на вкладке «Сайт и контакты».' }));
  }

  // ───────── галерея ─────────
  async function viewGallery() {
    const { gallery } = await api('/content');
    const caption = h('input', { placeholder: 'Подпись (необязательно)' }); const cat = h('input', { placeholder: 'Категория (необязательно)' });
    setView(h('h2', { text: 'Галерея работ' }),
      h('div', { class: 'card' }, h('div', { class: 'row' }, h('label', { class: 'f' }, 'Подпись', caption), h('label', { class: 'f' }, 'Категория', cat)),
        h('button', { class: 'btn btn--primary', type: 'button', text: 'Загрузить фото', onclick: () => pickFiles(true, guard(async (files) => {
          for (const f of files) await uploadFile(f, { caption: caption.value, category: cat.value }, '/gallery');
          toast(`Загружено: ${files.length}`); go('gallery');
        })) }), h('p', { class: 'muted', style: 'margin:.6rem 0 0', text: 'JPG, PNG, WebP или GIF до 12 МБ. Фото автоматически сжимаются для быстрой загрузки сайта.' })),
      h('div', { class: 'thumbs' }, gallery.map((g) => h('div', { class: 'thumb' }, h('img', { src: g.image, alt: g.caption, loading: 'lazy' }),
        h('div', {}, h('span', { text: g.caption || '(без подписи)' }),
          h('div', { class: 'acts' },
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Подпись', onclick: guard(async () => {
              const c = window.prompt('Подпись к фото', g.caption); if (c === null) return;
              await api('/gallery/' + g.id, { method: 'PUT', body: { caption: c, category: g.category, sort: g.sort } }); go('gallery');
            }) }),
            h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Удалить', onclick: guard(async () => {
              if (!confirmDlg('Удалить фото из галереи?')) return; await api('/gallery/' + g.id, { method: 'DELETE' }); go('gallery');
            }) })))))));
  }

  // ───────── FAQ ─────────
  async function viewFaq() {
    const { faq } = await api('/content');
    setView(h('div', { class: 'bar' }, h('h2', { class: 'grow', text: 'Вопросы и ответы' }),
      h('button', { class: 'btn btn--primary', type: 'button', text: '+ Добавить вопрос', onclick: () => editFaq({ question: '', answer: '', sort: 0 }) })),
      h('div', { class: 'list' }, faq.map((f) => h('div', { class: 'item' }, h('div', { class: 'item__body' }, h('strong', { text: f.question }), h('span', { class: 'muted', text: f.answer.slice(0, 120) + (f.answer.length > 120 ? '…' : '') })),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Изменить', onclick: () => editFaq(f) }),
        h('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Удалить', onclick: guard(async () => {
          if (!confirmDlg('Удалить вопрос?')) return; await api('/faq/' + f.id, { method: 'DELETE' }); go('faq');
        }) })))));
  }
  function editFaq(f) {
    const q = h('input', { value: f.question, maxlength: 300 }); const a = h('textarea', { rows: 6, value: f.answer }); const sort = h('input', { type: 'number', value: f.sort });
    openDlg(h('h2', { text: f.id ? 'Изменить вопрос' : 'Новый вопрос' }), h('label', { class: 'f' }, 'Вопрос', q), h('label', { class: 'f' }, 'Ответ', a),
      f.id ? h('label', { class: 'f' }, 'Порядок (меньше — выше)', sort) : null,
      h('div', { class: 'bar' }, h('span', { class: 'grow' }), h('button', { class: 'btn btn--ghost', type: 'button', text: 'Отмена', onclick: closeDlg }),
        h('button', { class: 'btn btn--primary', type: 'button', text: 'Сохранить', onclick: guard(async () => {
          await api(f.id ? '/faq/' + f.id : '/faq', { method: f.id ? 'PUT' : 'POST', body: { question: q.value, answer: a.value, sort: Number(sort.value) || 0 } });
          closeDlg(); toast('Сохранено'); go('faq');
        }) })));
  }

  // ───────── настройки сайта ─────────
  const SITE_FIELDS = [
    ['Основное', [['company_name', 'Название компании'], ['currency', 'Символ валюты'], ['seo_title', 'Заголовок страницы (SEO)'], ['seo_description', 'Описание страницы (SEO)', 'area']]],
    ['Первый экран', [['hero_title', 'Заголовок'], ['hero_subtitle', 'Подзаголовок', 'area'], ['hero_image', 'Главное фото', 'image']]],
    ['О нас', [['about_title', 'Заголовок'], ['about_text', 'Текст (абзацы разделяйте пустой строкой)', 'area']]],
    ['Цены', [['price_note', 'Примечание под пакетами', 'area']]],
    ['Контакты', [['phone', 'Телефон'], ['whatsapp', 'WhatsApp — номер в международном формате, только цифры', null, '77001234567'], ['telegram', 'Telegram — имя пользователя или ссылка', null, 'my_studio'], ['instagram', 'Instagram — ссылка или имя', null, 'https://instagram.com/my_studio'], ['email', 'E-mail для клиентов (необязательно)'], ['city', 'Город работы'], ['work_hours', 'Время работы менеджера']]],
    ['Финальный блок', [['cta_title', 'Заголовок'], ['cta_subtitle', 'Подзаголовок', 'area']]],
  ];
  async function viewSite() {
    const { site } = await api('/content');
    const inputs = {};
    const groups = SITE_FIELDS.map(([title, fields]) => h('div', { class: 'card' }, h('h3', { text: title }), fields.map(([key, label, kind, ph]) => {
      if (kind === 'image') {
        const inp = h('input', { value: site[key] || '' }); inputs[key] = inp;
        return h('label', { class: 'f' }, label, inp, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', style: 'justify-self:start', text: 'Загрузить новое фото', onclick: () => pickFiles(false, guard(async ([f]) => { if (f) { inp.value = (await uploadFile(f)).url; toast('Фото загружено — нажмите «Сохранить»'); } })) }));
      }
      const inp = kind === 'area' ? h('textarea', { rows: 4, value: site[key] || '' }) : h('input', { value: site[key] || '', placeholder: ph || '' });
      inputs[key] = inp; return h('label', { class: 'f' }, label, inp);
    })));
    setView(h('div', { class: 'bar' }, h('h2', { class: 'grow', text: 'Сайт и контакты' }),
      h('button', { class: 'btn btn--primary', type: 'button', text: 'Сохранить', onclick: guard(async () => {
        await api('/settings', { method: 'PUT', body: Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value])) }); toast('Настройки сохранены');
      }) })), ...groups);
  }

  // ───────── уведомления ─────────
  async function viewIntegrations() {
    const st = await api('/integrations');
    const badge = (ok) => h('b', { class: ok ? 'note-ok' : 'note-warn', text: ok ? '● подключено' : '○ не настроено' });
    setView(h('h2', { text: 'Уведомления о новых заявках' }),
      h('p', { class: 'muted', text: 'Заявки всегда сохраняются в базе и видны во вкладке «Заявки». Telegram и e-mail нужны, чтобы менеджер узнавал о заявке сразу. Настройки задаются переменными окружения на хостинге (Render → Environment) или в файле .env — после изменения перезапустите сервис.' }),
      h('div', { class: 'card' }, h('h3', {}, 'Telegram ', badge(st.telegram)),
        h('ol', { class: 'steps-list' },
          h('li', {}, 'В Telegram откройте ', h('b', { text: '@BotFather' }), ', отправьте ', h('code', { text: '/newbot' }), ' и получите токен бота.'),
          h('li', {}, 'Откройте созданного бота и нажмите «Start» (или добавьте его в группу менеджеров).'),
          h('li', {}, 'Узнайте chat id: напишите боту ', h('b', { text: '@userinfobot' }), ' (личный чат) или откройте ', h('code', { text: 'https://api.telegram.org/bot<ТОКЕН>/getUpdates' }), ' и найдите ', h('code', { text: 'chat.id' }), ' (для групп он отрицательный).'),
          h('li', {}, 'Задайте переменные ', h('code', { text: 'TELEGRAM_BOT_TOKEN' }), ' и ', h('code', { text: 'TELEGRAM_CHAT_ID' }), ', перезапустите сервис.'))),
      h('div', { class: 'card' }, h('h3', {}, 'E-mail (SMTP) ', badge(st.email)),
        h('p', { class: 'muted', text: 'Подойдёт любой SMTP: Gmail (пароль приложения), Яндекс, Mail.ru, Brevo, Mailgun и т. д.' }),
        h('pre', { text: 'SMTP_HOST=smtp.gmail.com\nSMTP_PORT=465\nSMTP_USER=you@gmail.com\nSMTP_PASS=пароль-приложения\nSMTP_FROM="Pastel Studio <you@gmail.com>"\nMANAGER_EMAIL=manager@example.com' }),
        st.email ? h('p', { class: 'muted', text: `Сервер: ${st.smtpHost}, получатель: ${st.managerEmail}` }) : null),
      h('div', { class: 'card' }, h('h3', { text: 'Проверка' }), h('p', { class: 'muted', text: 'Отправит тестовую заявку по всем настроенным каналам.' }),
        h('button', { class: 'btn btn--primary', type: 'button', text: 'Отправить тестовое уведомление', onclick: guard(async (e) => {
          const r = await api('/integrations/test', { method: 'POST' });
          toast(r.ok ? 'Отправлено: ' + r.info : 'Не удалось: ' + r.info, !r.ok);
        }) })),
      st.publicUrl ? null : h('p', { class: 'note-warn', text: 'Совет: задайте PUBLIC_URL (адрес сайта) — тогда в уведомлениях и sitemap будут правильные ссылки.' }));
  }

  // ───────── аккаунт ─────────
  async function viewAccount() {
    const me = await api('/me');
    const cur = h('input', { type: 'password', autocomplete: 'current-password' }); const nw = h('input', { type: 'password', autocomplete: 'new-password' });
    setView(h('h2', { text: 'Аккаунт' }), h('div', { class: 'card', style: 'max-width:420px' }, h('p', {}, 'Вы вошли как ', h('b', { text: me.username })),
      h('label', { class: 'f' }, 'Текущий пароль', cur), h('label', { class: 'f' }, 'Новый пароль', h('small', { text: 'не короче 10 символов' }), nw),
      h('button', { class: 'btn btn--primary', type: 'button', text: 'Сменить пароль', onclick: guard(async () => {
        await api('/change-password', { method: 'POST', body: { current: cur.value, next: nw.value } }); cur.value = nw.value = ''; toast('Пароль изменён');
      }) })));
  }

  const views = { requests: viewRequests, services: viewServices, packages: viewPackages, gallery: viewGallery, faq: viewFaq, site: viewSite, integrations: viewIntegrations, account: viewAccount };

  boot();
})();
