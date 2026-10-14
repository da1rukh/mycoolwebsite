document.documentElement.classList.add('js');
const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const segment = (value, start, end) => clamp((value - start) / (end - start));
function storageGet(store, key) { try { return window[store].getItem(key); } catch { return null; } }
function storageSet(store, key, value) { try { window[store].setItem(key, String(value)); } catch {} }

/* ---------- theme ---------- */
const themeButton = $('.theme-button');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme) {
  if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
  const dark = theme ? theme === 'dark' : systemDark.matches;
  themeButton?.setAttribute('aria-pressed', String(dark));
  themeButton?.setAttribute('aria-label', dark ? 'Светлая тема' : 'Тёмная тема');
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1d231b' : '#faf8ef');
}
applyTheme(storageGet('localStorage', 'ft-theme'));
systemDark.addEventListener('change', () => applyTheme(storageGet('localStorage', 'ft-theme')));
themeButton?.addEventListener('click', () => {
  const next = themeButton.getAttribute('aria-pressed') === 'true' ? 'light' : 'dark';
  storageSet('localStorage', 'ft-theme', next);
  applyTheme(next);
});

/* ---------- editable content ----------
   The HTML holds the default text. Saved owner edits arrive inline in #site-content
   and are applied with textContent / validated URLs only. */
const defaults = { texts: {}, links: {}, images: {} };
$$('[data-edit]').forEach(el => { defaults.texts[el.dataset.edit] ??= el.textContent; });
$$('[data-link]').forEach(el => { defaults.links[el.dataset.link] ??= el.getAttribute('href') || ''; });
$$('[data-image]').forEach(el => { defaults.images[el.dataset.image] ??= { src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '' }; });

let content = { texts: {}, links: {}, images: {} };
try { content = { ...content, ...JSON.parse($('#site-content')?.textContent || '{}') }; } catch {}

