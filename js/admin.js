import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  query, where, writeBatch, serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert, generateMatchPairs } from './utils.js';

let allActiveLeagues = [];
let allEndedLeagues = [];
let currentLeague = null;
let resultLeague = null;
let historyLeague = null;
let selectedHistoryPlayerId = null;
let currentEditLeagueId = null;

let allPlayers = [];
let allMatches = [];
let allMembers = [];
let historyPlayers = [];
let historyMatches = [];
let allSchedules = [];

let playerToDelete = null;
let memberToDelete = null;
let bonusPlayerId = null;
let editScheduleData = null;
let editHandicapMemberId = null;
let editPinMemberId = null;
let renameMemberId = null;
let editLeagueId = null;
let resultPlayers = [];
let resultMatches = [];
let selectedResultPlayerId = null;

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
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-sm btn-secondary" onclick="openEditLeagueModal('${league.id}')">수정</button>
          <button class="btn btn-sm btn-danger" onclick="endLeague('${league.id}','${league.name}')">종료</button>
        </div>
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
    resultPlayers = []; resultMatches = []; selectedResultPlayerId = null;
    renderResultTab();
  }
  await loadLeagues();
}

function openEditLeagueModal(leagueId) {
  const league = allActiveLeagues.find(l => l.id === leagueId);
  if (!league) return;
  editLeagueId = leagueId;
  document.getElementById('editLeagueName').value = league.name;
  document.getElementById('editLeagueWin').value = league.scoring.win;
  document.getElementById('editLeagueLoss').value = league.scoring.loss;
  document.getElementById('editLeagueNoGame').value = league.scoring.noGame;
  document.getElementById('editLeagueAlert').innerHTML = '';
  document.getElementById('editLeagueModal').classList.add('active');
}

async function saveEditLeague() {
  if (!editLeagueId) return;
  const name = document.getElementById('editLeagueName').value.trim();
  const win = parseInt(document.getElementById('editLeagueWin').value) || 0;
  const loss = parseInt(document.getElementById('editLeagueLoss').value) || 0;
  const noGame = parseInt(document.getElementById('editLeagueNoGame').value) || 0;
  if (!name) { showAlert('editLeagueAlert', '리그 이름을 입력하세요.'); return; }

  try {
    await updateDoc(doc(db, 'leagues', editLeagueId), { name, scoring: { win, loss, noGame } });
    document.getElementById('editLeagueModal').classList.remove('active');
    editLeagueId = null;
    await loadLeagues();
  } catch (e) { showAlert('editLeagueAlert', '오류: ' + e.message); }
}

// ── 올해의 승점 관리 ──────────────────────────────────────────────────

async function loadYearlyScores() {
  try {
    const snap = await getDocs(query(collection(db, 'members'), orderBy('handicap', 'desc')));
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('yearlyScoreCount').textContent = `총 ${members.length}명`;
    const el = document.getElementById('yearlyScoreList');
    if (!members.length) {
      el.innerHTML = '<div class="empty-state" style="padding:1rem;">등록된 회원이 없습니다</div>';
      return;
    }
    el.innerHTML = members.map(m => `
      <div class="player-row">
        <span><strong>${m.name}</strong></span>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <input type="number" id="ys-input-${m.id}" data-member-id="${m.id}" value="${m.yearlyScore ?? 0}"
            style="width:70px;padding:0.3rem 0.5rem;border:1px solid var(--border);border-radius:4px;background:var(--bg-input, var(--bg-table));color:var(--text-primary);font-size:0.9rem;text-align:center;"
            min="0">
          <span style="font-size:0.82rem;color:var(--text-muted);">점</span>
        </div>
      </div>`).join('');
  } catch (e) {
    document.getElementById('yearlyScoreList').innerHTML =
      `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

async function saveAllYearlyScores() {
  const inputs = document.querySelectorAll('#yearlyScoreList input[data-member-id]');
  const entries = [];
  for (const input of inputs) {
    const val = parseInt(input.value);
    if (isNaN(val) || val < 0) { showAlert('yearlyScoreAlert', '올바른 숫자를 입력하세요.'); return; }
    entries.push({ id: input.dataset.memberId, val });
  }
  if (!entries.length) return;
  try {
    const batch = writeBatch(db);
    entries.forEach(({ id, val }) => batch.update(doc(db, 'members', id), { yearlyScore: val }));
    await batch.commit();
    showAlert('yearlyScoreAlert', `${entries.length}명의 올해의 승점이 저장되었습니다.`, 'success');
    await loadYearlyScores();
  } catch (e) { showAlert('yearlyScoreAlert', '저장 오류: ' + e.message); }
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
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
        <button class="btn btn-sm btn-secondary" onclick="openRenameModal('${m.id}','${m.name}')">이름 변경</button>
        <button class="btn btn-sm btn-secondary" onclick="openHandicapModal('${m.id}','${m.name}',${m.handicap ?? 0})">핸디 변경</button>
        <button class="btn btn-sm btn-secondary" onclick="openChangePinModal('${m.id}','${m.name}')">비밀번호 변경</button>
        <button class="btn btn-sm btn-danger" onclick="openDeleteMember('${m.id}','${m.name}')">삭제</button>
      </div>
    </div>`).join('');
}

