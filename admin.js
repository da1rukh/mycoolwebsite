/* Gardener's panel. Loaded on demand by script.js; never part of the public page weight.
   All page text is plain text: we read innerText and write textContent, never HTML. */
(() => {
  const garden = window.garden;
  if (!garden || window.gardenAdmin) return;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const TOKEN_KEY = 'ft-admin-token';
  const plaintextOnly = (() => { const probe = document.createElement('div'); probe.contentEditable = 'plaintext-only'; return probe.contentEditable === 'plaintext-only'; })();

  let token = (() => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } })();
  let draft = clone(garden.content);
  let editing = false;
  let dock = null;
  let panel = null;
  let loginDialog = null;

  function clone(value) { return JSON.parse(JSON.stringify({ texts: value.texts || {}, links: value.links || {}, images: value.images || {} })); }
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === false || value == null) continue;
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value === true ? '' : value);
    }
    node.append(...children.filter(child => child != null && child !== false));
    return node;
  }
  function icon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
  }
  const ICONS = {
    pen: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
    save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    panel: 'M4 5h16v14H4zM14 5v14',
    exit: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    close: 'M6 6l12 12M18 6 6 18',
    seed: 'M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7',
    target: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    reset: 'M4 4v6h6M5 15a7 7 0 1 0 2-8.5L4 10',
    eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    trash: 'M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    minimize: 'M6 12h12'
  };

  /* ---------- API ---------- */
  async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
    let response;
    try {
      response = await fetch(path, {
        method,
        cache: 'no-store',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? (raw ? body : JSON.stringify(body)) : undefined
      });
    } catch { throw new Error('Нет связи с сервером. Проверь интернет и попробуй ещё раз.'); }
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && path === '/api/admin/session') { forgetToken(); throw new Error('Сессия закончилась.'); }
    if (response.status === 401 && path !== '/api/admin/login') {
      forgetToken();
      unmount();
      openLogin('Сессия закончилась. Войди снова — несохранённые правки остались на странице.');
      throw new Error('Сессия закончилась.');
    }
    if (!response.ok) throw new Error(result.error || 'Сервер не принял запрос.');
    return result;
  }
  function rememberToken(value) { token = value; try { sessionStorage.setItem(TOKEN_KEY, value); } catch {} }
  function forgetToken() { token = ''; try { sessionStorage.removeItem(TOKEN_KEY); } catch {} }

  /* ---------- login ---------- */
  function buildLogin() {
    const input = el('input', { id: 'ga-password', type: 'password', autocomplete: 'current-password', required: true, spellcheck: 'false' });
    const reveal = el('button', { type: 'button', class: 'ga-icon-button', 'aria-label': 'Показать пароль', 'aria-pressed': 'false' }, icon(ICONS.eye));
    reveal.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      reveal.setAttribute('aria-pressed', String(show));
      reveal.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
      input.focus();
    });
    const status = el('p', { class: 'ga-login-status', role: 'status', 'aria-live': 'polite' });
    const submit = el('button', { type: 'submit', class: 'ga-button ga-button-gold' }, 'Войти');
    const form = el('form', { class: 'ga-login-form', method: 'dialog' },
      el('div', { class: 'ga-login-mark', 'aria-hidden': 'true' }, icon(ICONS.seed)),
      el('h2', { id: 'ga-login-title', text: 'Калитка садовника' }),
      el('p', { class: 'ga-login-lead', text: 'Только для хозяина сада. Пароль не сохраняется — после входа выдаётся временный ключ на 12 часов.' }),
      el('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'flowertalker', hidden: true, tabindex: '-1', 'aria-hidden': 'true' }),
      el('label', { for: 'ga-password', text: 'Пароль' }),
      el('div', { class: 'ga-password' }, input, reveal),
      status,
      el('div', { class: 'ga-login-actions' },
        el('button', { type: 'button', class: 'ga-button ga-button-ghost', onclick: () => loginDialog.close() }, 'Закрыть'),
        submit)
    );
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!input.value) { status.textContent = 'Введи пароль.'; input.focus(); return; }
      submit.disabled = true;
      status.textContent = 'Открываю калитку…';
      try {
        const result = await api('/api/admin/login', { method: 'POST', body: { password: input.value } });
        rememberToken(result.token);
        input.value = '';
        status.textContent = '';
        loginDialog.close();
        mount();
        garden.showToast('Добро пожаловать в сад. Текст можно править прямо на странице.');
      } catch (error) {
        status.textContent = error.message;
        input.select();
      } finally { submit.disabled = false; }
    });
    loginDialog = el('dialog', { class: 'ga-login', 'aria-labelledby': 'ga-login-title' }, form);
    loginDialog.addEventListener('click', event => { if (event.target === loginDialog) loginDialog.close(); });
    document.body.append(loginDialog);
    return { input, status };
  }
  let loginParts = null;
  function openLogin(message = '') {
    if (!loginDialog) loginParts = buildLogin();
    loginParts.status.textContent = message;
    if (!loginDialog.open) loginDialog.showModal();
    loginParts.input.focus();
  }

  /* ---------- dirty tracking ---------- */
  const saved = () => garden.content;
  function valueOf(kind, key, source) {
    if (kind === 'texts') return Object.hasOwn(source.texts, key) ? source.texts[key] : garden.defaults.texts[key];
    if (kind === 'links') return Object.hasOwn(source.links, key) ? source.links[key] : garden.defaults.links[key];
    const image = source.images[key];
    return { src: image?.src || garden.defaults.images[key].src, alt: image?.alt || garden.defaults.images[key].alt };
  }
  function changedKeys() {
    const changed = [];
    for (const key of Object.keys(garden.defaults.texts)) if (valueOf('texts', key, draft) !== valueOf('texts', key, saved())) changed.push(['texts', key]);
    for (const key of Object.keys(garden.defaults.links)) if (valueOf('links', key, draft) !== valueOf('links', key, saved())) changed.push(['links', key]);
    for (const key of Object.keys(garden.defaults.images)) {
      const a = valueOf('images', key, draft), b = valueOf('images', key, saved());
      if (a.src !== b.src || a.alt !== b.alt) changed.push(['images', key]);
    }
    return changed;
  }
  // Only values that differ from the HTML defaults are stored, so future default copy still flows through.
  function payload() {
    const result = { texts: {}, links: {}, images: {} };
    for (const key of Object.keys(garden.defaults.texts)) { const value = valueOf('texts', key, draft); if (value !== garden.defaults.texts[key]) result.texts[key] = value; }
    for (const key of Object.keys(garden.defaults.links)) { const value = valueOf('links', key, draft); if (value !== garden.defaults.links[key]) result.links[key] = value; }
    for (const key of Object.keys(garden.defaults.images)) {
      const value = valueOf('images', key, draft), base = garden.defaults.images[key];
      if (value.src !== base.src || value.alt !== base.alt) result.images[key] = value;
    }
    return result;
  }
  function refreshState() {
    const changed = changedKeys();
    const dirtyTexts = new Set(changed.filter(([kind]) => kind === 'texts').map(([, key]) => key));
    $$('[data-edit]').forEach(node => node.toggleAttribute('data-ga-dirty', dirtyTexts.has(node.dataset.edit)));
    if (dock) {
      dock.count.textContent = String(changed.length);
      dock.root.classList.toggle('has-changes', changed.length > 0);
      dock.save.disabled = changed.length === 0;
      dock.revert.disabled = changed.length === 0;
      dock.save.setAttribute('aria-label', changed.length ? `Сохранить изменения: ${changed.length}` : 'Изменений нет');
    }
    if (panel) $$('[data-ga-field]', panel.root).forEach(row => {
      const [kind, key] = row.dataset.gaField.split('|');
      row.classList.toggle('is-dirty', changed.some(([k, name]) => k === kind && name === key));
      row.classList.toggle('is-custom', kind === 'texts' ? valueOf('texts', key, draft) !== garden.defaults.texts[key] : false);
    });
    return changed.length;
  }

  /* ---------- inline editing ---------- */
  function readEditable(node) {
    let text = node.innerText.replace(/ /g, ' ');
    if (!node.hasAttribute('data-multiline')) text = text.replace(/\s*\n+\s*/g, ' ');
    return text.replace(/\n{3,}/g, '\n\n');
  }
  function setText(key, value, source) {
    draft.texts[key] = value;
    $$(`[data-edit="${CSS.escape(key)}"]`).forEach(node => { if (node !== source && node.textContent !== value) node.textContent = value; });
    if (panel) {
      const area = $(`[data-ga-field="texts|${CSS.escape(key)}"] textarea`, panel.root);
      if (area && area !== source && area.value !== value) { area.value = value; autosize(area); }
    }
    garden.markEmpty();
    refreshState();
  }
  function onEditableInput(event) {
    const node = event.target.closest('[data-edit]');
    if (!node || !editing) return;
    setText(node.dataset.edit, readEditable(node), node);
  }
  function onEditableKeydown(event) {
    const node = event.target.closest?.('[data-edit]');
    if (!node || !editing) return;
    if (event.key === 'Escape') { node.blur(); event.stopPropagation(); }
    if (event.key === 'Enter' && !node.hasAttribute('data-multiline')) { event.preventDefault(); node.blur(); }
  }
  function onEditablePaste(event) {
    const node = event.target.closest?.('[data-edit]');
    if (!node || !editing || plaintextOnly) return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  }
  // While editing, links and buttons that hold text must not navigate or toggle.
  function onEditableClick(event) {
    if (!editing) return;
    const node = event.target.closest('[data-edit]');
    if (node && node.closest('a, button, summary')) { event.preventDefault(); event.stopPropagation(); node.focus(); }
  }
  function setEditing(on) {
    editing = on;
    document.documentElement.classList.toggle('ga-editing', on);
    $$('[data-edit]').forEach(node => {
      if (on) {
        node.contentEditable = plaintextOnly ? 'plaintext-only' : 'true';
        node.spellcheck = true;
        if (node.closest('a, button, summary')) node.tabIndex = 0;
      } else {
        node.removeAttribute('contenteditable');
        node.removeAttribute('spellcheck');
        if (node.closest('a, button, summary')) node.removeAttribute('tabindex');
      }
    });
    if (dock) {
      dock.edit.setAttribute('aria-pressed', String(on));
      dock.editLabel.textContent = on ? 'Правка включена' : 'Править текст';
    }
    garden.relayout();
  }

  /* ---------- save / revert ---------- */
  async function save() {
    if (!refreshState()) { garden.showToast('Нечего сохранять — всё уже на месте.'); return; }
    dock.save.disabled = true;
    dock.root.classList.add('is-saving');
    try {
      const result = await api('/api/admin/content', { method: 'PUT', body: payload() });
      garden.applyContent(result);
      draft = clone(result);
      refreshState();
      if (panel) panel.updateMeta();
      dock.root.classList.add('just-saved');
      setTimeout(() => dock?.root.classList.remove('just-saved'), 1600);
      garden.showToast('Сохранено. Гости уже видят новый текст.');
    } catch (error) {
      garden.showToast(error.message, 4200);
      refreshState();
    } finally { dock?.root.classList.remove('is-saving'); }
  }
  function revert() {
    draft = clone(saved());
    garden.applyContent(saved());
    if (panel) panel.fill();
    refreshState();
    garden.showToast('Правки отменены. Вернулся сохранённый вариант.');
  }

  /* ---------- small confirm dialog ---------- */
  function ask(question, confirmLabel = 'Да', danger = false) {
    return new Promise(resolve => {
      const dialog = el('dialog', { class: 'ga-ask' },
        el('p', { text: question }),
        el('div', { class: 'ga-ask-actions' },
          el('button', { type: 'button', class: 'ga-button ga-button-ghost', value: 'no' }, 'Отмена'),
          el('button', { type: 'button', class: `ga-button ${danger ? 'ga-button-danger' : 'ga-button-gold'}`, value: 'yes' }, confirmLabel)));
      $$('button', dialog).forEach(button => button.addEventListener('click', () => dialog.close(button.value)));
      dialog.addEventListener('close', () => { resolve(dialog.returnValue === 'yes'); dialog.remove(); });
      document.body.append(dialog);
      dialog.showModal();
      $('.ga-button-ghost', dialog).focus();
    });
  }

  /* ---------- labels ---------- */
  const SECTIONS = { nav: 'Меню', hero: 'Первый экран', story: 'История роста', stage: 'Пометки у цветка', about: 'Садовник', bloom: 'Что цветёт', sheet: 'Окна увлечений', herb: 'Гербарий', dusk: 'Вечер', footer: 'Подвал' };
  const WORDS = {
    grow: 'пункт «как растёт»', bloom: 'пункт «что цветёт»', herbarium: 'пункт «гербарий»',
    title: 'заголовок', title1: 'заголовок, первая строка', title2: 'заголовок, имя', intro: 'вступление', note: 'рукописная пометка',
    note1: 'пометка у корней', note2: 'пометка у цветка', cta: 'главная кнопка', water: 'кнопка полива', time: 'время', phase: 'фаза',
    text: 'текст', caption: 'подпись к фото', label: 'название', value: 'значение', kin: 'kin-list', name: 'имя', from: 'откуда',
    psy: 'портрет', short: 'подпись', open: 'кнопка «открыть»', open2: 'кнопка «открыть» 2', open3: 'кнопка «открыть» 3', open4: 'кнопка «открыть» 4',
    empty: 'когда треков нет', steam: 'кнопка Steam', top: 'кнопка наверх', copy: 'копирайт', meta: 'подпись', music: 'музыка', draw: 'рисование',
    games: 'игры', books: 'книги', fact1: 'факт 1', fact2: 'факт 2', fact3: 'факт 3', fact4: 'факт 4', about: 'пункт «садовник»'
  };
  function labelFor(key) {
    const [section, ...rest] = key.split('.');
    const parts = rest.map(part => WORDS[part] || (/^\d+$/.test(part) ? `№${part}` : part));
    return { section: SECTIONS[section] || section, label: parts.join(' · ') || key };
  }

  /* ---------- reveal a field on the page ---------- */
  function locate(node) {
    const details = node.closest('details');
    if (details) details.open = true;
    const page = node.closest('[data-sheet-page]');
    if (page) garden.openSheet(page.dataset.sheetPage);
    const card = node.closest('.pressed');
    if (card && !editing) garden.setPressed(card, true);
    if (!page) node.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    node.classList.remove('ga-flash');
    void node.offsetWidth;
    node.classList.add('ga-flash');
    setTimeout(() => node.classList.remove('ga-flash'), 1800);
    if (editing) setTimeout(() => node.focus({ preventScroll: true }), page ? 50 : 450);
  }

  /* ---------- panel ---------- */
  function autosize(area) { area.style.height = 'auto'; area.style.height = `${area.scrollHeight + 2}px`; }
  function buildPanel() {
    const tabs = [['texts', 'Тексты'], ['media', 'Ссылки и фото'], ['music', 'Музыка'], ['backup', 'Резерв']];
    const tabList = el('div', { class: 'ga-tabs', role: 'tablist', 'aria-label': 'Разделы панели' });
    const views = {};
    const root = el('aside', { class: 'ga-panel', 'aria-label': 'Панель садовника', hidden: true });
    const meta = el('p', { class: 'ga-panel-meta' });
    const header = el('div', { class: 'ga-panel-head' },
      el('div', {}, el('p', { class: 'ga-kicker', text: 'панель садовника' }), meta),
      el('button', { type: 'button', class: 'ga-icon-button', 'aria-label': 'Закрыть панель', onclick: () => togglePanel(false) }, icon(ICONS.close)));
    tabs.forEach(([id, name], index) => {
      const tab = el('button', { type: 'button', role: 'tab', id: `ga-tab-${id}`, 'aria-controls': `ga-view-${id}`, 'aria-selected': String(index === 0), tabindex: index === 0 ? '0' : '-1', text: name });
      tab.addEventListener('click', () => selectTab(id));
      tab.addEventListener('keydown', event => {
        if (!['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
        const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectTab(tabs[next][0]);
        $(`#ga-tab-${tabs[next][0]}`).focus();
      });
      tabList.append(tab);
      views[id] = el('section', { class: 'ga-view', role: 'tabpanel', id: `ga-view-${id}`, 'aria-labelledby': `ga-tab-${id}`, hidden: index !== 0 });
    });
    function selectTab(id) {
      tabs.forEach(([name]) => {
        const tab = $(`#ga-tab-${name}`, root);
        tab.setAttribute('aria-selected', String(name === id));
        tab.tabIndex = name === id ? 0 : -1;
        views[name].hidden = name !== id;
      });
      if (id === 'music') renderMusic();
    }
    root.append(header, tabList, ...Object.values(views));

    /* texts */
    const search = el('input', { type: 'search', class: 'ga-search', placeholder: 'Найти текст…', 'aria-label': 'Поиск по текстам' });
    const onlyChanged = el('input', { type: 'checkbox', id: 'ga-only-changed' });
    const fieldList = el('div', { class: 'ga-fields' });
    const emptyResult = el('p', { class: 'ga-empty', hidden: true, text: 'Ничего не нашлось. Попробуй другое слово.' });
    views.texts.append(
      el('div', { class: 'ga-toolbar' }, search, el('label', { class: 'ga-check', for: 'ga-only-changed' }, onlyChanged, ' только изменённые')),
      el('p', { class: 'ga-hint', text: 'Правь прямо здесь или включи «Править текст» и щёлкни по любому тексту на странице. Пустое поле скрывает элемент.' }),
      fieldList, emptyResult);
    let currentSection = '';
    Object.keys(garden.defaults.texts).forEach(key => {
      const { section, label } = labelFor(key);
      if (section !== currentSection) { fieldList.append(el('h3', { class: 'ga-group', text: section })); currentSection = section; }
      const node = $(`[data-edit="${CSS.escape(key)}"]`);
      const multiline = node?.hasAttribute('data-multiline');
      const area = el('textarea', { id: `ga-f-${key}`, rows: multiline ? 3 : 1, spellcheck: 'true' });
      area.addEventListener('input', () => {
        let value = area.value;
        if (!multiline) value = value.replace(/\s*\n+\s*/g, ' ');
        setText(key, value, area);
        autosize(area);
      });
      const reset = el('button', { type: 'button', class: 'ga-mini', title: 'Вернуть исходный текст', 'aria-label': `Вернуть исходный текст: ${label}` }, icon(ICONS.reset));
      reset.addEventListener('click', () => { area.value = garden.defaults.texts[key]; setText(key, area.value, null); autosize(area); });
      const find = el('button', { type: 'button', class: 'ga-mini', title: 'Показать на странице', 'aria-label': `Показать на странице: ${label}` }, icon(ICONS.target));
      find.addEventListener('click', () => { if (node) { if (matchMedia('(max-width: 760px)').matches) togglePanel(false); locate(node); } });
      fieldList.append(el('div', { class: 'ga-field', 'data-ga-field': `texts|${key}`, 'data-search': `${section} ${label} ${key}`.toLowerCase() },
        el('div', { class: 'ga-field-head' }, el('label', { for: `ga-f-${key}`, text: label }), el('span', { class: 'ga-field-actions' }, find, reset)),
        area));
    });
    function filterFields() {
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      $$('.ga-field', fieldList).forEach(row => {
        const area = $('textarea', row);
        const match = (!query || row.dataset.search.includes(query) || area.value.toLowerCase().includes(query)) && (!onlyChanged.checked || row.classList.contains('is-custom') || row.classList.contains('is-dirty'));
        row.hidden = !match;
        if (match) visible += 1;
      });
      $$('.ga-group', fieldList).forEach(group => {
        let next = group.nextElementSibling, any = false;
        while (next && !next.matches('.ga-group')) { if (!next.hidden) any = true; next = next.nextElementSibling; }
        group.hidden = !any;
      });
      emptyResult.hidden = visible > 0;
    }
    search.addEventListener('input', filterFields);
    onlyChanged.addEventListener('change', filterFields);

    /* media */
    const mediaFields = el('div', { class: 'ga-fields' });
    views.media.append(el('p', { class: 'ga-hint', text: 'Ссылки — https://, http://, mailto: или #якорь. Картинки — только https://. Пустая ссылка прячет кнопку.' }), mediaFields);
    Object.keys(garden.defaults.links).forEach(key => {
      const input = el('input', { type: 'url', id: `ga-l-${key}`, inputmode: 'url', spellcheck: 'false' });
      const status = el('p', { class: 'ga-field-error', role: 'status' });
      input.addEventListener('input', () => {
        const value = input.value.trim();
        const valid = value === '' || /^(https?:\/\/|mailto:|#)/i.test(value);
        status.textContent = valid ? '' : 'Нужен адрес вида https://…';
        input.setAttribute('aria-invalid', String(!valid));
        if (!valid) return;
        draft.links[key] = value;
        $$(`[data-link="${CSS.escape(key)}"]`).forEach(link => { if (value) link.setAttribute('href', value); else link.removeAttribute('href'); });
        garden.markEmpty();
        refreshState();
      });
      mediaFields.append(el('div', { class: 'ga-field', 'data-ga-field': `links|${key}` },
        el('div', { class: 'ga-field-head' }, el('label', { for: `ga-l-${key}`, text: key === 'steam' ? 'Ссылка на Steam' : `Ссылка: ${key}` })), input, status));
    });
    const IMAGE_NAMES = { 'about.photo': 'Фото садовника', 'herb.photo': 'Фото в гербарии' };
    Object.keys(garden.defaults.images).forEach(key => {
      const preview = el('img', { class: 'ga-preview', alt: '' });
      const src = el('input', { type: 'url', id: `ga-i-${key}`, inputmode: 'url', spellcheck: 'false' });
      const alt = el('input', { type: 'text', id: `ga-a-${key}` });
      const status = el('p', { class: 'ga-field-error', role: 'status' });
      const apply = () => {
        const value = src.value.trim();
        const valid = value === '' || /^https:\/\//i.test(value);
        status.textContent = valid ? '' : 'Картинка должна открываться по https://';
        src.setAttribute('aria-invalid', String(!valid));
        if (!valid) return;
        draft.images[key] = { src: value, alt: alt.value };
        const current = valueOf('images', key, draft);
        $$(`[data-image="${CSS.escape(key)}"]`).forEach(img => { img.src = current.src; img.alt = current.alt; });
        preview.src = current.src;
        refreshState();
      };
      src.addEventListener('input', apply);
      alt.addEventListener('input', apply);
      preview.addEventListener('error', () => { status.textContent = 'Картинка по этому адресу не загрузилась.'; });
      preview.addEventListener('load', () => { if (status.textContent.startsWith('Картинка по')) status.textContent = ''; });
      mediaFields.append(el('div', { class: 'ga-field ga-image-field', 'data-ga-field': `images|${key}` },
        el('div', { class: 'ga-field-head' }, el('span', { class: 'ga-field-title', text: IMAGE_NAMES[key] || key })),
        preview,
        el('label', { for: `ga-i-${key}`, text: 'Адрес картинки (пусто — исходная)' }), src,
        el('label', { for: `ga-a-${key}`, text: 'Описание для незрячих' }), alt, status));
    });

    /* music */
    const trackList = el('div', { class: 'ga-tracks' });
    const musicStatus = el('p', { class: 'ga-hint', role: 'status', 'aria-live': 'polite' });
    const fileInput = el('input', { type: 'file', accept: 'audio/mpeg,.mp3', multiple: true, class: 'visually-hidden', id: 'ga-upload' });
    views.music.append(
      el('p', { class: 'ga-hint', text: 'Треки появляются в окне «музыка». MP3 до 15 МБ; сохраняются сразу, без кнопки «Сохранить».' }),
      el('label', { class: 'ga-button ga-button-gold ga-upload', for: 'ga-upload' }, icon(ICONS.upload), 'Загрузить MP3'), fileInput,
      musicStatus, trackList,
      el('button', { type: 'button', class: 'ga-button ga-button-ghost', onclick: () => garden.openSheet('music') }, 'Открыть окно «музыка»'));
    async function renderMusic() {
      trackList.replaceChildren(el('p', { class: 'ga-hint', text: 'Загружаю список…' }));
      try {
        const tracks = await api('/api/music');
        if (!tracks.length) { trackList.replaceChildren(el('p', { class: 'ga-empty', text: 'Пока ни одного трека. Загрузи первый — он сразу появится у гостей.' })); return; }
        trackList.replaceChildren(...tracks.map(track => {
          const remove = el('button', { type: 'button', class: 'ga-mini ga-mini-danger', 'aria-label': `Удалить ${track.name}`, title: 'Удалить' }, icon(ICONS.trash));
          remove.addEventListener('click', async () => {
            if (!await ask(`Удалить «${track.name}»? Гости больше не смогут его послушать.`, 'Удалить', true)) return;
            try { await api(`/api/music/${encodeURIComponent(track.id)}`, { method: 'DELETE' }); musicStatus.textContent = `«${track.name}» удалён.`; renderMusic(); garden.loadTracks(); }
            catch (error) { musicStatus.textContent = error.message; }
          });
          return el('div', { class: 'ga-track' }, el('span', { text: track.name }), el('small', { text: `${(track.size / 1048576).toFixed(1)} МБ` }), remove);
        }));
      } catch (error) { trackList.replaceChildren(el('p', { class: 'ga-empty', text: error.message })); }
    }
    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files];
      fileInput.value = '';
      let done = 0;
      for (const file of files) {
        if (!(file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name))) { musicStatus.textContent = `«${file.name}» — не MP3, пропускаю.`; continue; }
        if (file.size > 15 * 1024 * 1024) { musicStatus.textContent = `«${file.name}» больше 15 МБ, пропускаю.`; continue; }
        musicStatus.textContent = `Загружаю «${file.name}»…`;
        try {
          await api('/api/admin/music', { method: 'POST', raw: true, body: file, headers: { 'Content-Type': 'audio/mpeg', 'X-Track-Name': encodeURIComponent(file.name) } });
          done += 1;
        } catch (error) { musicStatus.textContent = `«${file.name}»: ${error.message}`; }
      }
      if (done) musicStatus.textContent = `Загружено треков: ${done}.`;
      renderMusic();
      garden.loadTracks();
    });

    /* backup */
    const importInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'ga-import' });
    const backupStatus = el('p', { class: 'ga-hint', role: 'status', 'aria-live': 'polite' });
    const exportButton = el('button', { type: 'button', class: 'ga-button ga-button-ghost' }, icon(ICONS.download), 'Скачать копию текстов');
    exportButton.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ ...payload(), exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const link = el('a', { href: URL.createObjectURL(blob), download: `flowertalker-texts-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      backupStatus.textContent = 'Копия скачана. Храни её там, где не потеряешь.';
    });
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0];
      importInput.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || typeof data !== 'object' || typeof data.texts !== 'object') throw new Error();
        const known = key => Object.hasOwn(garden.defaults.texts, key);
        draft = clone({ texts: Object.fromEntries(Object.entries(data.texts).filter(([key, value]) => known(key) && typeof value === 'string')), links: data.links || {}, images: data.images || {} });
        garden.renderContent(draft);
        fill();
        refreshState();
        backupStatus.textContent = 'Копия загружена на страницу. Проверь и нажми «Сохранить», чтобы её увидели гости.';
      } catch { backupStatus.textContent = 'Это не похоже на копию текстов сайта. Выбери файл, скачанный отсюда.'; }
    });
    const resetAll = el('button', { type: 'button', class: 'ga-button ga-button-danger-ghost' }, icon(ICONS.reset), 'Вернуть все исходные тексты');
    resetAll.addEventListener('click', async () => {
      if (!await ask('Вернуть все тексты, ссылки и фото к исходным? Изменения появятся у гостей только после «Сохранить».', 'Вернуть', true)) return;
      draft = { texts: {}, links: {}, images: {} };
      garden.renderContent(draft);
      fill();
      refreshState();
      backupStatus.textContent = 'Исходные тексты на странице. Нажми «Сохранить», чтобы закрепить.';
    });
    views.backup.append(
      el('p', { class: 'ga-hint', text: 'Скачай копию перед большими правками — её можно загрузить обратно в любой момент.' }),
      el('div', { class: 'ga-stack' }, exportButton, el('label', { class: 'ga-button ga-button-ghost', for: 'ga-import' }, icon(ICONS.upload), 'Загрузить копию'), importInput, resetAll),
      backupStatus,
      el('div', { class: 'ga-keys' },
        el('h3', { class: 'ga-group', text: 'Быстрые клавиши' }),
        el('p', {}, el('kbd', { text: 'Ctrl + Alt + G' }), ' открыть калитку'),
        el('p', {}, el('kbd', { text: 'Ctrl + E' }), ' включить или выключить правку'),
        el('p', {}, el('kbd', { text: 'Ctrl + S' }), ' сохранить'),
        el('p', {}, el('kbd', { text: 'Esc' }), ' выйти из поля')));

    function fill() {
      $$('.ga-field[data-ga-field^="texts|"]', fieldList).forEach(row => {
        const key = row.dataset.gaField.slice(6);
        const area = $('textarea', row);
        area.value = valueOf('texts', key, draft);
      });
      Object.keys(garden.defaults.links).forEach(key => { $(`#ga-l-${CSS.escape(key)}`, root).value = valueOf('links', key, draft); });
      Object.keys(garden.defaults.images).forEach(key => {
        const image = draft.images[key] || {};
        $(`#ga-i-${CSS.escape(key)}`, root).value = image.src || '';
        $(`#ga-a-${CSS.escape(key)}`, root).value = image.alt || '';
        $(`[data-ga-field="images|${CSS.escape(key)}"] .ga-preview`, root).src = valueOf('images', key, draft).src;
      });
      requestAnimationFrame(() => $$('textarea', fieldList).forEach(autosize));
      filterFields();
    }
    function updateMeta() {
      const when = saved().updatedAt ? new Date(saved().updatedAt) : null;
      meta.textContent = when ? `последнее сохранение — ${when.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : 'сайт пока показывает исходные тексты';
    }
    root.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.target.closest('textarea, input')) togglePanel(false); });
    document.body.append(root);
    fill();
    updateMeta();
    return { root, fill, updateMeta, renderMusic, selectTab };
  }
  function togglePanel(force) {
    if (!panel) panel = buildPanel();
    const open = force ?? panel.root.hidden;
    panel.root.hidden = !open;
    document.documentElement.classList.toggle('ga-panel-open', open);
    dock?.panel.setAttribute('aria-expanded', String(open));
    garden.relayout();
    if (open) { panel.fill(); refreshState(); $('[role="tab"][aria-selected="true"]', panel.root).focus(); }
    else dock?.panel.focus();
  }

  /* ---------- dock ---------- */
  function dockButton(label, path, extra = {}) {
    const text = el('span', { class: 'ga-dock-label', text: label });
    const button = el('button', { type: 'button', class: 'ga-dock-button', ...extra }, icon(path), text);
    return [button, text];
  }
  function buildDock() {
    const [edit, editLabel] = dockButton('Править текст', ICONS.pen, { 'aria-pressed': 'false', title: 'Ctrl + E' });
    const count = el('span', { class: 'ga-count', text: '0' });
    const [save, saveLabel] = dockButton('Сохранить', ICONS.save, { class: 'ga-dock-button ga-dock-save', title: 'Ctrl + S' });
    save.append(count);
    const [revertButton] = dockButton('Отменить', ICONS.undo, { title: 'Вернуть сохранённый вариант' });
    const [panelButton] = dockButton('Панель', ICONS.panel, { 'aria-expanded': 'false' });
    const [exit] = dockButton('Выйти', ICONS.exit);
    const fold = el('button', { type: 'button', class: 'ga-fold', 'aria-label': 'Свернуть панель садовника', 'aria-expanded': 'true' }, icon(ICONS.minimize));
    const seed = el('button', { type: 'button', class: 'ga-seed', 'aria-label': 'Развернуть панель садовника' }, icon(ICONS.seed));
    const root = el('div', { class: 'ga-dock', role: 'toolbar', 'aria-label': 'Панель садовника' },
      seed, el('div', { class: 'ga-dock-body' }, el('span', { class: 'ga-dock-title', text: 'садовник' }), edit, save, revertButton, panelButton, exit, fold));
    edit.addEventListener('click', () => setEditing(!editing));
    save.addEventListener('click', save$);
    revertButton.addEventListener('click', async () => { if (await ask('Отменить все несохранённые правки?', 'Отменить правки')) revert(); });
    panelButton.addEventListener('click', () => togglePanel());
    exit.addEventListener('click', logout);
    const setFolded = folded => {
      root.classList.toggle('is-folded', folded);
      fold.setAttribute('aria-expanded', String(!folded));
      try { localStorage.setItem('ft-dock-folded', folded ? '1' : ''); } catch {}
      (folded ? seed : edit).focus();
    };
    fold.addEventListener('click', () => setFolded(true));
    seed.addEventListener('click', () => setFolded(false));
    try { if (localStorage.getItem('ft-dock-folded')) root.classList.add('is-folded'); } catch {}
    document.body.append(root);
    return { root, edit, editLabel, save, saveLabel, count, revert: revertButton, panel: panelButton };
  }
  function save$() { save(); }

  /* ---------- lifecycle ---------- */
  function onKeydown(event) {
    if (!dock) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && event.code === 'KeyS') { event.preventDefault(); save(); }
    if (mod && !event.altKey && event.code === 'KeyE') { event.preventDefault(); setEditing(!editing); }
  }
  function onBeforeUnload(event) { if (changedKeys().length) { event.preventDefault(); event.returnValue = ''; } }
  function mount() {
    if (dock) return;
    draft = clone(garden.content);
    dock = buildDock();
    document.documentElement.classList.add('ga-admin');
    document.addEventListener('input', onEditableInput, true);
    document.addEventListener('keydown', onEditableKeydown, true);
    document.addEventListener('paste', onEditablePaste, true);
    document.addEventListener('click', onEditableClick, true);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('beforeunload', onBeforeUnload);
    refreshState();
  }
  function unmount() {
    if (!dock) return;
    setEditing(false);
    dock.root.remove();
    dock = null;
    panel?.root.remove();
    panel = null;
    document.documentElement.classList.remove('ga-admin', 'ga-panel-open');
    $$('[data-ga-dirty]').forEach(node => node.removeAttribute('data-ga-dirty'));
    document.removeEventListener('input', onEditableInput, true);
    document.removeEventListener('keydown', onEditableKeydown, true);
    document.removeEventListener('paste', onEditablePaste, true);
    document.removeEventListener('click', onEditableClick, true);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('beforeunload', onBeforeUnload);
  }
  async function logout() {
    if (changedKeys().length && !await ask('Есть несохранённые правки. Выйти и потерять их?', 'Выйти', true)) return;
    try { await fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {}
    forgetToken();
    unmount();
    garden.applyContent(garden.content);
    garden.showToast('Калитка закрыта. До встречи в саду.');
  }

  window.gardenAdmin = {
    open() {
      if (dock) { dock.root.classList.remove('is-folded'); togglePanel(true); return; }
      openLogin();
    }
  };

  // Resume a session after reload without asking for the password again.
  if (token) {
    api('/api/admin/session').then(() => mount()).catch(() => {});
  }
})();
