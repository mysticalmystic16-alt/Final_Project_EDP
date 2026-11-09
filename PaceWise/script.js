const KEY = 'pacewise_data';
const blank = () => ({ tasks: [], wins: [], moods: {}, sessions: [], work: 25, brk: 5 });
let S = blank(), filter = 'all', tm = null, phase = 'work', left = 25 * 60, rounds = 0, mt;
const openToday = new Set(), openStep = new Set();

const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const dkey = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const todayKey = () => dkey(Date.now());
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function msg(text, type) {
  const m = $('#msg');
  m.textContent = text; m.className = type || 'ok'; m.style.display = 'block';
  clearTimeout(mt); mt = setTimeout(() => { m.style.display = 'none'; }, 3000);
}

function loadData() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.tasks)) S = Object.assign(blank(), d);
  } catch (e) { msg('Saved data could not be read. Starting fresh.', 'err'); }
  left = S.work * 60;
}
function saveData() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { msg('Could not save data in this browser.', 'err'); }
}

function showTab(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === name));
  document.querySelectorAll('#tabs button').forEach(b => {
    b.classList.toggle('on', b.dataset.tab === name);
    b.toggleAttribute('aria-current', b.dataset.tab === name);
  });
  renderAll();
}

function dueState(t) {
  if (t.done || !t.due) return '';
  const d = Math.round((new Date(t.due + 'T00:00') - new Date(todayKey() + 'T00:00')) / 864e5);
  return d < 0 ? 'over' : d <= 2 ? 'soon' : '';
}
function dueLabel(t) {
  const s = dueState(t);
  if (s === 'over') return 'Overdue';
  if (s === 'soon') return 'Due soon';
  return t.due ? 'Due ' + new Date(t.due + 'T00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '';
}
const stepCount = t => [t.steps.filter(s => s.done).length, t.steps.length];
function addWin(type, text) { S.wins.push({ id: uid(), type, text, ts: Date.now() }); }

function stepsHtml(t) {
  if (!t.steps.length) return '<li class="mut">No steps yet</li>';
  return t.steps.map(s => `<li><button type="button" class="circle ${s.done ? 'on' : ''}" data-act="step" data-id="${t.id}" data-s="${s.id}" aria-label="${s.done ? 'Mark step as not done' : 'Mark step as done'}"></button><span class="${s.done ? 'dim' : ''}">${esc(s.text)}</span></li>`).join('');
}

function renderToday() {
  const L = S.tasks.filter(t => t.today);
  $('#todayList').innerHTML = L.length ? L.map(t => {
    const [d, n] = stepCount(t), o = openToday.has(t.id);
    return `<li class="item ${t.done ? 'dim' : ''}"><div class="line"><button type="button" class="circle ${t.done ? 'on' : ''}" data-act="toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark task as not done' : 'Mark task as done'}"></button><button type="button" class="name" data-act="open" data-id="${t.id}">${esc(t.name)}</button><span class="mut small">${n ? d + '/' + n : ''}</span></div>${o ? `<ul class="steps">${stepsHtml(t)}<li><button type="button" class="link mut" data-act="untoday" data-id="${t.id}">Remove from Today</button></li></ul>` : ''}</li>`;
  }).join('') : '<li class="empty">Nothing here yet. Open Tasks and tap Add to Today (up to 3).</li>';
  const w = S.wins.filter(x => dkey(x.ts) === todayKey()).reverse();
  $('#winsList').innerHTML = w.length ? w.map(x => `<li>${esc(x.text)}</li>`).join('') : '<li class="mut">No wins yet. Your first small step counts.</li>';
}

function renderTasks() {
  let L = S.tasks.slice();
  if (filter === 'pending') L = L.filter(t => !t.done);
  else if (filter === 'done') L = L.filter(t => t.done);
  else if (filter === 'due') L = L.filter(t => dueState(t));
  document.querySelectorAll('#filters button').forEach(b => b.classList.toggle('on', b.dataset.f === filter));
  $('#taskList').innerHTML = L.length ? L.map(t => {
    const [d, n] = stepCount(t);
    const meta = [t.subject, dueLabel(t)].filter(Boolean).join(' | ') || (n ? d + ' of ' + n + ' steps' : 'No steps yet');
    return `<li class="task ${t.done ? 'dim' : ''}">
      <div class="trow"><div class="tmain"><b>${esc(t.name)}</b><small>${esc(meta)}</small></div>${t.done ? '' : `<button type="button" class="link ac" data-act="today" data-id="${t.id}">${t.today ? 'In Today' : 'Add to Today'}</button>`}</div>
      <ul class="steps">${n ? stepsHtml(t) : ''}</ul>
      ${t.done ? '' : `<button type="button" class="link ac" style="margin-left:32px" data-act="stepform" data-id="${t.id}">+ Add step</button>
      <form class="stepForm" data-form="${t.id}" ${openStep.has(t.id) ? '' : 'hidden'}><input type="text" name="s" maxlength="80" placeholder="Describe a small step" aria-label="New step"><button class="plus sm" type="submit" aria-label="Save step">+</button></form>`}
      <div class="tools"><button type="button" data-act="done" data-id="${t.id}">${t.done ? 'Reopen' : 'Mark done'}</button><button type="button" data-act="edit" data-id="${t.id}">Edit</button><button type="button" data-act="del" data-id="${t.id}">Delete</button></div></li>`;
  }).join('') : '<li class="empty">No tasks here.</li>';
}

function renderProgress() {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(dkey(Date.now() - i * 864e5));
  const mins = k => S.sessions.filter(x => dkey(x.ts) === k).reduce((a, x) => a + x.min, 0);
  const cnt = (k, ty) => S.wins.filter(x => x.type === ty && dkey(x.ts) === k).length;
  const sum = f => days.reduce((a, k) => a + f(k), 0);
  $('#stats').innerHTML = [['Tasks', sum(k => cnt(k, 'task'))], ['Steps', sum(k => cnt(k, 'step'))], ['Minutes', sum(mins)]].map(a => `<div><b>${a[1]}</b><span>${a[0]}</span></div>`).join('');
  const max = Math.max(1, ...days.map(mins));
  $('#bars').innerHTML = days.map(k => {
    const m = mins(k), h = m ? Math.max(10, Math.round(m / max * 84)) : 6;
    return `<div class="bar" title="${m} min"><i class="${m ? 'on' : ''}" style="height:${h}px"></i>${['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(k + 'T00:00').getDay()]}</div>`;
  }).join('');
  const cur = S.moods[todayKey()];
  document.querySelectorAll('#moods button').forEach(b => b.classList.toggle('on', !!cur && b.dataset.m === cur.m));
  $('#moodHint').textContent = cur ? 'Today\'s mood is saved: ' + cur.m : 'Tap a face to save your mood for today.';
}

function renderAll() { renderToday(); renderTasks(); renderProgress(); }

function checkNameLive() {
  const v = $('#taskName').value.trim();
  $('#nameHint').textContent = v && v.length < 3 ? 'Use at least 3 characters.' : '';
}

function validateTask(name, due) {
  if (!name) return 'Please type a task name.';
  if (name.length < 3) return 'Task name needs at least 3 characters.';
  if (S.tasks.some(t => !t.done && t.name.toLowerCase() === name.toLowerCase())) return 'This task is already on your list.';
  if (due && due < todayKey()) return 'The due date is already past. Pick today or a later date.';
  return '';
}

function addTask(e) {
  e.preventDefault();
  const name = $('#taskName').value.trim(), due = $('#taskDue').value;
  const err = validateTask(name, due);
  if (err) return msg(err, 'err');
  S.tasks.push({ id: uid(), name, subject: $('#taskSubject').value.trim(), due, steps: [], today: false, done: false });
  e.target.reset(); $('#nameHint').textContent = '';
  saveData(); renderAll(); msg('Task added.');
}

function addStep(e) {
  if (!e.target.matches('.stepForm')) return;
  e.preventDefault();
  const t = S.tasks.find(x => x.id === e.target.dataset.form);
  const text = e.target.querySelector('input').value.trim();
  if (!t) return;
  if (!text) return msg('Type a small step first.', 'err');
  if (text.length > 80) return msg('Keep the step under 80 characters.', 'err');
  t.steps.push({ id: uid(), text, done: false });
  t.done = false;
  saveData(); renderAll(); msg('Step added.');
  const i = document.querySelector('[data-form="' + t.id + '"] input');
  if (i) i.focus();
}

function toggleTask(t) {
  t.done = !t.done;
  if (t.done) {
    t.steps.forEach(s => { s.done = true; });
    addWin('task', 'Finished task: ' + t.name);
    msg('Task complete. Nice work!');
  }
}

function toggleStep(t, sid) {
  const s = t.steps.find(x => x.id === sid);
  if (!s) return;
  s.done = !s.done;
  if (s.done) addWin('step', 'Finished step: ' + s.text);
  if (t.steps.every(x => x.done)) {
    if (!t.done) { t.done = true; addWin('task', 'Finished task: ' + t.name); msg('Task complete. Nice work!'); }
  } else t.done = false;
}

function toggleToday(t) {
  if (t.today) { t.today = false; return; }
  if (S.tasks.filter(x => x.today && !x.done).length >= 3) return msg('Today already has 3 tasks. Finish or remove one first.', 'err');
  t.today = true; msg('Added to Today.');
}

function listClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const t = S.tasks.find(x => x.id === b.dataset.id);
  if (!t) return;
  const a = b.dataset.act;
  if (a === 'toggle') toggleTask(t);
  else if (a === 'open') { if (!openToday.delete(t.id)) openToday.add(t.id); }
  else if (a === 'step') toggleStep(t, b.dataset.s);
  else if (a === 'today') toggleToday(t);
  else if (a === 'untoday') t.today = false;
  else if (a === 'done') { if (t.done) t.done = false; else toggleTask(t); }
  else if (a === 'stepform') {
    if (!openStep.delete(t.id)) openStep.add(t.id);
    renderTasks();
    const i = document.querySelector('[data-form="' + t.id + '"] input');
    if (i) i.focus();
    return;
  } else if (a === 'edit') {
    const n = (prompt('Rename task', t.name) || '').trim();
    if (!n) return;
    if (n.length < 3) return msg('Task name needs at least 3 characters.', 'err');
    t.name = n;
  } else if (a === 'del') {
    if (!confirm('Delete this task?')) return;
    S.tasks = S.tasks.filter(x => x !== t);
  }
  saveData(); renderAll();
}