function openRenameModal(memberId, memberName) {
  renameMemberId = memberId;
  document.getElementById('renameMemberCurrent').textContent = memberName;
  document.getElementById('renameMemberInput').value = memberName;
  document.getElementById('renameAlert').innerHTML = '';
  document.getElementById('renameModal').classList.add('active');
}

async function saveMemberName() {
  if (!renameMemberId) return;
  const newName = document.getElementById('renameMemberInput').value.trim();
  if (!newName) { showAlert('renameAlert', '이름을 입력하세요.'); return; }
  if (allMembers.some(m => m.name === newName && m.id !== renameMemberId)) {
    showAlert('renameAlert', '이미 사용 중인 이름입니다.'); return;
  }
  try {
    await updateDoc(doc(db, 'members', renameMemberId), { name: newName });
    document.getElementById('renameModal').classList.remove('active');
    renameMemberId = null;
    await loadMembers();
  } catch (e) { showAlert('renameAlert', '오류: ' + e.message); }
}

function openChangePinModal(memberId, memberName) {
  editPinMemberId = memberId;
  document.getElementById('changePinMemberName').textContent = memberName;
  document.getElementById('newPinInput').value = '';
  document.getElementById('changePinAlert').innerHTML = '';
  document.getElementById('changePinModal').classList.add('active');
}

async function saveChangedPin() {
  if (!editPinMemberId) return;
  const newPin = document.getElementById('newPinInput').value.trim();
  if (!/^\d{4}$/.test(newPin)) { showAlert('changePinAlert', 'PIN은 숫자 4자리입니다.'); return; }
  const pinHash = await hashString(newPin);
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'members', editPinMemberId), { pinHash });
    for (const league of allActiveLeagues) {
      const player = (league.id === currentLeague?.id ? allPlayers : []).find(p => p.memberId === editPinMemberId);
      if (player) batch.update(doc(db, 'leagues', league.id, 'players', player.id), { pinHash });
    }
    await batch.commit();
    document.getElementById('changePinModal').classList.remove('active');
    editPinMemberId = null;
    showAlert('memberAlert', '비밀번호가 변경되었습니다.', 'success');
    await loadMembers();
  } catch (e) { showAlert('changePinAlert', '오류: ' + e.message); }
}

function openHandicapModal(memberId, memberName, currentHandicap) {
  editHandicapMemberId = memberId;
  document.getElementById('handicapMemberName').textContent = memberName;
  document.getElementById('handicapInput').value = currentHandicap;
  document.getElementById('handicapAlert').innerHTML = '';
  document.getElementById('handicapModal').classList.add('active');
}

