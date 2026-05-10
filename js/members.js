import { db } from './firebase-config.js';
import {
  collection, getDocs, orderBy, query
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function init() {
  try {
    const snap = await getDocs(query(collection(db, 'members'), orderBy('name')));
    const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('memberCount').textContent = `총 ${members.length}명`;

    const tbody = document.getElementById('memberTableBody');
    if (!members.length) {
      tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state">등록된 회원이 없습니다</div></td></tr>`;
      return;
    }
    tbody.innerHTML = members.map((m, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.handicap ?? '-'}</td>
      </tr>`).join('');
  } catch (e) {
    document.getElementById('memberTableBody').innerHTML =
      `<tr><td colspan="3"><div class="alert alert-error">불러오기 실패: ${e.message}</div></td></tr>`;
  }
}

init();
