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

function stripMarkdownArtifacts(text){
  return (text||"")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "")
    .replace(/\[\*\*([^\]]+?)\*\*\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+?)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_`>#]+/g, "")
    .replace(/ /g, " ");
}

function textFromHTML(html){
  const cleaned = stripTags(html);
  const doc = new DOMParser().parseFromString(cleaned, "text/html");
  const text = doc.body ? doc.body.innerText : "";
  return stripMarkdownArtifacts(text)
    .replace(//g,"")
    .replace(/[ 	]+/g," ")
    .replace(/
{3,}/g,"

")
    .trim();
}

function norm(s){ return (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase(); }
function compact(s){ return (s||"").replace(/\s+/g," ").trim(); }

function firstMatch(text, re){ const m = re.exec(text); return m ? m[1] || m[0] : ""; }

function parseSongAndPrayer(text){
  const matches = [...text.matchAll(/canci[oó]n\s+(\d+)/gi)].map(m=>m[1]);
  const uniq = [];
  for(const n of matches){ if(!uniq.includes(n)) uniq.push(n); }
  return {
    openingSong: uniq[0] || "",
    middleSong: uniq[1] || "",
    closingSong: uniq[2] || uniq[uniq.length-1] || ""
  };
}

function parseReading(text, tesSection=""){
  const cleanedTes = stripMarkdownArtifacts(tesSection || "");
  const specific = /3\.\s*Lectura de la Biblia\s*\([^)]*\)\s*([^
]+)/i.exec(cleanedTes)
    || /Lectura de la Biblia\s*\([^)]*\)\s*([^
]+)/i.exec(cleanedTes);
  if(specific) return compact(specific[1]).replace(/\s*,\s*/g, ", ");

  const cleaned = stripMarkdownArtifacts(text);
  const m = /([1-3]?\s?[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s+\d{1,3}(?::|,)[^
|]+)/i.exec(cleaned);
  return m ? compact(m[1]).replace(/\s*,\s*/g, ", ") : "";
}

function sectionBetween(text, startText, endTexts=[]){
  const lower = norm(text);
  const s = lower.indexOf(norm(startText));
  if(s === -1) return "";
  let e = lower.length;
  for(const end of endTexts){
    const i = lower.indexOf(norm(end), s + 5);
    if(i !== -1) e = Math.min(e, i);
  }
  return text.slice(s, e);
}

function blockAfterNumber(section, n){
  const lines = section.split("
").map(x=>x.trim()).filter(Boolean);
  const idx = lines.findIndex(l=> new RegExp(`^${n}\.\s`).test(l));
  if(idx === -1) return "";
  let out = [lines[idx]];
  for(let i=idx+1;i<lines.length;i++){
    if(/^\d+\.\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join(" ");
}

function parseMinutes(block){
  const m = /\((\d+)\s*mins?\.?(?:utos?)?\)/i.exec(block) || /\((\d+)\s*min/i.exec(block);
  return m ? Number(m[1]) : "";
}

function parseStudentType(title){
  const n = norm(title);
  if(n.includes("explique sus creencias") && n.includes("discurso")) return "Discurso de estudiante";
  if(n.includes("discurso")) return "Discurso de estudiante";
  return "Asignación estudiantil";
}

function parsePartTitle(block, n){
  let t = stripMarkdownArtifacts(block).replace(new RegExp(`^${n}\.\s*`),"").trim();
  t = t.replace(/\(\d+\s*mins?\.?(?:utos?)?\)/i,"").trim();
  return compact(t);
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
  const vida = sectionBetween(text, "NUESTRA VIDA CRISTIANA", ["Palabras de conclusión", "Palabras de conclusion"]);

  const songs = parseSongAndPrayer(text);
  const reading = parseReading(text, tes);
  const parts = [];

  const b1 = blockAfterNumber(tes, 1);
  const b2 = blockAfterNumber(tes, 2);
  const b3 = blockAfterNumber(tes, 3);
  if(b1) parts.push({ section:"Tesoros de la Biblia", type:"Tesoros", title:parsePartTitle(b1,1), minutes:parseMinutes(b1) || 10 });
  if(b2) parts.push({ section:"Tesoros de la Biblia", type:"Perlas", title:parsePartTitle(b2,2), minutes:parseMinutes(b2) || 10 });
  if(b3) parts.push({ section:"Tesoros de la Biblia", type:"Lectura de la Biblia", title:parsePartTitle(b3,3), minutes:parseMinutes(b3) || 4 });

  for(const n of [4,5,6]){
    const b = blockAfterNumber(maes, n);
    if(!b) continue;
    const title = parsePartTitle(b,n);
    parts.push({ section:"Seamos mejores maestros", type:parseStudentType(title), title, minutes:parseMinutes(b) || "", needsHelper: !/discurso/i.test(norm(title)) });
  }

  for(const n of [7,8]){
    const b = blockAfterNumber(vida, n);
    if(!b) continue;
    const title = parsePartTitle(b,n);
    const isNeeds = norm(title).includes("necesidades de la congregacion");
    parts.push({ section:"Nuestra vida cristiana", type:isNeeds ? "Necesidades de la congregación" : "Nuestra vida cristiana", title, minutes:parseMinutes(b) || "" });
  }

  const ebcBlock = blockAfterNumber(vida, 9) || firstMatch(vida, /(Estudio biblico de la congregacion[\s\S]{0,120})/i);
  if(ebcBlock && /estudio b/i.test(norm(ebcBlock))){
    const lesson = firstMatch(ebcBlock, /Estudio bíblico de la congregación\s*\((\d+\s*mins?\.?)\)/i);
    parts.push({ section:"Nuestra vida cristiana", type:"Conductor EBC", title:"Estudio bíblico de la congregación", minutes: lesson || 30 });
    parts.push({ section:"Nuestra vida cristiana", type:"Lector EBC", title:"Estudio bíblico de la congregación", minutes: lesson || 30 });
  }

  markUnsaved("Se cargó el programa desde WOL.");
  return {
    parts,
    meta: {
      reading,
      openingSong: songs.openingSong,
      middleSong: songs.middleSong,
      closingSong: songs.closingSong
    },
    rawTextSample: text.slice(0, 1500)
  };
}
