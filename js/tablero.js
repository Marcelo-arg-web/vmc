import { qs, Storage, fmtDateAR, addDaysISO, shortWeekLabel } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadWeek, loadAssignments, loadAppSettings } from "./data.js";

mountHeader();

const weekISO = Storage.get("currentWeekISO", "");
const nextWeekISO = addDaysISO(weekISO, 7);
qs("#weekPretty").textContent = `${shortWeekLabel(weekISO)} · ${shortWeekLabel(nextWeekISO)}`;

function byType(asg, type){ return asg.find(x=>x.type===type); }
function fullName(row){ return row ? `${row.person1Name||"—"}${row.person2Name ? " / " + row.person2Name : ""}` : "—"; }
function esc(s){ return String(s||"").replace(/[&<>"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;"}[m])); }

function sectionHtml(name, rows, travelerName=""){
  if(!rows.length) return "";
  const items = rows.map(row=>{
    let who = fullName(row);
    if(row.type === "Discurso del viajante" && travelerName) who = travelerName;
    return `<div class="board-row"><div class="left"><div class="main">${esc(row.title || row.type)}</div></div><div class="right"><div class="name">${esc(who)}</div></div></div>`;
  }).join("");
  return `<div class="sectionTitle">${esc(name)}</div>${items}`;
}

async function renderWeek(iso, app){
  const w = await loadWeek(iso);
  const asg = await loadAssignments(iso);
  const noMeeting = ["asamblea","conmemoracion","sin_reunion"].includes(w?.weekType);
  const schedule = `${w?.meetingDay || ""} ${new Date(iso+"T00:00:00").getDate()}${w?.meetingTime ? " · " + w.meetingTime : ""}`.trim();
  const header = `
    <div class="board-top">
      <div class="left">
        <div class="cong">CONG.: ${esc(String(app.congregacion || "Villa Fiad").toUpperCase())}</div>
        <h1>Reunión Vida y Ministerio Cristianos</h1>
        <div class="date">${esc(shortWeekLabel(iso, w?.meetingDay || ""))}</div>
        <div class="small board-sub">${esc(schedule)}${w?.reading ? " · Lectura: " + esc(w.reading) : ""}</div>
        <div class="songs">
          <span>Inicio: ${esc(w?.openingSong || "—")}</span>
          <span>Intermedia: ${esc(w?.middleSong || "—")}</span>
          <span>Final: ${esc(w?.closingSong || "—")}</span>
        </div>
      </div>
      <div class="right intro-box">
        <div><span class="label">Presidente</span><span class="val">${esc(byType(asg, "Presidente")?.person1Name || "—")}</span></div>
        <div><span class="label">Oración inicial</span><span class="val">${esc(byType(asg, "Oración inicial")?.person1Name || "—")}</span></div>
        <div><span class="label">Oración final</span><span class="val">${esc(byType(asg, "Oración final")?.person1Name || "—")}</span></div>
      </div>
    </div>`;

  let body = "";
  if(noMeeting){
    body = `<div class="special-card"><b>Esta semana no hay reunión.</b><br>${esc(w?.specialReason || "Motivo especial")}</div>`;
  } else {
    body += sectionHtml("Tesoros de la Biblia", [byType(asg,"Tesoros"), byType(asg,"Perlas"), byType(asg,"Lectura de la Biblia")].filter(Boolean), w?.travelerName);
    body += sectionHtml("Seamos mejores maestros", asg.filter(x=>["Asignación estudiantil","Discurso de estudiante"].includes(x.type)), w?.travelerName);
    body += sectionHtml("Nuestra vida cristiana", asg.filter(x=>["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante","Conductor EBC","Lector EBC"].includes(x.type)), w?.travelerName);
  }

  return `<section class="week-board">${header}<div class="partsList">${body}</div></section>`;
}

async function load(){
  const app = await loadAppSettings();
  const html = [];
  html.push(await renderWeek(weekISO, app));
  html.push(await renderWeek(nextWeekISO, app));
  qs("#boardList").innerHTML = html.join("");
}

qs("#btnPrint").addEventListener("click", ()=>window.print());
load();