async function saveHandicap() {
  if (!editHandicapMemberId) return;
  const raw = document.getElementById('handicapInput').value;
  const val = parseInt(raw);
  if (raw === '' || isNaN(val)) { showAlert('handicapAlert', '숫자를 입력하세요.'); return; }
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'members', editHandicapMemberId), { handicap: val });
    const player = allPlayers.find(p => p.memberId === editHandicapMemberId);
    if (player && currentLeague) {
      batch.update(doc(db, 'leagues', currentLeague.id, 'players', player.id), { handicap: val });
    }
    await batch.commit();
    document.getElementById('handicapModal').classList.remove('active');
    editHandicapMemberId = null;
    showAlert('memberAlert', '핸디캡이 변경되었습니다.', 'success');
    await loadMembers();
  } catch (e) { showAlert('handicapAlert', '오류: ' + e.message); }
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
  el.innerHTML = allPlayers.map(p => {
    const bonus = p.bonusPoints || 0;
    const bonusLabel = bonus !== 0
      ? `<span style="color:var(--gold);font-size:0.82rem;margin-left:0.4rem;">조정 ${bonus > 0 ? '+' : ''}${bonus}점</span>`
      : '';
    return `<div class="player-row">
      <span>
        <strong>${p.name}</strong>
        ${p.handicap != null ? `<span style="color:var(--text-muted);font-size:0.85rem;margin-left:0.4rem;">핸디 ${p.handicap}</span>` : ''}
        ${bonusLabel}
      </span>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-sm btn-secondary" onclick="openBonusModal('${p.id}','${p.name}',${bonus})">승점 조정</button>
        <button class="btn btn-sm btn-danger" onclick="openDeletePlayer('${p.id}','${p.name}')">삭제</button>
      </div>
    </div>`;
  }).join('');
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

// ── 승점 조정 ──────────────────────────────────────────────────────

function openBonusModal(playerId, playerName, currentBonus) {
  bonusPlayerId = playerId;
  document.getElementById('bonusPlayerName').textContent = playerName;
  const bonusFormatted = currentBonus > 0 ? `+${currentBonus}` : String(currentBonus);
  document.getElementById('currentBonusDisplay').textContent = bonusFormatted;
  document.getElementById('bonusInput').value = currentBonus;
  document.getElementById('bonusAlert').innerHTML = '';
  document.getElementById('bonusModal').classList.add('active');
}

async function saveBonusPoints() {
  if (!bonusPlayerId || !currentLeague) return;
  const raw = document.getElementById('bonusInput').value;
  const val = Math.round(parseFloat(raw) * 10) / 10;
  if (raw === '' || isNaN(val)) { showAlert('bonusAlert', '숫자를 입력하세요.'); return; }

  try {
    await updateDoc(doc(db, 'leagues', currentLeague.id, 'players', bonusPlayerId), { bonusPoints: val });
    document.getElementById('bonusModal').classList.remove('active');
    bonusPlayerId = null;
    await loadPlayers();
  } catch (e) { showAlert('bonusAlert', '오류: ' + e.message); }
}

// ── 결과 수정 (진행 중 리그) ──────────────────────────────────────

async function onResultLeagueChange() {
  const leagueId = document.getElementById('resultLeagueSelect').value;
  resultLeague = allActiveLeagues.find(l => l.id === leagueId) || null;
  if (!resultLeague) { renderResultTab([], []); return; }
  await loadResultData();
}

async function loadResultData() {
  if (!resultLeague) return;
  const prevSelected = selectedResultPlayerId;
  const [ps, ms] = await Promise.all([
    getDocs(collection(db, 'leagues', resultLeague.id, 'players')),
    getDocs(collection(db, 'leagues', resultLeague.id, 'matches'))
  ]);
  resultPlayers = ps.docs.map(d => ({ id: d.id, ...d.data() }));
  resultMatches = ms.docs.map(d => ({ id: d.id, ...d.data() }));
  if (prevSelected && resultPlayers.find(p => p.id === prevSelected)) {
    selectedResultPlayerId = prevSelected;
    renderResultPlayerMatches();
  } else {
    selectedResultPlayerId = null;
    renderResultTab();
  }
}

function renderResultTab() {
  const el = document.getElementById('adminMatchList');
  if (!resultLeague) { el.innerHTML = ''; return; }
  if (!resultPlayers.length) { el.innerHTML = '<div class="empty-state">선수가 없습니다</div>'; return; }

  el.innerHTML = resultPlayers.map(p => {
    const myMatches = resultMatches.filter(m => m.player1Id === p.id || m.player2Id === p.id);
    const played = myMatches.filter(m => m.result).length;
    const total = myMatches.length;
    const allDone = played === total;
    return `<div class="player-row" style="cursor:pointer;" onclick="selectResultPlayer('${p.id}')">
      <strong>${p.name}</strong>
      <span style="color:${allDone ? '#81c784' : 'var(--text-muted)'};font-size:0.85rem;">${played}/${total} 완료</span>
    </div>`;
  }).join('');
}

