import { APP, qs, qsa, setActiveNav } from "./app.js";
import { watchAuth, logout, requireSignedIn } from "./firebase.js";

function currentPage(){
  return location.pathname.split("/").pop() || "index.html";
}

function showLoggedOutNavigation(isLoggedIn){
  qsa(".navlinks a").forEach(a=>{
    const href = a.getAttribute("href") || "";
    if(!isLoggedIn && href !== "login.html") a.style.display = "none";
    else a.style.display = "inline-flex";
  });
}

export function mountHeader(){
  const appName = qs("#appName");
  const appVersion = qs("#appVersion");
  if(appName) appName.textContent = APP.name;
  if(appVersion) appVersion.textContent = "v"+APP.version;
  setActiveNav(currentPage());

  const statusEl = qs("#authStatus");
  const logoutBtn = qs("#btnLogout");
  const page = currentPage();
  const isLoginPage = page === "login.html";

  if(statusEl){
    try{
      watchAuth(u=>{
        const logged = !!u;
        statusEl.textContent = logged ? ("Conectado: "+ (u.email||"")) : "No conectado";
        if(logoutBtn) logoutBtn.style.display = logged ? "inline-flex" : "none";
        showLoggedOutNavigation(logged);
        if(!logged && !isLoginPage){
          const next = encodeURIComponent(page + (location.search || "") + (location.hash || ""));
          location.replace(`login.html?next=${next}`);
        }
      });
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

export async function requireAuthOrRedirect(){
  return requireSignedIn(true);
}
