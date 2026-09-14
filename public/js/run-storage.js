import { getLevel, GENERATOR_VERSION, MAX_RAW_LENGTH, RECENT_TASK_LIMIT } from './config.js';
import { createAttempt } from './generators.js';
import { createGame } from './game-state.js';

export function snapshotRun(game, fields, hintVisible = false) {
  if(!game||game.practice||!['answer','wrong','correct'].includes(game.phase)) return null;
  const {seed,index,lives,phase,correct,mistakes,hints,hintStep,history,revision,recent}=game;
  return {generatorVersion:GENERATOR_VERSION,levelId:game.level.id,seed,index,lives,phase,correct,mistakes,hints,hintStep,history,revision,recent,
    fields:{...fields},hintVisible};
}
export function restoreRun(snapshot) {
  try {
    const s=snapshot, level=getLevel(s?.levelId);
    if(!level||s.generatorVersion!==GENERATOR_VERSION||!['answer','wrong','correct'].includes(s.phase))return null;
    const bounded=(n,a,b)=>Number.isInteger(n)&&n>=a&&n<=b;
    if(!bounded(s.seed,0,4294967295)||!bounded(s.index,0,level.problemCount-1)||!bounded(s.lives,1,3)
      ||!bounded(s.correct,0,level.problemCount)||!bounded(s.mistakes,0,2)||s.lives!==3-s.mistakes
      ||s.correct!==s.index+(s.phase==='correct'?1:0)||!bounded(s.hints,0,level.problemCount*3)
      ||!bounded(s.hintStep,0,3)||!bounded(s.revision,0,level.problemCount+2))return null;
    if(!Array.isArray(s.recent)||s.recent.length>RECENT_TASK_LIMIT||s.recent.some(t=>typeof t!=='string'||t.length>800))return null;
    const tasks=createAttempt(level,s.seed,s.recent), ids=new Set(tasks.map(t=>t.id));
    if(!Array.isArray(s.history)||s.history.length!==s.correct+s.mistakes
      ||s.history.some(h=>!ids.has(h.taskId)||typeof h.correct!=='boolean')
      ||s.history.filter(h=>h.correct).length!==s.correct)return null;
    if(!s.fields||['answer','remainder','choice'].some(k=>typeof s.fields[k]!=='string'||s.fields[k].length>MAX_RAW_LENGTH))return null;
    const game={...createGame(level,tasks,s.seed,false,{recent:s.recent}),index:s.index,lives:s.lives,phase:s.phase,correct:s.correct,
      mistakes:s.mistakes,hints:s.hints,hintStep:s.hintStep,history:s.history,revision:s.revision};
    return {game,fields:{...s.fields},hintVisible:!!s.hintVisible};
  }catch{return null;}
}
