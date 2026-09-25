document.documentElement.classList.add('js-motion');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver((entries, activeObserver) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        activeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });
  reveals.forEach(item => observer.observe(item));
  requestAnimationFrame(() => reveals.forEach(item => {
    if (item.getBoundingClientRect().top < window.innerHeight * 1.1) item.classList.add('is-visible');
  }));
} else {
  reveals.forEach(item => item.classList.add('is-visible'));
}

const hobbyNotes = {
  музыка: 'Музыка задаёт погоду внутри дня. Сейчас здесь играет что-то тёплое и немного мечтательное.',
  рисование: 'Рисование помогает думать руками. Лучшие линии обычно появляются без предварительного плана.',
  игры: 'Люблю игры, в которых можно исследовать мир и случайно найти историю за углом.',
  книги: 'Книги хороши тем, что можно ненадолго поселиться в чьей-то другой голове.'
};
const detail = document.querySelector('.hobby-detail');
document.querySelectorAll('[data-hobby]').forEach(button => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-hobby]').forEach(item => item.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    if (detail) detail.textContent = hobbyNotes[button.dataset.hobby];
    walk.hobby = button.dataset.hobby;
    renderWalk();
    if (letterStatus) letterStatus.textContent = `В записке появилось увлечение: ${hobbyLabels[walk.hobby]}.`;
  });
});

const walkStorageKey = 'flowertalker-garden-walk';
const walk = { seed: '', hobby: '', note: '' };
try {
  const savedWalk = JSON.parse(localStorage.getItem(walkStorageKey) || '{}');
  if (savedWalk && typeof savedWalk === 'object') Object.assign(walk, savedWalk);
} catch { /* Storage may be disabled; the walk still works for this visit. */ }
const seeds = [...document.querySelectorAll('[data-seed]')];
const keepsakes = [...document.querySelectorAll('[data-keepsake]')];
const letterSeed = document.querySelector('[data-letter-seed]');
const letterHobby = document.querySelector('[data-letter-hobby]');
const letterNote = document.querySelector('[data-letter-note]');
const letterStatus = document.querySelector('[data-letter-status]');
const seedEcho = document.querySelector('[data-seed-echo]');
const sealSeed = document.querySelector('[data-seal-seed]');
const sealHobby = document.querySelector('[data-seal-hobby]');
const flowerSeal = document.querySelector('.flower-seal');
const seedLabels = { light: 'свет', quiet: 'тишина', spark: 'искра' };
const hobbyLabels = { музыка: 'музыку', рисование: 'рисование', игры: 'игры', книги: 'книги' };
const noteLabels = {
  'note-1': 'Красивые идеи редко приходят по расписанию.',
  'note-2': 'Запах мокрого асфальта после первого дождя.',
  'note-3': 'Сделать что-нибудь просто потому, что хочется.'
};
function saveWalk() {
  try { localStorage.setItem(walkStorageKey, JSON.stringify(walk)); } catch { /* Optional persistence. */ }
}
function renderWalk() {
  seeds.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.seed === walk.seed)));
  keepsakes.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.keepsake === walk.note)));
  if (letterSeed) letterSeed.textContent = seedLabels[walk.seed] || 'любопытство';
  if (letterHobby) letterHobby.textContent = hobbyLabels[walk.hobby] || 'маленькие открытия';
  if (letterNote) letterNote.textContent = noteLabels[walk.note] || 'Сделать что-нибудь просто потому, что хочется.';
  if (seedEcho) seedEcho.textContent = walk.seed ? `Ты взял с собой ${seedLabels[walk.seed]}. Оно уже пустило корни.` : 'Любая история начинается с того, что хочется заметить.';
  if (seedEcho) seedEcho.dataset.seedTheme = walk.seed || 'default';
  if (sealSeed) sealSeed.textContent = seedLabels[walk.seed] || 'любопытство';
  if (sealHobby) sealHobby.textContent = hobbyLabels[walk.hobby] || 'открытия';
  if (flowerSeal) {
    flowerSeal.dataset.seed = walk.seed || 'default';
    flowerSeal.setAttribute('aria-label', `Цветочная печать: ${seedLabels[walk.seed] || 'любопытство'}, ${hobbyLabels[walk.hobby] || 'маленькие открытия'}, ${noteLabels[walk.note] || noteLabels['note-3']}`);
  }
  saveWalk();
}
seeds.forEach(button => button.addEventListener('click', () => {
  walk.seed = button.dataset.seed;
  renderWalk();
  if (letterStatus) letterStatus.textContent = `Взял с собой: ${seedLabels[walk.seed]}.`;
}));
keepsakes.forEach(button => button.addEventListener('click', () => {
  walk.note = button.dataset.keepsake;
  renderWalk();
  if (letterStatus) letterStatus.textContent = 'Эта мысль теперь в твоей записке.';
}));
renderWalk();
const copyLetterButton = document.querySelector('[data-copy-letter]');
copyLetterButton?.addEventListener('click', async () => {
  const text = `Я взял с собой ${seedLabels[walk.seed] || 'любопытство'}, нашёл ${hobbyLabels[walk.hobby] || 'маленькие открытия'} и запомнил: ${noteLabels[walk.note] || noteLabels['note-3']}`;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    if (letterStatus) letterStatus.textContent = 'Записка скопирована. Неси её дальше.';
  } catch {
    if (letterStatus) letterStatus.textContent = `Выдели и скопируй записку: ${text}`;
  }
});
document.querySelector('[data-reset-walk]')?.addEventListener('click', () => {
  walk.seed = '';
  walk.hobby = '';
  walk.note = '';
  document.querySelectorAll('[data-hobby]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  if (detail) detail.textContent = 'выбери растение, чтобы раскрыть заметку';
  if (letterStatus) letterStatus.textContent = 'Началась новая прогулка. Сад снова ждёт.';
  renderWalk();
});

const toast = document.querySelector('.toast');
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2400);
}
let waterTimer;
document.querySelector('[data-water]').addEventListener('click', () => {
  document.body.classList.remove('watered');
  void document.body.offsetWidth;
  document.body.classList.add('watered');
  showToast('Сад полит. Цветок расправил лепестки.');
  window.clearTimeout(waterTimer);
  waterTimer = window.setTimeout(() => document.body.classList.remove('watered'), 1500);
});