function updateClock() {
  $('#clock').textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
  $('#phase').textContent = phase === 'work' ? 'Focus' : 'Break';
  $('#rounds').textContent = rounds ? 'Rounds finished: ' + rounds : '';
  $('#startBtn').textContent = tm ? 'Running' : 'Start';
}
function startTimer() { if (tm) return; tm = setInterval(tick, 1000); updateClock(); }
function pauseTimer() { clearInterval(tm); tm = null; updateClock(); }
function resetTimer() { pauseTimer(); phase = 'work'; left = S.work * 60; updateClock(); }
function tick() { left--; if (left <= 0) endRound(); updateClock(); }
function endRound() {
  pauseTimer();
  if (phase === 'work') {
    rounds++;
    S.sessions.push({ ts: Date.now(), min: S.work });
    addWin('round', 'Finished a ' + S.work + '-minute round');
    const long = rounds % 4 === 0;
    phase = 'break'; left = (long ? S.brk * 3 : S.brk) * 60;
    msg(long ? 'Four rounds done! Take a longer break.' : 'Round done. Take a short break.');
    saveData(); renderAll();
  } else {
    phase = 'work'; left = S.work * 60;
    msg('Break is over. Ready for the next round?');
  }
}

function saveMood(e) {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  S.moods[todayKey()] = { m: b.dataset.m };
  saveData(); renderProgress(); msg('Mood saved.');
}

