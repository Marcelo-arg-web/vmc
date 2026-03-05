
import { qs } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { login, watchAuth } from "./firebase.js";

function setMsg(t){
  const el = document.querySelector("#msg");
  if(el) el.textContent = t;
}

function debug(t){
  console.log("[LOGIN]", t);
  const el = document.querySelector("#debug");
  if(el) el.textContent = t;
}

window.addEventListener("error", (ev)=>{
  debug("Error: " + (ev?.message || ev));
});

window.addEventListener("unhandledrejection", (ev)=>{
  debug("Promise rechazado: " + (ev?.reason?.message || ev?.reason || ev));
});

document.addEventListener("DOMContentLoaded", ()=>{
  try{
    mountHeader();
  }catch(e){
    debug("mountHeader falló: " + (e?.message || e));
  }

  // Confirm scripts running
  debug("login.js cargado ✅");

  // Watch auth state
  try{
    watchAuth(u=>{
      debug("Estado de sesión: " + (u ? "logueado" : "sin sesión"));
      if(u) location.href="index.html";
    });
  }catch(e){
    debug("watchAuth falló: " + (e?.message || e));
  }

  const btn = document.querySelector("#btnLogin");
  if(!btn){
    setMsg("No encuentro el botón #btnLogin (revisa login.html).");
    debug("No existe #btnLogin");
    return;
  }

  btn.addEventListener("click", async (ev)=>{
    ev.preventDefault();
    const emailEl = document.querySelector("#email");
    const passEl = document.querySelector("#password");
    const email = (emailEl?.value || "").trim();
    const pass = (passEl?.value || "");

    setMsg("");
    debug("Intentando iniciar sesión...");

    if(!email || !pass){
      setMsg("Ingresá email y contraseña.");
      debug("Faltan credenciales");
      return;
    }

    try{
      await login(email, pass);
      debug("login() OK. Esperando redirección...");
    }catch(e){
      const msg = e?.code ? `${e.code}: ${e.message}` : (e?.message || String(e));
      setMsg("No se pudo iniciar sesión: " + msg);
      debug("login() falló: " + msg);
    }
  });
});
