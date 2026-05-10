import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, writeBatch, serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert, generateMatchPairs } from './utils.js';

let allActiveLeagues = [];
let currentLeague = null;   // 선수 관리 탭에서 선택된 리그
let resultLeague = null;    // 결과 수정 탭에서 선택된 리그
let allPlayers = [];
let allMatches = [];
let allMembers = [];
let playerToDelete = null;
let memberToDelete = null;

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
  await Promise.all([loadLeagues(), loadMembers()]);
}

// ── 리그 관리 ──────────────────────────────────────────────────────

async function loadLeagues() {
  try {
    const snap = await getDocs(query(
      collection(db, 'leagues'),
      where('active', '==', true),
      orderBy('createdAt', 'desc')
    ));
    allActiveLeagues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeagueList();
    renderLeagueSelectors();
  } catch (e) {
    document.getElementById('activeLeagueList').innerHTML =
      `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

function renderLeagueList() {
  const el = document.getElementById('activeLeagueList');
  const countEl = document.getElementById('activeLeagueCount');
  countEl.textContent = `총 ${allActiveLeagues.length}개`;

  if (!allActiveLeagues.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem;">진행 중인 리그가 없습니다</div>';
    return;
  }
  el.innerHTML = allActiveLeagues.map(league => {
    const s = league.scoring;
    return `<div class="player-row" style="flex-direction:column;align-items:flex-start;gap:0.4rem;padding:0.85rem 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <strong style="color:var(--gold);font-size:1rem;">${league.name}</strong>
        <button class="btn btn-sm btn-danger" onclick="endLeague('${league.id}','${league.name}')">종료</button>
      </div>
      <div style="color:var(--text-secondary);font-size:0.83rem;">승 ${s.win}점 · 패 ${s.loss}점 · 미경기 ${s.noGame}점</div>
    </div>`;
  }).join('<hr style="border-color:var(--border);margin:0;">');
}

function renderLeagueSelectors() {
  const options = allActiveLeagues.length
    ? allActiveLeagues.map(l => `<option value="${l.id}">${l.name}</option>`).join('')
    : '<option value="">진행 중인 리그 없음</option>';

  const playerSel = document.getElementById('playerLeagueSelect');
  const resultSel = document.getElementById('resultLeagueSelect');
  const prevPlayer = playerSel.value;
  const prevResult = resultSel.value;

  playerSel.innerHTML = '<option value="">-- 리그를 선택하세요 --</option>' + options;
  resultSel.innerHTML = '<option value="">-- 리그를 선택하세요 --</option>' + options;

  // 기존 선택값 유지
  if (prevPlayer && allActiveLeagues.find(l => l.id === prevPlayer)) playerSel.value = prevPlayer;
  if (prevResult && allActiveLeagues.find(l => l.id === prevResult)) resultSel.value = prevResult;
}

async function createLeague() {
  const name = document.getElementById('leagueName').value.trim();
  const win = parseInt(document.getElementById('scoreWin').value) || 0;
  const loss = parseInt(document.getElementById('scoreLoss').value) || 0;
  const noGame = parseInt(document.getElementById('scoreNoGame').value) || 0;
  if (!name) { showAlert('createLeagueAlert', '리그 이름을 입력하세요.'); return; }

  try {
    const newRef = doc(collection(db, 'leagues'));
    await setDoc(newRef, { name, active: true, scoring: { win, loss, noGame }, createdAt: serverTimestamp() });
    showAlert('createLeagueAlert', '리그가 생성되었습니다! 선수 관리 탭에서 참가자를 등록하세요.', 'success');
    document.getElementById('leagueName').value = '';
    await loadLeagues();
  } catch (e) { showAlert('createLeagueAlert', '오류: ' + e.message); }
}

async function endLeague(leagueId, leagueName) {
  if (!confirm(`"${leagueName}" 리그를 종료하시겠습니까?`)) return;
  await updateDoc(doc(db, 'leagues', leagueId), { active: false });
  if (currentLeague?.id === leagueId) {
    currentLeague = null; allPlayers = []; allMatches = [];
    renderPlayerTab();
  }
  if (resultLeague?.id === leagueId) {
    resultLeague = null;
    renderResultTab();
  }
  await loadLeagues();
}

// ── 회원 관리 ──────────────────────────────────────────────────────

async function loadMembers() {
  try {
    const snap = await getDocs(query(collection(db, 'members'), orderBy('handicap', 'desc')));
    allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('memberCount').textContent = `총 ${allMembers.length}명`;
    renderMemberList();
    if (currentLeague) renderMemberSelectForLeague();
  } catch (e) {
    document.getElementById('memberList').innerHTML =
      `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

async function addMember() {
  const name = document.getElementById('newMemberName').value.trim();
  const handicapVal = document.getElementById('newMemberHandicap').value.trim();
  const pin = document.getElementById('newMemberPin').value.trim();
  if (!name) { showAlert('memberAlert', '이름을 입력하세요.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAlert('memberAlert', 'PIN은 숫자 4자리입니다.'); return; }
  if (allMembers.some(m => m.name === name)) { showAlert('memberAlert', '이미 등록된 회원입니다.'); return; }

  try {
    const pinHash = await hashString(pin);
    const handicap = handicapVal !== '' ? parseInt(handicapVal) : 0;
    await setDoc(doc(collection(db, 'members')), { name, handicap, pinHash });
    document.getElementById('newMemberName').value = '';
    document.getElementById('newMemberHandicap').value = '';
    document.getElementById('newMemberPin').value = '';
    showAlert('memberAlert', `${name} 회원이 등록되었습니다.`, 'success');
    await loadMembers();
  } catch (e) { showAlert('memberAlert', '오류: ' + e.message); }
}

function renderMemberList() {
  const el = document.getElementById('memberList');
  if (!allMembers.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem;">등록된 회원이 없습니다</div>';
    return;
  }
  el.innerHTML = allMembers.map(m => `
    <div class="player-row">
      <span>
        <strong>${m.name}</strong>
        ${m.handicap != null ? `<span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.4rem;">핸디 ${m.handicap}</span>` : ''}
      </span>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-sm btn-secondary" onclick="promptResetMemberPin('${m.id}','${m.name}')">PIN 변경</button>
        <button class="btn btn-sm btn-danger" onclick="openDeleteMember('${m.id}','${m.name}')">삭제</button>
      </div>
    </div>`).join('');
}

async function promptResetMemberPin(memberId, memberName) {
  const newPin = prompt(`${memberName}의 새 PIN (숫자 4자리):`);
  if (!newPin) return;
  if (!/^\d{4}$/.test(newPin)) { alert('PIN은 숫자 4자리입니다.'); return; }
  const pinHash = await hashString(newPin);
  const batch = writeBatch(db);
  batch.update(doc(db, 'members', memberId), { pinHash });
  if (currentLeague) {
    const player = allPlayers.find(p => p.memberId === memberId);
    if (player) batch.update(doc(db, 'leagues', currentLeague.id, 'players', player.id), { pinHash });
  }
  await batch.commit();
  showAlert('memberAlert', `${memberName} PIN이 변경되었습니다.`, 'success');
  await loadMembers();
}

function openDeleteMember(memberId, memberName) {
  memberToDelete = memberId;
  document.getElementById('deleteMemberInfo').textContent =
    `"${memberName}" 회원을 삭제하시겠습니까? (현재 리그 참가자에서는 제거되지 않습니다)`;
  document.getElementById('deleteMemberModal').classList.add('active');
}

async function confirmDeleteMember() {
  if (!memberToDelete) return;
  try {
    await deleteDoc(doc(db, 'members', memberToDelete));
    document.getElementById('deleteMemberModal').classList.remove('active');
    memberToDelete = null;
    await loadMembers();
  } catch (e) { alert('오류: ' + e.message); }
}

// ── 선수 관리 ──────────────────────────────────────────────────────

async function onPlayerLeagueChange() {
  const leagueId = document.getElementById('playerLeagueSelect').value;
  currentLeague = allActiveLeagues.find(l => l.id === leagueId) || null;
  allPlayers = []; allMatches = [];
  if (!currentLeague) { renderPlayerTab(); return; }
  await loadPlayers();
}

async function loadPlayers() {
  if (!currentLeague) { renderPlayerTab(); return; }
  const [ps, ms] = await Promise.all([
    getDocs(collection(db, 'leagues', currentLeague.id, 'players')),
    getDocs(collection(db, 'leagues', currentLeague.id, 'matches'))
  ]);
  allPlayers = ps.docs.map(d => ({ id: d.id, ...d.data() }));
  allMatches = ms.docs.map(d => ({ id: d.id, ...d.data() }));
  renderPlayerTab();
}

function renderPlayerTab() {
  document.getElementById('playerCount').textContent = currentLeague ? `총 ${allPlayers.length}명` : '';
  renderPlayerList();
  renderMemberSelectForLeague();
}

function renderPlayerList() {
  const el = document.getElementById('playerList');
  if (!currentLeague) { el.innerHTML = ''; return; }
  if (!allPlayers.length) {
    el.innerHTML = '<div class="empty-state" style="padding:1rem;">등록된 선수가 없습니다</div>';
    return;
  }
  el.innerHTML = allPlayers.map(p => `
    <div class="player-row">
      <span>
        <strong>${p.name}</strong>
        ${p.handicap != null ? `<span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.4rem;">핸디 ${p.handicap}</span>` : ''}
      </span>
      <button class="btn btn-sm btn-danger" onclick="openDeletePlayer('${p.id}','${p.name}')">삭제</button>
    </div>`).join('');
}

function renderMemberSelectForLeague() {
  const el = document.getElementById('memberSelectList');
  if (!el) return;
  if (!currentLeague) { el.innerHTML = ''; return; }
  if (!allMembers.length) {
    el.innerHTML = '<div class="empty-state">등록된 회원이 없습니다. 먼저 회원 관리 탭에서 회원을 등록하세요.</div>';
    return;
  }
  const enrolledNames = new Set(allPlayers.map(p => p.name));
  const available = allMembers.filter(m => !enrolledNames.has(m.name));
  if (!available.length) {
    el.innerHTML = '<div class="empty-state">모든 회원이 이미 참가자로 등록되어 있습니다.</div>';
    return;
  }
  el.innerHTML = available.map(m => `
    <label class="player-row" style="cursor:pointer;user-select:none;">
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <input type="checkbox" value="${m.id}" style="width:16px;height:16px;accent-color:var(--gold);cursor:pointer;">
        <span>
          <strong>${m.name}</strong>
          ${m.handicap != null ? `<span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.4rem;">핸디 ${m.handicap}</span>` : ''}
        </span>
      </div>
    </label>`).join('');
}

async function addSelectedMembers() {
  if (!currentLeague) { showAlert('memberSelectAlert', '리그를 먼저 선택하세요.'); return; }
  const checked = [...document.querySelectorAll('#memberSelectList input[type=checkbox]:checked')];
  if (!checked.length) { showAlert('memberSelectAlert', '추가할 회원을 선택하세요.'); return; }

  const selectedIds = checked.map(c => c.value);
  const selectedMembers = allMembers.filter(m => selectedIds.includes(m.id));

  try {
    const batch = writeBatch(db);
    const newPlayerIds = [];

    selectedMembers.forEach(m => {
      const ref = doc(collection(db, 'leagues', currentLeague.id, 'players'));
      batch.set(ref, { name: m.name, handicap: m.handicap ?? 0, pinHash: m.pinHash, memberId: m.id });
      newPlayerIds.push(ref.id);
    });

    const existingIds = allPlayers.map(p => p.id);
    const allIds = [...existingIds, ...newPlayerIds];
    const existingPairs = new Set(allMatches.map(m => `${m.player1Id}|${m.player2Id}`));

    allIds.forEach((id1, i) => {
      allIds.slice(i + 1).forEach(id2 => {
        if (!newPlayerIds.includes(id1) && !newPlayerIds.includes(id2)) return;
        const key1 = `${id1}|${id2}`, key2 = `${id2}|${id1}`;
        if (existingPairs.has(key1) || existingPairs.has(key2)) return;
        const ref = doc(collection(db, 'leagues', currentLeague.id, 'matches'));
        batch.set(ref, { player1Id: id1, player2Id: id2, result: null, winnerId: null, reportedBy: null, reportedAt: null });
      });
    });

    await batch.commit();
    showAlert('memberSelectAlert', `${selectedMembers.length}명이 추가되었습니다!`, 'success');
    await loadPlayers();
  } catch (e) { showAlert('memberSelectAlert', '오류: ' + e.message); }
}

function openDeletePlayer(playerId, playerName) {
  playerToDelete = playerId;
  document.getElementById('deletePlayerInfo').textContent =
    `"${playerName}" 선수를 삭제하면 관련 경기 기록도 모두 삭제됩니다.`;
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

// ── 결과 수정 ──────────────────────────────────────────────────────

async function onResultLeagueChange() {
  const leagueId = document.getElementById('resultLeagueSelect').value;
  resultLeague = allActiveLeagues.find(l => l.id === leagueId) || null;
  if (!resultLeague) { renderResultTab([], []); return; }
  await loadResultData();
}

async function loadResultData() {
  if (!resultLeague) return;
  const [ps, ms] = await Promise.all([
    getDocs(collection(db, 'leagues', resultLeague.id, 'players')),
    getDocs(collection(db, 'leagues', resultLeague.id, 'matches'))
  ]);
  const players = ps.docs.map(d => ({ id: d.id, ...d.data() }));
  const matches = ms.docs.map(d => ({ id: d.id, ...d.data() }));
  renderResultTab(players, matches);
}

function renderResultTab(players = [], matches = []) {
  const el = document.getElementById('adminMatchList');
  if (!resultLeague) { el.innerHTML = ''; return; }
  if (!matches.length) { el.innerHTML = '<div class="empty-state">경기가 없습니다</div>'; return; }

  const sorted = [...matches].sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));
  el.innerHTML = sorted.map(m => {
    const p1 = players.find(p => p.id === m.player1Id);
    const p2 = players.find(p => p.id === m.player2Id);
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

function openEditResult(matchId, p1Id, p2Id, p1Name, p2Name) {
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
  if (!resultLeague) return;
  const matchId = document.getElementById('editMatchId').value;
  const p1Id = document.getElementById('editPlayer1Id').value;
  const p2Id = document.getElementById('editPlayer2Id').value;
  const winnerId = result === 'player1' ? p1Id : result === 'player2' ? p2Id : null;
  try {
    await updateDoc(doc(db, 'leagues', resultLeague.id, 'matches', matchId),
      { result, winnerId, reportedBy: 'admin', reportedAt: new Date() });
    document.getElementById('editResultModal').classList.remove('active');
    await loadResultData();
  } catch (e) { showAlert('editModalAlert', '오류: ' + e.message); }
}

// ── 설정 ──────────────────────────────────────────────────────────

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
window.addMember = addMember;
window.promptResetMemberPin = promptResetMemberPin;
window.openDeleteMember = openDeleteMember;
window.confirmDeleteMember = confirmDeleteMember;
window.onPlayerLeagueChange = onPlayerLeagueChange;
window.addSelectedMembers = addSelectedMembers;
window.openDeletePlayer = openDeletePlayer;
window.confirmDeletePlayer = confirmDeletePlayer;
window.onResultLeagueChange = onResultLeagueChange;
window.openEditResult = openEditResult;
window.adminSetResult = adminSetResult;
window.changePassword = changePassword;

init();
