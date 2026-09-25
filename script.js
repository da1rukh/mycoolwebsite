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
        player.addEventListener('play', () => { document.body.classList.add('music-growing'); play.textContent = 'Ⅱ'; play.setAttribute('aria-label', `Приостановить ${track.name}`); row.classList.add('is-playing'); });
        player.addEventListener('pause', () => { if (![...document.querySelectorAll('.audio-track audio')].some(item => item !== player && !item.paused)) document.body.classList.remove('music-growing'); play.textContent = '▶'; play.setAttribute('aria-label', `Воспроизвести ${track.name}`); row.classList.remove('is-playing'); });
        player.addEventListener('ended', () => { if (![...document.querySelectorAll('.audio-track audio')].some(item => item !== player && !item.paused)) document.body.classList.remove('music-growing'); player.currentTime = 0; seek.value = '0'; });
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
// Garden trail: subtle pollen follows the pointer; a double tap sprouts a flower.
const trailLayer = document.querySelector('[data-garden-trail]');
let lastPollen = 0;
function pollenAt(x, y) {
  if (!trailLayer || reducedMotion || Date.now() - lastPollen < 55) return;
  lastPollen = Date.now();
  const mote = document.createElement('i'); mote.className = 'pollen-mote';
  mote.style.left = `${x}px`; mote.style.top = `${y}px`;
  mote.style.setProperty('--drift', `${Math.round(Math.random() * 32 - 16)}px`);
  trailLayer.append(mote); mote.addEventListener('animationend', () => mote.remove(), {once:true});
}
document.addEventListener('pointermove', event => pollenAt(event.clientX, event.clientY), {passive:true});
document.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') pollenAt(event.clientX, event.clientY); }, {passive:true});
document.addEventListener('dblclick', event => {
  if (reducedMotion || event.target.closest('button,a,input,textarea,select,summary,form,[data-sticker-field],.header-tools')) return;
  const sprout = document.createElement('span'); sprout.className = `sprout sprout-${1 + Math.floor(Math.random()*4)}`;
  sprout.textContent = ['✿','✾','❀','✽'][Math.floor(Math.random()*4)];
  sprout.style.left = `${event.clientX}px`; sprout.style.top = `${event.clientY}px`;
  trailLayer?.append(sprout); sprout.addEventListener('animationend', () => sprout.remove(), {once:true});
  if (navigator.vibrate) navigator.vibrate(12);
});

// Moscow forecast via Open-Meteo: public endpoint, no API key.
const weatherToggle = document.querySelector('[data-weather-toggle]');
const weatherPopover = document.querySelector('[data-weather-popover]');
const weatherSummary = document.querySelector('[data-weather-summary]');
const weatherTemp = document.querySelector('[data-weather-temp]');
const weatherIcon = document.querySelector('[data-weather-icon]');
const weatherLabels = {sun:['☀','Солнечно'],rain:['🌧','Тёплый дождь'],night:['☾','Ночной сад']};
function setGardenWeather(mode) {
  document.body.dataset.weather = mode;
  if (weatherIcon && weatherLabels[mode]) weatherIcon.textContent = weatherLabels[mode][0];
  document.querySelectorAll('[data-weather-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.weatherMode === mode)));
}
weatherToggle?.addEventListener('click', () => {
  const open = weatherPopover.hidden; weatherPopover.hidden = !open;
  weatherToggle.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('[data-weather-mode]').forEach(button => button.addEventListener('click', () => setGardenWeather(button.dataset.weatherMode)));
document.addEventListener('click', event => { if (!event.target.closest('.weather-widget') && weatherPopover && !weatherPopover.hidden) { weatherPopover.hidden = true; weatherToggle?.setAttribute('aria-expanded','false'); } });
(async () => {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=55.7558&longitude=37.6173&current=temperature_2m,precipitation,weather_code&timezone=Europe%2FMoscow', {cache:'no-store'});
    if (!response.ok) throw new Error('weather unavailable');
    const data = await response.json(), current = data.current, code = current.weather_code;
    const rainy = current.precipitation > 0 || [51,53,55,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(code);
    if (weatherTemp) weatherTemp.textContent = `${Math.round(current.temperature_2m)}°`;
    if (weatherSummary) weatherSummary.textContent = `Москва · ${Math.round(current.temperature_2m)}° · ${rainy ? 'осадки или облачность' : 'без осадков'}`;
    if (weatherLabels.sun) weatherLabels.sun[1] = rainy ? 'Пасмурно' : 'Ясно';
    const hour = Number(new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
    setGardenWeather(hour >= 21 || hour < 6 ? 'night' : rainy ? 'rain' : 'sun');
  } catch { if (weatherSummary) weatherSummary.textContent = 'Москва · погода временно недоступна'; setGardenWeather('sun'); }
})();
const ambientToggle = document.querySelector('[data-ambient-toggle]');
let ambientContext;
ambientToggle?.addEventListener('change', () => {
  if (!ambientToggle.checked) { ambientContext?.close(); ambientContext = null; return; }
  try {
    ambientContext = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = ambientContext.createBuffer(1, ambientContext.sampleRate * 2, ambientContext.sampleRate), channel = buffer.getChannelData(0);
    for (let i=0;i<channel.length;i++) channel[i] = (Math.random()*2-1) * .18;
    const source = ambientContext.createBufferSource(), filter = ambientContext.createBiquadFilter(), gain = ambientContext.createGain();
    source.buffer = buffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 420; gain.gain.value = .012;
    source.connect(filter).connect(gain).connect(ambientContext.destination); source.start();
  } catch { ambientToggle.checked = false; }
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
    if (item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.y)) {
      // Measure only after insertion: detached cards report zero dimensions and drift on reload.
      card.style.left = `calc(${item.position.x * 100}% - ${item.position.x * card.offsetWidth}px)`;
      card.style.top = `calc(${item.position.y * 100}% - ${item.position.y * card.offsetHeight}px)`;
    }
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