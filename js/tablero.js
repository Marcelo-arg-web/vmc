import { qs, Storage, fmtDateTitle, addDaysISO } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadWeek, loadAssignments, loadAppSettings } from "./data.js";

mountHeader();

const currentWeek = Storage.get("currentWeekISO", "");
const nextWeek = addDaysISO(currentWeek, 7);

function byType(asg, type){ return asg.find(x=>x.type===type); }
function rowsByType(asg, types){ return asg.filter(x=>types.includes(x.type)); }
function esc(s){ return String(s || "—").replace(/[&<>\"]/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }

function initialsForSection(type){
  if(type === "Tesoros") return "1";
  if(type === "Perlas") return "2";
  if(type === "Lectura de la Biblia") return "3";
  return "";
}

function buildWeekSheet(weekISO, app, w, asg){
  if(!w) return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(weekISO)}</div><div class="special-empty">No hay datos guardados para esta semana.</div></div>`;
  if(["asamblea","conmemoracion","sin_reunion"].includes(w.weekType)){
    return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(weekISO)}</div><div class="special-empty">Esta semana no hay reunión. ${esc(w.specialReason || "Motivo especial")}</div></div>`;
  }

  const pres = byType(asg, "Presidente")?.person1Name || "—";
  const or1 = byType(asg, "Oración inicial")?.person1Name || "—";
  const or2 = byType(asg, "Oración final")?.person1Name || "—";
  const tes = byType(asg, "Tesoros");
  const per = byType(asg, "Perlas");
  const lec = byType(asg, "Lectura de la Biblia");
  const students = rowsByType(asg, ["Asignación estudiantil","Discurso de estudiante"]);
  const vida = rowsByType(asg, ["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante"]);
  const conductor = byType(asg, "Conductor EBC");
  const lector = byType(asg, "Lector EBC");

  const studentRight = students.map((r, idx)=>`
    <div class="asg-row${r.person2Name ? '' : ' single'}">
      <div class="asg-name">${esc(r.person1Name || '—')}</div>
      <div class="asg-num">${idx+4}</div>
      <div>${r.person2Name ? esc(r.person2Name) : ''}</div>
    </div>`).join("");

  const tesRight = `
    <div class="asg-caption">Auditorio principal</div>
    <div class="asg-name">${esc(tes?.person1Name || '—')}</div>
    <div class="asg-name">${esc(per?.person1Name || '—')}</div>
    <div class="asg-row single"><div><span class="asg-name">${esc(lec?.person1Name || '—')}</span> <span class="asg-num">3</span></div></div>`;

  const vidaRows = vida.map(r=>`<div class="asg-name">${esc(r.person1Name || '—')}</div>`).join("");
  const lecturaTexto = lec?.detail ? `${esc(lec.title || 'Lectura de la Biblia')} — ${esc(lec.detail)}` : esc(lec?.title || 'Lectura de la Biblia');
  const ebcLabel = conductor || lector ? `<div class="footer-line"><div>Conductor/Lector: <b>${esc(conductor?.person1Name || '—')}</b> / ${esc(lector?.person1Name || '—')}</div><div class="right">Oración: ${esc(or2)}</div></div>` : `<div class="footer-line"><div></div><div class="right">Oración: ${esc(or2)}</div></div>`;

  return `
  <div class="week-sheet">
    <div class="week-top">
      <div>
        <div class="week-date">${fmtDateTitle(weekISO)}</div>
        <div class="week-reading">LECTURA SEMANAL DE LA BIBLIA | ${esc((w.reading || '').toUpperCase() || '—')}</div>
      </div>
      <div class="side-grid">
        <div class="label">Presidente:</div><div class="value">${esc(pres)}</div>
        <div class="label">Oración:</div><div class="value">${esc(or1)}</div>
      </div>
    </div>

    <div class="program-grid">
      <div>
        <div class="lines">
          <div class="line"><div class="time">${esc(w.meetingTime || '19:30')}</div><div class="dot">•</div><div class="topic">Canción ${esc(w.openingSong || '—')}</div></div>
          <div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">Palabras de introducción (1 min.)</div></div>
        </div>

        <div class="section-band tesoros">TESOROS DE LA BIBLIA</div>
        <div class="lines">
          <div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">${esc(tes?.title || '—')}${tes?.minutes ? ` (${tes.minutes} mins.)` : ''}</div></div>
          <div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">Busquemos perlas escondidas${per?.minutes ? ` (${per.minutes} mins.)` : ''}</div></div>
          <div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">${lecturaTexto}${lec?.minutes ? ` (${lec.minutes} mins.)` : ''}</div></div>
        </div>

        <div class="section-band maestros">SEAMOS MEJORES MAESTROS</div>
        <div class="lines">
          ${students.map(r=>`<div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">${esc(r.title || r.type)}${r.detail ? ` — ${esc(r.detail)}` : ''}${r.minutes ? ` (${r.minutes} mins.)` : ''}</div></div>`).join('')}
        </div>

        <div class="section-band vida">NUESTRA VIDA CRISTIANA</div>
        <div class="lines">
          <div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">Canción ${esc(w.middleSong || '—')}</div></div>
          ${vida.map(r=>`<div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">${esc(r.title || r.type)}${r.detail ? ` — ${esc(r.detail)}` : ''}${r.minutes ? ` (${r.minutes} mins.)` : ''}</div></div>`).join('')}
          ${conductor ? `<div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">${esc(conductor.title || 'Estudio bíblico de la congregación')}${conductor.detail ? ` — ${esc(conductor.detail)}` : ''} (${esc(conductor.minutes || 30)} mins.)</div></div>` : ''}
          <div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">Repaso de esta reunión, adelanto de la próxima y anuncios (3 mins.)</div></div>
          <div class="line"><div class="time"></div><div class="dot">•</div><div class="topic">Canción ${esc(w.closingSong || '—')}</div></div>
        </div>
      </div>

      <div>
        <div class="asg-block">${tesRight}</div>
        <div style="height:18px"></div>
        <div class="asg-block">
          <div class="asg-caption">Auditorio principal</div>
          ${studentRight || '<div class="asg-name">—</div>'}
        </div>
        <div style="height:22px"></div>
        <div class="asg-block">${vidaRows || '<div class="asg-name">—</div>'}</div>
      </div>
    </div>
    ${ebcLabel}
  </div>`;
}

async function load(){
  const app = await loadAppSettings();
  qs("#cong").textContent = `CONG.: \"${String(app.congregacion || "Villa Fiad").toUpperCase()}\"`;
  const weeks = [currentWeek, nextWeek].filter(Boolean);
  const data = await Promise.all(weeks.map(async iso => ({ iso, w: await loadWeek(iso), asg: await loadAssignments(iso) })));
  qs("#weeksContainer").innerHTML = data.map(x=>buildWeekSheet(x.iso, app, x.w, x.asg)).join("");
}

qs("#btnPrint").addEventListener("click", ()=>window.print());
load();
