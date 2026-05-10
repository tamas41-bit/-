import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert } from './utils.js';

let allMembers = [];

async function init() {
  try {
    const snap = await getDocs(collection(db, 'members'));
    allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const sel = document.getElementById('loginPlayerSelect');
    allMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name;
      sel.appendChild(opt);
    });
  } catch (e) {
    showAlert('loginAlert', '불러오기 실패: ' + e.message);
  }
}

async function doLogin() {
  const id = document.getElementById('loginPlayerSelect').value;
  const pin = document.getElementById('loginPin').value.trim();
  if (!id) { showAlert('loginAlert', '이름을 선택하세요.'); return; }
  if (!/^\d{4}$/.test(pin)) { showAlert('loginAlert', 'PIN은 숫자 4자리입니다.'); return; }

  const member = allMembers.find(m => m.id === id);
  if (!member) { showAlert('loginAlert', '회원 정보를 찾을 수 없습니다.'); return; }
  if (await hashString(pin) !== member.pinHash) { showAlert('loginAlert', 'PIN이 올바르지 않습니다.'); return; }

  localStorage.setItem('hankyu_player', JSON.stringify({ id: member.id, name: member.name }));
  location.href = 'index.html';
}

window.doLogin = doLogin;
init();
