import { qs, Storage } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadAppSettings, saveAppSettings } from "./data.js";

mountHeader();

async function load(){
  const cfg = Storage.get("firebaseConfig", null);
  if(cfg) qs("#cfg").value = JSON.stringify(cfg, null, 2);
  qs("#proxy").value = Storage.get("proxyBase", "") || "";

  const app = await loadAppSettings();
  qs("#congregacion").value = app.congregacion || "Villa Fiad";
  qs("#travelerName").value = app.travelerName || "Roberto Armando";
  qs("#defaultTime").value = app.defaultTime || "19:30";
  qs("#noMeetingDates").value = (app.noMeetingDates || "2026-04-02 | Conmemoración").trim();
}

qs("#btnSaveCfg").addEventListener("click", async ()=>{
  try{
    const cfgText = qs("#cfg").value.trim();
    if(cfgText) Storage.set("firebaseConfig", JSON.parse(cfgText));
    Storage.set("proxyBase", qs("#proxy").value.trim());
    await saveAppSettings({
      congregacion: qs("#congregacion").value.trim(),
      travelerName: qs("#travelerName").value.trim(),
      defaultTime: qs("#defaultTime").value.trim(),
      noMeetingDates: qs("#noMeetingDates").value.trim()
    });
    qs("#msg").textContent = "Configuración guardada.";
  }catch(e){
    qs("#msg").textContent = "Revisá el JSON de Firebase Config.";
  }
});

load();
