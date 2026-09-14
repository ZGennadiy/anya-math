import { validateAnswer } from './validation.js';
export const currentTask = state => state.tasks[state.index];
export function createGame(level, tasks, seed, practice=false, options={}) {
  return {level,tasks,seed,practice,runId:level.id+':'+seed,index:0,lives:3,phase:'answer',
    correct:0,mistakes:0,hints:0,hintStep:0,history:[],revision:0,recent:options.recent??[],
    timer:options.seconds ? {durationMs:options.seconds*1000,elapsedMs:0} : null};
}
export function submitAnswer(state, fields) {
  if(state.phase!=='answer') return {state,ignored:true};
  const validation=validateAnswer(currentTask(state),fields);
  if(!validation.valid) return {state,invalid:validation.field,message:validation.message};
  const correct=validation.correct, lives=state.lives-(!correct&&!state.practice?1:0);
  return {correct,state:{...state,lives,correct:state.correct+(correct?1:0),mistakes:state.mistakes+(correct?0:1),
    phase:correct?'correct':lives===0?'failed':'wrong',revision:state.revision+1,
    history:[...state.history,{taskId:currentTask(state).id,skill:currentTask(state).skillTag,correct}]}};
}
export function advance(state) {
  if(state.phase==='wrong') return {...state,phase:'answer'};
  if(state.phase!=='correct') return state;
  if(state.index===state.tasks.length-1) return {...state,phase:'completed'};
  return {...state,index:state.index+1,phase:'answer',hintStep:0};
}
export function useHint(state) {
  return ['answer','wrong'].includes(state.phase) && state.hintStep<3
    ? {...state,hints:state.hints+1,hintStep:state.hintStep+1} : state;
}
export function tickGameTimer(state, elapsedMs) {
  if(!state.practice||!state.timer||!['answer','wrong'].includes(state.phase)||!Number.isFinite(elapsedMs)||elapsedMs<=0) return state;
  const timer={...state.timer,elapsedMs:Math.min(state.timer.durationMs,state.timer.elapsedMs+elapsedMs)};
  return {...state,timer,phase:timer.elapsedMs>=timer.durationMs?'timedOut':state.phase};
}
export const starsForGame = state => state.phase==='completed'&&!state.practice ? state.lives : 0;
