import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert, formatDatetime } from './utils.js';

let activeLeague = null;
let allPlayers = [];
let scheduleLoggedIn = null;

async function init() {
  try {
    const snap = await getDocs(query(collection(db, 'leagues'), where('active', '==', true), limit(1)));
    if (!snap.empty) {
      activeLeague = { id: snap.docs[0].id, ...snap.docs[0].data() };
      const ps = await getDocs(collection(db, 'leagues', activeLeague.id, 'players'));
      allPlayers = ps.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    populateSelects();
    await loadScheduleList();
    setDefaultDate();
  } catch (e) {
    document.getElementById('scheduleListContent').innerHTML = `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

function setDefaultDate() {
  const today = new Date();
  const fmt = today.toISOString().split('T')[0];
  const timeEl = document.getElementById('scheduleTime');
  if (timeEl) timeEl.value = '19:00';
  const dateEl = document.getElementById('scheduleDate');
  if (dateEl) dateEl.value = fmt;
}

function populateSelects() {
  const sel = document.getElementById('schedulePlayerSelect');
  if (!sel) return;
  allPlayers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

async function loadScheduleList() {
  const el = document.getElementById('scheduleListContent');
  if (!activeLeague) { el.innerHTML = '<div class="alert alert-info">진행 중인 리그가 없습니다.</div>'; return; }

  try {
    const snap = await getDocs(query(
      collection(db, 'schedules'),
      where('leagueId', '==', activeLeague.id),
      where('status', '==', 'open'),
      orderBy('datetime', 'asc')
    ));

    if (snap.empty) { el.innerHTML = '<div class="empty-state"><div class="icon">📅</div>등록된 일정이 없습니다</div>'; return; }

    el.innerHTML = snap.docs.map(d => {
      const s = { id: d.id, ...d.data() };
      const dt = formatDatetime(s.date, s.time);
      return `<div class="schedule-card">
        <div class="schedule-datetime">📅 ${dt}</div>
        <div class="schedule-player">👤 ${s.playerName}</div>
        ${s.note ? `<div class="schedule-note">${s.note}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="alert alert-error">오류: ${e.message}</div>`;
  }
}

async function loginForSchedule() {
  const pid = document.getElementById('schedulePlayerSelect').value;
  const pin = document.getElementById('schedulePin').value.trim();
  if (!pid) { showAlert('scheduleLoginAlert', '이름을 선택하세요.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAlert('scheduleLoginAlert', 'PIN은 숫자 4자리입니다.'); return; }
  const player = allPlayers.find(p => p.id === pid);
  if (!player || await hashString(pin) !== player.pinHash) { showAlert('scheduleLoginAlert', 'PIN이 올바르지 않습니다.'); return; }
  scheduleLoggedIn = player;
  document.getElementById('scheduleLoginArea').style.display = 'none';
  document.getElementById('scheduleFormArea').style.display = 'block';
  document.getElementById('scheduleLoggedInName').textContent = player.name + ' 님';
  await loadMySchedules();
}

function logoutSchedule() {
  scheduleLoggedIn = null;
  document.getElementById('scheduleLoginArea').style.display = 'block';
  document.getElementById('scheduleFormArea').style.display = 'none';
  document.getElementById('schedulePin').value = '';
}

async function postSchedule() {
  if (!scheduleLoggedIn || !activeLeague) return;
  const date = document.getElementById('scheduleDate').value;
  const time = document.getElementById('scheduleTime').value;
  const note = document.getElementById('scheduleNote').value.trim();
  if (!date || !time) { showAlert('scheduleFormAlert', '날짜와 시간을 입력하세요.'); return; }

  try {
    await addDoc(collection(db, 'schedules'), {
      leagueId: activeLeague.id, playerId: scheduleLoggedIn.id, playerName: scheduleLoggedIn.name,
      date, time, datetime: new Date(`${date}T${time}`), note, status: 'open', createdAt: serverTimestamp()
    });
    document.getElementById('scheduleNote').value = '';
    showAlert('scheduleFormAlert', '일정이 등록되었습니다.', 'success');
    await loadMySchedules();
    await loadScheduleList();
  } catch (e) { showAlert('scheduleFormAlert', '오류: ' + e.message); }
}

async function loadMySchedules() {
  if (!scheduleLoggedIn || !activeLeague) return;
  const el = document.getElementById('myScheduleList');
  const snap = await getDocs(query(
    collection(db, 'schedules'),
    where('leagueId', '==', activeLeague.id),
    where('playerId', '==', scheduleLoggedIn.id),
    orderBy('datetime', 'desc')
  ));

  if (snap.empty) { el.innerHTML = '<div class="empty-state" style="padding:1rem;">등록된 일정이 없습니다</div>'; return; }

  el.innerHTML = snap.docs.map(d => {
    const s = { id: d.id, ...d.data() };
    const dt = formatDatetime(s.date, s.time);
    const statusBadge = s.status === 'open'
      ? '<span class="badge badge-active">모집중</span>'
      : '<span class="badge badge-inactive">종료</span>';
    return `<div class="schedule-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="schedule-datetime">${dt}</div>
          ${s.note ? `<div class="schedule-note">${s.note}</div>` : ''}
        </div>
        ${statusBadge}
      </div>
      ${s.status === 'open' ? `<button class="btn btn-sm btn-danger" style="margin-top:0.5rem;" onclick="cancelSchedule('${s.id}')">취소</button>` : ''}
    </div>`;
  }).join('');
}

async function cancelSchedule(scheduleId) {
  if (!confirm('일정을 취소하시겠습니까?')) return;
  await updateDoc(doc(db, 'schedules', scheduleId), { status: 'cancelled' });
  await loadMySchedules();
  await loadScheduleList();
}

window.loginForSchedule = loginForSchedule;
window.logoutSchedule = logoutSchedule;
window.postSchedule = postSchedule;
window.cancelSchedule = cancelSchedule;

init();
