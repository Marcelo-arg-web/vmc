import { login, watchAuth } from "./firebase.js";

const msg = document.getElementById("msg");

watchAuth((u) => {
  if (u) location.href = "index.html";
});

document.getElementById("btnLogin").addEventListener("click", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;

  if (!email || !pass) {
    msg.textContent = "Ingresá email y contraseña.";
    return;
  }

  msg.textContent = "Iniciando sesión...";

  try {
    await login(email, pass);
    // redirige por watchAuth
  } catch (err) {
    msg.textContent = "Error: " + (err?.message || err);
    console.error(err);
  }
});