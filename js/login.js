
import { login, watchAuth } from "./firebase.js";

const msg = document.getElementById("msg");
const btn = document.getElementById("btnLogin");

watchAuth(u=>{
  if(u){
    location.href="index.html";
  }
});

btn.addEventListener("click", async ()=>{
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;

  msg.textContent = "Iniciando sesión...";

  try{
    await login(email, pass);
  }catch(e){
    msg.textContent = "Error: " + e.message;
  }
});
