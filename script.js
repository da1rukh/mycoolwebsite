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
const hobbyNotes = {
  музыка: 'Музыка задаёт погоду внутри дня.',
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
  const empty = document.querySelector('[data-audio-empty]');
  const tools = document.querySelector('[data-audio-owner-tools]');
  const isOwner = Boolean(adminToken);
  if (tools) tools.hidden = !isOwner;
  try {
    const db = await dbReady;
    const request = db.transaction('tracks').objectStore('tracks').getAll();
    request.onsuccess = () => {
      audioList.replaceChildren();
      const tracks = request.result;
      if (empty) empty.hidden = tracks.length > 0;
      tracks.forEach(track => {
        const row = document.createElement('div'); row.className = 'audio-track';
        const name = document.createElement('span'); name.textContent = track.name;
        const player = document.createElement('audio'); player.preload = 'metadata'; player.src = URL.createObjectURL(track.blob); player.setAttribute('aria-label', `Воспроизвести ${track.name}`);
        const controls = document.createElement('div'); controls.className = 'flower-controls';
        const play = document.createElement('button'); play.type = 'button'; play.className = 'flower-play'; play.textContent = '▶'; play.setAttribute('aria-label', `Воспроизвести ${track.name}`);
        const clock = document.createElement('span'); clock.className = 'flower-time'; clock.textContent = '0:00 / 0:00';
        const seek = document.createElement('input'); seek.type = 'range'; seek.className = 'flower-seek'; seek.min = '0'; seek.max = '1000'; seek.value = '0'; seek.setAttribute('aria-label', `Позиция трека ${track.name}`);
        const volume = document.createElement('input'); volume.type = 'range'; volume.className = 'flower-volume'; volume.min = '0'; volume.max = '1'; volume.step = '0.01'; volume.value = '0.8'; volume.setAttribute('aria-label', `Громкость трека ${track.name}`); player.volume = Number(volume.value);
        const flower = document.createElement('span'); flower.className = 'flower-vinyl'; flower.textContent = '✿'; flower.setAttribute('aria-hidden', 'true');
        const formatTime = value => { if (!Number.isFinite(value)) return '0:00'; const seconds = Math.floor(value); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
        play.addEventListener('click', async () => { if (player.paused) { document.querySelectorAll('.audio-track audio').forEach(other => { if (other !== player) other.pause(); }); try { await player.play(); } catch {} } else player.pause(); });
        player.addEventListener('play', () => { play.textContent = 'Ⅱ'; play.setAttribute('aria-label', `Приостановить ${track.name}`); row.classList.add('is-playing'); });
        player.addEventListener('pause', () => { play.textContent = '▶'; play.setAttribute('aria-label', `Воспроизвести ${track.name}`); row.classList.remove('is-playing'); });
        player.addEventListener('ended', () => { player.currentTime = 0; seek.value = '0'; });
        player.addEventListener('timeupdate', () => { clock.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`; seek.value = String(player.duration ? Math.round(player.currentTime / player.duration * 1000) : 0); });
        player.addEventListener('loadedmetadata', () => { clock.textContent = `0:00 / ${formatTime(player.duration)}`; });
        seek.addEventListener('input', () => { if (player.duration) player.currentTime = Number(seek.value) / 1000 * player.duration; });
        volume.addEventListener('input', () => { player.volume = Number(volume.value); });
        controls.append(flower, play, clock, seek, volume); row.append(name, player, controls);
        if (isOwner) {
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить';
          remove.addEventListener('click', async () => { const db = await dbReady; db.transaction('tracks','readwrite').objectStore('tracks').delete(track.id); renderTracks(); });
          row.append(remove);
        }
        audioList.append(row);
      });
    };
  } catch { audioList.textContent = 'Не удалось открыть музыкальную библиотеку.'; }
}
document.querySelectorAll('[data-hobby]').forEach(button => {
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-hobby]').forEach(item => item.setAttribute('aria-pressed', 'false'));
    button.setAttribute('aria-pressed', 'true');
    if (detail) detail.textContent = hobbyNotes[button.dataset.hobby];
    if (ownerAudio) ownerAudio.hidden = button.dataset.hobby !== 'музыка';
    if (button.dataset.hobby === 'музыка') renderTracks();
  });
});
audioInput?.addEventListener('change', async () => {
  if (!adminToken) { if (audioList) audioList.textContent = 'Войдите в модерацию владельца, чтобы добавлять треки.'; return; }
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
const stickerFields = [...document.querySelectorAll('[data-sticker-field]')];
const adminForm = document.querySelector('[data-admin-login]');
const adminStatus = document.querySelector('[data-admin-status]');
const moderationQueue = document.querySelector('[data-moderation-queue]');
const approvedStickerTools = document.querySelector('[data-approved-sticker-tools]');
const adminLogout = document.querySelector('[data-admin-logout]');
let adminToken = '';
let stickerPlacement = null;
let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
document.addEventListener('pointermove', event => { lastPointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
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
  if (approvedStickerTools) {
    approvedStickerTools.replaceChildren();
    if (adminToken && items.length) items.forEach(item => {
      const row = document.createElement('div'); row.className = 'approved-sticker-tool';
      const label = document.createElement('span'); label.textContent = item.text;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button button-quiet'; button.textContent = 'Курсор';
      button.addEventListener('click', async () => {
        const card = [...document.querySelectorAll('[data-sticker-id]')].find(node => node.dataset.stickerId === item.id);
        if (!card) { if (adminStatus) adminStatus.textContent = 'Не удалось найти стикер в списке.'; return; }
        const pageY = lastPointer.y + window.scrollY;
        const sections = [...document.querySelectorAll('.garden-chapter')];
        const targetSection = sections.find(section => {
          const rect = section.getBoundingClientRect(); const top = rect.top + window.scrollY;
          return pageY >= top && pageY <= top + section.offsetHeight;
        }) || sections.reduce((best, section) => {
          const rect = section.getBoundingClientRect(); const top = rect.top + window.scrollY;
          const distance = pageY < top ? top - pageY : pageY - (top + section.offsetHeight);
          return !best || distance < best.distance ? {section, distance} : best;
        }, null)?.section;
        const field = targetSection?.querySelector('[data-sticker-field]');
        if (!field) { if (adminStatus) adminStatus.textContent = 'Не удалось определить секцию под курсором.'; return; }
        const bounds = field.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (lastPointer.x - bounds.left - card.offsetWidth / 2) / Math.max(1, bounds.width - card.offsetWidth)));
        const y = Math.max(0, Math.min(1, (lastPointer.y - bounds.top - card.offsetHeight / 2) / Math.max(1, bounds.height - card.offsetHeight)));
        const position = {x,y,field:field.dataset.stickerField};
        field.append(card);
        card.style.left = `calc(${x * 100}% - ${x * card.offsetWidth}px)`; card.style.top = `calc(${y * 100}% - ${y * card.offsetHeight}px)`;
        try { await api(`/api/admin/stickers/${encodeURIComponent(item.id)}/position`, {method:'PATCH', body:JSON.stringify(position)}); if (adminStatus) adminStatus.textContent = 'Стикер перенесён к курсору и сохранён.'; }
        catch (error) { if (adminStatus) adminStatus.textContent = error.message; loadApproved(); }
      });
      row.append(label, button); approvedStickerTools.append(row);
    });
  }
  stickerFields.forEach(field => field.replaceChildren());
  if (!stickerFields.length) return;
  if (!items.length) {
    stickerFields.forEach(field => field.hidden = true);
    return;
  }
  stickerFields.forEach(field => field.hidden = false);
  const styles = ['wall-one', 'wall-two', 'wall-three'];
  items.forEach((item, index) => {
    const field = stickerFields.find(candidate => candidate.dataset.stickerField === item.position?.field) || stickerFields[index % stickerFields.length];
    const card = document.createElement('article');
    card.className = `paper-sticker wall-sticker ${styles[index % styles.length]}`;
    card.dataset.stickerId = item.id;
    if (!item.position) { card.dataset.x = String((index % 2) * 0.58); card.style.left = `${(index % 2) * 58}%`; card.style.top = `${Math.floor(index / 2) * 155}px`; }
    const flower = document.createElement('span');
    flower.setAttribute('aria-hidden', 'true');
    flower.textContent = ['✦', '✿', '✳'][index % 3];
    const text = document.createElement('p');
    text.textContent = item.text;
    const date = document.createElement('small');
    date.textContent = new Date(item.createdAt).toLocaleDateString('ru-RU');
    card.append(flower, text, date);
    if (item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.y)) {
      card.style.left = `calc(${item.position.x * 100}% - ${item.position.x * card.offsetWidth}px)`; card.style.top = `calc(${item.position.y * 100}% - ${item.position.y * card.offsetHeight}px)`;
    }
    if (adminToken) {
      const moveButton = document.createElement('button');
      moveButton.type = 'button'; moveButton.className = 'sticker-move-button'; moveButton.textContent = '↗';
      moveButton.setAttribute('aria-label', 'Перенести стикер к курсору'); moveButton.title = 'Нажмите, затем укажите место на странице';
      moveButton.addEventListener('pointerdown', event => event.stopPropagation());
      moveButton.addEventListener('click', event => {
        event.stopPropagation(); stickerPlacement = { card, field, id: item.id };
        card.classList.add('is-placement-target'); document.body.classList.add('placing-sticker');
        if (adminStatus) adminStatus.textContent = 'Наведите курсор на нужное место и нажмите.';
      });
      card.append(moveButton);
      card.classList.add('admin-draggable'); card.title = 'Перетащите стикер или нажмите ↗ для переноса к курсору';
      card.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); card.setPointerCapture(event.pointerId);
        const cardBounds = card.getBoundingClientRect();
        const dragOffset = { x: event.clientX - cardBounds.left, y: event.clientY - cardBounds.top };
        const move = e => {
          const bounds = field.getBoundingClientRect();
          const x = Math.max(0, Math.min(1, (e.clientX - bounds.left - dragOffset.x) / Math.max(1, bounds.width - card.offsetWidth)));
          const y = Math.max(0, Math.min(1, (e.clientY - bounds.top - dragOffset.y) / Math.max(1, bounds.height - card.offsetHeight)));
          card.style.left = `calc(${x * 100}% - ${x * card.offsetWidth}px)`; card.style.top = `calc(${y * 100}% - ${y * card.offsetHeight}px)`; card.dataset.position = JSON.stringify({x,y,field:field.dataset.stickerField});
        };
        const finish = async () => {
          card.removeEventListener('pointermove', move); card.removeEventListener('pointerup', finish); card.removeEventListener('pointercancel', finish);
          if (!card.dataset.position) return;
          const pageY = lastPointer.y + window.scrollY;
          const sections = [...document.querySelectorAll('.garden-chapter')];
          const targetSection = sections.find(section => { const top = section.getBoundingClientRect().top + window.scrollY; return pageY >= top && pageY <= top + section.offsetHeight; }) || sections.reduce((best, section) => { const top = section.getBoundingClientRect().top + window.scrollY; const distance = pageY < top ? top - pageY : pageY - (top + section.offsetHeight); return !best || distance < best.distance ? {section, distance} : best; }, null)?.section;
          const targetField = targetSection?.querySelector('[data-sticker-field]') || field;
          if (targetField !== field) { const bounds = targetField.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (lastPointer.x - bounds.left - dragOffset.x) / Math.max(1, bounds.width - card.offsetWidth))); const y = Math.max(0, Math.min(1, (lastPointer.y - bounds.top - dragOffset.y) / Math.max(1, bounds.height - card.offsetHeight))); targetField.append(card); card.style.left = `calc(${x * 100}% - ${x * card.offsetWidth}px)`; card.style.top = `calc(${y * 100}% - ${y * card.offsetHeight}px)`; card.dataset.position = JSON.stringify({x,y,field:targetField.dataset.stickerField}); }
          try { await api(`/api/admin/stickers/${encodeURIComponent(item.id)}/position`, {method:'PATCH', body:card.dataset.position}); delete card.dataset.position; if (adminStatus) adminStatus.textContent = 'Положение стикера сохранено.'; }
          catch (error) { if (adminStatus) adminStatus.textContent = error.message; loadApproved(); }
        };
        card.addEventListener('pointermove', move); card.addEventListener('pointerup', finish); card.addEventListener('pointercancel', finish);
      });
    }
    field.append(card);
  });
}
document.addEventListener('pointermove', event => {
  if (!stickerPlacement) return;
  const {card, field} = stickerPlacement; const bounds = field.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - bounds.left - card.offsetWidth / 2) / Math.max(1, bounds.width - card.offsetWidth)));
  const y = Math.max(0, Math.min(1, (event.clientY - bounds.top - card.offsetHeight / 2) / Math.max(1, bounds.height - card.offsetHeight)));
  card.style.left = `calc(${x * 100}% - ${x * card.offsetWidth}px)`; card.style.top = `calc(${y * 100}% - ${y * card.offsetHeight}px)`;
  card.dataset.position = JSON.stringify({x,y,field:field.dataset.stickerField});
});
document.addEventListener('click', async event => {
  if (!stickerPlacement || event.target.closest('.sticker-move-button')) return;
  const placement = stickerPlacement; stickerPlacement = null;
  placement.card.classList.remove('is-placement-target'); document.body.classList.remove('placing-sticker');
  if (!placement.card.dataset.position) return;
  try {
    await api(`/api/admin/stickers/${encodeURIComponent(placement.id)}/position`, {method:'PATCH', body:placement.card.dataset.position});
    delete placement.card.dataset.position; if (adminStatus) adminStatus.textContent = 'Положение стикера сохранено.';
  } catch (error) { if (adminStatus) adminStatus.textContent = error.message; loadApproved(); }
}, true);
async function loadApproved() {
  try { renderApproved(await api('/api/stickers')); }
  catch {
    approvedStickerTools?.replaceChildren();
    stickerFields.forEach(field => {
      field.replaceChildren();
      field.hidden = true;
    });
  }
}
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
  try { await loadQueue(); adminStatus.textContent = 'Вход выполнен. Новые стикеры ждут решения.'; adminForm.querySelector('input').value = ''; adminLogout.hidden = false; renderTracks(); await loadApproved(); }
  catch { adminToken = ''; adminStatus.textContent = 'Пароль неверный или сервер недоступен.'; renderTracks(); }
});
adminLogout?.addEventListener('click',()=>{adminToken='';moderationQueue.replaceChildren();approvedStickerTools?.replaceChildren();loadApproved();adminStatus.textContent='Вы вышли из панели.';adminLogout.hidden=true;renderTracks();});
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