function selectResultPlayer(playerId) {
  selectedResultPlayerId = playerId;
  renderResultPlayerMatches();
}

function renderResultPlayerMatches() {
  const el = document.getElementById('adminMatchList');
  const player = resultPlayers.find(p => p.id === selectedResultPlayerId);
  if (!player) { renderResultTab(); return; }

  const myMatches = resultMatches.filter(m => m.player1Id === player.id || m.player2Id === player.id);
  const sorted = [...myMatches].sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));
  const played = myMatches.filter(m => m.result).length;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border);">
      <button class="btn btn-sm btn-secondary" onclick="backToResultPlayerList()">← 목록</button>
      <strong style="color:var(--gold);font-size:1rem;">${player.name}</strong>
      <span style="color:var(--text-muted);font-size:0.85rem;">${played}/${myMatches.length} 완료</span>
    </div>
    ${sorted.map(m => {
      const isP1 = m.player1Id === player.id;
      const me = resultPlayers.find(p => p.id === (isP1 ? m.player1Id : m.player2Id));
      const opp = resultPlayers.find(p => p.id === (isP1 ? m.player2Id : m.player1Id));
      const men = me?.name || '?', oppn = opp?.name || '?';
      const p1n = resultPlayers.find(p => p.id === m.player1Id)?.name || '?';
      const p2n = resultPlayers.find(p => p.id === m.player2Id)?.name || '?';
      let resultText = '미진행', resultStyle = 'color:var(--text-muted)';
      if (m.result === 'player1') { resultText = `${p1n} 승`; resultStyle = 'color:#81c784'; }
      else if (m.result === 'player2') { resultText = `${p2n} 승`; resultStyle = 'color:#81c784'; }
      else if (m.result === 'draw') { resultText = '무승부'; resultStyle = 'color:#9e9e9e'; }
      else if (m.result === 'noGame') { resultText = '미경기'; resultStyle = 'color:#9e9e9e'; }
      return `<div class="match-item">
        <div>
          <div class="match-vs"><span class="player-name">${men}</span><span class="vs-badge">vs</span><span class="player-name">${oppn}</span></div>
          <div style="font-size:0.82rem;margin-top:0.2rem;${resultStyle}">${resultText}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="openEditResult('${m.id}','${m.player1Id}','${m.player2Id}','${p1n}','${p2n}')">수정</button>
      </div>`;
    }).join('')}`;
}

function backToResultPlayerList() {
  selectedResultPlayerId = null;
  renderResultTab();
}

function openEditResult(matchId, p1Id, p2Id, p1Name, p2Name) {
  currentEditLeagueId = resultLeague?.id;
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
  if (!currentEditLeagueId) return;
  const matchId = document.getElementById('editMatchId').value;
  const p1Id = document.getElementById('editPlayer1Id').value;
  const p2Id = document.getElementById('editPlayer2Id').value;
  const winnerId = result === 'player1' ? p1Id : result === 'player2' ? p2Id : null;
  try {
    await updateDoc(doc(db, 'leagues', currentEditLeagueId, 'matches', matchId),
      { result, winnerId, reportedBy: 'admin', reportedAt: new Date() });
    document.getElementById('editResultModal').classList.remove('active');
    if (resultLeague?.id === currentEditLeagueId) await loadResultData();
    if (historyLeague?.id === currentEditLeagueId) await loadHistoryData();
  } catch (e) { showAlert('editModalAlert', '오류: ' + e.message); }
}

// ── 이전 리그 관리 ──────────────────────────────────────────────────

async function loadEndedLeaguesForAdmin() {
  const sel = document.getElementById('historyLeagueSelect');
  try {
    const snap = await getDocs(query(
      collection(db, 'leagues'),
      where('active', '==', false),
      orderBy('createdAt', 'desc')
    ));
    allEndedLeagues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    sel.innerHTML = '<option value="">-- 리그를 선택하세요 --</option>';
    allEndedLeagues.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id; opt.textContent = l.name;
      sel.appendChild(opt);
    });
    if (historyLeague) {
      sel.value = historyLeague.id;
    }
  } catch (e) {
    document.getElementById('historyMatchList').innerHTML =
      `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

