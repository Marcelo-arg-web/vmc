import { Storage } from "./app.js";

// Firebase v12 modular (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

export { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit };

let _app = null, _auth = null, _db = null;

export function getFirebaseConfig(){
  return Storage.get("firebaseConfig", null);
}

export function hasFirebaseConfig(){
  return !!getFirebaseConfig();
}

export function initFirebase(){
  const cfg = getFirebaseConfig();
  if(!cfg) throw new Error("No hay configuración de Firebase. Ve a Configuración.");
  _app = initializeApp(cfg);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  return { app:_app, auth:_auth, db:_db };
}

export function auth(){ return _auth; }
export function db(){ return _db; }

export function ensureInit(){
  if(!_app || !_auth || !_db){
    initFirebase();
  }
  return { app:_app, auth:_auth, db:_db };
}

export async function login(email, password){
  ensureInit();
  return signInWithEmailAndPassword(_auth, email, password);
}

export async function logout(){
  ensureInit();
  return signOut(_auth);
}

// Devuelve la función de desuscripción, o null si falta config
export function watchAuth(cb){
  if(!hasFirebaseConfig()) return null;
  ensureInit();
  return onAuthStateChanged(_auth, cb);
}
