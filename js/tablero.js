import { qs, Storage, fmtDateAR } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadWeek, loadAssignments, loadAppSettings } from "./data.js";

mountHeader();

const weekISO = Storage.get("currentWeekISO", "");
qs("#weekPretty").textContent = fmtDateAR(weekISO);

function byType(asg, type){ return asg.find(x=>x.type===type); }
function esc(s){ return String(s || "").replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
function fullName(row){ return row ? `${row.person1Name||"—"}${row.person2Name ? " / " + row.person2Name : ""}` : "—"; }
function rowHtml(number, title, names, meta=""){
  return `<div class="programRow"><div class="num">${number}</div><div class="content"><div class="partTitle">${esc(title)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ""}</div><div class="assigned">${esc(names || "—")}</div></div>`;
}

async function load(){
  const app = await loadAppSettings();
  const w = await loadWeek(weekISO);
  const asg = await loadAssignments(weekISO);
  qs("#cong").textContent = `Congr. ${app.congregacion || "Villa Fiad"}`;
  qs("#date").textContent = fmtDateAR(weekISO);
  qs("#schedule").textContent = `${w?.meetingDay || ""}${w?.meetingTime ? " | " + w.meetingTime : ""}`;
  qs("#reading").textContent = w?.reading || "—";
  qs("#song1").textContent = w?.openingSong || "—";
  qs("#song2").textContent = w?.middleSong || "—";
  qs("#song3").textContent = w?.closingSong || "—";

  if(["asamblea","conmemoracion","sin_reunion"].includes(w?.weekType)){
    qs("#specialBox").innerHTML = `<div class="notice warn" style="margin-top:10px"><b>Esta semana no hay reunión.</b><br>${esc(w?.specialReason || "Motivo especial")}</div>`;
    qs("#partsList").innerHTML = "";
    return;
  }

  qs("#pres").textContent = byType(asg, "Presidente")?.person1Name || "—";
  qs("#or1").textContent = byType(asg, "Oración inicial")?.person1Name || "—";
  qs("#or2").textContent = byType(asg, "Oración final")?.person1Name || "—";

  const sections = [
    { name:"TESOROS DE LA BIBLIA", rows:[byType(asg,"Tesoros"), byType(asg,"Perlas"), byType(asg,"Lectura de la Biblia")].filter(Boolean) },
    { name:"SEAMOS MEJORES MAESTROS", rows: asg.filter(x=>["Asignación estudiantil","Discurso de estudiante"].includes(x.type)) },
    { name:"NUESTRA VIDA CRISTIANA", rows: asg.filter(x=>["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante","Conductor EBC","Lector EBC"].includes(x.type)) }
  ];

  const box = qs("#partsList");
  box.innerHTML = "";
  let n = 1;
  for(const sec of sections){
    if(!sec.rows.length) continue;
    box.insertAdjacentHTML("beforeend", `<div class="sectionHeader">${esc(sec.name)}</div>`);
    for(const row of sec.rows){
      let who = fullName(row);
      if(row.type === "Discurso del viajante" && w?.travelerName){ who = w.travelerName; }
      let meta = row.minutes ? `${row.minutes} min.` : "";
      if(row.type === "Conductor EBC") meta = "Conductor";
      if(row.type === "Lector EBC") meta = "Lector";
      if(row.person2Name) meta = `${meta ? meta + " · " : ""}Ayudante: ${row.person2Name}`;
      box.insertAdjacentHTML("beforeend", rowHtml(n++, row.title || row.type, who, meta));
    }
  }
}

qs("#btnPrint").addEventListener("click", ()=>window.print());
load();
