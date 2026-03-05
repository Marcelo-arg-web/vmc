
import { watchAuth, logout } from "./firebase.js";

const info = document.getElementById("info");
const btn = document.getElementById("logout");

watchAuth(u=>{
  if(!u){
    location.href="login.html";
    return;
  }
  info.textContent = "Sesión iniciada: " + u.email;
});

btn.addEventListener("click", async ()=>{
  await logout();
});
