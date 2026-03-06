import { qs, qsa, debounce, normalizeName } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadPeople, savePerson, deletePerson } from "./data.js";

mountHeader();


function stripAccents(s){
  return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function guessSexByName(fullName){
  const n = normalizeName(fullName||"");
  const first = stripAccents((n.split(" ")[0]||"")).toLowerCase();
  const fem = new Set([
    "erica","érica","paola","carmen","gloria","belen","belén","elida","élida","ruth","carla","maria","maría","ana","maricel","maricela"
  ]);
  const masc = new Set([
    "marcelo","sergio","leonardo","luis","eduardo","hugo","omar","epifanio","roberto","rodolfo","david","emanuel","martin","martín","braian","brian","isaias","isaías","facundo"
  ]);
  if(fem.has(first)) return "M";
  if(masc.has(first)) return "H";
  if(first.endsWith("a") && !["isaias","isaías","elias","matias","matías","luca"].includes(first)) return "M";
  return "";
}


  });
}


// Sugerencia automática de sexo (editable)
qs("#name").addEventListener("blur", ()=>{
  if(qs("#sex").value) return;
  const g = guessSexByName(qs("#name").value);
  if(g) qs("#sex").value = g;
});


// UI botones
qs('#btnPrev')?.addEventListener('click', goPrev);
qs('#btnNext')?.addEventListener('click', goNext);
qs('#btnShowList')?.addEventListener('click', ()=>showList(true));
qs('#btnToggleList')?.addEventListener('click', ()=>showList(false));