const themeButton = document.querySelector('.theme-button');
themeButton.addEventListener('click', () => {
  const enabled = document.body.classList.toggle('dark');
  themeButton.setAttribute('aria-pressed', String(enabled));
  themeButton.textContent = enabled ? '☾' : '☼';
});

document.querySelector('[data-form]').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('.form-status').textContent = 'Это демо-форма: чтобы получать письма, подключи почту или сервис отправки.';
});

const chapters = [...document.querySelectorAll('.garden-chapter')];
const parallaxItems = [...document.querySelectorAll('[data-parallax]')];
const vine = document.querySelector('.garden-vine span');
const nativeScrollAnimation = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');
const storyStage = document.querySelector('.story-stage');
const storyPlant = document.querySelector('.story-plant');
storyPlant?.querySelectorAll('path').forEach(path => path.setAttribute('pathLength', '1'));
const storyLabel = document.querySelector('.story-state-label');
const storyPhases = ['семечко', 'корни', 'стебель', 'цветение', 'сад'];
const storyStateNames = ['seed', 'roots', 'stem', 'bloom', 'garden'];
function updateStory(progress) {
  if (!storyStage || !storyPlant) return;
  const phaseIndex = Math.min(storyPhases.length - 1, Math.floor(progress * storyPhases.length));
  const phaseProgress = (progress * storyPhases.length) % 1;
  const roots = Math.min(1, progress * 5.2);
  const growth = Math.min(1, Math.max(0, (progress - .16) * 2.1));
  const branches = Math.min(1, Math.max(0, (progress - .38) * 2.2));
  const bloom = Math.min(1, Math.max(0, (progress - .58) * 2.5));
  storyStage.dataset.phase = storyStateNames[phaseIndex];
  storyStage.style.setProperty('--roots', roots);
  storyStage.style.setProperty('--growth', growth);
  storyStage.style.setProperty('--branches', branches);
  storyStage.style.setProperty('--bloom', bloom);
  storyStage.style.setProperty('--seed', Math.max(.28, 1 - growth * .78));
  storyStage.style.setProperty('--thread-progress', progress);
  if (storyLabel) storyLabel.textContent = storyPhases[phaseIndex];
  storyPlant.style.setProperty('--phase-progress', phaseProgress);
}

let ticking = false;
function updateScrollScene() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
  if (vine) vine.style.setProperty('--vine-progress', `${progress * 100}%`);
  if (!nativeScrollAnimation) document.querySelector('.progress span')?.style.setProperty('width', `${progress * 100}%`);

  let activeChapter = chapters[0];
  let closestDistance = Infinity;
  chapters.forEach(chapter => {
    const distance = Math.abs(chapter.getBoundingClientRect().top - window.innerHeight * .38);
    if (distance < closestDistance) {
      closestDistance = distance;
      activeChapter = chapter;
    }
  });
  chapters.forEach(chapter => chapter.toggleAttribute('data-active', chapter === activeChapter));
  const activeIndex = Math.max(0, chapters.indexOf(activeChapter));
  updateStory(activeIndex / Math.max(1, chapters.length - 1));

  if (!reducedMotion && !nativeScrollAnimation) {
    parallaxItems.forEach(item => {
      const rect = item.getBoundingClientRect();
      const depth = item.dataset.parallax === 'deep' ? .08 : item.dataset.parallax === 'hero' ? .16 : .05;
      const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * depth;
      item.style.transform = `translate3d(0, ${offset}px, 0)`;
    });
  }
  ticking = false;
}

function requestScrollScene() {
  if (!ticking) {
    window.requestAnimationFrame(updateScrollScene);
    ticking = true;
  }
}
window.addEventListener('scroll', requestScrollScene, { passive: true });
window.addEventListener('resize', requestScrollScene);
updateScrollScene();
