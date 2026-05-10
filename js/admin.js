import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, writeBatch, serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert, generateMatchPairs } from './utils.js';

let currentLeague = null;
let allPlayers = [];
let allMatches = [];
let playerToDelete = null;
let editingMatchId = null;

async function init() {
  const cfg = await getDoc(doc(db, 'config', 'settings'));
  if (!cfg.exists() || !cfg.data().adminPasswordHash) {
    document.getElementById('setupNotice').style.display = 'block';
    document.getElementById('adminLoginBtn').textContent = '비밀번호 설정';
    document.getElementById('adminLoginBtn').onclick = setupPassword;
  }
}

async function setupPassword() {
  const pw = document.getElementById('adminPasswordInput').value;
  if (pw.length < 4) { showAlert('adminLoginAlert', '비밀번호는 4자 이상이어야 합니다.'); return; }
  await setDoc(doc(db, 'config', 'settings'), { adminPasswordHash: await hashString(pw) });
  showAlert('adminLoginAlert', '비밀번호가 설정되었습니다! 다시 로그인해주세요.', 'success');
  document.getElementById('adminLoginBtn').textContent = '로그인';
  document.getElementById('adminLoginBtn').onclick = adminLogin;
  document.getElementById('setupNotice').style.display = 'none';
}

async function adminLogin() {
  const pw = document.getElementById('adminPasswordInput').value;
  if (!pw) { showAlert('adminLoginAlert', '비밀번호를 입력하세요.'); return; }
  const cfg = await getDoc(doc(db, 'config', 'settings'));
  if (!cfg.exists()) { showAlert('adminLoginAlert', '먼저 비밀번호를 설정하세요.'); return; }
  if (await hashString(pw) !== cfg.data().adminPasswordHash) { showAlert('adminLoginAlert', '비밀번호가 틀렸습니다.'); return; }
  document.getElementById('adminLogin').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  await loadAll();
}

function adminLogout() {
  document.getElementById('adminLogin').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('adminPasswordInput').value = '';
}

async function loadAll() {
  await loadLeague();
  await loadPlayers();
}

async function loadLeague() {
  const snap = await getDocs(query(collection(db, 'leagues'), where('active', '==', true), limit(1)));
  const info = document.getElementById('currentLeagueInfo');
  const badge = document.getElementById('currentLeagueBadge');

  if (snap.empty) {
    currentLeague = null;
    badge.innerHTML = '<span class="badge badge-inactive">없음</span>';
    info.innerHTML = '<div class="empty-state" style="padding:1rem;">진행 중인 리그가 없습니다</div>';
    return;
  }
  currentLeague = { id: snap.docs[0].id, ...snap.docs[0].data() };
  const s = currentLeague.scoring;
  badge.innerHTML = '<span class="badge badge-active">진행 중</span>';
  info.innerHTML = `<div>
    <strong style="color:var(--gold);font-size:1.05rem;">${currentLeague.name}</strong>
    <div style="color:var(--text-secondary);font-size:0.88rem;margin-top:0.3rem;">승 ${s.win}점 · 패 ${s.loss}점 · 미경기 ${s.noGame}점</div>
    <div style="margin-top:0.75rem;">
      <button class="btn btn-sm btn-danger" onclick="endLeague()">리그 종료</button>
    </div>
  </div>`;
}

async function loadPlayers() {
  if (!currentLeague) {
    document.getElementById('playerList').innerHTML = '<div class="alert alert-info">리그를 먼저 생성하세요.</div>';
    document.getElementById('adminMatchList').innerHTML = '<div class="alert alert-info">리그를 먼저 생성하세요.</div>';
    return;
  }
  const [ps, ms] = await Promise.all([
    getDocs(collection(db, 'leagues', currentLeague.id, 'players')),
    getDocs(collection(db, 'leagues', currentLeague.id, 'matches'))
  ]);
  allPlayers = ps.docs.map(d => ({ id: d.id, ...d.data() }));
  allMatches = ms.docs.map(d => ({ id: d.id, ...d.data() }));
  document.getElementById('playerCount').textContent = `총 ${allPlayers.length}명`;
  renderPlayerList();
  renderAdminMatchList();
}

function renderPlayerList() {
  const el = document.getElementById('playerList');
  if (!allPlayers.length) { el.innerHTML = '<div class="empty-state" style="padding:1rem;">등록된 선수가 없습니다</div>'; return; }
  el.innerHTML = allPlayers.map(p => `
    <div class="player-row">
      <span><strong>${p.name}</strong></span>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-sm btn-secondary" onclick="promptResetPin('${p.id}','${p.name}')">PIN 변경</button>
        <button class="btn btn-sm btn-danger" onclick="openDeletePlayer('${p.id}','${p.name}')">삭제</button>
      </div>
    </div>`).join('');
}

