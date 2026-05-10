import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBq4oNJf4MM4E7lTZGlgs3e-1QGgn3szVk",
  authDomain: "hankyu-league.firebaseapp.com",
  projectId: "hankyu-league",
  storageBucket: "hankyu-league.firebasestorage.app",
  messagingSenderId: "103725569445",
  appId: "1:103725569445:web:3f9099d111ae22183fc44c",
  measurementId: "G-YREVRNG6N5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