async function onHistoryLeagueChange() {
  const id = document.getElementById('historyLeagueSelect').value;
  historyLeague = allEndedLeagues.find(l => l.id === id) || null;
  historyPlayers = []; historyMatches = [];
  selectedHistoryPlayerId = null;
  document.getElementById('historyMatchList').innerHTML = '';
  document.getElementById('historyLeagueActions').style.display = historyLeague ? 'block' : 'none';
  if (!historyLeague) return;
  await loadHistoryData();
}

async function loadHistoryData() {
  if (!historyLeague) return;
  const [ps, ms] = await Promise.all([
    getDocs(collection(db, 'leagues', historyLeague.id, 'players')),
    getDocs(collection(db, 'leagues', historyLeague.id, 'matches'))
  ]);
  historyPlayers = ps.docs.map(d => ({ id: d.id, ...d.data() }));
  historyMatches = ms.docs.map(d => ({ id: d.id, ...d.data() }));
  if (selectedHistoryPlayerId && historyPlayers.find(p => p.id === selectedHistoryPlayerId)) {
    renderHistoryPlayerMatches();
  } else {
    selectedHistoryPlayerId = null;
    renderHistoryPlayerList();
  }
}

function renderHistoryPlayerList() {
  const el = document.getElementById('historyMatchList');
  if (!historyPlayers.length) { el.innerHTML = '<div class="empty-state">선수가 없습니다</div>'; return; }

  el.innerHTML = historyPlayers.map(p => {
    const myMatches = historyMatches.filter(m => m.player1Id === p.id || m.player2Id === p.id);
    const played = myMatches.filter(m => m.result).length;
    return `<div class="player-row" style="cursor:pointer;" onclick="selectHistoryPlayer('${p.id}')">
      <span><strong>${p.name}</strong></span>
      <span style="color:var(--text-muted);font-size:0.85rem;">${played}/${myMatches.length} 완료 ›</span>
    </div>`;
  }).join('');
}

function selectHistoryPlayer(playerId) {
  selectedHistoryPlayerId = playerId;
  renderHistoryPlayerMatches();
}

