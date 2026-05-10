export async function hashString(str) {
  const data = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function showAlert(elementId, message, type = 'error') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  if (type !== 'info') setTimeout(() => { if (el) el.innerHTML = ''; }, 4000);
}

export function formatDatetime(dateStr, timeStr) {
  const d = new Date(`${dateStr}T${timeStr}`);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function formatTimestamp(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// Generate all round-robin match pairs from player ID list
export function generateMatchPairs(playerIds) {
  const pairs = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      pairs.push({ player1Id: playerIds[i], player2Id: playerIds[j], result: null, winnerId: null, reportedBy: null, reportedAt: null });
    }
  }
  return pairs;
}

// Calculate standings from players/matches/scoring config
export function calculateStandings(players, matches, scoring) {
  const stats = {};
  players.forEach(p => {
    stats[p.id] = { id: p.id, name: p.name, wins: 0, losses: 0, noGames: 0, played: 0, total: players.length - 1 };
  });

  matches.forEach(m => {
    if (!m.result) return;
    if (m.result === 'player1') {
      if (stats[m.player1Id]) { stats[m.player1Id].wins++; stats[m.player1Id].played++; }
      if (stats[m.player2Id]) { stats[m.player2Id].losses++; stats[m.player2Id].played++; }
    } else if (m.result === 'player2') {
      if (stats[m.player2Id]) { stats[m.player2Id].wins++; stats[m.player2Id].played++; }
      if (stats[m.player1Id]) { stats[m.player1Id].losses++; stats[m.player1Id].played++; }
    } else if (m.result === 'noGame') {
      if (stats[m.player1Id]) { stats[m.player1Id].noGames++; stats[m.player1Id].played++; }
      if (stats[m.player2Id]) { stats[m.player2Id].noGames++; stats[m.player2Id].played++; }
    }
  });

  return Object.values(stats)
    .map(s => ({ ...s, points: s.wins * scoring.win + s.losses * scoring.loss + s.noGames * scoring.noGame }))
    .sort((a, b) => b.points !== a.points ? b.points - a.points : b.wins - a.wins);
}
