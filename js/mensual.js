import { qs, Storage, fmtDateAR } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadWeek, loadAssignments } from "./data.js";

mountHeader();

const monthInp = qs("#month");
const wrap = qs("#wrap");
const msg = qs("#msg");

function show(s, kind="ok"){
  msg.className = "notice " + (kind==="ok"?"ok":kind==="warn"?"warn":"err");
  msg.textContent = s;
  msg.style.display = "block";
}
function hide(){ msg.style.display="none"; }

function thursdaysOfMonth(yyyy_mm){
  const [yS,mS] = yyyy_mm.split("-");
  const y = Number(yS), m = Number(mS); // 1-12
  const days = new Date(y, m, 0).getDate();
  const out=[];
  for(let d=1; d<=days; d++){
    const dt = new Date(y, m-1, d);
    if(dt.getDay()===4){ // jueves
      const iso = dt.toISOString().slice(0,10);
      out.push(iso);
    }
  }
  return out;
}

function findRow(asg, type){
  return asg?.find(x=>x.type===type) || null;
}

function rowHTML(time, num, text, assign){
  return `<div class="r">
    <div class="time">${time||""}</div>
    <div class="num">${num||""}</div>
    <div class="txt">${text||""}</div>
    <div class="assign">${assign||""}</div>
  </div>`;
}

function renderWeek(weekISO, w, asg){
  const cong = Storage.get("congregacion", 'CONG.: "VILLA FIAD"');
  const datePretty = fmtDateAR(weekISO);

  const pres = findRow(asg, "Presidente")?.person1Name || "—";
  const or1  = findRow(asg, "Oración (inicio)")?.person1Name || "—";
  const or2  = findRow(asg, "Oración (final)")?.person1Name || "—";

  // Part titles come from assignments row (editable) OR from detected parts saved in week
  const titleOf = (type)=>{
    const r = findRow(asg, type);
    if(r?.title) return r.title;
    return "";
  };

  const nameOf = (type)=>{
    const r = findRow(asg, type);
    if(!r) return "—";
    const h = r.person2Name ? (" / " + r.person2Name) : "";
    return (r.person1Name||"—") + h;
  };

  // Build a simplified mapping like your S-140 look
  const rowsTesoros = [
    rowHTML("20:00","", `Canción ${w?.meta?.songStart||""}`.trim(), ""),
    rowHTML("20:05","", "Palabras de introducción (1 min.)", ""),
    rowHTML("20:06","1", titleOf("Tesoros 1 (Discurso)") || "—", nameOf("Tesoros 1 (Discurso)")),
    rowHTML("20:16","2", titleOf("Tesoros 2 (Perlas)") || "—", nameOf("Tesoros 2 (Perlas)")),
    rowHTML("20:26","3", titleOf("Tesoros 3 (Lectura Biblia)") || "Lectura de la Biblia (4 mins.)", nameOf("Tesoros 3 (Lectura Biblia)")),
  ].join("");

  const rowsMaestros = [
    rowHTML("20:31","4", titleOf("Maestros 4") || "—", nameOf("Maestros 4")),
    rowHTML("20:35","5", titleOf("Maestros 5") || "—", nameOf("Maestros 5")),
    rowHTML("20:40","6", titleOf("Maestros 6") || "—", nameOf("Maestros 6")),
    // opcional 7 (si existiera en el futuro)
  ].join("");

  const rowsVida = [
    rowHTML("20:46","", `Canción ${w?.meta?.songMiddle||""}`.trim(), ""),
    rowHTML("20:50","8", titleOf("Vida Cristiana 8") || "—", nameOf("Vida Cristiana 8")),
    rowHTML("20:57","9", titleOf("Vida Cristiana 9") || "—", nameOf("Vida Cristiana 9")),
    rowHTML("21:05","#", "Estudio bíblico de la congregación (30 mins.)", `${nameOf("Estudio bíblico (Conductor)")} / ${findRow(asg,"Estudio bíblico (Lector)")?.person1Name||"—"}`),
    rowHTML("21:35","#", titleOf("Repaso y anuncios") || "Repaso de esta reunión, adelanto de la próxima y anuncios (3 mins.)", nameOf("Repaso y anuncios")),
    rowHTML("21:38","", `Canción ${w?.meta?.songEnd||""}`.trim(), ""),
  ].join("");

  const lectura = w?.meta?.bibleReading ? (`LECTURA SEMANAL DE LA BIBLIA | ${w.meta.bibleReading}`) : "LECTURA SEMANAL DE LA BIBLIA";

  return `
  <div class="week-card">
    <div class="week-top">
      <div class="week-left">
        <div style="font-weight:800">${datePretty}</div>
        <div class="small" style="margin-top:6px; font-weight:700">${lectura}</div>
      </div>
      <div class="week-right">
        <div><span class="label">Presidente:</span> <span class="val">${pres}</span></div>
        <div><span class="label">Oración:</span> <span class="val">${or1}</span></div>
        <div style="margin-top:10px"><span class="label">Oración:</span> <span class="val">${or2}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="sec-title sec-gray">TESOROS DE LA BIBLIA</div>
      <div class="rows">${rowsTesoros}</div>
    </div>

    <div class="section">
      <div class="sec-title sec-gold">SEAMOS MEJORES MAESTROS</div>
      <div class="rows">${rowsMaestros}</div>
    </div>

    <div class="section">
      <div class="sec-title sec-red">NUESTRA VIDA CRISTIANA</div>
      <div class="rows">${rowsVida}</div>
    </div>
  </div>
  `;
}

async function load(){
  hide();
  wrap.innerHTML="";
  const ym = monthInp.value;
  if(!ym){ show("Elegí un mes.", "warn"); return; }

  const weeks = thursdaysOfMonth(ym);
  if(!weeks.length){ show("Ese mes no tiene jueves (raro).", "warn"); return; }

  let ok=0, missing=[];
  for(let i=0;i<weeks.length;i++){
    const iso = weeks[i];
    const w = await loadWeek(iso);
    const asg = await loadAssignments(iso);
    if(!w){ missing.push(iso); continue; }
    wrap.insertAdjacentHTML("beforeend", renderWeek(iso, w, asg||[]));
    ok++;
    if((i%2)===1 && i<weeks.length-1){
      wrap.insertAdjacentHTML("beforeend", '<div class="pagebreak"></div>');
    }
  }

  if(missing.length){
    show("Faltan semanas guardadas: " + missing.map(fmtDateAR).join(", ") + ". Guardalas desde Semana.", "warn");
  }else{
    show("Listo. Semanas cargadas: " + ok, "ok");
  }
}

qs("#btnLoad").addEventListener("click", load);
qs("#btnPrint").addEventListener("click", ()=>window.print());

// Default month = current
const now = new Date();
monthInp.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
