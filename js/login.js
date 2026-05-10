import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert } from './utils.js';

let allMembers = [];

async function init() {
  try {
    const snap = await getDocs(collection(db, 'members'));
    allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    showAlert('loginAlert', '불러오기 실패: ' + e.message);
  }
}

async function doLogin() {
  const pin = document.getElementById('loginPin').value.trim();
  if (!/^\d{4}$/.test(pin)) { showAlert('loginAlert', '비밀번호는 숫자 4자리입니다.'); return; }

  const hashed = await hashString(pin);
  const member = allMembers.find(m => m.pinHash === hashed);
  if (!member) { showAlert('loginAlert', '비밀번호가 올바르지 않습니다.'); return; }

  localStorage.setItem('hankyu_player', JSON.stringify({ id: member.id, name: member.name }));
  location.href = 'index.html';
}

window.doLogin = doLogin;
init();
