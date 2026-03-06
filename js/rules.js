import { weeksBetween } from "./app.js";

function isBrother(p){ return p.sex === "H"; }
function isSister(p){ return p.sex === "M"; }
function isElder(p){ return p.role === "Anciano"; }
function isMS(p){ return p.role === "Siervo Ministerial"; }
function isApprovedBrother(p){ return isBrother(p) && p.approved === true; }

export const Rules = {
  allowedFor(partType, person){
    if(person.active === false) return false;
    const can = person.can || {};
    const exact = (key, fallback)=> can[key] === true || (can[key] === undefined && fallback);

    switch(partType){
      case "Presidente":
        return exact("presidir", isElder(person) || isMS(person));
      case "Oración inicial":
      case "Oración final":
        return exact("orar", isApprovedBrother(person));
      case "Tesoros":
        return exact("tesoros", isElder(person) || isMS(person));
      case "Perlas":
        return exact("perlas", isElder(person) || isMS(person));
      case "Lectura de la Biblia":
        return exact("lecturaBiblia", isApprovedBrother(person));
      case "Asignación estudiantil":
        return exact("estudiante", !!person.student || isBrother(person) || isSister(person));
      case "Ayudante":
        return exact("ayudante", !!person.student || isBrother(person) || isSister(person));
      case "Discurso de estudiante":
        return exact("discursoEstudiante", isBrother(person));
      case "Nuestra vida cristiana":
        return exact("vidaCristiana", isElder(person) || isMS(person));
      case "Necesidades de la congregación":
        return exact("necesidades", isElder(person));
      case "Conductor EBC":
        return exact("conductorEbc", isElder(person) || isMS(person));
      case "Lector EBC":
        return exact("lectorEbc", isApprovedBrother(person));
      case "Discurso del viajante":
        return true;
      default:
        return person.active !== false;
    }
  },

  helperAllowed(mainPerson, helper){
    if(!helper || helper.active === false) return false;
    if(!mainPerson) return Rules.allowedFor("Ayudante", helper);
    if(!Rules.allowedFor("Ayudante", helper)) return false;
    if(mainPerson.id === helper.id) return false;
    const sameSex = mainPerson.sex && helper.sex && mainPerson.sex === helper.sex;
    const sameFamily = !!mainPerson.familyGroup && !!helper.familyGroup && mainPerson.familyGroup === helper.familyGroup;
    return sameSex || sameFamily;
  }
};

export function scoreCandidate({person, historyByPerson, currentWeekISO, currentUsedIds=new Set(), partType}){
  const hist = historyByPerson[person.id] || [];
  let lastAnyWeeks = 999;
  if(hist.length){
    const latest = hist.slice().sort((a,b)=>(b.weekISO||"").localeCompare(a.weekISO||""))[0];
    lastAnyWeeks = weeksBetween(latest.weekISO, currentWeekISO);
  }
  let score = 0;
  score -= Math.min(lastAnyWeeks, 999) * 10;
  score += hist.length;
  if(currentUsedIds.has(person.id)) score += 500;
  if(partType === "Presidente" && person.role === "Anciano") score -= 5;
  return score;
}
