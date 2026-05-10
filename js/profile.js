import { db } from './firebase-config.js';
import { doc, getDoc, getDocs, collection, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { hashString, showAlert } from './utils.js';

let memberId = null;
let memberData = null;

async function init() {
  const saved = localStorage.getItem('hankyu_player');
  if (!saved) { location.href = 'login.html'; return; }
  memberId = JSON.parse(saved).id;

  try {
    const snap = await getDoc(doc(db, 'members', memberId));
    if (!snap.exists()) { showAlert('nameAlert', '회원 정보를 찾을 수 없습니다.'); return; }
    memberData = { id: snap.id, ...snap.data() };
    document.getElementById('currentNameDisplay').textContent = memberData.name;
    document.getElementById('newNameInput').value = memberData.name;
    if (memberData.handicap != null) {
      document.getElementById('handicapDisplay').textContent = `핸디캡: ${memberData.handicap}`;
    }
  } catch (e) {
    showAlert('nameAlert', '불러오기 실패: ' + e.message);
  }
}

async function saveName() {
  const newName = document.getElementById('newNameInput').value.trim();
  if (!newName) { showAlert('nameAlert', '이름을 입력하세요.'); return; }
  if (newName === memberData.name) { showAlert('nameAlert', '현재 이름과 동일합니다.'); return; }

  try {
    const allSnap = await getDocs(collection(db, 'members'));
    const duplicate = allSnap.docs.some(d => d.id !== memberId && d.data().name === newName);
    if (duplicate) { showAlert('nameAlert', '이미 사용 중인 이름입니다.'); return; }

    await updateDoc(doc(db, 'members', memberId), { name: newName });
    memberData.name = newName;
    document.getElementById('currentNameDisplay').textContent = newName;
    localStorage.setItem('hankyu_player', JSON.stringify({ id: memberId, name: newName }));
    document.getElementById('navUserName').textContent = newName;
    showAlert('nameAlert', '이름이 변경되었습니다.', 'success');
  } catch (e) {
    showAlert('nameAlert', '오류: ' + e.message);
  }
}

async function savePin() {
  const current = document.getElementById('currentPinInput').value.trim();
  const newPin = document.getElementById('newPinInput').value.trim();
  const confirm = document.getElementById('confirmPinInput').value.trim();

  if (!/^\d{4}$/.test(current)) { showAlert('pinAlert', '현재 비밀번호는 숫자 4자리입니다.'); return; }
  if (!/^\d{4}$/.test(newPin)) { showAlert('pinAlert', '새 비밀번호는 숫자 4자리입니다.'); return; }
  if (newPin !== confirm) { showAlert('pinAlert', '새 비밀번호가 일치하지 않습니다.'); return; }

  const currentHash = await hashString(current);
  if (currentHash !== memberData.pinHash) { showAlert('pinAlert', '현재 비밀번호가 올바르지 않습니다.'); return; }

  try {
    const newHash = await hashString(newPin);
    await updateDoc(doc(db, 'members', memberId), { pinHash: newHash });
    memberData.pinHash = newHash;
    document.getElementById('currentPinInput').value = '';
    document.getElementById('newPinInput').value = '';
    document.getElementById('confirmPinInput').value = '';
    showAlert('pinAlert', '비밀번호가 변경되었습니다.', 'success');
  } catch (e) {
    showAlert('pinAlert', '오류: ' + e.message);
  }
}

window.saveName = saveName;
window.savePin = savePin;
init();
