import { db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function loadBoardPosts() {
  const el = document.getElementById('boardList');
  el.innerHTML = '<div class="loading"><span class="spinner"></span></div>';
  try {
    const snap = await getDocs(query(collection(db, 'board'), orderBy('createdAt', 'desc')));
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!posts.length) {
      el.innerHTML = '<div class="empty-state">등록된 게시글이 없습니다.</div>';
      return;
    }
    el.innerHTML = posts.map((p, i) => {
      const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('ko-KR') : '';
      const contentHtml = (p.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
      return `<div class="board-item" id="post-${p.id}">
        <div class="board-item-header" onclick="togglePost('${p.id}')">
          <div>
            <div style="font-weight:600;font-size:1rem;">${p.title}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.2rem;">${date}</div>
          </div>
          <span class="board-toggle-arrow" id="arrow-${p.id}">▶</span>
        </div>
        <div class="board-item-body" id="body-${p.id}" style="display:none;">
          <div style="font-size:0.92rem;line-height:1.7;white-space:pre-wrap;">${contentHtml}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="alert alert-error">불러오기 실패: ${e.message}</div>`;
  }
}

window.togglePost = function(id) {
  const body = document.getElementById('body-' + id);
  const arrow = document.getElementById('arrow-' + id);
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▶' : '▼';
};

loadBoardPosts();
