(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /** Безопасное создание элементов: весь текст попадает в DOM как текст, а не как HTML. */
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  }
  const icon = (id) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ic'); s.setAttribute('viewBox', '0 0 24 24');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + id); s.append(u);
    return s;
  };
  const safeImg = (url) => (typeof url === 'string' && /^(\/|https:\/\/)/.test(url) ? url : '');
  const fmt = (n) => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ');

  const UNIT = { per_person: 'за участника', per_group: 'за группу', custom: 'индивидуальный расчёт' };
  const CONTACT = { whatsapp: 'WhatsApp', telegram: 'Telegram', call: 'Звонок' };
  const EVENT_TYPES = ['День рождения', 'Девичник', 'Корпоратив', 'Детский праздник', 'Семейное мероприятие', 'Дружеская встреча', 'Другое'];

  let data = null;

  // ───────── загрузка и отрисовка ─────────
  async function load() {
    try {
      const res = await fetch('/api/content');
      if (!res.ok) throw new Error();
      data = await res.json();
    } catch {
      $('#serviceGrid').append(el('p', { class: 'muted', text: 'Не удалось загрузить каталог. Обновите страницу.' }));
      return;
    }
    renderAll();
    handleHash();
  }

  function renderAll() {
    const { site } = data;
    $$('[data-company]').forEach((n) => { n.textContent = site.company_name; });
    $$('[data-bind]').forEach((n) => { if (site[n.dataset.bind]) n.textContent = site[n.dataset.bind]; });
    const hero = safeImg(site.hero_image); if (hero) $('#heroImage').src = hero;
    const about = $('#aboutText'); about.replaceChildren();
    String(site.about_text || '').split(/\n{2,}/).filter(Boolean).forEach((p) => about.append(el('p', { text: p })));
    $('#priceNote').textContent = site.price_note || '';
    $('#footerCity').textContent = site.city ? `Работаем: ${site.city} и область` : '';
    $('#footerYear').textContent = `© ${new Date().getFullYear()} ${site.company_name}`;
    renderServices(); renderPackages(); renderGallery(); renderContacts(); renderFaq();
    observeReveal();
  }

  // Услуги
  let activeCat = 'all';
  function renderServices() {
    const cats = [...new Set(data.services.map((s) => s.category))];
    const f = $('#serviceFilters'); f.replaceChildren();
    [['all', 'Все'], ...cats.map((c) => [c, c])].forEach(([key, label]) => {
      f.append(el('button', {
        type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(activeCat === key), text: label,
        onclick: () => { activeCat = key; renderServices(); },
      }));
    });
    const grid = $('#serviceGrid'); grid.replaceChildren();
    data.services.filter((s) => activeCat === 'all' || s.category === activeCat).forEach((s) => {
      const img = el('img', { src: safeImg(s.image), alt: s.title, loading: 'lazy', decoding: 'async', width: 800, height: 600 });
      grid.append(el('button', { type: 'button', class: 'card svc reveal is-visible', onclick: () => openService(s.id) },
        el('div', { class: 'svc__img' }, img),
        el('div', { class: 'svc__body' },
          el('span', { class: 'svc__cat', text: s.category }),
          el('h3', { text: s.title }),
          el('p', { text: s.short }),
          el('span', { class: 'svc__more', text: 'Подробнее' }))));
    });
  }

  function openService(id) {
    const s = data.services.find((x) => x.id === id); if (!s) return;
    const body = $('#serviceBody'); body.replaceChildren();
    const examples = (s.examples || []).map(safeImg).filter(Boolean);
    body.append(el('div', { class: 'svc-detail' },
      el('div', { class: 'svc-detail__hero' }, el('img', { src: safeImg(s.image), alt: s.title })),
      el('p', { class: 'eyebrow', text: s.category }),
      el('h2', { id: 'svcTitle', text: s.title }),
      el('div', { class: 'prose' }, String(s.description || s.short).split(/\n{2,}/).map((p) => el('p', { text: p }))),
      examples.length ? el('h3', { text: 'Примеры готовых работ' }) : null,
      examples.length ? el('div', { class: 'examples' }, examples.map((u, i) =>
        el('button', { type: 'button', 'aria-label': `Открыть пример ${i + 1}`, onclick: () => openLightbox(examples.map((x) => ({ image: x, caption: s.title })), i) },
          el('img', { src: u, alt: `${s.title} — пример ${i + 1}`, loading: 'lazy' })))) : null,
      el('button', { type: 'button', class: 'btn btn--primary btn--lg', text: 'Заказать этот мастер-класс',
        onclick: () => { $('#serviceDialog').close(); openForm({ service: s.title }); } })));
    $('#serviceDialog').showModal();
    history.replaceState(null, '', '#service-' + id);
  }

  // Пакеты
  function priceBlock(p) {
    if (p.price_unit === 'custom' || p.price_from == null) {
      return [el('div', { class: 'pkg__price', text: 'По запросу' }), el('div', { class: 'pkg__unit', text: 'индивидуальный расчёт' })];
    }
    return [
      el('div', { class: 'pkg__price' }, 'от ' + fmt(p.price_from), el('small', { text: data.site.currency || '₸' })),
      el('div', { class: 'pkg__unit', text: UNIT[p.price_unit] || '' }),
    ];
  }
  function renderPackages() {
    const g = $('#packageGrid'); g.replaceChildren();
    data.packages.forEach((p) => {
      g.append(el('article', { class: 'card pkg reveal is-visible' + (p.highlighted ? ' pkg--hl' : '') },
        p.highlighted ? el('span', { class: 'pkg__badge', text: 'Популярный выбор' }) : null,
        el('h3', { class: 'pkg__name', text: p.name }),
        el('p', { class: 'pkg__desc', text: p.description }),
        ...priceBlock(p),
        p.price_note ? el('p', { class: 'muted', style: 'font-size:.8rem;margin:-.8rem 0 1rem', text: p.price_note }) : null,
        p.includes ? el('p', { class: 'pkg__includes', text: p.includes }) : null,
        el('ul', {}, (p.features || []).map((f) => el('li', {}, icon('i-check'), el('span', { text: f })))),
        el('button', { type: 'button', class: 'btn ' + (p.highlighted ? 'btn--primary' : 'btn--ghost'), text: 'Выбрать пакет', onclick: () => openForm({ pkg: p.code }) })));
    });
  }

  // Галерея и лайтбокс
  function renderGallery() {
    const g = $('#galleryGrid'); g.replaceChildren();
    data.gallery.forEach((it, i) => {
      g.append(el('button', { type: 'button', class: 'shot', 'aria-label': 'Увеличить: ' + (it.caption || 'фото'), onclick: () => openLightbox(data.gallery, i) },
        el('img', { src: safeImg(it.image), alt: it.caption || 'Работа', loading: 'lazy', decoding: 'async' }),
        it.caption ? el('span', { text: it.caption }) : null));
    });
  }
  let lb = { items: [], i: 0 };
  function showLb() {
    const it = lb.items[lb.i];
    $('#lbImg').src = safeImg(it.image); $('#lbImg').alt = it.caption || '';
    $('#lbCap').textContent = it.caption || '';
    const multi = lb.items.length > 1;
    $('#lbPrev').style.visibility = $('#lbNext').style.visibility = multi ? 'visible' : 'hidden';
  }
  function openLightbox(items, i) { lb = { items, i }; showLb(); const d = $('#lightbox'); if (!d.open) d.showModal(); }
  const stepLb = (d) => { lb.i = (lb.i + d + lb.items.length) % lb.items.length; showLb(); };
  $('#lbPrev').addEventListener('click', () => stepLb(-1));
  $('#lbNext').addEventListener('click', () => stepLb(1));
  $('#lightbox').addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') stepLb(-1); if (e.key === 'ArrowRight') stepLb(1); });
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox' || e.target.tagName === 'FIGURE') e.currentTarget.close(); });

  // Контакты
  function renderContacts() {
    const s = data.site;
    const list = $('#contactList'); list.replaceChildren();
    const row = (ic, label, content) => list.append(el('li', {}, el('span', { class: 'icon-bubble' }, icon(ic)), el('div', {}, el('small', { text: label }), content)));
    if (s.phone) row('i-phone', 'Телефон', el('a', { href: 'tel:' + s.phone.replace(/[^\d+]/g, ''), text: s.phone }));
    if (s.email) row('i-mail', 'Почта', el('a', { href: 'mailto:' + s.email, text: s.email }));
    if (s.city) row('i-pin', 'Город', el('span', { text: s.city }));
    if (s.work_hours) row('i-clock', 'Время работы менеджера', el('span', { text: s.work_hours }));
    const soc = $('#socialBtns'); soc.replaceChildren();
    const wa = s.whatsapp_url
      ? s.whatsapp_url + '?text=' + encodeURIComponent(`Здравствуйте! Хочу узнать про мастер-классы (${s.company_name}).`) : '';
    if (wa) soc.append(el('a', { class: 'btn btn--wa', href: wa, target: '_blank', rel: 'noopener' }, icon('i-whatsapp'), 'Написать менеджеру в WhatsApp'));
    if (s.telegram_url) soc.append(el('a', { class: 'btn btn--tg', href: s.telegram_url, target: '_blank', rel: 'noopener' }, icon('i-telegram'), 'Telegram'));
    if (s.instagram_url) soc.append(el('a', { class: 'btn btn--ig', href: s.instagram_url, target: '_blank', rel: 'noopener' }, icon('i-instagram'), 'Instagram'));
  }

  // FAQ
  function renderFaq() {
    const box = $('#faqList'); box.replaceChildren();
    data.faq.forEach((f) => {
      box.append(el('details', { class: 'reveal is-visible' },
        el('summary', { text: f.question }),
        el('div', { class: 'faq__a' }, String(f.answer).split(/\n{2,}/).map((p) => el('p', { text: p })))));
    });
  }

  // ───────── поведение страницы ─────────
  const header = $('#header');
  const fab = $('.fab');
  const onScroll = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 10);
    const hero = $('#top').getBoundingClientRect();
    fab.classList.toggle('is-hidden', hero.bottom > 200 || $('#formDialog').open);
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const burger = $('#burger'); const nav = $('#nav');
  const setMenu = (open) => { nav.classList.toggle('is-open', open); burger.setAttribute('aria-expanded', String(open)); };
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a, button')) setMenu(false); });

  let io;
  function observeReveal() {
    if (!('IntersectionObserver' in window)) { $$('.reveal').forEach((n) => n.classList.add('is-visible')); return; }
    io ||= new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal:not(.is-visible)').forEach((n) => io.observe(n));
  }

  // Закрытие диалогов
  $$('dialog').forEach((d) => {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    d.addEventListener('close', () => { if (location.hash.startsWith('#service-')) history.replaceState(null, '', location.pathname); onScroll(); });
  });
  $('#footerYear').textContent = '';
  $('#openPrivacy').addEventListener('click', () => $('#privacyDialog').showModal());
  $('#consentPolicy').addEventListener('click', () => $('#privacyDialog').showModal());

  function handleHash() {
    const m = /^#service-(\d+)$/.exec(location.hash);
    if (m) openService(Number(m[1]));
    if (location.hash === '#request') openForm();
  }

  // ───────── анкета ─────────
  const form = $('#wizard');
  const TOTAL = 6;
  let step = 1; let token = ''; const state = { services: new Set() };

  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function buildChoices() {
    const et = $('#eventTypes'); et.replaceChildren();
    EVENT_TYPES.forEach((t) => et.append(el('label', { class: 'choice' }, el('input', { type: 'radio', name: 'event_type', value: t }), el('span', { text: t }))));

    const sc = $('#serviceChoices'); sc.replaceChildren();
    const cats = [...new Set(data.services.map((s) => s.category))];
    cats.forEach((c) => {
      sc.append(el('div', { class: 'svc-group' }, el('h4', { text: c }),
        el('div', { class: 'choice-row' }, data.services.filter((s) => s.category === c).map((s) =>
          el('label', { class: 'choice' }, el('input', { type: 'checkbox', name: 'service', value: s.title, ...(state.services.has(s.title) ? { checked: '' } : {}) }), el('span', { text: s.title }))))));
    });

    const pc = $('#packageChoices'); pc.replaceChildren();
    const opt = (code, title, sub, price) => el('label', { class: 'pkg-choice' },
      el('input', { type: 'radio', name: 'package', value: code }),
      el('div', {}, el('div', {}, el('strong', { text: title }), el('small', { text: sub })), price ? el('span', { class: 'price', text: price }) : null));
    data.packages.forEach((p) => pc.append(opt(p.code, p.name, p.description,
      p.price_from != null && p.price_unit !== 'custom' ? `от ${fmt(p.price_from)} ${data.site.currency || '₸'}` : 'по запросу')));
    pc.append(opt('UNDECIDED', 'Не определился(-ась)', 'Нужна консультация менеджера', ''));
  }

  function setRadio(name, value) { const r = form.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`); if (r) r.checked = true; }

  async function openForm({ service, pkg } = {}) {
    if (!data) return;
    const dlg = $('#formDialog');
    form.hidden = false; $('#formSuccess').hidden = true;
    if (!dlg.open) {
      form.reset(); state.services = new Set(); step = 1;
      form.event_date.min = today();
      form.participants.value = 6;
      buildChoices();
      setRadio('package', 'UNDECIDED');
      $('#formError').textContent = '';
      clearErrors();
    }
    if (service) { state.services.add(service); const cb = form.querySelector(`input[name="service"][value="${CSS.escape(service)}"]`); if (cb) cb.checked = true; }
    if (pkg) setRadio('package', pkg);
    showStep(step);
    if (!dlg.open) dlg.showModal();
    onScroll();
    try { token = (await (await fetch('/api/form-token')).json()).token; } catch { token = ''; }
  }
  $$('[data-open-form]').forEach((b) => b.addEventListener('click', () => { openForm(); }));
  window.addEventListener('hashchange', handleHash);

  function showStep(n) {
    step = n;
    $$('.step', form).forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    $('#stepLabel').textContent = `Шаг ${n} из ${TOTAL}`;
    $('#progressBar').style.width = `${(n / TOTAL) * 100}%`;
    $('#btnBack').style.visibility = n === 1 ? 'hidden' : 'visible';
    $('#btnNext').hidden = n === TOTAL; $('#btnSubmit').hidden = n !== TOTAL;
    if (n === TOTAL) renderSummary();
    const first = $('.step:not([hidden]) input:not([type=hidden]), .step:not([hidden]) textarea', form);
    if (first && n !== 4 && n !== 3) setTimeout(() => first.focus({ preventScroll: true }), 50);
    $('.modal__box', $('#formDialog')).scrollTop = 0;
  }

  function clearErrors() {
    $$('[data-err]', form).forEach((e) => { e.textContent = ''; });
    $$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
  }
  function setError(name, msg) {
    const e = form.querySelector(`[data-err="${name}"]`); if (e) e.textContent = msg;
    const inp = form.elements[name]; const f = inp && inp.closest ? inp.closest('.field') : null; if (f) f.classList.add('has-error');
  }

  const radioVal = (name) => (form.querySelector(`input[name="${name}"]:checked`) || {}).value || '';

  function stepErrors(n) {
    const errs = {};
    if (n === 1) {
      if (form.name.value.trim().length < 2) errs.name = 'Укажите имя';
      const digits = form.phone.value.replace(/\D/g, '');
      if (!/^[\d+\-()\s]+$/.test(form.phone.value.trim()) || digits.length < 10 || digits.length > 15) errs.phone = 'Укажите корректный номер телефона';
      if (!radioVal('contact_method')) errs.contact_method = 'Выберите способ связи';
    }
    if (n === 2) {
      const d = form.event_date.value;
      if (!d) errs.event_date = 'Выберите дату мероприятия';
      else if (d < today()) errs.event_date = 'Дата не может быть в прошлом';
      const p = Number(form.participants.value);
      if (!Number.isInteger(p) || p < 1 || p > 500) errs.participants = 'Укажите количество участников (от 1 до 500)';
      if (!radioVal('event_type')) errs.event_type = 'Выберите формат мероприятия';
    }
    if (n === 4 && !radioVal('package')) errs.package = 'Выберите пакет';
    if (n === 6 && !form.consent.checked) errs.consent = 'Необходимо согласие на обработку персональных данных';
    return errs;
  }

  function validateStep(n) {
    clearErrors();
    const errs = stepErrors(n);
    Object.entries(errs).forEach(([k, v]) => setError(k, v));
    const firstKey = Object.keys(errs)[0];
    if (firstKey && form.elements[firstKey] && form.elements[firstKey].focus) form.elements[firstKey].focus();
    return !Object.keys(errs).length;
  }

  $('#btnNext').addEventListener('click', () => { if (validateStep(step)) showStep(step + 1); });
  $('#btnBack').addEventListener('click', () => showStep(Math.max(1, step - 1)));
  // Enter не должен отправлять форму раньше времени
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'checkbox') {
      e.preventDefault(); if (step < TOTAL) $('#btnNext').click(); else form.requestSubmit();
    }
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'service') { e.target.checked ? state.services.add(e.target.value) : state.services.delete(e.target.value); }
  });
  $('[data-step-dec]', form).addEventListener('click', () => { form.participants.value = Math.max(1, Number(form.participants.value || 1) - 1); });
  $('[data-step-inc]', form).addEventListener('click', () => { form.participants.value = Math.min(500, Number(form.participants.value || 0) + 1); });

  function renderSummary() {
    const pk = radioVal('package');
    const pkgName = pk === 'UNDECIDED' ? 'Нужна консультация' : (data.packages.find((p) => p.code === pk) || {}).name || pk;
    const [y, m, d] = form.event_date.value.split('-');
    const rows = [
      ['Имя', form.name.value.trim()], ['Телефон', form.phone.value.trim()], ['Связь', CONTACT[radioVal('contact_method')]],
      ['Дата', `${d}.${m}.${y}${form.event_time.value ? ' в ' + form.event_time.value : ''}`],
      ['Участников', form.participants.value], ['Формат', radioVal('event_type')],
      ['Услуги', [...state.services].join(', ') || 'Выберем вместе с менеджером'], ['Пакет', pkgName],
    ];
    if (form.wishes.value.trim()) rows.push(['Пожелания', form.wishes.value.trim()]);
    const dl = $('#summary'); dl.replaceChildren();
    rows.forEach(([k, v]) => dl.append(el('dt', { text: k }), el('dd', { text: v })));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (let n = 1; n <= TOTAL; n++) {
      if (n === 3 || n === 5) continue;
      if (!validateStep(n)) { showStep(n); return; }
    }
    const btn = $('#btnSubmit'); btn.disabled = true; btn.textContent = 'Отправляем…';
    $('#formError').textContent = '';
    const payload = {
      name: form.name.value.trim(), phone: form.phone.value.trim(), contact_method: radioVal('contact_method'),
      event_date: form.event_date.value, event_time: form.event_time.value, participants: Number(form.participants.value),
      event_type: radioVal('event_type'), services: [...state.services], package: radioVal('package'),
      wishes: form.wishes.value.trim(), consent: form.consent.checked, website: form.website.value, token,
    };
    try {
      const res = await fetch('/api/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok) {
        form.hidden = true; $('#formSuccess').hidden = false;
        $('.modal__box', $('#formDialog')).scrollTop = 0;
      } else if (res.status === 422 && out.errors) {
        const keys = Object.keys(out.errors);
        const stepOf = { name: 1, phone: 1, contact_method: 1, event_date: 2, event_time: 2, participants: 2, event_type: 2, package: 4, consent: 6 };
        showStep(Math.min(...keys.map((k) => stepOf[k] || 6)));
        keys.forEach((k) => setError(k, out.errors[k]));
        $('#formError').textContent = out.error || 'Проверьте заполнение формы';
      } else {
        $('#formError').textContent = out.error || 'Не удалось отправить заявку. Попробуйте ещё раз или напишите нам в мессенджер.';
        if (res.status === 400) fetch('/api/form-token').then((r) => r.json()).then((j) => { token = j.token; }).catch(() => {});
      }
    } catch {
      $('#formError').textContent = 'Нет соединения. Проверьте интернет и попробуйте ещё раз.';
    } finally {
      btn.disabled = false; btn.textContent = 'Отправить заявку';
    }
  });

  load();
})();
