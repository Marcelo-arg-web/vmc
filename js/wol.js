import { markUnsaved } from "./app.js";

export function buildFetchUrl(wolUrl, proxyBase){
  const clean = (wolUrl||"").trim();
  if(!clean) return null;
  if(proxyBase) return proxyBase + encodeURIComponent(clean);
  return "https://r.jina.ai/http://" + clean.replace(/^https?:\/\//,"");
}

function stripTags(html){
  return html.replace(/<script[\s\S]*?<\/script>/gi,"")
             .replace(/<style[\s\S]*?<\/style>/gi,"");
}

function cleanMarkdownArtifacts(text){
  return text
    .replace(/\*\*/g, "")
    .replace(/\[[^\]]*\]\((?:https?:\/\/)?[^)]+\)/g, "")
    .replace(/\]\((?:https?:\/\/)?[^)]+\)/g, "")
    .replace(/[_`>#]+/g, " ")
    .replace(/\s+\|\s+/g, " | ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function textFromHTML(html){
  const cleaned = stripTags(html);
  const doc = new DOMParser().parseFromString(cleaned, "text/html");
  const text = doc.body ? (doc.body.innerText || doc.body.textContent || "") : cleaned;
  return cleanMarkdownArtifacts(text.replace(/\r/g, ""));
}

function norm(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase(); }
function compact(s){ return (s||"").replace(/\s+/g," ").trim(); }
function titleCaseBible(s){ return compact(s).replace(/\b([a-záéíóúñ])/g, m=>m.toUpperCase()); }

function parseReading(text){
  const lines = text.split("\n").map(compact).filter(Boolean);
  const readingLine = lines.find(l=>/lectura semanal de la biblia/i.test(l));
  if(readingLine){
    const cleaned = readingLine
      .replace(/lectura semanal de la biblia/i, "")
      .replace(/[|:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return titleCaseBible(cleaned.replace(/\b(\d+),\s*(\d+)\b/g, "$1, $2"));
  }
  const m = text.match(/([1-3]?\s?[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s+\d+[\s,:-]*\d*)/);
  return m ? titleCaseBible(m[1]) : "";
}

function sectionBetween(text, startText, endTexts=[]){
  const lines = text.split("\n");
  const startIdx = lines.findIndex(l=>norm(l).includes(norm(startText)));
  if(startIdx === -1) return "";
  let endIdx = lines.length;
  for(let i=startIdx+1;i<lines.length;i++){
    const nl = norm(lines[i]);
    if(endTexts.some(e=> nl.includes(norm(e)))){ endIdx = i; break; }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

function extractSongAfter(anchor, text){
  const lines = text.split("\n").map(compact).filter(Boolean);
  const idx = lines.findIndex(l=>norm(l).includes(norm(anchor)));
  if(idx === -1) return "";
  for(let i=idx;i>=Math.max(0, idx-2);i--){
    const m = lines[i].match(/canci[oó]n\s+(\d+)/i);
    if(m) return m[1];
  }
  for(let i=idx;i<Math.min(lines.length, idx+4);i++){
    const m = lines[i].match(/canci[oó]n\s+(\d+)/i);
    if(m) return m[1];
  }
  return "";
}

function parseSongs(text, vidaSection){
  const lines = text.split("\n").map(compact).filter(Boolean);
  const songNums = [];
  for(const line of lines){
    const m = line.match(/canci[oó]n\s+(\d+)/i);
    if(m) songNums.push(m[1]);
  }
  const openingSong = extractSongAfter("palabras de introduccion", text) || songNums[0] || "";
  const middleSong = extractSongAfter("nuestra vida cristiana", vidaSection || text) || songNums.find(n=>n !== openingSong) || "";
  let closingSong = "";
  for(let i=lines.length-1;i>=0;i--){
    const m = lines[i].match(/canci[oó]n\s+(\d+)/i);
    if(m){ closingSong = m[1]; break; }
  }
  return { openingSong, middleSong: middleSong === closingSong ? "" : middleSong, closingSong };
}

function parseMinutes(line){
  const m = line.match(/\((\d+)\s*min/i);
  return m ? Number(m[1]) : "";
}

function parseLinesFromSection(section){
  return section.split("\n")
    .map(compact)
    .filter(Boolean)
    .map(line=>line.replace(/^\d{1,2}:\d{2}\s+/, ""))
    .filter(line=>/^\d+\s/.test(line) || /^#\s*estudio/i.test(line));
}

function parsePartLine(line){
  const normalized = line.replace(/^#\s*/, "9 ");
  const num = normalized.match(/^(\d+)\s+/)?.[1] || "";
  let title = normalized.replace(/^\d+\s+/, "").trim();
  const minutes = parseMinutes(title);
  title = compact(title.replace(/\((\d+)\s*min[^)]*\)/i, ""));
  return { num:Number(num||0), title, minutes };
}

function parseStudentType(title){
  const n = norm(title);
  if(n.includes("explique sus creencias") && n.includes("discurso")) return "Discurso de estudiante";
  if(n.includes("discurso")) return "Discurso de estudiante";
  return "Asignación estudiantil";
}

export async function fetchAndParseWOL({ wolUrl, proxyBase=null }){
  const url = buildFetchUrl(wolUrl, proxyBase);
  if(!url) throw new Error("Pegá un link de WOL.");
  const res = await fetch(url);
  if(!res.ok) throw new Error("No se pudo leer WOL.");
  const html = await res.text();
  const text = textFromHTML(html);

  const tes = sectionBetween(text, "TESOROS DE LA BIBLIA", ["SEAMOS MEJORES MAESTROS", "NUESTRA VIDA CRISTIANA"]);
  const maes = sectionBetween(text, "SEAMOS MEJORES MAESTROS", ["NUESTRA VIDA CRISTIANA"]);
  const vida = sectionBetween(text, "NUESTRA VIDA CRISTIANA", ["repaso de esta reunion", "palabras de conclusion", "repaso de esta reunión"]);
  const songs = parseSongs(text, vida);
  const reading = parseReading(text);

  const parts = [];
  const tesLines = parseLinesFromSection(tes).map(parsePartLine);
  if(tesLines[0]) parts.push({ section:"Tesoros de la Biblia", type:"Tesoros", title:tesLines[0].title || "Tesoros de la Biblia", minutes:tesLines[0].minutes || 10 });
  if(tesLines[1]) parts.push({ section:"Tesoros de la Biblia", type:"Perlas", title:"Busquemos perlas escondidas", minutes:tesLines[1].minutes || 10 });
  if(tesLines[2]) parts.push({ section:"Tesoros de la Biblia", type:"Lectura de la Biblia", title:`Lectura de la Biblia${reading ? " — " + reading : ""}`, minutes:tesLines[2].minutes || 4, detail: reading });

  const maesLines = parseLinesFromSection(maes).map(parsePartLine);
  for(const row of maesLines){
    if(!row.title) continue;
    parts.push({ section:"Seamos mejores maestros", type:parseStudentType(row.title), title:row.title, minutes:row.minutes || "", needsHelper: !/discurso/i.test(norm(row.title)) });
  }

  const vidaLines = parseLinesFromSection(vida).map(parsePartLine);
  let ebcTitle = "";
  for(const row of vidaLines){
    const n = norm(row.title);
    if(n.includes("cancion")) continue;
    if(n.includes("estudio biblico de la congregacion")){
      ebcTitle = row.title;
      parts.push({ section:"Nuestra vida cristiana", type:"Conductor EBC", title:row.title, minutes:row.minutes || 30 });
      parts.push({ section:"Nuestra vida cristiana", type:"Lector EBC", title:row.title, minutes:row.minutes || 30 });
      continue;
    }
    const isNeeds = n.includes("necesidades de la congregacion");
    parts.push({ section:"Nuestra vida cristiana", type:isNeeds ? "Necesidades de la congregación" : "Nuestra vida cristiana", title:row.title, minutes:row.minutes || "" });
  }

  markUnsaved("Se cargó el programa desde WOL.");
  return {
    parts,
    meta: {
      reading,
      openingSong: songs.openingSong,
      middleSong: songs.middleSong,
      closingSong: songs.closingSong,
      ebcTitle
    },
    rawTextSample: text.slice(0, 2000)
  };
}
