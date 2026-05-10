import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, query, where, onSnapshot, updateDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert, calculateStandings } from './utils.js';

let activeLeague = null;
let allPlayers = [];
let allMatches = [];
let loggedInPlayer = null;
let pendingMatchId = null;
let pendingOpponentId = null;
let pendingOpponentName = null;

async function init() {
  try {
    const snap = await getDocs(query(collection(db, 'leagues'), where('active', '==', true), orderBy('createdAt', 'desc'), limit(1)));
    if (snap.empty) {
      document.getElementById('leagueBanner').innerHTML = '<div class="alert alert-info">진행 중인 리그가 없습니다. 관리자에게 문의하세요.</div>';
      document.getElementById('standingsBody').innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">🎱</div>진행 중인 리그가 없습니다</div></td></tr>`;
      document.getElementById('matrixContainer').innerHTML = '<div class="empty-state">리그가 없습니다</div>';
      return;
    }
    activeLeague = { id: snap.docs[0].id, ...snap.docs[0].data() };
    renderBanner();
    await loadData();
    subscribeMatches();
    populatePlayerSelect('entryPlayerSelect');

    const saved = localStorage.getItem('hankyu_player');
    if (saved) {
      const { id } = JSON.parse(saved);
      const player = allPlayers.find(p => p.id === id);
      if (player) setEntryLoggedIn(player);
    }
  } catch (e) {
    document.getElementById('leagueBanner').innerHTML = `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

function renderBanner() {
  const s = activeLeague.scoring;
  document.getElementById('leagueBanner').innerHTML = `
    <div class="league-banner">
      <div><h2>🎱 ${activeLeague.name}</h2><div class="scoring-info">승 ${s.win}점 · 패 ${s.loss}점 · 미경기 ${s.noGame}점</div></div>
      <span class="badge badge-active">진행 중</span>
    </div>`;
}

async function loadData() {
  const [ps, ms] = await Promise.all([
    getDocs(collection(db, 'leagues', activeLeague.id, 'players')),
    getDocs(collection(db, 'leagues', activeLeague.id, 'matches'))
  ]);
  allPlayers = ps.docs.map(d => ({ id: d.id, ...d.data() }));
  allMatches = ms.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}

function subscribeMatches() {
  onSnapshot(collection(db, 'leagues', activeLeague.id, 'matches'), snap => {
    allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
    if (loggedInPlayer) renderEntryList();
  });
}

function render() {
  renderStandings();
  renderMatrix();
}

function renderStandings() {
  const standings = calculateStandings(allPlayers, allMatches, activeLeague.scoring);
  const tbody = document.getElementById('standingsBody');
  if (!standings.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">선수가 등록되지 않았습니다</div></td></tr>`;
    return;
  }
  tbody.innerHTML = standings.map((p, i) => {
    const r = i + 1;
    const cls = r <= 3 ? `rank-${r}` : 'rank-other';
    const pct = p.total > 0 ? Math.round(p.played / p.total * 100) : 0;
    return `<tr>
      <td><span class="rank-badge ${cls}">${r}</span></td>
      <td><strong>${p.name}</strong></td>
      <td class="wins">${p.wins}</td>
      <td class="losses">${p.losses}</td>
      <td class="no-games">${p.noGames}</td>
      <td class="points">${p.points}</td>
      <td><div style="display:flex;align-items:center;gap:0.4rem;">
        <div class="progress-bar" style="width:55px;margin:0;"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span style="font-size:0.75rem;color:var(--text-muted)">${p.played}/${p.total}</span>
      </div></td>
    </tr>`;
  }).join('');
  document.getElementById('lastUpdated').textContent = `${new Date().toLocaleTimeString('ko-KR')} 기준`;
}

