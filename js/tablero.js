import { qs, Storage, fmtDateAR } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadWeek, loadAssignments, loadAppSettings } from "./data.js";

mountHeader();

const weekISO = Storage.get("currentWeekISO", "");
qs("#weekPretty").textContent = fmtDateAR(weekISO);

function byType(asg, type){ return asg.find(x=>x.type===type); }
function itemHtml(title, who){ return `<div class="board-row"><div class="left"><div class="main">${title}</div></div><div class="right"><div class="name">${who || "—"}</div></div></div>`; }
function fullName(row){ return row ? `${row.person1Name||"—"}${row.person2Name ? " / " + row.person2Name : ""}` : "—"; }

async function load(){
  const app = await loadAppSettings();
  const w = await loadWeek(weekISO);
  const asg = await loadAssignments(weekISO);
  qs("#cong").textContent = `CONG.: ${String(app.congregacion || "Villa Fiad").toUpperCase()}`;
  qs("#date").textContent = fmtDateAR(weekISO);
  qs("#schedule").textContent = `${w?.meetingDay || ""} ${w?.meetingTime ? "| " + w.meetingTime : ""}`;

  if(["asamblea","conmemoracion","sin_reunion"].includes(w?.weekType)){
    qs("#specialBox").innerHTML = `<div class="notice warn" style="margin-top:10px"><b>Esta semana no hay reunión.</b><br>${w?.specialReason || "Motivo especial"}</div>`;
    qs("#partsList").innerHTML = "";
    return;
  }

  qs("#pres").textContent = byType(asg, "Presidente")?.person1Name || "—";
  qs("#or1").textContent = byType(asg, "Oración inicial")?.person1Name || "—";
  qs("#or2").textContent = byType(asg, "Oración final")?.person1Name || "—";

  const sections = [];
  sections.push({ name:"TESOROS DE LA BIBLIA", rows:[byType(asg,"Tesoros"), byType(asg,"Perlas"), byType(asg,"Lectura de la Biblia")].filter(Boolean) });
  sections.push({ name:"SEAMOS MEJORES MAESTROS", rows: asg.filter(x=>["Asignación estudiantil","Discurso de estudiante"].includes(x.type)) });
  sections.push({ name:"NUESTRA VIDA CRISTIANA", rows: asg.filter(x=>["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante","Conductor EBC","Lector EBC"].includes(x.type)) });

  const box = qs("#partsList");
  box.innerHTML = "";
  for(const sec of sections){
    if(!sec.rows.length) continue;
    const h = document.createElement("div");
    h.className = "sectionTitle";
    h.textContent = sec.name;
    box.appendChild(h);
    for(const row of sec.rows){
      let who = fullName(row);
      if(row.type === "Discurso del viajante" && w?.travelerName){ who = w.travelerName; }
      box.insertAdjacentHTML("beforeend", itemHtml(row.title || row.type, who));
    }
  }
}

qs("#btnPrint").addEventListener("click", ()=>window.print());
load();