const safeHref = value => /^(https?:|mailto:|#)/i.test(value) ? value : '';
const safeSrc = value => /^https:/i.test(value) ? value : '';
function markEmpty() {
  $$('[data-edit]').forEach(el => el.toggleAttribute('data-empty', el.textContent.trim() === ''));
  $$('[data-link]').forEach(el => el.toggleAttribute('data-empty', !el.getAttribute('href')));
  // A row disappears only when every editable piece inside it is empty.
  $$('.kin-list li, .facts > div').forEach(row => {
    const parts = $$('[data-edit]', row);
    row.toggleAttribute('data-empty', parts.length > 0 && parts.every(part => part.hasAttribute('data-empty')));
  });
}
// Paints any content snapshot onto the page (the admin uses this for previews).
function renderContent(source) {
  const texts = source.texts || {}, links = source.links || {}, images = source.images || {};
  $$('[data-edit]').forEach(el => {
    const key = el.dataset.edit;
    const value = Object.hasOwn(texts, key) ? texts[key] : defaults.texts[key];
    if (el.textContent !== value) el.textContent = value;
  });
  $$('[data-link]').forEach(el => {
    const key = el.dataset.link;
    const value = Object.hasOwn(links, key) ? safeHref(links[key]) : defaults.links[key];
    if (value) el.setAttribute('href', value); else el.removeAttribute('href');
  });
  $$('[data-image]').forEach(el => {
    const key = el.dataset.image;
    const image = images[key] || {};
    const src = safeSrc(image.src || '') || defaults.images[key].src;
    if (el.getAttribute('src') !== src) el.src = src;
    el.alt = image.alt || defaults.images[key].alt;
  });
  markEmpty();
  updatePhaseLabel();
}
// Records what the server has saved, then paints it.
function applyContent(next = content) {
  content = { texts: next.texts || {}, links: next.links || {}, images: next.images || {}, updatedAt: next.updatedAt || null };
  renderContent(content);
}

/* ---------- toast ---------- */
const toast = $('.toast');
let toastTimer;
function showToast(message, duration = 2600) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ---------- scroll story ---------- */
const header = $('.site-header');
const grow = $('.grow');
const stage = $('.stage');
const stageInner = $('.stage-inner');
const steps = $$('[data-step]');
const phaseLabel = $('[data-stage-phase]');
const clock = $('[data-clock]');
const bed = $('.bed');
const bedTrack = $('[data-bed-track]');
const portrait = $('.portrait');
const herbPhoto = $('.herbarium-photo');
const dusk = $('.dusk');
const navLinks = $$('.site-nav a');
const navTargets = navLinks.map(link => document.getElementById(link.getAttribute('href').slice(1)));
const stageVars = ['--seed', '--roots', '--stem', '--leaf-l', '--leaf-r', '--bloom', '--glow'];
let activeStep = 0;
let bedDistance = 0;

function headerHeight() { return header?.offsetHeight || 0; }
function sectionProgress(section) {
  const rect = section.getBoundingClientRect();
  const range = rect.height - (window.innerHeight - headerHeight());
  return range > 0 ? clamp((headerHeight() - rect.top) / range) : 0;
}
function updatePhaseLabel() {
  // The hero has no phase of its own, so it shows the first one ("seed").
  const step = steps[Math.max(1, activeStep)];
  const name = step?.querySelector('[data-edit$=".phase"]')?.textContent.trim() || '';
  if (phaseLabel && phaseLabel.textContent !== name) phaseLabel.textContent = name;
}
function minutesToTime(minutes) {
  const rounded = Math.round(minutes / 5) * 5;
  return `${String(Math.floor(rounded / 60) % 24).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function updateGrow() {
  if (!grow || !stage) return;
  const p = sectionProgress(grow);
  if (!reducedMotion.matches) {
    // The flower grows in overlapping stages so the drawing never stalls between chapters.
    const values = [1 - segment(p, .3, .6) * .4, segment(p, .1, .42), segment(p, .36, .72), segment(p, .52, .66), segment(p, .6, .74), segment(p, .72, .94), segment(p, 0, .95)];
    stageVars.forEach((name, index) => stage.style.setProperty(name, values[index].toFixed(4)));
  }
  // The active chapter is the one whose middle is nearest the reading line.
  const narrow = window.innerWidth <= 860;
  const line = headerHeight() + (window.innerHeight - headerHeight()) * (narrow ? .7 : .5);
  let nearest = 0, best = Infinity;
  steps.forEach((step, index) => {
    const rect = step.getBoundingClientRect();
    const distance = Math.abs(rect.top + rect.height / 2 - line);
    if (distance < best) { best = distance; nearest = index; }
  });
  if (nearest !== activeStep || !stage.dataset.phase) {
    activeStep = nearest;
    steps.forEach((step, index) => step.classList.toggle('is-active', index === nearest));
    stage.dataset.phase = String(nearest);
    updatePhaseLabel();
  }
}

function setupBed() {
  if (!bed || !bedTrack) return;
  const pin = window.innerWidth >= 900 && window.innerHeight >= 560 && !reducedMotion.matches;
  bed.classList.toggle('is-pinned', pin);
  if (pin) {
    bedDistance = Math.max(0, bedTrack.scrollWidth - window.innerWidth);
    bed.style.height = `${bedDistance + window.innerHeight}px`;
  } else {
    bedDistance = 0;
    bed.style.removeProperty('height');
    bed.style.removeProperty('--bed-x');
  }
}
function updateBed() {
  if (!bed || !bedTrack) return;
  let p;
  if (bed.classList.contains('is-pinned')) {
    p = sectionProgress(bed);
    bed.style.setProperty('--bed-x', (p * bedDistance).toFixed(1));
  } else {
    const max = bedTrack.scrollWidth - bedTrack.clientWidth;
    p = max > 0 ? bedTrack.scrollLeft / max : 0;
  }
  bed.style.setProperty('--bed-p', p.toFixed(4));
}

function updateAmbient() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const day = max > 0 ? clamp(window.scrollY / max) : 0;
  root.style.setProperty('--day', day.toFixed(4));
  if (clock) clock.textContent = minutesToTime(340 + day * (1290 - 340));
  if (reducedMotion.matches) return;
  const viewport = window.innerHeight;
  if (portrait) {
    const rect = portrait.getBoundingClientRect();
    portrait.style.setProperty('--tilt', clamp((viewport - rect.top) / (viewport + rect.height)).toFixed(3));
  }
  if (herbPhoto) {
    const rect = herbPhoto.getBoundingClientRect();
    herbPhoto.style.setProperty('--shift', ((rect.top + rect.height / 2 - viewport / 2) * -.08).toFixed(1));
  }
  if (dusk) {
    const rect = dusk.getBoundingClientRect();
    dusk.style.setProperty('--dusk', clamp((viewport - rect.top) / (viewport * .85)).toFixed(3));
  }
}

function updateNav() {
  const line = headerHeight() + window.innerHeight * .3;
  let current = -1;
  navTargets.forEach((target, index) => { if (target && target.getBoundingClientRect().top <= line) current = index; });
  navLinks.forEach((link, index) => { if (index === current) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current'); });
}

let frame = 0;
function render() {
  frame = 0;
  updateGrow();
  updateBed();
  updateAmbient();
  updateNav();
}
function requestRender() { if (!frame) frame = requestAnimationFrame(render); }
function relayout() { setupBed(); requestRender(); }
window.addEventListener('scroll', requestRender, { passive: true });
window.addEventListener('resize', relayout);
window.addEventListener('load', relayout);
document.fonts?.ready.then(relayout);
bedTrack?.addEventListener('scroll', requestRender, { passive: true });
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    stageVars.forEach(name => stage?.style.removeProperty(name));
    ['--tilt', '--shift', '--dusk'].forEach(name => [portrait, herbPhoto, dusk].forEach(el => el?.style.removeProperty(name)));
  }
  relayout();
});

/* ---------- reveal on scroll ---------- */
const revealItems = $$('[data-reveal]');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), { rootMargin: '0px 0px -10% 0px' });
  revealItems.forEach(item => observer.observe(item));
} else revealItems.forEach(item => item.classList.add('is-visible'));

/* ---------- watering ---------- */
$('[data-water]')?.addEventListener('click', () => {
  if (!stage || !stageInner) return;
  stage.classList.remove('is-watered');
  void stage.offsetWidth;
  stage.classList.add('is-watered');
  if (!reducedMotion.matches) {
    for (let index = 0; index < 14; index += 1) {
      const drop = document.createElement('span');
      drop.className = 'drop';
      drop.style.left = `${28 + Math.random() * 44}%`;
      drop.style.animationDelay = `${(Math.random() * .5).toFixed(2)}s`;
      stageInner.append(drop);
      drop.addEventListener('animationend', () => drop.remove());
    }
  }
  const watered = (Number(storageGet('sessionStorage', 'ft-watered')) || 0) + 1;
  storageSet('sessionStorage', 'ft-watered', watered);
  showToast(watered === 1 ? 'Сад полит. Листья расправились.' : watered < 5 ? 'Ещё немного воды — цветок доволен.' : 'Кажется, сад уже напился. Но спасибо!');
  setTimeout(() => stage.classList.remove('is-watered'), 900);
});

/* ---------- herbarium ---------- */
function setPressed(card, open) {
  const toggle = $('.pressed-toggle', card);
  card.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  $('.visually-hidden', toggle).textContent = open ? 'Свернуть листок' : 'Развернуть листок';
}
$$('.pressed').forEach(card => $('.pressed-toggle', card).addEventListener('click', () => setPressed(card, !card.classList.contains('is-open'))));

/* ---------- hobby sheet ---------- */
const sheet = $('[data-sheet]');
const tracksBox = $('[data-tracks]');
const tracksEmpty = $('[data-tracks-empty]');
let sheetOpener = null;
$$('[data-sheet-page]').forEach(page => { const title = $('h2', page); if (title) title.id = `sheet-${page.dataset.sheetPage}`; });
async function loadTracks() {
  if (!tracksBox) return [];
  try {
    const response = await fetch('/api/music', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const tracks = await response.json();
    tracksBox.replaceChildren(...tracks.map(track => {
      const row = document.createElement('div');
      row.className = 'track';
      const name = document.createElement('span');
      name.className = 'track-name';
      name.textContent = track.name.replace(/\.mp3$/i, '');
      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.src = `/api/music/${encodeURIComponent(track.id)}`;
      player.setAttribute('aria-label', `Слушать: ${name.textContent}`);
      row.append(name, player);
      return row;
    }));
    if (tracksEmpty) tracksEmpty.hidden = tracks.length > 0;
    return tracks;
  } catch {
    tracksBox.replaceChildren();
    if (tracksEmpty) tracksEmpty.hidden = false;
    return [];
  }
}
// Only one track plays at a time.
document.addEventListener('play', event => { $$('audio').forEach(audio => { if (audio !== event.target) audio.pause(); }); }, true);
function openSheet(name, opener) {
  if (!sheet) return;
  $$('[data-sheet-page]', sheet).forEach(page => page.classList.toggle('is-current', page.dataset.sheetPage === name));
  sheet.setAttribute('aria-labelledby', `sheet-${name}`);
  sheetOpener = opener || null;
  if (name === 'music') loadTracks();
  if (!sheet.open) sheet.showModal();
}
$$('[data-open-sheet]').forEach(button => button.addEventListener('click', () => openSheet(button.dataset.openSheet, button)));
$('[data-close-sheet]')?.addEventListener('click', () => sheet.close());
sheet?.addEventListener('click', event => { if (event.target === sheet) sheet.close(); });
sheet?.addEventListener('close', () => { $$('audio', sheet).forEach(audio => audio.pause()); sheetOpener?.focus(); sheetOpener = null; });

/* ---------- hidden gardener gate ----------
   The admin code is not part of the public page; it loads only when the gate is used. */
let adminLoading = null;
function loadAdmin() {
  if (window.gardenAdmin) return Promise.resolve(window.gardenAdmin);
  if (adminLoading) return adminLoading;
  adminLoading = new Promise((resolve, reject) => {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'admin.css';
    document.head.append(style);
    const script = document.createElement('script');
    script.src = 'admin.js';
    script.onload = () => window.gardenAdmin ? resolve(window.gardenAdmin) : reject(new Error('admin'));
    script.onerror = () => { adminLoading = null; script.remove(); reject(new Error('admin')); };
    document.body.append(script);
  });
  return adminLoading;
}
function openGate() { loadAdmin().then(admin => admin.open()).catch(() => showToast('Не удалось открыть панель. Обнови страницу.')); }
$('[data-gate]')?.addEventListener('click', openGate);
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.altKey && event.code === 'KeyG') { event.preventDefault(); openGate(); }
});
function checkGateHash() {
  if (location.hash !== '#sadovnik') return;
  history.replaceState(null, '', location.pathname + location.search);
  openGate();
}
window.addEventListener('hashchange', checkGateHash);

/* ---------- public API for admin.js ---------- */
window.garden = { defaults, get content() { return content; }, applyContent, renderContent, markEmpty, showToast, loadTracks, openSheet, setPressed, relayout };

applyContent(content);
setupBed();
render();
checkGateHash();
// A gardener who reloads mid-session goes straight back to the dock.
if (storageGet('sessionStorage', 'ft-admin-token')) loadAdmin().catch(() => {});
