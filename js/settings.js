import { qs, Storage } from "./app.js";
import { mountHeader } from "./ui_common.js";

mountHeader();

const cfg = Storage.get("firebaseConfig", null);
if(cfg){
  qs("#cfg").value = JSON.stringify(cfg, null, 2);
}
qs("#proxy").value = Storage.get("proxyBase", "") || "";

qs("#btnSaveCfg").addEventListener("click", ()=>{
  try{
    const obj = JSON.parse(qs("#cfg").value);
    Storage.set("firebaseConfig", obj);
    Storage.set("proxyBase", qs("#proxy").value.trim());
    qs("#msg").textContent = "Guardado. Ahora podés ir a Login.";
  }catch(e){
    qs("#msg").textContent = "JSON inválido en Firebase Config.";
  }
});