function renderMatrix() {
  const container = document.getElementById('matrixContainer');
  if (!allPlayers.length) { container.innerHTML = '<div class="empty-state">선수가 없습니다</div>'; return; }

  const matchMap = {};
  allMatches.forEach(m => { matchMap[`${m.player1Id}_${m.player2Id}`] = m; });

  const getMatch = (a, b) => matchMap[`${a}_${b}`] || matchMap[`${b}_${a}`];

  let html = '<table class="matrix-table"><thead><tr><th>나 \\ 상대</th>';
  allPlayers.forEach(p => { html += `<th title="${p.name}">${p.name.slice(0, 3)}</th>`; });
  html += '</tr></thead><tbody>';

  allPlayers.forEach(row => {
    html += `<tr><td><strong>${row.name}</strong></td>`;
    allPlayers.forEach(col => {
      if (row.id === col.id) { html += '<td class="matrix-self">-</td>'; return; }
      const m = getMatch(row.id, col.id);
      if (!m || !m.result) { html += '<td class="matrix-pending">·</td>'; return; }
      if (m.result === 'noGame') { html += '<td class="matrix-nogame">미</td>'; return; }
      const iWon = (m.result === 'player1' && m.player1Id === row.id) || (m.result === 'player2' && m.player2Id === row.id);
      html += iWon ? '<td class="matrix-win">승</td>' : '<td class="matrix-loss">패</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function populatePlayerSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  allPlayers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

function setEntryLoggedIn(player) {
  loggedInPlayer = player;
  localStorage.setItem('hankyu_player', JSON.stringify({ id: player.id, name: player.name }));
  document.getElementById('entryStep1').style.display = 'none';
  document.getElementById('entryStep2').style.display = 'block';
  document.getElementById('loggedInName').textContent = player.name;
  renderEntryList();
}

async function loginForEntry() {
  const pid = document.getElementById('entryPlayerSelect').value;
  const pin = document.getElementById('entryPin').value.trim();
  if (!pid) { showAlert('entryLoginAlert', '이름을 선택하세요.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAlert('entryLoginAlert', 'PIN은 숫자 4자리입니다.'); return; }

  const player = allPlayers.find(p => p.id === pid);
  if (!player) { showAlert('entryLoginAlert', '선수 정보를 찾을 수 없습니다.'); return; }
  if (await hashString(pin) !== player.pinHash) { showAlert('entryLoginAlert', 'PIN이 올바르지 않습니다.'); return; }

  setEntryLoggedIn(player);
}

function logoutEntry() {
  loggedInPlayer = null;
  localStorage.removeItem('hankyu_player');
  document.getElementById('entryStep1').style.display = 'block';
  document.getElementById('entryStep2').style.display = 'none';
  document.getElementById('entryPin').value = '';
}

function renderEntryList() {
  if (!loggedInPlayer) return;
  const myMatches = allMatches.filter(m => m.player1Id === loggedInPlayer.id || m.player2Id === loggedInPlayer.id);
  const played = myMatches.filter(m => m.result).length;
  const total = myMatches.length;
  document.getElementById('entryProgress').style.width = (total > 0 ? played / total * 100 : 0) + '%';
  document.getElementById('entryProgressText').textContent = `${played} / ${total} 경기 완료`;

  if (!myMatches.length) { document.getElementById('entryMatchList').innerHTML = '<div class="empty-state">경기가 없습니다</div>'; return; }

  myMatches.sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));

  document.getElementById('entryMatchList').innerHTML = myMatches.map(m => {
    const oppId = m.player1Id === loggedInPlayer.id ? m.player2Id : m.player1Id;
    const opp = allPlayers.find(p => p.id === oppId);
    const oppName = opp ? opp.name : '?';

    let statusHtml = '', actionHtml = '';
    if (!m.result) {
      statusHtml = '<span class="match-status status-pending">미진행</span>';
      actionHtml = `<button class="btn btn-sm btn-danger" onclick="openResultModal('${m.id}','${oppId}','${oppName}')">결과 입력</button>`;
    } else if (m.result === 'noGame') {
      statusHtml = '<span class="match-status status-nogame">미경기</span>';
    } else {
      const myWin = (m.result === 'player1' && m.player1Id === loggedInPlayer.id) || (m.result === 'player2' && m.player2Id === loggedInPlayer.id);
      statusHtml = myWin
        ? '<span class="match-status status-win">승리 ✓</span>'
        : '<span class="match-status status-loss">패배</span>';
    }
    return `<div class="match-item">
      <div class="match-vs">
        <span class="player-name">${loggedInPlayer.name}</span>
        <span class="vs-badge">vs</span>
        <span class="player-name">${oppName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:0.6rem;">${statusHtml}${actionHtml}</div>
    </div>`;
  }).join('');
}

function openResultModal(matchId, oppId, oppName) {
  pendingMatchId = matchId;
  pendingOpponentId = oppId;
  pendingOpponentName = oppName;
  document.getElementById('modalMatchInfo').innerHTML = `<strong>${loggedInPlayer.name}</strong> vs <strong>${oppName}</strong>`;
  document.getElementById('modalAlert').innerHTML = '';
  document.getElementById('resultModal').classList.add('active');
}

async function submitResult(type) {
  if (!pendingMatchId || !loggedInPlayer) return;
  const m = allMatches.find(x => x.id === pendingMatchId);
  if (!m) return;

  let result, winnerId = null;
  if (type === 'loss') {
    result = m.player1Id === pendingOpponentId ? 'player1' : 'player2';
    winnerId = pendingOpponentId;
  } else {
    result = 'noGame';
  }

  try {
    await updateDoc(doc(db, 'leagues', activeLeague.id, 'matches', pendingMatchId), {
      result, winnerId, reportedBy: loggedInPlayer.id, reportedAt: new Date()
    });
    document.getElementById('resultModal').classList.remove('active');
  } catch (e) {
    showAlert('modalAlert', '저장 오류: ' + e.message);
  }
}

window.loginForEntry = loginForEntry;
window.logoutEntry = logoutEntry;
window.openResultModal = openResultModal;
window.submitResult = submitResult;

init();
