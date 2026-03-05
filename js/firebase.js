// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFyo49uQEhRHVTxK9LPmG1AcwgeIZYphk",
  authDomain: "vmc2026-3b10b.firebaseapp.com",
  projectId: "vmc2026-3b10b",
  storageBucket: "vmc2026-3b10b.appspot.com",
  messagingSenderId: "88307042345",
  appId: "1:88307042345:web:3530ac98c4a6aaa3767438"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export function login(email, pass) {
  return signInWithEmailAndPassword(auth, email, pass);
}

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export function logout() {
  return signOut(auth);
}