function renderAdminMatchList() {
  const el = document.getElementById('adminMatchList');
  if (!allMatches.length) { el.innerHTML = '<div class="empty-state">경기가 없습니다</div>'; return; }

  const sorted = [...allMatches].sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));
  el.innerHTML = sorted.map(m => {
    const p1 = allPlayers.find(p => p.id === m.player1Id);
    const p2 = allPlayers.find(p => p.id === m.player2Id);
    const p1n = p1?.name || '?', p2n = p2?.name || '?';
    let resultText = '미진행', resultStyle = 'color:var(--text-muted)';
    if (m.result === 'player1') { resultText = `${p1n} 승`; resultStyle = 'color:#81c784'; }
    else if (m.result === 'player2') { resultText = `${p2n} 승`; resultStyle = 'color:#81c784'; }
    else if (m.result === 'noGame') { resultText = '미경기'; resultStyle = 'color:#9e9e9e'; }
    return `<div class="match-item">
      <div>
        <div class="match-vs"><span class="player-name">${p1n}</span><span class="vs-badge">vs</span><span class="player-name">${p2n}</span></div>
        <div style="font-size:0.82rem;margin-top:0.2rem;${resultStyle}">${resultText}</div>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="openEditResult('${m.id}','${m.player1Id}','${m.player2Id}','${p1n}','${p2n}')">수정</button>
    </div>`;
  }).join('');
}

async function createLeague() {
  const name = document.getElementById('leagueName').value.trim();
  const win = parseInt(document.getElementById('scoreWin').value) || 0;
  const loss = parseInt(document.getElementById('scoreLoss').value) || 0;
  const noGame = parseInt(document.getElementById('scoreNoGame').value) || 0;
  if (!name) { showAlert('createLeagueAlert', '리그 이름을 입력하세요.'); return; }
  if (currentLeague && !confirm(`"${currentLeague.name}" 리그를 종료하고 새 리그를 시작하시겠습니까?`)) return;

  try {
    const batch = writeBatch(db);
    if (currentLeague) batch.update(doc(db, 'leagues', currentLeague.id), { active: false });
    const newRef = doc(collection(db, 'leagues'));
    batch.set(newRef, { name, active: true, scoring: { win, loss, noGame }, createdAt: serverTimestamp() });
    await batch.commit();

    currentLeague = { id: newRef.id, name, active: true, scoring: { win, loss, noGame } };
    allPlayers = []; allMatches = [];

    showAlert('createLeagueAlert', '리그가 생성되었습니다! 선수 관리 탭에서 참가자를 등록하세요.', 'success');
    document.getElementById('leagueName').value = '';
    await loadLeague();
    loadPlayers();
  } catch (e) { showAlert('createLeagueAlert', '오류: ' + e.message); }
}

async function importPrevPlayers() {
  if (!currentLeague) { showAlert('playerAlert', '먼저 리그를 생성하세요.'); return; }
  const snap = await getDocs(query(collection(db, 'leagues'), where('active', '==', false), orderBy('createdAt', 'desc'), limit(1)));
  if (snap.empty) { showAlert('playerAlert', '이전 리그가 없습니다.'); return; }
  const prevId = snap.docs[0].id;
  const prevPlayers = await getDocs(collection(db, 'leagues', prevId, 'players'));
  if (prevPlayers.empty) { showAlert('playerAlert', '이전 리그에 선수가 없습니다.'); return; }
  if (!confirm('이전 리그 참가자를 현재 리그로 불러오시겠습니까?')) return;

  const batch = writeBatch(db);
  const importedIds = [];
  prevPlayers.docs.forEach(d => {
    const data = d.data();
    const existing = allPlayers.find(p => p.name === data.name);
    if (!existing) {
      const ref = doc(collection(db, 'leagues', currentLeague.id, 'players'));
      batch.set(ref, { name: data.name, pinHash: data.pinHash });
      importedIds.push(ref.id);
    }
  });

  const existingIds = allPlayers.map(p => p.id);
  const allIds = [...existingIds, ...importedIds];
  generateMatchPairs(allIds).forEach((pair, i) => {
    if (existingIds.includes(pair.player1Id) && existingIds.includes(pair.player2Id)) return;
    const ref = doc(collection(db, 'leagues', currentLeague.id, 'matches'));
    batch.set(ref, pair);
  });

  await batch.commit();
  showAlert('playerAlert', '불러오기 완료!', 'success');
  await loadPlayers();
}

async function endLeague() {
  if (!currentLeague || !confirm(`"${currentLeague.name}" 리그를 종료하시겠습니까?`)) return;
  await updateDoc(doc(db, 'leagues', currentLeague.id), { active: false });
  currentLeague = null; allPlayers = []; allMatches = [];
  await loadAll();
}

