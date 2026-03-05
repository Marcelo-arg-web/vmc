import { qs } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { login, watchAuth } from "./firebase.js";

function setMsg(t){
  const el = document.querySelector("#msg");
  if(el) el.textContent = t;
}

document.addEventListener("DOMContentLoaded", ()=>{
  // Header
  try { mountHeader(); } catch(e) { /* no-op */ }

  // Redirect if already logged in
  try{
    watchAuth(u=>{
      if(u) location.href="index.html";
    });
  }catch(e){
    setMsg("Error iniciando Firebase/Auth: " + (e?.message || e));
  }

  const btn = document.querySelector("#btnLogin");
  if(!btn){
    setMsg("Error: no encuentro el botón de login (#btnLogin).");
    return;
  }

  btn.addEventListener("click", async (ev)=>{
    ev.preventDefault();

    const email = (document.querySelector("#email")?.value || "").trim();
    const pass  = (document.querySelector("#password")?.value || "");

    if(!email || !pass){
      setMsg("Ingresá email y contraseña.");
      return;
    }

    setMsg("Iniciando sesión...");

    try{
      await login(email, pass);
      // watchAuth redirige
    }catch(e){
      const msg = e?.code ? `${e.code}: ${e.message}` : (e?.message || String(e));
      setMsg("No se pudo iniciar sesión: " + msg);
      console.error(e);
    }
  });
});
