import { qs, qsa, Storage } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { login, registerUser, sendResetPassword, watchAuth, firebaseProjectId } from "./firebase.js";

mountHeader();

const params = new URLSearchParams(location.search);
const rawNext = params.get("next") || "index.html";
const nextPage = rawNext.includes("://") || rawNext.startsWith("/") ? "index.html" : rawNext;
const msg = qs("#msg");
const projectEl = qs("#firebaseProjectId");
if(projectEl) projectEl.textContent = firebaseProjectId() || "sin configurar";

function showMessage(text, type="ok"){
  msg.style.display = "block";
  msg.className = "notice " + (type === "ok" ? "ok" : type === "warn" ? "warn" : "err");
  msg.textContent = text;
}

function friendlyError(e){
  const code = String(e?.code || "");
  if(code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) return "Correo o contraseña incorrectos.";
  if(code.includes("auth/user-not-found")) return "No existe un usuario con ese correo.";
  if(code.includes("auth/email-already-in-use")) return "Ese correo ya tiene una cuenta.";
  if(code.includes("auth/weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if(code.includes("auth/invalid-email")) return "El correo no parece válido.";
  if(code.includes("auth/network-request-failed")) return "No hay conexión. Revisá Internet e intentá de nuevo.";
  if(code.includes("auth/operation-not-allowed")) return "En Firebase falta activar Authentication > Email/Password.";
  if(code.includes("auth/unauthorized-domain")) return "Este dominio no está autorizado en Firebase Authentication > Settings > Authorized domains.";
  if(code.includes("auth/too-many-requests")) return "Hubo muchos intentos. Esperá unos minutos o usá Recuperar contraseña.";
  if(code.includes("auth/user-disabled")) return "Este usuario está deshabilitado en Firebase Authentication.";
  const detail = e?.code ? ` (${e.code})` : "";
  return (e?.message || "No se pudo completar la operación.") + detail;
}

function switchPanel(panelId){
  qsa(".auth-panel").forEach(p=>{ p.hidden = p.id !== panelId; });
  qsa(".auth-tab").forEach(btn=>{
    const active = btn.dataset.panel === panelId;
    btn.classList.toggle("active", active);
    btn.classList.toggle("ghost", !active);
  });
  msg.style.display = "none";
}

qsa(".auth-tab").forEach(btn=>btn.addEventListener("click", ()=>switchPanel(btn.dataset.panel)));

qsa(".password-toggle").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const input = qs("#"+btn.dataset.toggle);
    if(!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Ocultar" : "Ver";
  });
});

watchAuth(user=>{
  if(user) location.replace(nextPage);
});

qs("#loginPanel").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = qs("#loginEmail").value.trim();
  const password = qs("#loginPassword").value;
  const btn = qs("#btnLogin");
  try{
    btn.disabled = true;
    showMessage("Verificando usuario en Firebase...", "warn");
    await login(email, password);
    showMessage("Ingreso correcto. Abriendo la app...", "ok");
    setTimeout(()=>location.replace(nextPage), 250);
  }catch(err){
    showMessage(friendlyError(err), "err");
    btn.disabled = false;
  }
});

qs("#registerPanel").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = qs("#registerEmail").value.trim();
  const password = qs("#registerPassword").value;
  const password2 = qs("#registerPassword2").value;
  if(password !== password2){
    showMessage("Las contraseñas no coinciden.", "err");
    return;
  }
  const btn = qs("#btnRegister");
  try{
    btn.disabled = true;
    showMessage("Creando usuario en Firebase...", "warn");
    await registerUser(email, password);
    showMessage("Usuario creado. Abriendo la app...", "ok");
    setTimeout(()=>location.replace(nextPage), 250);
  }catch(err){
    showMessage(friendlyError(err), "err");
    btn.disabled = false;
  }
});

qs("#resetPanel").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = qs("#resetEmail").value.trim();
  try{
    await sendResetPassword(email);
    showMessage("Listo. Revisá el correo para cambiar la contraseña.", "ok");
  }catch(err){
    showMessage(friendlyError(err), "err");
  }
});


qs("#btnClearLocalLogin")?.addEventListener("click", ()=>{
  if(confirm("¿Borrar la configuración local guardada en este navegador? No borra Firebase.")){
    Storage.clearApp();
    location.reload();
  }
});

qs("#btnReloadLogin")?.addEventListener("click", ()=>location.reload());