function readMinutes() {
  const w = Number($('#workMin').value), b = Number($('#brkMin').value);
  if ($('#workMin').value === '' || !Number.isInteger(w) || w < 1 || w > 90) return { err: 'Work minutes must be a whole number from 1 to 90.' };
  if ($('#brkMin').value === '' || !Number.isInteger(b) || b < 1 || b > 30) return { err: 'Break minutes must be a whole number from 1 to 30.' };
  return { w, b };
}
function checkSettingsLive() { $('#setHint').textContent = readMinutes().err || ''; }
function saveSettings(e) {
  e.preventDefault();
  const r = readMinutes();
  if (r.err) return msg(r.err, 'err');
  S.work = r.w; S.brk = r.b;
  if (!tm) { left = (phase === 'work' ? r.w : r.b) * 60; updateClock(); }
  saveData(); msg('Settings saved.');
}

function backupData() {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = 'pacewise-backup-' + todayKey() + '.json';
    a.click(); URL.revokeObjectURL(a.href);
    msg('Backup file saved.');
  } catch (err) { msg('Backup failed in this browser.', 'err'); }
}

function initForms() {
  $('#workMin').value = S.work; $('#brkMin').value = S.brk; $('#setHint').textContent = '';
}

function restoreData(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.tasks)) throw new Error('bad');
      if (!confirm('Replace your current data with this backup?')) return;
      S = Object.assign(blank(), d); left = S.work * 60;
      saveData(); initForms(); renderAll(); updateClock(); msg('Data restored.');
    } catch (err) { msg('This file is not a valid PaceWise backup.', 'err'); }
  };
  r.onerror = () => msg('Could not read the file.', 'err');
  r.readAsText(f); e.target.value = '';
}

function clearData() {
  if (!confirm('Delete ALL tasks, wins, moods, and settings? This cannot be undone.')) return;
  pauseTimer(); S = blank(); phase = 'work'; rounds = 0; left = S.work * 60;
  openToday.clear(); openStep.clear();
  saveData(); initForms(); renderAll(); updateClock(); msg('All data cleared.');
}

document.addEventListener('DOMContentLoaded', () => {
  loadData(); initForms();
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('#taskForm').addEventListener('submit', addTask);
  $('#taskName').addEventListener('input', checkNameLive);
  $('#moreBtn').addEventListener('click', () => { const m = $('#moreFields'); m.hidden = !m.hidden; });
  $('#filters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderTasks(); } });
  $('#todayList').addEventListener('click', listClick);
  $('#taskList').addEventListener('click', listClick);
  $('#taskList').addEventListener('submit', addStep);
  $('#startBtn').addEventListener('click', startTimer);
  $('#pauseBtn').addEventListener('click', pauseTimer);
  $('#resetBtn').addEventListener('click', resetTimer);
  $('#moods').addEventListener('click', saveMood);
  $('#workMin').addEventListener('input', checkSettingsLive);
  $('#brkMin').addEventListener('input', checkSettingsLive);
  $('#setForm').addEventListener('submit', saveSettings);
  $('#backupBtn').addEventListener('click', backupData);
  $('#chooseBtn').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', restoreData);
  $('#clearBtn').addEventListener('click', clearData);
  renderAll(); updateClock();
});
