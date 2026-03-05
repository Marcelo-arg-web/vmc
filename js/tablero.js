import { qs, Storage, fmtDateAR } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadWeek, loadAssignments } from "./data.js";

mountHeader();

const weekISO = Storage.get("currentWeekISO", "");
qs("#weekPretty").textContent = fmtDateAR(weekISO);

async function load(){
  const w = await loadWeek(weekISO);
  const asg = await loadAssignments(weekISO);

  qs("#cong").textContent = Storage.get("congregacion", "CONG.: "VILLA FIAD"");
  qs("#title").textContent = "Programa para la reunión de entre semana";
  qs("#date").textContent = fmtDateAR(weekISO);

  // Map key roles
  const get = (type)=>asg.find(x=>x.type===type);
  qs("#pres").textContent = get("Presidente")?.person1Name || "—";
  qs("#or1").textContent = get("Oración (inicio)")?.person1Name || "—";
  qs("#or2").textContent = get("Oración (final)")?.person1Name || "—";

  const listEl = qs("#partsList");
  listEl.innerHTML = "";

  const showTypes = [
    "Tesoros 1 (Discurso)","Tesoros 2 (Perlas)","Tesoros 3 (Lectura Biblia)",
    "Maestros 4","Maestros 5","Maestros 6",
    "Vida Cristiana 8","Vida Cristiana 9",
    "Estudio bíblico (Conductor)","Estudio bíblico (Lector)",
    "Repaso y anuncios"
  ];

  for(const t of showTypes){
    const row = asg.find(x=>x.type===t);
    if(!row) continue;
    const li = document.createElement("div");
    li.className="board-row";
    const helper = row.person2Name ? (" / " + row.person2Name) : "";
    li.innerHTML = `
      <div class="left">
        <div class="sec">${t}</div>
        <div class="main">${row.title || ""}</div>
      </div>
      <div class="right">
        <div class="name">${(row.person1Name||"—")}${helper}</div>
      </div>
    `;
    listEl.appendChild(li);
  }
}

qs("#btnPrint").addEventListener("click", ()=>window.print());

qs("#btnPNG").addEventListener("click", async ()=>{
  const el = qs("#board");
  const canvas = await window.html2canvas(el, { scale: 2 });
  const a = document.createElement("a");
  a.download = `VMC_${weekISO}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

load();