function renderHistoryPlayerMatches() {
  const el = document.getElementById('historyMatchList');
  const player = historyPlayers.find(p => p.id === selectedHistoryPlayerId);
  if (!player) { renderHistoryPlayerList(); return; }

  const myMatches = historyMatches.filter(m => m.player1Id === player.id || m.player2Id === player.id);
  const sorted = [...myMatches].sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));
  const played = myMatches.filter(m => m.result).length;

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border);">
      <button class="btn btn-sm btn-secondary" onclick="backToHistoryPlayerList()">← 목록</button>
      <strong style="color:var(--gold);font-size:1rem;">${player.name}</strong>
      <span style="color:var(--text-muted);font-size:0.85rem;">${played}/${myMatches.length} 완료</span>
    </div>
    ${sorted.map(m => {
      const isP1 = m.player1Id === player.id;
      const me = historyPlayers.find(p => p.id === (isP1 ? m.player1Id : m.player2Id));
      const opp = historyPlayers.find(p => p.id === (isP1 ? m.player2Id : m.player1Id));
      const men = me?.name || '?', oppn = opp?.name || '?';
      const p1n = historyPlayers.find(p => p.id === m.player1Id)?.name || '?';
      const p2n = historyPlayers.find(p => p.id === m.player2Id)?.name || '?';
      let resultText = '미진행', resultStyle = 'color:var(--text-muted)';
      if (m.result === 'player1') { resultText = `${p1n} 승`; resultStyle = 'color:#81c784'; }
      else if (m.result === 'player2') { resultText = `${p2n} 승`; resultStyle = 'color:#81c784'; }
      else if (m.result === 'draw') { resultText = '무승부'; resultStyle = 'color:#9e9e9e'; }
      else if (m.result === 'noGame') { resultText = '미경기'; resultStyle = 'color:#9e9e9e'; }
      return `<div class="match-item">
        <div>
          <div class="match-vs"><span class="player-name">${men}</span><span class="vs-badge">vs</span><span class="player-name">${oppn}</span></div>
          <div style="font-size:0.82rem;margin-top:0.2rem;${resultStyle}">${resultText}</div>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="openHistoryEditResult('${m.id}','${m.player1Id}','${m.player2Id}','${p1n}','${p2n}')">수정</button>
      </div>`;
    }).join('')}`;
}

function backToHistoryPlayerList() {
  selectedHistoryPlayerId = null;
  renderHistoryPlayerList();
}

function openHistoryEditResult(matchId, p1Id, p2Id, p1Name, p2Name) {
  currentEditLeagueId = historyLeague?.id;
  document.getElementById('editMatchId').value = matchId;
  document.getElementById('editPlayer1Id').value = p1Id;
  document.getElementById('editPlayer2Id').value = p2Id;
  document.getElementById('editModalInfo').textContent = `${p1Name} vs ${p2Name}`;
  document.getElementById('editBtnP1Win').textContent = `${p1Name} 승리`;
  document.getElementById('editBtnP2Win').textContent = `${p2Name} 승리`;
  document.getElementById('editModalAlert').innerHTML = '';
  document.getElementById('editResultModal').classList.add('active');
}

async function deleteEndedLeague() {
  if (!historyLeague) return;
  if (!confirm(`"${historyLeague.name}" 리그를 완전히 삭제하시겠습니까?\n선수, 경기 기록이 모두 삭제됩니다.`)) return;

  try {
    const batch = writeBatch(db);
    historyPlayers.forEach(p => batch.delete(doc(db, 'leagues', historyLeague.id, 'players', p.id)));
    historyMatches.forEach(m => batch.delete(doc(db, 'leagues', historyLeague.id, 'matches', m.id)));
    batch.delete(doc(db, 'leagues', historyLeague.id));
    await batch.commit();

    allEndedLeagues = allEndedLeagues.filter(l => l.id !== historyLeague.id);
    const deletedId = historyLeague.id;
    historyLeague = null; historyPlayers = []; historyMatches = [];
    document.getElementById('historyMatchList').innerHTML = '';
    document.getElementById('historyLeagueActions').style.display = 'none';

    const sel = document.getElementById('historyLeagueSelect');
    sel.innerHTML = '<option value="">-- 리그를 선택하세요 --</option>';
    allEndedLeagues.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id; opt.textContent = l.name;
      sel.appendChild(opt);
    });
    showAlert('historyAlert', '리그가 삭제되었습니다.', 'success');
  } catch (e) { showAlert('historyAlert', '삭제 오류: ' + e.message); }
}

async function restoreLeague() {
  if (!historyLeague) return;
  if (!confirm(`"${historyLeague.name}" 리그를 다시 진행 중으로 복원하시겠습니까?`)) return;
  try {
    await updateDoc(doc(db, 'leagues', historyLeague.id), { active: true });
    showAlert('historyAlert', `"${historyLeague.name}" 리그가 복원되었습니다.`, 'success');
    allEndedLeagues = allEndedLeagues.filter(l => l.id !== historyLeague.id);
    historyLeague = null; historyPlayers = []; historyMatches = [];
    document.getElementById('historyMatchList').innerHTML = '';
    document.getElementById('historyLeagueActions').style.display = 'none';
    const sel = document.getElementById('historyLeagueSelect');
    sel.innerHTML = '<option value="">-- 리그를 선택하세요 --</option>';
    allEndedLeagues.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id; opt.textContent = l.name;
      sel.appendChild(opt);
    });
    await loadLeagues();
  } catch (e) { showAlert('historyAlert', '복원 오류: ' + e.message); }
}
window.restoreLeague = restoreLeague;
window.loadYearlyScores = loadYearlyScores;
window.saveAllYearlyScores = saveAllYearlyScores;

// ── 일정 관리 ──────────────────────────────────────────────────────

async function loadAdminSchedules() {
  const el = document.getElementById('adminScheduleList');
  el.innerHTML = '<div class="loading"><span class="spinner"></span></div>';

  try {
    const snap = await getDocs(collection(db, 'schedules'));
    allSchedules = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
    document.getElementById('scheduleCount').textContent = `총 ${allSchedules.length}건`;
    renderAdminScheduleList();
  } catch (e) {
    el.innerHTML = `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

