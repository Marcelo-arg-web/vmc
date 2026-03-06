import { qs, Storage } from "./app.js";
import { mountHeader } from "./ui_common.js";

mountHeader();

const cfg = Storage.get("firebaseConfig", null);
if(cfg) qs("#cfg").value = JSON.stringify(cfg, null, 2);
qs("#proxy").value = Storage.get("proxyBase", "") || "";
qs("#congregacion").value = Storage.get("congregacion", 'CONG.: "VILLA FIAD"');
qs("#travelingName").value = Storage.get("travelingName", "Roberto Armando");
qs("#defaultTime").value = Storage.get("defaultMeetingTime", "20:00");

qs("#btnSaveCfg").addEventListener("click", ()=>{
  try{
    const raw = qs("#cfg").value.trim();
    if(raw) Storage.set("firebaseConfig", JSON.parse(raw));
    Storage.set("proxyBase", qs("#proxy").value.trim());
    Storage.set("congregacion", qs("#congregacion").value.trim() || 'CONG.: "VILLA FIAD"');
    Storage.set("travelingName", qs("#travelingName").value.trim() || "Roberto Armando");
    Storage.set("defaultMeetingTime", qs("#defaultTime").value || "20:00");
    qs("#msg").textContent = "Configuración guardada.";
  }catch(e){
    qs("#msg").textContent = "JSON inválido en Firebase Config.";
  }
});
