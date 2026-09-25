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
    detail.textContent = hobbyNotes[button.dataset.hobby];
  });
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
const storyLabel = document.querySelector('.story-state-label');
const storyPhases = ['семечко', 'корни', 'стебель', 'цветение', 'сад'];
storyPlant?.querySelectorAll('path').forEach(path => path.setAttribute('pathLength', '1'));
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
