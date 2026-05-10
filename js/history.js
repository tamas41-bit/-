import { db } from './firebase-config.js';
import {
  collection, getDocs, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { calculateStandings } from './utils.js';

let leagues = [];
let selectedLeague = null;
let allPlayers = [];
let allMatches = [];

async function init() {
  try {
    const snap = await getDocs(query(
      collection(db, 'leagues'),
      where('active', '==', false),
      orderBy('createdAt', 'desc')
    ));

    if (snap.empty) {
      document.getElementById('leagueSelect').innerHTML = '<option value="">종료된 리그가 없습니다</option>';
      document.getElementById('historyContent').innerHTML = '<div class="empty-state"><div class="icon">📋</div>종료된 리그가 없습니다</div>';
      return;
    }

    leagues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById('leagueSelect');
    sel.innerHTML = '<option value="">-- 리그를 선택하세요 --</option>';
    leagues.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      sel.appendChild(opt);
    });
  } catch (e) {
    document.getElementById('historyContent').innerHTML = `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

async function onLeagueSelect() {
  const id = document.getElementById('leagueSelect').value;
  if (!id) {
    document.getElementById('historyContent').innerHTML = '';
    return;
  }

  selectedLeague = leagues.find(l => l.id === id);
  document.getElementById('historyContent').innerHTML = '<div class="loading"><span class="spinner"></span></div>';

  try {
    const [ps, ms] = await Promise.all([
      getDocs(collection(db, 'leagues', id, 'players')),
      getDocs(collection(db, 'leagues', id, 'matches'))
    ]);
    allPlayers = ps.docs.map(d => ({ id: d.id, ...d.data() }));
    allMatches = ms.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHistory();
  } catch (e) {
    document.getElementById('historyContent').innerHTML = `<div class="alert alert-error">오류: ${e.message}</div>`;
  }
}

function renderHistory() {
  const s = selectedLeague.scoring;
  document.getElementById('historyContent').innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <h3 style="color:var(--gold);margin-bottom:0.25rem;">${selectedLeague.name}</h3>
      <div style="color:var(--text-secondary);font-size:0.88rem;">승 ${s.win}점 · 패 ${s.loss}점 · 미경기 ${s.noGame}점</div>
    </div>

    <div class="tabs" style="margin-bottom:0;">
      <div class="tab active" id="htab-standings" onclick="switchHistoryTab('standings')">🏆 순위표</div>
      <div class="tab" id="htab-matrix" onclick="switchHistoryTab('matrix')">📊 대진표</div>
    </div>

    <div class="tab-content active" id="hcontent-standings">
      <div class="card" style="margin-top:0;border-top-left-radius:0;border-top-right-radius:0;">
        ${renderStandings()}
      </div>
    </div>

    <div class="tab-content" id="hcontent-matrix">
      <div class="card" style="margin-top:0;border-top-left-radius:0;border-top-right-radius:0;">
        ${renderMatrix()}
      </div>
    </div>
  `;
}

function renderStandings() {
  const standings = calculateStandings(allPlayers, allMatches, selectedLeague.scoring);
  if (!standings.length) return '<div class="empty-state">선수 데이터가 없습니다</div>';

  const rows = standings.map((p, i) => {
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

  return `<div class="table-scroll">
    <table class="standings-table">
      <thead><tr><th>순위</th><th>이름</th><th>승</th><th>패</th><th>무</th><th>승점</th><th>진행률</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderMatrix() {
  if (!allPlayers.length) return '<div class="empty-state">선수 데이터가 없습니다</div>';

  const matchMap = {};
  allMatches.forEach(m => { matchMap[`${m.player1Id}_${m.player2Id}`] = m; });
  const getMatch = (a, b) => matchMap[`${a}_${b}`] || matchMap[`${b}_${a}`];

  let html = '<div class="table-scroll"><table class="matrix-table"><thead><tr><th>나 \\ 상대</th>';
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
  html += '</tbody></table></div>';
  return html;
}

window.onLeagueSelect = onLeagueSelect;
window.switchHistoryTab = function(name) {
  document.querySelectorAll('#historyContent .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#historyContent .tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('htab-' + name).classList.add('active');
  document.getElementById('hcontent-' + name).classList.add('active');
};

init();
