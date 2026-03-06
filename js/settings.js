import { qs, Storage } from "./app.js";
import { mountHeader } from "./ui_common.js";

mountHeader();

const cfg = Storage.get("firebaseConfig", null);
if(cfg) qs("#cfg").value = JSON.stringify(cfg, null, 2);
qs("#proxy").value = Storage.get("proxyBase", "") || "";
qs("#congregacion").value = Storage.get("congregacion", 'CONG.: "VILLA FIAD"') || 'CONG.: "VILLA FIAD"';
qs("#viajante").value = Storage.get("viajanteNombre", "Roberto Armando") || "Roberto Armando";

const rawFechas = Storage.get("specialDates", [
  { date: "2026-04-02", reason: "Conmemoración" }
]);
qs("#fechasEspeciales").value = rawFechas.map(x => `${x.date}|${x.reason || 'Sin reunión'}`).join("\n");

qs("#btnSaveCfg").addEventListener("click", ()=>{
  try{
    const obj = JSON.parse(qs("#cfg").value);
    const specialDates = qs("#fechasEspeciales").value
      .split(/\n+/)
      .map(x => x.trim())
      .filter(Boolean)
      .map(line => {
        const [date, ...rest] = line.split('|');
        return { date: (date || '').trim(), reason: (rest.join('|') || 'Sin reunión').trim() };
      })
      .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));

    Storage.set("firebaseConfig", obj);
    Storage.set("proxyBase", qs("#proxy").value.trim());
    Storage.set("congregacion", qs("#congregacion").value.trim() || 'CONG.: "VILLA FIAD"');
    Storage.set("viajanteNombre", qs("#viajante").value.trim() || "Roberto Armando");
    Storage.set("specialDates", specialDates);
    qs("#msg").textContent = "Guardado.";
  }catch(e){
    qs("#msg").textContent = "JSON inválido en Firebase Config.";
  }
});
