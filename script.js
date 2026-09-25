document.documentElement.classList.add('js-motion');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver((entries, activeObserver) => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); activeObserver.unobserve(entry.target); }
  }), { threshold: 0.05 });
  reveals.forEach(item => observer.observe(item));
} else reveals.forEach(item => item.classList.add('is-visible'));

const STEAM_PROFILE_URL = 'https://steamcommunity.com/id/flowertalkerr/';
const OWNER_PIN = ''; // Архив локален для этого браузера; PIN в клиентском коде не защищает от посетителей.
const hobbyNotes = {
  музыка: 'Музыка задаёт погоду внутри дня. Открой личный архив, чтобы послушать мои треки.',
  рисование: 'Рисование помогает думать руками. Лучшие линии обычно появляются без предварительного плана.',
  игры: 'Люблю игры, в которых можно исследовать мир и случайно найти историю за углом.',
  книги: 'Книги хороши тем, что можно ненадолго поселиться в чьей-то другой голове.'
};
const detail = document.querySelector('.hobby-detail');
const ownerAudio = document.querySelector('[data-owner-audio]');
const audioList = document.querySelector('[data-audio-list]');
const audioInput = document.querySelector('[data-audio-files]');
const steamLink = document.querySelector('[data-steam-link] a');
if (STEAM_PROFILE_URL && steamLink) { steamLink.href = STEAM_PROFILE_URL; steamLink.parentElement.hidden = false; }
let audioDb;
const dbReady = new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) return reject(new Error('Хранилище недоступно'));
  const request = indexedDB.open('flowertalker-audio', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
  request.onsuccess = () => { audioDb = request.result; resolve(audioDb); };
  request.onerror = () => reject(request.error);
});
dbReady.catch(() => {}); // Не показывать ошибку до обращения к скрытому архиву.
async function renderTracks() {
  if (!audioList) return;
  try {
    const db = await dbReady;
    const request = db.transaction('tracks').objectStore('tracks').getAll();
    request.onsuccess = () => {
      audioList.replaceChildren();
      request.result.forEach(track => {
        const row = document.createElement('div'); row.className = 'audio-track';
        const name = document.createElement('span'); name.textContent = track.name;
        const player = document.createElement('audio'); player.controls = true; player.preload = 'none'; player.src = URL.createObjectURL(track.blob); player.setAttribute('aria-label', `Воспроизвести ${track.name}`);
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить'; remove.addEventListener('click', async () => { const db = await dbReady; db.transaction('tracks','readwrite').objectStore('tracks').delete(track.id); renderTracks(); });
        row.append(name, player, remove); audioList.append(row);
      });
    };
  } catch { audioList.textContent = 'Не удалось открыть локальное хранилище.'; }
}
document.querySelectorAll('[data-hobby]').forEach(button => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-hobby]').forEach(item => item.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    if (detail) detail.textContent = hobbyNotes[button.dataset.hobby];
    if (button.dataset.hobby === 'музыка' && ownerAudio && OWNER_PIN) {
      const pin = window.prompt('Личный PIN для музыкального архива:');
      ownerAudio.hidden = pin !== OWNER_PIN;
      if (pin === OWNER_PIN) renderTracks();
    } else if (ownerAudio) ownerAudio.hidden = true;
  });
});
audioInput?.addEventListener('change', async () => {
  const files = [...audioInput.files].filter(file => file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3'));
  try {
    const db = await dbReady;
    for (const file of files) db.transaction('tracks','readwrite').objectStore('tracks').add({ name: file.name, blob: file });
    await renderTracks();
  } catch { if (audioList) audioList.textContent = 'Не удалось сохранить треки в этом браузере.'; }
  audioInput.value = '';
});

const toast = document.querySelector('.toast');
let toastTimer;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message; toast.classList.add('show'); window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2400);
}
let waterTimer;
document.querySelector('[data-water]')?.addEventListener('click', () => {
  document.body.classList.remove('watered'); void document.body.offsetWidth; document.body.classList.add('watered');
  showToast('Сад полит. Цветок расправил лепестки.'); window.clearTimeout(waterTimer);
  waterTimer = window.setTimeout(() => document.body.classList.remove('watered'), 1500);
});
const themeButton = document.querySelector('.theme-button');
themeButton?.addEventListener('click', () => {
  const enabled = document.body.classList.toggle('dark'); themeButton.setAttribute('aria-pressed', String(enabled)); themeButton.textContent = enabled ? '☾' : '☼';
});
const stickerForm = document.querySelector('[data-sticker-form]');
const stickerStatus = document.querySelector('[data-sticker-status]');
const approvedWall = document.querySelector('[data-approved-stickers]');
const adminForm = document.querySelector('[data-admin-login]');
const adminStatus = document.querySelector('[data-admin-status]');
const moderationQueue = document.querySelector('[data-moderation-queue]');
const adminLogout = document.querySelector('[data-admin-logout]');
let adminToken = '';
async function api(path, options={}) {
  const headers = { ...(options.body ? {'Content-Type':'application/json'} : {}), ...(path.startsWith('/api/admin/') && adminToken ? {Authorization:`Bearer ${adminToken}`} : {}), ...options.headers };
  let response;
  try { response = await fetch(path, {...options, headers, cache:'no-store'}); }
  catch { throw new Error('Нет связи с сервером. Попробуй позже.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос.');
  return result;
}
function renderApproved(items) {
  if (!approvedWall) return;
  approvedWall.replaceChildren();
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'sticker-empty'; empty.textContent = 'Пока нет опубликованных записок. Оставь первую!'; approvedWall.append(empty); return; }
  const styles = ['wall-one','wall-two','wall-three'];
  items.forEach((item,index) => {
    const card = document.createElement('article'); card.className = `paper-sticker wall-sticker ${styles[index % styles.length]}`;
    const flower = document.createElement('span'); flower.textContent = ['✦','✿','✳'][index % 3];
    const text = document.createElement('p'); text.textContent = item.text;
    const date = document.createElement('small'); date.textContent = new Date(item.createdAt).toLocaleDateString('ru-RU');
    card.append(flower,text,date); approvedWall.append(card);
  });
}
async function loadApproved() { try { renderApproved(await api('/api/stickers')); } catch { if (approvedWall) { approvedWall.replaceChildren(); const message = document.createElement('p'); message.className = 'sticker-empty'; message.textContent = 'Записки временно недоступны. Попробуй позже.'; approvedWall.append(message); } } }
stickerForm?.addEventListener('submit', async event => {
  event.preventDefault(); const button = stickerForm.querySelector('[type="submit"]'); button.disabled = true;
  if (stickerStatus) stickerStatus.textContent = 'Отправляю на проверку…';
  try { const text = new FormData(stickerForm).get('text'); const result = await api('/api/stickers',{method:'POST',body:JSON.stringify({text})}); stickerStatus.textContent = result.message; stickerForm.reset(); }
  catch (error) { stickerStatus.textContent = error.message; }
  finally { button.disabled = false; }
});
async function loadQueue() {
  const items = await api('/api/admin/stickers'); moderationQueue.replaceChildren();
  if (!items.length) { moderationQueue.textContent = 'Очередь пуста.'; return; }
  items.forEach(item => {
    const card = document.createElement('article'); card.className = 'moderation-item';
    const text = document.createElement('p'); text.textContent = item.text;
    const approve = document.createElement('button'); approve.className = 'button button-primary'; approve.type = 'button'; approve.textContent = 'Одобрить';
    const reject = document.createElement('button'); reject.className = 'button button-quiet'; reject.type = 'button'; reject.textContent = 'Отклонить';
    const act = async decision => { approve.disabled = reject.disabled = true; try { await api(`/api/admin/stickers/${encodeURIComponent(item.id)}/${decision}`,{method:'POST'}); await loadQueue(); await loadApproved(); if (adminStatus) adminStatus.textContent = decision === 'approve' ? 'Стикер опубликован.' : 'Стикер отклонён.'; } catch (error) { if (adminStatus) adminStatus.textContent = error.message; approve.disabled = reject.disabled = false; } };
    approve.addEventListener('click',()=>act('approve')); reject.addEventListener('click',()=>act('reject'));
    card.append(text,approve,reject); moderationQueue.append(card);
  });
}
adminForm?.addEventListener('submit', async event => {
  event.preventDefault(); adminToken = adminForm.querySelector('input').value;
  try { await loadQueue(); adminStatus.textContent = 'Вход выполнен. Новые стикеры ждут решения.'; adminForm.querySelector('input').value = ''; adminLogout.hidden = false; }
  catch { adminToken = ''; adminStatus.textContent = 'Пароль неверный или сервер недоступен.'; }
});
adminLogout?.addEventListener('click',()=>{adminToken='';moderationQueue.replaceChildren();adminStatus.textContent='Вы вышли из панели.';adminLogout.hidden=true;});
loadApproved();
const parallaxItems = [...document.querySelectorAll('[data-parallax]')];
const chapters = [...document.querySelectorAll('.garden-chapter')];
const nativeScrollAnimation = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');
function updateScrollScene() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progress = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
  document.querySelector('.garden-atmosphere')?.style.setProperty('--thread-progress', progress);
  document.documentElement.style.setProperty('--thread-progress', progress);
  if (!nativeScrollAnimation) document.querySelector('.progress span')?.style.setProperty('width', `${progress * 100}%`);
  let activeChapter = chapters[0], closestDistance = Infinity;
  chapters.forEach(chapter => { const distance = Math.abs(chapter.getBoundingClientRect().top - window.innerHeight * .38); if (distance < closestDistance) { closestDistance = distance; activeChapter = chapter; } });
  chapters.forEach(chapter => chapter.toggleAttribute('data-active', chapter === activeChapter));
  if (!reducedMotion && !nativeScrollAnimation) parallaxItems.forEach(item => {
    const rect = item.getBoundingClientRect(), depth = item.dataset.parallax === 'deep' ? .08 : item.dataset.parallax === 'hero' ? .16 : .05;
    const offset = Math.max(-42, Math.min(42, (rect.top + rect.height / 2 - window.innerHeight / 2) * depth));
    item.style.transform = `translate3d(0, ${offset}px, 0)`;
  });
}
let ticking = false;
function requestScrollScene() { if (!ticking) { window.requestAnimationFrame(() => { updateScrollScene(); ticking = false; }); ticking = true; } }
window.addEventListener('scroll', requestScrollScene, { passive: true });
window.addEventListener('resize', requestScrollScene); updateScrollScene();