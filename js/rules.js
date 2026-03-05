export const Rules = {
  // Marcelo's rules:
  // - Presidente: solo ancianos + quizá Marcelo Rodriguez
  // - Oración: solo hermanos aprobados
  // - Tesoros/Perlas: ancianos y SM
  // - Lectura Biblia: solo hermanos aprobados
  // - Maestros: hermanos/hermanas, excepto si la parte requiere solo hermanos
  // - Vida Cristiana: solo ancianos
  // - EBC Conductor: ancianos + Marcelo Rodriguez + Eduardo Rivadeneira
  // - EBC Lector: solo hermanos aprobados

  allowedFor(partType, person){
    const role = person.role || "";
    const sexo = person.sex || "";
    const approvedBrother = (sexo === "H" && person.approved === true);
    const can = person.can || {};
    const isElder = role === "Anciano";
    const isSM = role === "Siervo Ministerial";
    const name = (person.name||"").toLowerCase();

    const isMarceloRod = name.includes("marcelo") && name.includes("rodr");
    const isEduRiv = name.includes("eduardo") && name.includes("rivad");

    switch(partType){
      case "Presidente":
        return (can.presidir===true) || (can.presidir===false ? false : (isElder || isMarceloRod));
      case "Oración (inicio)":
      case "Oración (final)":
        return approvedBrother && (can.oracion===true || can.oracion===undefined);
      case "Tesoros 1 (Discurso)":
      case "Tesoros 2 (Perlas)":
      case "Tesoros 3 (Lectura Biblia)":
        if(partType === "Tesoros 3 (Lectura Biblia)") return approvedBrother && (can.oracion===true || can.oracion===undefined);
        return isElder || isSM;
      case "Maestros 4":
      case "Maestros 5":
      case "Maestros 6":
        // default: any active person with capability; specific constraints handled elsewhere
        return person.active !== false;
      case "Vida Cristiana 8":
      case "Vida Cristiana 9":
        return isElder;
      case "Estudio bíblico (Conductor)":
        return isElder || isMarceloRod || isEduRiv;
      case "Estudio bíblico (Lector)":
        return approvedBrother && (can.oracion===true || can.oracion===undefined);
      case "Repaso y anuncios":
        return isElder || isSM;
      default:
        return person.active !== false;
    }
  }
};

export function scoreCandidate({person, partType, historyByPerson}){
  // lower is better
  const h = historyByPerson[person.id] || [];
  const lastSame = [...h].reverse().find(x=>x.partType===partType);
  const lastDate = lastSame ? lastSame.weekISO : null;

  const totalLast8 = h.slice(-40).filter(x=>{
    // naive, history already limited by fetch in db; good enough
    return true;
  }).length;

  let score = 0;
  if(lastDate){
    // older date => better => lower score
    // Convert to days ago
    const d = new Date(lastDate+"T00:00:00");
    const daysAgo = Math.floor((Date.now()-d.getTime())/86400000);
    score += Math.max(0, 200 - daysAgo); // if long ago, smaller
  }else{
    score -= 50; // never did it => prioritize
  }
  score += totalLast8 * 3;
  if(person.role === "Anciano") score += 1; // small bias to distribute with others when possible
  return score;
}
