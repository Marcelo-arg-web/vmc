import { markUnsaved } from "./app.js";

export function buildFetchUrl(wolUrl, proxyBase){
  const clean = (wolUrl||"").trim();
  if(!clean) return null;
  if(proxyBase) return proxyBase + encodeURIComponent(clean);
  return "https://r.jina.ai/http://" + clean.replace(/^https?:\/\//,"");
}

function compact(s){ return (s||"").replace(/\s+/g, " ").trim(); }
function norm(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
function escRE(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function cleanText(text){
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, "$1")
    .replace(/[*_`>]+/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function linesOf(text){
  return cleanText(text)
    .split("\n")
    .map(compact)
    .filter(Boolean)
    .filter(line => !/^Respuesta$/i.test(line))
    .filter(line => !/^Image:/i.test(line));
}

function parseReading(lines){
  for(let i=0;i<lines.length;i++){
    if(/lectura semanal de la biblia/i.test(lines[i])){
      const same = compact(lines[i].replace(/.*lectura semanal de la biblia\s*[|:]?\s*/i, ""));
      if(same) return same;
      for(let j=i+1;j<Math.min(i+4, lines.length);j++){
        if(/^[#\d]/.test(lines[j])) continue;
        if(/canci[oó]n/i.test(lines[j])) continue;
        return lines[j];
      }
    }
  }
  const direct = lines.find(line => /^(?:#+\s*)?[1-3]?\s?[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]+\d+(?:,\s*\d+)?$/.test(line));
  return direct ? direct.replace(/^#+\s*/, "") : "";
}

function parseSongs(lines){
  const nums = [];
  for(const line of lines){
    const matches = [...line.matchAll(/canci[oó]n\s+(\d+)/ig)];
    for(const m of matches) nums.push(m[1]);
  }
  return {
    openingSong: nums[0] || "",
    middleSong: nums[1] || "",
    closingSong: nums.at(-1) || ""
  };
}

function findIndex(lines, pattern, from=0){
  return lines.findIndex((line, idx) => idx >= from && pattern.test(norm(line)));
}

function parseMinutes(line){
  const m = line.match(/\((\d+)\s*min/i);
  return m ? Number(m[1]) : "";
}

function parseStudyDetail(lines, index){
  const out = [];
  for(let i=index+1;i<Math.min(index+4, lines.length);i++){
    const line = lines[i];
    if(/^###?\s*\d+[.)]?\s+/.test(line)) break;
    if(/^###?\s*palabras de conclusi[oó]n/i.test(line)) break;
    if(/^##\s+/.test(line)) break;
    if(/^(repaso de esta reunion|palabras de conclusion|canci[oó]n)/i.test(norm(line))) break;
    if(/^\(\d+\s*min/i.test(line)) continue;
    out.push(line);
  }
  return compact(out.join(" "));
}

function parseProgram(lines){
  const parts = [];

  const treasuresStart = findIndex(lines, /tesoros de la biblia/);
  const teachersStart = findIndex(lines, /seamos mejores maestros/);
  const christianStart = findIndex(lines, /nuestra vida cristiana/);

  let treasureTitle = "Tesoros de la Biblia";
  let treasureMinutes = 10;
  let readingPassage = "";
  let readingMinutes = 4;

  for(let i=treasuresStart+1; i<(teachersStart === -1 ? lines.length : teachersStart); i++){
    const line = lines[i];
    let m = line.match(/^###?\s*1\.\s+(.+)$/i);
    if(m){
      treasureTitle = compact(m[1]);
      treasureMinutes = parseMinutes(lines[i+1]) || 10;
      continue;
    }
    m = line.match(/^###?\s*3\.\s+Lectura de la Biblia$/i);
    if(m){
      const next = lines[i+1] || "";
      readingMinutes = parseMinutes(next) || 4;
      const pm = next.match(/\)\s*([^()]+?)(?:\s*\(|$)/);
      if(pm) readingPassage = compact(pm[1].replace(/[.;]$/, ""));
    }
  }

  parts.push({ section:"Tesoros de la Biblia", type:"Tesoros", title:treasureTitle, minutes:treasureMinutes });
  parts.push({ section:"Tesoros de la Biblia", type:"Perlas", title:"Busquemos perlas escondidas", minutes:10 });
  parts.push({ section:"Tesoros de la Biblia", type:"Lectura de la Biblia", title:"Lectura de la Biblia", minutes:readingMinutes, detail: readingPassage });

  for(let i=teachersStart+1; i<(christianStart === -1 ? lines.length : christianStart); i++){
    const line = lines[i];
    const m = line.match(/^###?\s*(\d+)\.\s+(.+)$/i);
    if(!m) continue;
    const title = compact(m[2]);
    const detailLine = lines[i+1] || "";
    const minutes = parseMinutes(detailLine) || "";
    let detail = compact(detailLine.replace(/^\((\d+)\s*mins?\.?(?:\)|\))?\s*/i, ""));
    const lessonIdx = detail.search(/\(.*lecci[oó]n/i);
    if(lessonIdx > 0) detail = compact(detail.slice(0, lessonIdx));
    const n = norm(title);
    parts.push({
      section:"Seamos mejores maestros",
      type:(n.includes("discurso") ? "Discurso de estudiante" : "Asignación estudiantil"),
      title,
      minutes,
      detail,
      needsHelper: !n.includes("discurso")
    });
  }

  for(let i=christianStart+1; i<lines.length; i++){
    const line = lines[i];
    if(/palabras de conclusion|palabras de conclusión/i.test(norm(line))) break;
    const m = line.match(/^###?\s*(\d+)\.\s+(.+)$/i);
    if(!m) continue;
    const title = compact(m[2]);
    const n = norm(title);
    const next = lines[i+1] || "";
    const minutes = parseMinutes(next) || "";
    if(n.includes("estudio biblico de la congregacion")){
      let detail = compact(next.replace(/^\((\d+)\s*mins?\.?(?:\)|\))?\s*/i, ""));
      if(!detail) detail = parseStudyDetail(lines, i);
      parts.push({ section:"Nuestra vida cristiana", type:"Conductor EBC", title:"Estudio bíblico de la congregación", minutes: minutes || 30, detail });
      parts.push({ section:"Nuestra vida cristiana", type:"Lector EBC", title:"Estudio bíblico de la congregación", minutes: minutes || 30, detail });
    } else {
      parts.push({
        section:"Nuestra vida cristiana",
        type: n.includes("necesidades de la congregacion") ? "Necesidades de la congregación" : "Nuestra vida cristiana",
        title,
        minutes,
        detail: ""
      });
    }
  }

  return parts;
}

export async function fetchAndParseWOL({ wolUrl, proxyBase=null }){
  const url = buildFetchUrl(wolUrl, proxyBase);
  if(!url) throw new Error("Pegá un link de WOL.");
  const res = await fetch(url);
  if(!res.ok) throw new Error("No se pudo leer WOL.");
  const raw = await res.text();
  const lines = linesOf(raw);
  const reading = parseReading(lines);
  const songs = parseSongs(lines);
  const parts = parseProgram(lines);

  markUnsaved("Se cargó el programa desde WOL.");
  return {
    parts,
    meta: {
      reading,
      openingSong: songs.openingSong,
      middleSong: songs.middleSong,
      closingSong: songs.closingSong,
      ebcTitle: "Estudio bíblico de la congregación"
    },
    rawTextSample: lines.slice(0, 160).join("\n")
  };
}
