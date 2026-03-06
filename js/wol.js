import { markUnsaved } from "./app.js";

export function buildFetchUrl(wolUrl, proxyBase){
  const clean = (wolUrl || "").trim();
  if(!clean) return null;
  if(proxyBase) return proxyBase + encodeURIComponent(clean);
  return "https://r.jina.ai/http://" + clean.replace(/^https?:\/\//, "");
}

function normalizeText(raw){
  return (raw || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\[\*\*([^\]]+?)\*\*\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+?)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_`>#]+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(s){
  return (s || "").replace(/^[•*]\s*/, "").replace(/\s+/g, " ").trim();
}

function norm(s){
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function compact(s){
  return cleanLine(s);
}

function parseMinutes(lines, startIndex){
  for(let i=startIndex + 1; i < Math.min(lines.length, startIndex + 4); i++){
    const m = /\((\d+)\s*mins?\.?|\((\d+)\s*minutos?\.?/i.exec(lines[i]);
    if(m) return Number(m[1] || m[2]);
  }
  return "";
}

function nextContentLine(lines, startIndex){
  for(let i=startIndex + 1; i < lines.length; i++){
    const line = lines[i];
    if(/^##\s+/i.test(line) || /^###\s+\d+\./i.test(line) || /^###\s+canci[oó]n/i.test(line) || /^###\s+palabras de conclusi/i.test(line)) break;
    const cleaned = cleanLine(line);
    if(!cleaned) continue;
    if(/^\((\d+)\s*mins?\.?|\((\d+)\s*minutos?\.?/i.test(cleaned)) continue;
    if(/^respuesta$/i.test(cleaned)) continue;
    if(/^para investigar:/i.test(cleaned)) continue;
    return cleaned;
  }
  return "";
}

export async function fetchAndParseWOL({ wolUrl, proxyBase = null }){
  const url = buildFetchUrl(wolUrl, proxyBase);
  if(!url) throw new Error("Pegá un link de WOL.");

  const res = await fetch(url);
  if(!res.ok) throw new Error("No se pudo leer WOL.");

  const raw = await res.text();
  const text = normalizeText(raw);
  const lines = text.split("\n").map(cleanLine).filter(Boolean);

  let reading = "";
  let openingSong = "";
  let middleSong = "";
  let closingSong = "";
  const parts = [];

  const readingLine = lines.find(l => /^##\s+[1-3]?\s*[A-ZÁÉÍÓÚÑ]/.test(l) && !/tesoros|seamos mejores maestros|nuestra vida cristiana/i.test(norm(l)));
  if(readingLine) reading = compact(readingLine.replace(/^##\s+/, ""));

  const openLine = lines.find(l => /^###\s*canci[oó]n\s+\d+\s+y\s+oraci[oó]n/i.test(norm(l)));
  if(openLine){
    const m = /canci[oó]n\s+(\d+)/i.exec(openLine);
    openingSong = m ? m[1] : "";
  }

  const closingLine = lines.find(l => /^###\s*palabras de conclusi/i.test(norm(l)));
  if(closingLine){
    const m = /canci[oó]n\s+(\d+)/i.exec(closingLine);
    closingSong = m ? m[1] : "";
  }

  let section = "";
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    const lineNorm = norm(line);

    if(/^##\s+tesoros de la biblia/i.test(lineNorm)){
      section = "tesoros";
      continue;
    }
    if(/^##\s+seamos mejores maestros/i.test(lineNorm)){
      section = "maestros";
      continue;
    }
    if(/^##\s+nuestra vida cristiana/i.test(lineNorm)){
      section = "vida";
      continue;
    }

    if(section === "vida" && !middleSong && /^###\s*canci[oó]n\s+\d+$/i.test(lineNorm)){
      const m = /canci[oó]n\s+(\d+)/i.exec(line);
      middleSong = m ? m[1] : "";
      continue;
    }

    const partMatch = /^###\s+(\d+)\.\s+(.+)$/.exec(line);
    if(!partMatch) continue;

    const num = Number(partMatch[1]);
    const title = compact(partMatch[2]);
    const minutes = parseMinutes(lines, i);
    const contentLine = nextContentLine(lines, i);

    if(section === "tesoros"){
      if(num === 1) parts.push({ section:"Tesoros de la Biblia", type:"Tesoros", title, minutes: minutes || 10 });
      if(num === 2) parts.push({ section:"Tesoros de la Biblia", type:"Perlas", title, minutes: minutes || 10 });
      if(num === 3) parts.push({ section:"Tesoros de la Biblia", type:"Lectura de la Biblia", title: contentLine || title, minutes: minutes || 4 });
      continue;
    }

    if(section === "maestros"){
      const titleNorm = norm(title);
      const type = titleNorm.includes("discurso") ? "Discurso de estudiante" : "Asignación estudiantil";
      const finalTitle = contentLine ? `${title} — ${contentLine}` : title;
      parts.push({ section:"Seamos mejores maestros", type, title: finalTitle, minutes: minutes || "", needsHelper: type !== "Discurso de estudiante" });
      continue;
    }

    if(section === "vida"){
      const titleNorm = norm(title);
      if(titleNorm.includes("estudio biblico de la congregacion")){
        parts.push({ section:"Nuestra vida cristiana", type:"Conductor EBC", title:"Estudio bíblico de la congregación", minutes: minutes || 30 });
        parts.push({ section:"Nuestra vida cristiana", type:"Lector EBC", title:"Estudio bíblico de la congregación", minutes: minutes || 30 });
      }else{
        parts.push({
          section:"Nuestra vida cristiana",
          type: titleNorm.includes("necesidades de la congregacion") ? "Necesidades de la congregación" : "Nuestra vida cristiana",
          title,
          minutes: minutes || ""
        });
      }
    }
  }

  if(!middleSong){
    const songLines = lines.filter(l => /^###\s*canci[oó]n\s+\d+/i.test(norm(l))).map(l => ((/canci[oó]n\s+(\d+)/i.exec(l) || [])[1] || ""));
    if(songLines.length >= 2) middleSong = songLines[1] || "";
    if(songLines.length >= 3 && !closingSong) closingSong = songLines[2] || "";
  }

  markUnsaved("Se cargó el programa desde WOL.");
  return {
    parts,
    meta: { reading, openingSong, middleSong, closingSong },
    rawTextSample: text.slice(0, 1500)
  };
}
