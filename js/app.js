import { db } from './firebase-config.js';
import {
  collection, doc, getDocs, getDoc, query, where, onSnapshot, updateDoc, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert, calculateStandings } from './utils.js';

let allActiveLeagues = [];
let activeLeague = null;
let allPlayers = [];
let allMatches = [];
let loggedInPlayer = null;
let pendingMatchId = null;
let pendingOpponentId = null;
let pendingOpponentName = null;
let unsubscribeMatches = null;
let matchMode = 'single';
let bo3Games = [];

async function init() {
  try {
    const snap = await getDocs(query(
      collection(db, 'leagues'),
      where('active', '==', true),
      orderBy('createdAt', 'desc')
    ));
    allActiveLeagues = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!allActiveLeagues.length) {
      document.getElementById('leagueBanner').innerHTML =
        '<div class="alert alert-info">진행 중인 리그가 없습니다. 관리자에게 문의하세요.</div>';
      document.getElementById('standingsBody').innerHTML =
        `<tr><td colspan="7"><div class="empty-state"><div class="icon">🎱</div>진행 중인 리그가 없습니다</div></td></tr>`;
      document.getElementById('matrixContainer').innerHTML = '<div class="empty-state">리그가 없습니다</div>';
      return;
    }

    // 저장된 로그인 정보로 소속 리그 찾기
    let defaultLeague = allActiveLeagues[0];
    const saved = localStorage.getItem('hankyu_player');
    if (saved) {
      const { id } = JSON.parse(saved);
      for (const league of allActiveLeagues) {
        try {
          const pSnap = await getDocs(query(
            collection(db, 'leagues', league.id, 'players'),
            where('memberId', '==', id),
            limit(1)
          ));
          if (!pSnap.empty) { defaultLeague = league; break; }
        } catch {}
      }
    }

    await switchLeague(defaultLeague);
  } catch (e) {
    document.getElementById('leagueBanner').innerHTML =
      `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

async function switchLeague(league) {
  if (unsubscribeMatches) { unsubscribeMatches(); unsubscribeMatches = null; }
  activeLeague = league;
  allPlayers = []; allMatches = [];

  renderBanner();
  await loadData();
  subscribeMatches();
  resetEntryUI();
  populatePlayerSelect();

  // 이 리그에 해당 플레이어가 있으면 자동 로그인 복원
  const saved = localStorage.getItem('hankyu_player');
  if (saved) {
    const { id } = JSON.parse(saved);
    const player = allPlayers.find(p => p.memberId === id);
    if (player) {
      setEntryLoggedIn(player);
    } else {
      showWrongLeagueMessage(JSON.parse(saved).name);
    }
  }
}

function showWrongLeagueMessage(name) {
  document.getElementById('entryStep1').style.display = 'none';
  document.getElementById('entryStep2').style.display = 'block';
  document.getElementById('loggedInName').textContent = name;
  document.getElementById('entryProgress').style.width = '0%';
  document.getElementById('entryProgressText').textContent = '';
  document.getElementById('entryMatchList').innerHTML = `
    <div class="alert alert-info">
      해당 리그는 회원님이 진행 중인 경기가 아닙니다.<br>
      좌측 상단의 '다른 리그 보기'에서 회원님이 진행 중인 리그를 선택해주세요.
    </div>`;
}

function onLeagueSelectorChange() {
  const leagueId = document.getElementById('leagueSelector').value;
  const league = allActiveLeagues.find(l => l.id === leagueId);
  if (league) switchLeague(league);
}

function renderBanner() {
  const s = activeLeague.scoring;
  let selectorHtml = '';
  if (allActiveLeagues.length > 1) {
    const opts = allActiveLeagues.map(l =>
      `<option value="${l.id}"${l.id === activeLeague.id ? ' selected' : ''}>${l.name}</option>`
    ).join('');
    selectorHtml = `
      <div style="margin-top:0.75rem;display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
        <span style="font-size:0.82rem;color:var(--text-muted);white-space:nowrap;">다른 리그 보기:</span>
        <select class="form-control" id="leagueSelector" onchange="onLeagueSelectorChange()"
          style="max-width:230px;padding:0.3rem 0.6rem;font-size:0.88rem;">
          ${opts}
        </select>
      </div>`;
  }
  document.getElementById('leagueBanner').innerHTML = `
    <div class="league-banner">
      <div>
        <h2>🎱 ${activeLeague.name}</h2>
        <div class="scoring-info">승 ${s.win}점 · 패 ${s.loss}점 · 미경기 ${s.noGame}점</div>
        ${selectorHtml}
      </div>
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
  unsubscribeMatches = onSnapshot(
    collection(db, 'leagues', activeLeague.id, 'matches'),
    snap => {
      allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
      if (loggedInPlayer) renderEntryList();
    }
  );
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
      <td class="no-games">${p.draws}</td>
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
      if (!m || !m.result) {
        if (m && m.matchType === 'bo3' && m.seriesScore) {
          const myS = m.player1Id === row.id ? m.seriesScore.player1 : m.seriesScore.player2;
          const oppS = m.player1Id === row.id ? m.seriesScore.player2 : m.seriesScore.player1;
          html += `<td class="matrix-pending" title="진행중">${myS}-${oppS}</td>`;
        } else {
          html += '<td class="matrix-pending">·</td>';
        }
        return;
      }
      if (m.result === 'noGame' || m.result === 'draw') { html += '<td class="matrix-nogame">미</td>'; return; }
      const iWon = (m.result === 'player1' && m.player1Id === row.id) ||
                   (m.result === 'player2' && m.player2Id === row.id);
      if (m.matchType === 'bo3' && m.seriesScore) {
        const myScore = m.player1Id === row.id ? m.seriesScore.player1 : m.seriesScore.player2;
        const oppScore = m.player1Id === row.id ? m.seriesScore.player2 : m.seriesScore.player1;
        html += iWon
          ? `<td class="matrix-win">${myScore}-${oppScore}</td>`
          : `<td class="matrix-loss">${myScore}-${oppScore}</td>`;
      } else {
        html += iWon ? '<td class="matrix-win">승</td>' : '<td class="matrix-loss">패</td>';
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function resetEntryUI() {
  loggedInPlayer = null;
  document.getElementById('entryStep1').style.display = 'block';
  document.getElementById('entryStep2').style.display = 'none';
}

function populatePlayerSelect() {}

function setEntryLoggedIn(player) {
  loggedInPlayer = player;
  localStorage.setItem('hankyu_player', JSON.stringify({ id: player.memberId, name: player.name }));
  document.getElementById('entryStep1').style.display = 'none';
  document.getElementById('entryStep2').style.display = 'block';
  document.getElementById('loggedInName').textContent = player.name;
  renderEntryList();
}

function loginForEntry() {}

function logoutEntry() {
  localStorage.removeItem('hankyu_player');
  resetEntryUI();
  populatePlayerSelect();
}

function renderEntryList() {
  if (!loggedInPlayer) return;
  const myMatches = allMatches.filter(
    m => m.player1Id === loggedInPlayer.id || m.player2Id === loggedInPlayer.id
  );
  const played = myMatches.filter(m => m.result).length;
  const total = myMatches.length;
  document.getElementById('entryProgress').style.width = (total > 0 ? played / total * 100 : 0) + '%';
  document.getElementById('entryProgressText').textContent = `${played} / ${total} 경기 완료`;

  if (!myMatches.length) {
    document.getElementById('entryMatchList').innerHTML = '<div class="empty-state">경기가 없습니다</div>';
    return;
  }

  myMatches.sort((a, b) => (a.result ? 1 : 0) - (b.result ? 1 : 0));

  document.getElementById('entryMatchList').innerHTML = myMatches.map(m => {
    const oppId = m.player1Id === loggedInPlayer.id ? m.player2Id : m.player1Id;
    const opp = allPlayers.find(p => p.id === oppId);
    const oppName = opp ? opp.name : '?';

    const editBtn = `<button class="btn btn-sm btn-secondary" onclick="openResultModal('${m.id}','${oppId}','${oppName}')">수정</button>`;
    let statusHtml = '', actionHtml = '';
    if (!m.result && m.matchType === 'bo3' && m.seriesScore) {
      const isP1 = m.player1Id === loggedInPlayer.id;
      const myS = isP1 ? m.seriesScore.player1 : m.seriesScore.player2;
      const oppS = isP1 ? m.seriesScore.player2 : m.seriesScore.player1;
      statusHtml = `<span class="match-status status-pending">진행중 ${myS}-${oppS}</span>`;
      actionHtml = `<button class="btn btn-sm btn-danger" onclick="openResultModal('${m.id}','${oppId}','${oppName}')">계속 입력</button>`;
    } else if (!m.result) {
      statusHtml = '<span class="match-status status-pending">미진행</span>';
      actionHtml = `<button class="btn btn-sm btn-danger" onclick="openResultModal('${m.id}','${oppId}','${oppName}')">결과 입력</button>`;
    } else if (m.result === 'draw' || m.result === 'noGame') {
      statusHtml = '<span class="match-status status-nogame">미진행</span>';
      actionHtml = editBtn;
    } else {
      const myWin = (m.result === 'player1' && m.player1Id === loggedInPlayer.id) ||
                    (m.result === 'player2' && m.player2Id === loggedInPlayer.id);
      let scoreLabel = '';
      if (m.matchType === 'bo3' && m.seriesScore) {
        const isP1 = m.player1Id === loggedInPlayer.id;
        const myS = isP1 ? m.seriesScore.player1 : m.seriesScore.player2;
        const oppS = isP1 ? m.seriesScore.player2 : m.seriesScore.player1;
        scoreLabel = ` ${myS}-${oppS}`;
      }
      statusHtml = myWin
        ? `<span class="match-status status-win">승리${scoreLabel} ✓</span>`
        : `<span class="match-status status-loss">패배${scoreLabel}</span>`;
      actionHtml = editBtn;
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
  document.getElementById('modalMatchInfo').innerHTML =
    `<strong>${loggedInPlayer.name}</strong> vs <strong>${oppName}</strong>`;
  document.getElementById('modalAlert').innerHTML = '';

  const m = allMatches.find(x => x.id === matchId);
  if (m && m.matchType === 'bo3' && m.bo3Games && m.bo3Games.length > 0 && !m.result) {
    const isP1 = m.player1Id === loggedInPlayer.id;
    bo3Games = m.bo3Games.map(g => {
      if (g === 'player1') return isP1 ? 'me' : 'opp';
      return isP1 ? 'opp' : 'me';
    });
    matchMode = 'bo3';
    setMatchMode('bo3', true);
  } else {
    matchMode = 'single';
    bo3Games = [];
    setMatchMode('single');
  }

  document.getElementById('resultModal').classList.add('active');
}

function setMatchMode(mode, keepGames = false) {
  matchMode = mode;
  document.getElementById('modeBtn-single').className = `btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}`;
  document.getElementById('modeBtn-bo3').className = `btn btn-sm ${mode === 'bo3' ? 'btn-primary' : 'btn-secondary'}`;
  document.getElementById('modeSingle').style.display = mode === 'single' ? 'flex' : 'none';
  document.getElementById('modeBo3').style.display = mode === 'bo3' ? 'block' : 'none';
  if (mode === 'bo3') { if (!keepGames) bo3Games = []; renderBo3UI(); }
}

function renderBo3UI() {
  const myWins = bo3Games.filter(g => g === 'me').length;
  const oppWins = bo3Games.filter(g => g === 'opp').length;
  const gameNum = bo3Games.length + 1;

  document.getElementById('bo3ScoreDisplay').innerHTML =
    `<span style="color:var(--gold)">${myWins}</span><span style="color:var(--text-muted);font-size:1rem;margin:0 0.5rem">:</span><span style="color:#ef5350">${oppWins}</span>`;

  let html = '';
  bo3Games.forEach((g, i) => {
    const isMe = g === 'me';
    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted);font-size:0.85rem;">${i + 1}세트</span>
      <span style="font-weight:600;color:${isMe ? 'var(--gold)' : '#ef5350'}">${isMe ? loggedInPlayer.name : pendingOpponentName} 승</span>
    </div>`;
  });

  if (myWins < 2 && oppWins < 2 && gameNum <= 3) {
    html += `<div style="margin-top:0.85rem;">
      <div style="text-align:center;color:var(--text-muted);font-size:0.85rem;margin-bottom:0.6rem;">${gameNum}세트</div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-primary btn-full" onclick="addBo3Game('me')">${loggedInPlayer.name} 승</button>
        <button class="btn btn-danger btn-full" onclick="addBo3Game('opp')">${pendingOpponentName} 승</button>
      </div>
    </div>`;
  }

  document.getElementById('bo3Games').innerHTML = html;
}

async function addBo3Game(winner) {
  bo3Games.push(winner);
  const myWins = bo3Games.filter(g => g === 'me').length;
  const oppWins = bo3Games.filter(g => g === 'opp').length;

  if (!pendingMatchId || !loggedInPlayer) return;
  const m = allMatches.find(x => x.id === pendingMatchId);
  if (!m) return;

  const isP1 = m.player1Id === loggedInPlayer.id;
  const bo3GamesAbsolute = bo3Games.map(g =>
    g === 'me' ? (isP1 ? 'player1' : 'player2') : (isP1 ? 'player2' : 'player1')
  );
  const seriesScore = {
    player1: isP1 ? myWins : oppWins,
    player2: isP1 ? oppWins : myWins
  };

  const isComplete = myWins === 2 || oppWins === 2;
  if (isComplete) {
    await submitBo3Result(myWins === 2 ? 'win' : 'loss', myWins, oppWins, bo3GamesAbsolute, seriesScore);
  } else {
    try {
      await updateDoc(doc(db, 'leagues', activeLeague.id, 'matches', pendingMatchId), {
        matchType: 'bo3', seriesScore, bo3Games: bo3GamesAbsolute,
        reportedBy: loggedInPlayer.id, reportedAt: new Date()
      });
      renderBo3UI();
    } catch (e) {
      showAlert('modalAlert', '저장 오류: ' + e.message);
    }
  }
}

async function submitBo3Result(type, myWins, oppWins, bo3GamesAbsolute, seriesScore) {
  if (!pendingMatchId || !loggedInPlayer) return;
  const m = allMatches.find(x => x.id === pendingMatchId);
  if (!m) return;

  let result, winnerId;
  if (type === 'win') {
    result = m.player1Id === loggedInPlayer.id ? 'player1' : 'player2';
    winnerId = loggedInPlayer.id;
  } else {
    result = m.player1Id === pendingOpponentId ? 'player1' : 'player2';
    winnerId = pendingOpponentId;
  }

  try {
    await updateDoc(doc(db, 'leagues', activeLeague.id, 'matches', pendingMatchId), {
      result, winnerId, matchType: 'bo3', seriesScore, bo3Games: bo3GamesAbsolute,
      reportedBy: loggedInPlayer.id, reportedAt: new Date()
    });
    document.getElementById('resultModal').classList.remove('active');
  } catch (e) {
    showAlert('modalAlert', '저장 오류: ' + e.message);
  }
}

async function submitResult(type) {
  if (!pendingMatchId || !loggedInPlayer) return;
  const m = allMatches.find(x => x.id === pendingMatchId);
  if (!m) return;

  let result, winnerId = null;
  if (type === 'win') {
    result = m.player1Id === loggedInPlayer.id ? 'player1' : 'player2';
    winnerId = loggedInPlayer.id;
  } else if (type === 'loss') {
    result = m.player1Id === pendingOpponentId ? 'player1' : 'player2';
    winnerId = pendingOpponentId;
  } else {
    result = 'draw';
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

window.onLeagueSelectorChange = onLeagueSelectorChange;
window.loginForEntry = loginForEntry;
window.logoutEntry = logoutEntry;
window.openResultModal = openResultModal;
window.setMatchMode = setMatchMode;
window.addBo3Game = addBo3Game;
window.submitResult = submitResult;
window.renderMatrix = renderMatrix;

init();
