import { qs, Storage, todayISO } from "./app.js";
import { mountHeader } from "./ui_common.js";

mountHeader();

const ctrlEl = qs("#controlBox");
function renderControl(){
  const ctrl = Storage.get("control", {saved:true});
  if(ctrl.saved){
    ctrlEl.className = "notice ok";
    ctrlEl.innerHTML = "✅ Estado: <b>Guardado</b>";
  }else{
    ctrlEl.className = "notice warn";
    ctrlEl.innerHTML = "⚠️ Estado: <b>No guardado</b>. " + (ctrl.reason?("<div class='small'>"+ctrl.reason+"</div>"):"");
  }
}
renderControl();
window.addEventListener("control-changed", renderControl);

qs("#weekISO").value = Storage.get("currentWeekISO", todayISO());
qs("#btnGoWeek").addEventListener("click", ()=>{
  Storage.set("currentWeekISO", qs("#weekISO").value);
  location.href = "semana.html";
});
