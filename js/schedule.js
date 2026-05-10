import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert, formatDatetime, formatTimestamp } from './utils.js';

let activeLeague = null;
let allPlayers = [];
let scheduleLoggedIn = null;
let requestsLoggedIn = null;
let targetScheduleId = null;

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
  ['schedulePlayerSelect', 'requestsPlayerSelect', 'requestMyName'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    allPlayers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
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
      const isMe = scheduleLoggedIn?.id === s.playerId;
      return `<div class="schedule-card">
        <div class="schedule-datetime">📅 ${dt}</div>
        <div class="schedule-player">👤 ${s.playerName}</div>
        ${s.note ? `<div class="schedule-note">${s.note}</div>` : ''}
        ${!isMe ? `<button class="btn btn-sm btn-gold" onclick="openRequestModal('${s.id}','${s.playerName}','${dt}')">매칭 요청</button>` : '<span style="color:var(--text-muted);font-size:0.82rem;">내 일정</span>'}
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

function openRequestModal(scheduleId, ownerName, datetime) {
  targetScheduleId = scheduleId;
  document.getElementById('requestModalInfo').innerHTML = `<strong>${ownerName}</strong> 님의 일정<br>${datetime}`;
  document.getElementById('requestModalAlert').innerHTML = '';
  document.getElementById('requestModal').classList.add('active');
}

async function submitMatchRequest() {
  const pid = document.getElementById('requestMyName').value;
  const pin = document.getElementById('requestMyPin').value.trim();
  const msg = document.getElementById('requestMessage').value.trim();
  if (!pid) { showAlert('requestModalAlert', '이름을 선택하세요.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAlert('requestModalAlert', 'PIN은 숫자 4자리입니다.'); return; }
  const player = allPlayers.find(p => p.id === pid);
  if (!player || await hashString(pin) !== player.pinHash) { showAlert('requestModalAlert', 'PIN이 올바르지 않습니다.'); return; }

  const scheduleSnap = await getDocs(query(collection(db, 'schedules'), where('__name__', '==', targetScheduleId)));
  // Just use doc reference directly
  try {
    await addDoc(collection(db, 'scheduleRequests'), {
      scheduleId: targetScheduleId, requesterId: pid, requesterName: player.name,
      message: msg, status: 'pending', createdAt: serverTimestamp()
    });
    document.getElementById('requestModal').classList.remove('active');
    document.getElementById('requestMyPin').value = '';
    document.getElementById('requestMessage').value = '';
    alert('요청을 보냈습니다! 상대방의 수락을 기다리세요.');
  } catch (e) { showAlert('requestModalAlert', '오류: ' + e.message); }
}

async function loginForRequests() {
  const pid = document.getElementById('requestsPlayerSelect').value;
  const pin = document.getElementById('requestsPin').value.trim();
  if (!pid) { showAlert('requestsLoginAlert', '이름을 선택하세요.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAlert('requestsLoginAlert', 'PIN은 숫자 4자리입니다.'); return; }
  const player = allPlayers.find(p => p.id === pid);
  if (!player || await hashString(pin) !== player.pinHash) { showAlert('requestsLoginAlert', 'PIN이 올바르지 않습니다.'); return; }
  requestsLoggedIn = player;
  document.getElementById('requestsLoginArea').style.display = 'none';
  document.getElementById('requestsArea').style.display = 'block';
  document.getElementById('requestsLoggedInName').textContent = player.name + ' 님';
  await loadRequests();
}

function logoutRequests() {
  requestsLoggedIn = null;
  document.getElementById('requestsLoginArea').style.display = 'block';
  document.getElementById('requestsArea').style.display = 'none';
  document.getElementById('requestsPin').value = '';
}

async function loadRequests() {
  if (!requestsLoggedIn || !activeLeague) return;
  const el = document.getElementById('requestsList');

  // Get my schedules first
  const mySchedules = await getDocs(query(
    collection(db, 'schedules'),
    where('leagueId', '==', activeLeague.id),
    where('playerId', '==', requestsLoggedIn.id)
  ));
  const myScheduleIds = mySchedules.docs.map(d => d.id);

  // Get requests I've sent
  const sentSnap = await getDocs(query(
    collection(db, 'scheduleRequests'),
    where('requesterId', '==', requestsLoggedIn.id),
    orderBy('createdAt', 'desc')
  ));

  let html = '';

  // Received requests (for my schedules)
  if (myScheduleIds.length > 0) {
    const scheduleMap = {};
    mySchedules.docs.forEach(d => { scheduleMap[d.id] = d.data(); });

    // Fetch requests for each schedule
    for (const sid of myScheduleIds) {
      const reqSnap = await getDocs(query(collection(db, 'scheduleRequests'), where('scheduleId', '==', sid), where('status', '==', 'pending')));
      reqSnap.docs.forEach(d => {
        const r = { id: d.id, ...d.data() };
        const s = scheduleMap[sid];
        const dt = s ? formatDatetime(s.date, s.time) : '';
        html += `<div class="schedule-card">
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">받은 요청 · ${dt}</div>
          <div style="margin-bottom:0.5rem;"><strong>${r.requesterName}</strong> 님이 매칭을 요청했습니다</div>
          ${r.message ? `<div class="schedule-note">"${r.message}"</div>` : ''}
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <button class="btn btn-sm btn-primary" onclick="respondRequest('${r.id}','accepted')">수락</button>
            <button class="btn btn-sm btn-secondary" onclick="respondRequest('${r.id}','rejected')">거절</button>
          </div>
        </div>`;
      });
    }
  }

  // Sent requests
  if (!sentSnap.empty) {
    html += `<div style="color:var(--gold);font-weight:600;font-size:0.9rem;margin:1rem 0 0.5rem;">내가 보낸 요청</div>`;
    sentSnap.docs.forEach(d => {
      const r = { id: d.id, ...d.data() };
      const statusText = { pending: '⏳ 대기중', accepted: '✅ 수락됨', rejected: '❌ 거절됨' }[r.status] || r.status;
      html += `<div class="schedule-card">
        <div style="display:flex;justify-content:space-between;">
          <span><strong>${r.requesterName}</strong> → 상대방에게 요청</span>
          <span style="font-size:0.85rem;">${statusText}</span>
        </div>
        ${r.message ? `<div class="schedule-note" style="margin-top:0.3rem;">"${r.message}"</div>` : ''}
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.3rem;">${r.createdAt ? formatTimestamp(r.createdAt) : ''}</div>
      </div>`;
    });
  }

  el.innerHTML = html || '<div class="empty-state">요청이 없습니다</div>';
}

async function respondRequest(requestId, status) {
  await updateDoc(doc(db, 'scheduleRequests', requestId), { status });
  if (status === 'accepted') {
    // Mark schedule as matched
    const reqDoc = (await getDocs(query(collection(db, 'scheduleRequests'), where('__name__', '==', requestId)))).docs[0];
    if (reqDoc) await updateDoc(doc(db, 'schedules', reqDoc.data().scheduleId), { status: 'matched' });
  }
  await loadRequests();
  if (status === 'accepted') alert('수락했습니다! 경기 일정을 조율하세요.');
}

window.loginForSchedule = loginForSchedule;
window.logoutSchedule = logoutSchedule;
window.postSchedule = postSchedule;
window.cancelSchedule = cancelSchedule;
window.openRequestModal = openRequestModal;
window.submitMatchRequest = submitMatchRequest;
window.loginForRequests = loginForRequests;
window.logoutRequests = logoutRequests;
window.respondRequest = respondRequest;

init();