function renderAdminScheduleList() {
  const el = document.getElementById('adminScheduleList');
  if (!allSchedules.length) {
    el.innerHTML = '<div class="empty-state">등록된 일정이 없습니다</div>';
    return;
  }

  const days = ['일', '월', '화', '수', '목', '금', '토'];
  el.innerHTML = allSchedules.map(s => {
    const d = new Date(`${s.date}T${s.time}`);
    const dt = `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    const isPast = d < new Date();
    let statusBadge;
    if (s.status === 'cancelled') statusBadge = '<span class="badge badge-inactive">취소</span>';
    else if (isPast) statusBadge = '<span class="badge" style="background:var(--text-muted);">종료</span>';
    else statusBadge = '<span class="badge badge-active">모집중</span>';

    return `<div class="match-item">
      <div>
        <div style="font-weight:600;margin-bottom:0.2rem;">${dt}</div>
        <div style="font-size:0.85rem;color:var(--text-secondary);">👤 ${s.playerName}${s.note ? ` · ${s.note}` : ''}</div>
        <div style="margin-top:0.3rem;">${statusBadge}</div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-shrink:0;">
        <button class="btn btn-sm btn-secondary" onclick="openScheduleEdit('${s.id}')">수정</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAdminSchedule('${s.id}','${s.playerName}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

function openScheduleEdit(scheduleId) {
  editScheduleData = allSchedules.find(s => s.id === scheduleId);
  if (!editScheduleData) return;
  document.getElementById('editScheduleId').value = scheduleId;
  document.getElementById('editScheduleDate').value = editScheduleData.date;
  document.getElementById('editScheduleTime').value = editScheduleData.time;
  document.getElementById('editScheduleNote').value = editScheduleData.note || '';
  document.getElementById('editScheduleStatus').value = editScheduleData.status || 'open';
  document.getElementById('scheduleEditAlert').innerHTML = '';
  document.getElementById('scheduleEditModal').classList.add('active');
}

async function saveScheduleEdit() {
  const id = document.getElementById('editScheduleId').value;
  const date = document.getElementById('editScheduleDate').value;
  const time = document.getElementById('editScheduleTime').value;
  const note = document.getElementById('editScheduleNote').value.trim();
  const status = document.getElementById('editScheduleStatus').value;
  if (!date || !time) { showAlert('scheduleEditAlert', '날짜와 시간을 입력하세요.'); return; }

  try {
    await updateDoc(doc(db, 'schedules', id), {
      date, time, datetime: new Date(`${date}T${time}`), note, status
    });
    document.getElementById('scheduleEditModal').classList.remove('active');
    await loadAdminSchedules();
  } catch (e) { showAlert('scheduleEditAlert', '오류: ' + e.message); }
}

async function deleteAdminSchedule(scheduleId, playerName) {
  if (!confirm(`${playerName}의 일정을 삭제하시겠습니까?`)) return;
  try {
    await deleteDoc(doc(db, 'schedules', scheduleId));
    await loadAdminSchedules();
  } catch (e) { alert('오류: ' + e.message); }
}

// ── 게시판 관리 ──────────────────────────────────────────────────────
let allBoardPosts = [];
let editBoardPostId = null;

async function loadBoardPosts() {
  const el = document.getElementById('boardAdminList');
  if (el) el.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
  try {
    const snap = await getDocs(query(collection(db, 'board'), orderBy('createdAt', 'desc')));
    allBoardPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cnt = document.getElementById('boardPostCount');
    if (cnt) cnt.textContent = `총 ${allBoardPosts.length}개`;
    renderBoardAdminList();
  } catch (e) {
    if (el) el.innerHTML = `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

function renderBoardAdminList() {
  const el = document.getElementById('boardAdminList');
  if (!el) return;
  if (!allBoardPosts.length) {
    el.innerHTML = '<div class="empty-state">등록된 게시글이 없습니다</div>';
    return;
  }
  el.innerHTML = allBoardPosts.map(p => {
    const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('ko-KR') : '';
    const preview = (p.content || '').replace(/\n/g, ' ').slice(0, 60);
    return `<div class="match-item">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;margin-bottom:0.2rem;">${p.title}</div>
        <div style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${preview}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;">${date}</div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-shrink:0;">
        <button class="btn btn-sm btn-secondary" onclick="openEditBoardPostModal('${p.id}')">수정</button>
        <button class="btn btn-sm btn-danger" onclick="deleteBoardPost('${p.id}','${p.title.replace(/'/g,"\\'")}')">삭제</button>
      </div>
    </div>`;
  }).join('');
}

async function addBoardPost() {
  const title = document.getElementById('boardNewTitle').value.trim();
  const content = document.getElementById('boardNewContent').value.trim();
  if (!title) { showAlert('boardWriteAlert', '제목을 입력하세요.'); return; }
  if (!content) { showAlert('boardWriteAlert', '내용을 입력하세요.'); return; }
  try {
    await setDoc(doc(collection(db, 'board')), { title, content, createdAt: serverTimestamp() });
    document.getElementById('boardNewTitle').value = '';
    document.getElementById('boardNewContent').value = '';
    showAlert('boardWriteAlert', '게시글이 등록되었습니다.', 'success');
    await loadBoardPosts();
  } catch (e) { showAlert('boardWriteAlert', '오류: ' + e.message); }
}

async function deleteBoardPost(id, title) {
  if (!confirm(`"${title}" 게시글을 삭제하시겠습니까?`)) return;
  try {
    await deleteDoc(doc(db, 'board', id));
    await loadBoardPosts();
  } catch (e) { alert('삭제 오류: ' + e.message); }
}

function openEditBoardPostModal(id) {
  const post = allBoardPosts.find(p => p.id === id);
  if (!post) return;
  editBoardPostId = id;
  document.getElementById('editBoardPostId').value = id;
  document.getElementById('editBoardTitle').value = post.title;
  document.getElementById('editBoardContent').value = post.content;
  document.getElementById('boardEditAlert').innerHTML = '';
  document.getElementById('boardEditModal').classList.add('active');
}

async function saveEditBoardPost() {
  const id = document.getElementById('editBoardPostId').value;
  const title = document.getElementById('editBoardTitle').value.trim();
  const content = document.getElementById('editBoardContent').value.trim();
  if (!title) { showAlert('boardEditAlert', '제목을 입력하세요.'); return; }
  if (!content) { showAlert('boardEditAlert', '내용을 입력하세요.'); return; }
  try {
    await updateDoc(doc(db, 'board', id), { title, content });
    document.getElementById('boardEditModal').classList.remove('active');
    showAlert('boardWriteAlert', '게시글이 수정되었습니다.', 'success');
    await loadBoardPosts();
  } catch (e) { showAlert('boardEditAlert', '오류: ' + e.message); }
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

window.openEditLeagueModal = openEditLeagueModal;
window.saveEditLeague = saveEditLeague;
window.adminLogin = adminLogin;
window.adminLogout = adminLogout;
window.createLeague = createLeague;
window.endLeague = endLeague;
window.addMember = addMember;
window.openChangePinModal = openChangePinModal;
window.openRenameModal = openRenameModal;
window.saveMemberName = saveMemberName;
window.saveChangedPin = saveChangedPin;
window.openHandicapModal = openHandicapModal;
window.saveHandicap = saveHandicap;
window.openDeleteMember = openDeleteMember;
window.confirmDeleteMember = confirmDeleteMember;
window.onPlayerLeagueChange = onPlayerLeagueChange;
window.addSelectedMembers = addSelectedMembers;
window.openDeletePlayer = openDeletePlayer;
window.confirmDeletePlayer = confirmDeletePlayer;
window.openBonusModal = openBonusModal;
window.saveBonusPoints = saveBonusPoints;
window.onResultLeagueChange = onResultLeagueChange;
window.selectResultPlayer = selectResultPlayer;
window.backToResultPlayerList = backToResultPlayerList;
window.openEditResult = openEditResult;
window.adminSetResult = adminSetResult;
window.loadEndedLeaguesForAdmin = loadEndedLeaguesForAdmin;
window.onHistoryLeagueChange = onHistoryLeagueChange;
window.openHistoryEditResult = openHistoryEditResult;
window.selectHistoryPlayer = selectHistoryPlayer;
window.backToHistoryPlayerList = backToHistoryPlayerList;
window.deleteEndedLeague = deleteEndedLeague;
window.loadAdminSchedules = loadAdminSchedules;
window.openScheduleEdit = openScheduleEdit;
window.saveScheduleEdit = saveScheduleEdit;
window.deleteAdminSchedule = deleteAdminSchedule;
window.changePassword = changePassword;
window.loadBoardPosts = loadBoardPosts;
window.addBoardPost = addBoardPost;
window.deleteBoardPost = deleteBoardPost;
window.openEditBoardPostModal = openEditBoardPostModal;
window.saveEditBoardPost = saveEditBoardPost;

init();