async function addPlayer() {
  if (!currentLeague) { showAlert('playerAlert', '리그를 먼저 생성하세요.'); return; }
  const name = document.getElementById('newPlayerName').value.trim();
  const pin = document.getElementById('newPlayerPin').value.trim();
  if (!name) { showAlert('playerAlert', '이름을 입력하세요.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAlert('playerAlert', 'PIN은 숫자 4자리입니다.'); return; }
  if (allPlayers.some(p => p.name === name)) { showAlert('playerAlert', '이미 등록된 이름입니다.'); return; }

  try {
    const pinHash = await hashString(pin);
    const playerRef = doc(collection(db, 'leagues', currentLeague.id, 'players'));
    const batch = writeBatch(db);
    batch.set(playerRef, { name, pinHash });
    allPlayers.forEach(existing => {
      const mRef = doc(collection(db, 'leagues', currentLeague.id, 'matches'));
      batch.set(mRef, { player1Id: existing.id, player2Id: playerRef.id, result: null, winnerId: null, reportedBy: null, reportedAt: null });
    });
    await batch.commit();
    document.getElementById('newPlayerName').value = '';
    document.getElementById('newPlayerPin').value = '';
    showAlert('playerAlert', `${name} 선수가 등록되었습니다.`, 'success');
    await loadPlayers();
  } catch (e) { showAlert('playerAlert', '오류: ' + e.message); }
}

async function promptResetPin(playerId, playerName) {
  const newPin = prompt(`${playerName}의 새 PIN (숫자 4자리):`);
  if (!newPin) return;
  if (!/^\d{4}$/.test(newPin)) { alert('PIN은 숫자 4자리입니다.'); return; }
  await updateDoc(doc(db, 'leagues', currentLeague.id, 'players', playerId), { pinHash: await hashString(newPin) });
  showAlert('playerAlert', `${playerName} PIN이 변경되었습니다.`, 'success');
}

function openDeletePlayer(playerId, playerName) {
  playerToDelete = playerId;
  document.getElementById('deletePlayerInfo').textContent = `"${playerName}" 선수를 삭제하면 관련 경기 기록도 모두 삭제됩니다.`;
  document.getElementById('deletePlayerModal').classList.add('active');
}

async function confirmDeletePlayer() {
  if (!playerToDelete || !currentLeague) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'leagues', currentLeague.id, 'players', playerToDelete));
  allMatches.filter(m => m.player1Id === playerToDelete || m.player2Id === playerToDelete)
    .forEach(m => batch.delete(doc(db, 'leagues', currentLeague.id, 'matches', m.id)));
  await batch.commit();
  document.getElementById('deletePlayerModal').classList.remove('active');
  playerToDelete = null;
  await loadPlayers();
}

function openEditResult(matchId, p1Id, p2Id, p1Name, p2Name) {
  editingMatchId = matchId;
  document.getElementById('editMatchId').value = matchId;
  document.getElementById('editPlayer1Id').value = p1Id;
  document.getElementById('editPlayer2Id').value = p2Id;
  document.getElementById('editModalInfo').textContent = `${p1Name} vs ${p2Name}`;
  document.getElementById('editBtnP1Win').textContent = `${p1Name} 승리`;
  document.getElementById('editBtnP2Win').textContent = `${p2Name} 승리`;
  document.getElementById('editModalAlert').innerHTML = '';
  document.getElementById('editResultModal').classList.add('active');
}

async function adminSetResult(result) {
  const matchId = document.getElementById('editMatchId').value;
  const p1Id = document.getElementById('editPlayer1Id').value;
  const p2Id = document.getElementById('editPlayer2Id').value;
  const winnerId = result === 'player1' ? p1Id : result === 'player2' ? p2Id : null;
  try {
    await updateDoc(doc(db, 'leagues', currentLeague.id, 'matches', matchId), { result, winnerId, reportedBy: 'admin', reportedAt: new Date() });
    document.getElementById('editResultModal').classList.remove('active');
    await loadPlayers();
  } catch (e) { showAlert('editModalAlert', '오류: ' + e.message); }
}

async function changePassword() {
  const cur = document.getElementById('currentPassword').value;
  const nw = document.getElementById('newPassword').value;
  const cf = document.getElementById('confirmPassword').value;
  if (!cur || !nw || !cf) { showAlert('passwordAlert', '모든 항목을 입력하세요.'); return; }
  if (nw !== cf) { showAlert('passwordAlert', '새 비밀번호가 일치하지 않습니다.'); return; }
  if (nw.length < 4) { showAlert('passwordAlert', '비밀번호는 4자 이상이어야 합니다.'); return; }
  const cfg = await getDoc(doc(db, 'config', 'settings'));
  if (await hashString(cur) !== cfg.data().adminPasswordHash) { showAlert('passwordAlert', '현재 비밀번호가 틀렸습니다.'); return; }
  await updateDoc(doc(db, 'config', 'settings'), { adminPasswordHash: await hashString(nw) });
  showAlert('passwordAlert', '비밀번호가 변경되었습니다.', 'success');
  ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => document.getElementById(id).value = '');
}

window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.createLeague = createLeague;
window.endLeague = endLeague;
window.importPrevPlayers = importPrevPlayers;
window.addPlayer = addPlayer;
window.promptResetPin = promptResetPin;
window.openDeletePlayer = openDeletePlayer;
window.confirmDeletePlayer = confirmDeletePlayer;
window.openEditResult = openEditResult;
window.adminSetResult = adminSetResult;
window.changePassword = changePassword;

init();
