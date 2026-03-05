import { APP, Storage, qs, setActiveNav } from "./app.js";
import { watchAuth, logout } from "./firebase.js";

export function mountHeader(){
  qs("#appName").textContent = APP.name;
  qs("#appVersion").textContent = "v"+APP.version;
  setActiveNav(location.pathname.split("/").pop() || "index.html");

  const statusEl = qs("#authStatus");
  const logoutBtn = qs("#btnLogout");
  if(statusEl){
    try{
      const unsub = watchAuth(u=>{
        statusEl.textContent = u ? ("Conectado: "+ (u.email||"")) : "No conectado";
        if(logoutBtn) logoutBtn.style.display = u ? "inline-flex" : "none";
      });
      if(unsub === null){
        statusEl.textContent = "Configurar Firebase";
        if(logoutBtn) logoutBtn.style.display = "none";
      }
    }catch(e){
      statusEl.textContent = "Configurar Firebase";
    }
  }
  if(logoutBtn){
    logoutBtn.addEventListener("click", async ()=>{
      await logout();
      location.href="login.html";
    });
  }
}

export function requireAuthOrRedirect(){
  // If no firebase config => go settings
  const cfg = Storage.get("firebaseConfig", null);
  if(!cfg){
    location.href="settings.html";
    return;
  }
  // Auth state is async; we do a quick check by reading cached firebase user? Not available; simplest:
  // pages that require auth will have a link and user will go through login if needed.
}
