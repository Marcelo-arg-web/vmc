import { qs } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { login, watchAuth } from "./firebase.js";

mountHeader();

const unsub = watchAuth(u=>{
  if(u) location.href="index.html";
});
if(unsub === null){
  // No hay config guardada aún
  location.href="settings.html";
}

qs("#btnLogin").addEventListener("click", async ()=>{
  const email = qs("#email").value.trim();
  const pass = qs("#password").value;
  qs("#msg").textContent = "";
  try{
    await login(email, pass);
  }catch(e){
    qs("#msg").textContent = "No se pudo iniciar sesión: " + (e?.message || e);
  }
});
