import { qs, qsa, Storage } from "./app.js";
import { mountHeader, requireAuthOrRedirect } from "./ui_common.js";
import { DEFAULT_FIREBASE_CONFIG, changePassword, watchAuth } from "./firebase.js";
import { loadAppSettings, saveAppSettings, exportCompatibleBackup, importCompatibleBackup } from "./data.js";

mountHeader();
await requireAuthOrRedirect();

function currentFormSettings(){
  return {
    congregacion: qs("#congregacion").value.trim(),
    travelerName: qs("#travelerName").value.trim(),
    defaultTime: qs("#defaultTime").value.trim(),
    enableAuxRoom: qs("#enableAuxRoom")?.checked !== false,
    auxRoomName: qs("#auxRoomName")?.value.trim() || "Sala B",
    noMeetingDates: qs("#noMeetingDates").value.trim()
  };
}

function fillForm(app={}){
  qs("#congregacion").value = app.congregacion || "";
  qs("#travelerName").value = app.travelerName || "";
  qs("#defaultTime").value = app.defaultTime || "19:30";
  if(qs("#enableAuxRoom")) qs("#enableAuxRoom").checked = app.enableAuxRoom !== false;
  if(qs("#auxRoomName")) qs("#auxRoomName").value = app.auxRoomName || "Sala B";
  qs("#noMeetingDates").value = (app.noMeetingDates || "").trim();
}

function authErrorText(e){
  const code = String(e?.code || "");
  if(code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) return "La contraseña actual no es correcta.";
  if(code.includes("auth/weak-password")) return "La contraseña nueva debe tener al menos 6 caracteres.";
  if(code.includes("auth/requires-recent-login")) return "Por seguridad, cerrá sesión, volvé a entrar y repetí el cambio.";
  return e?.message || "No se pudo cambiar la contraseña.";
}

async function load(){
  const cfg = Storage.get("firebaseConfig", DEFAULT_FIREBASE_CONFIG);
  qs("#cfg").value = cfg ? JSON.stringify(cfg, null, 2) : "";
  qs("#proxy").value = Storage.get("proxyBase", "") || "";

  fillForm(Storage.get("appSettings", {}));
  try{
    const app = await loadAppSettings();
    if(app && Object.keys(app).length){
      Storage.set("appSettings", app);
      fillForm(app);
    }
  }catch(e){
    qs("#msg").textContent = "Configuración local cargada. No se pudo leer Firebase.";
  }
}

qs("#btnSaveCfg").addEventListener("click", async ()=>{
  try{
    const cfgText = qs("#cfg").value.trim();
    if(cfgText) Storage.set("firebaseConfig", JSON.parse(cfgText));
    Storage.set("proxyBase", qs("#proxy").value.trim());
    const settings = currentFormSettings();
    Storage.set("appSettings", settings);
    try{
      await saveAppSettings(settings);
      qs("#msg").textContent = "Configuración guardada en esta app y en Firebase.";
    }catch(e){
      qs("#msg").textContent = "Configuración guardada en esta app. No se pudo guardar en Firebase.";
    }
  }catch(e){
    qs("#msg").textContent = "Revisá el JSON de Firebase Config.";
  }
});

qs("#btnClearLocal")?.addEventListener("click", ()=>{
  if(confirm("¿Borrar solo la configuración local de este navegador? No borra Firebase.")){
    Storage.clearApp();
    location.reload();
  }
});

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
  qs("#userEmail").textContent = user?.email || "—";
});

qs("#btnChangePassword").addEventListener("click", async ()=>{
  const current = qs("#currentPassword").value;
  const next = qs("#newPassword").value;
  const next2 = qs("#newPassword2").value;
  const out = qs("#secMsg");
  out.style.color = "#dc2626";
  if(!current || !next){ out.textContent = "Completá la contraseña actual y la nueva."; return; }
  if(next.length < 6){ out.textContent = "La nueva contraseña debe tener al menos 6 caracteres."; return; }
  if(next !== next2){ out.textContent = "Las contraseñas nuevas no coinciden."; return; }
  try{
    out.style.color = "#6b7280";
    out.textContent = "Cambiando...";
    await changePassword(current, next);
    qs("#currentPassword").value = "";
    qs("#newPassword").value = "";
    qs("#newPassword2").value = "";
    out.style.color = "#16a34a";
    out.textContent = "Contraseña cambiada correctamente.";
  }catch(e){
    out.style.color = "#dc2626";
    out.textContent = authErrorText(e);
  }
});

load();

// Backup compatible Python/Web: agregado sin modificar la lógica existente de semanas/asignaciones.
qs("#btnExportCompatible")?.addEventListener("click", async ()=>{
  const out = qs("#backupMsg");
  try{
    out.textContent = "Preparando backup compatible...";
    const data = await exportCompatibleBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `PlanificadorVMC_web_backup_compatible_${date}.vmc.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    out.textContent = `Backup compatible exportado: ${data.people.length} personas, ${data.weeks.length} semanas.`;
  }catch(e){
    out.textContent = `No se pudo exportar: ${e?.message || e}`;
  }
});

qs("#btnImportCompatible")?.addEventListener("click", async ()=>{
  const out = qs("#backupMsg");
  const file = qs("#compatibleBackupFile")?.files?.[0];
  if(!file){ out.textContent = "Elegí primero un archivo .json compatible."; return; }
  if(file.name.toLowerCase().endsWith(".zip")){ out.textContent = "En la web se importa el JSON compatible. Desde Python use ‘Exportar compatible Web/Python’."; return; }
  if(!confirm("Se importará/fusionará configuración, personas, semanas y asignaciones. ¿Continuar?")) return;
  try{
    out.textContent = "Importando backup compatible...";
    const data = JSON.parse(await file.text());
    const clearExisting = qs("#clearBeforeCompatibleImport")?.checked === true;
    const stats = await importCompatibleBackup(data, {clearExisting});
    out.textContent = `Importación lista: ${stats.peopleImported} personas, ${stats.weeksImported} semanas, ${stats.assignmentsImported} asignaciones.`;
  }catch(e){
    out.textContent = `No se pudo importar: ${e?.message || e}`;
  }
});

