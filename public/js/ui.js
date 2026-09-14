import { WORLDS, LEVELS, getLevel, TOTAL_STAGES, TOTAL_STARS } from './config.js';
import { currentTask } from './game-state.js';
import { totalStars } from './storage.js';
import { renderMascot } from './mascots.js';
import { ru, starWord } from './strings.js';

export const $ = id => document.getElementById(id);
export const show = (id, visible) => { $(id).hidden = !visible; };
const escape = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const paths = {
  arrow:'M5 12h14m-6-6 6 6-6 6',back:'M19 12H5m6-6-6 6 6 6',check:'m5 12 4 4L19 6',close:'m6 6 12 12M18 6 6 18',
  book:'M12 6v15M3 4h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3z',
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z',
  bulb:'M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2',
  keyboard:'M3 5h18v14H3zM6 9h.1M10 9h.1M14 9h.1M18 9h.1M6 13h.1M10 13h.1M14 13h.1M18 13h.1M8 16h8',
  lock:'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3',backspace:'m9 5-7 7 7 7h12V5z m4 4 5 6m0-6-5 6',
  restart:'M3 11a9 9 0 1 1 3 8M3 4v7h7',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2'
};
export const icon = (name, extra='') => '<svg class="icon '+extra+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]??paths.star)+'"/></svg>';
export function initIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML=icon(el.dataset.icon); }); }
const stars = n => Array.from({length:3},(_,i)=>'<span class="'+(i<n?'earned':'unearned')+'" aria-hidden="true">★</span>').join('');
export function setScreen(screen) {
  for(const name of ['home','game','table','results']) show('screen-'+name,name===screen);
  document.body.dataset.screen=screen;
}
export function wallet(progress) {
  const sum=totalStars(progress);
  $('star-total').textContent=sum;
  $('wallet').setAttribute('aria-label',ru.wallet(sum,TOTAL_STARS));
}
export function renderHome(progress, savedRun=null) {
  wallet(progress);
  const next=getLevel(savedRun?.game.level.id??progress.currentLevel), world=WORLDS[next.chapter-1];
  const first=progress.completedLevels.length===0, all=progress.completedLevels.length===TOTAL_STAGES;
  $('mission-label').textContent=world.title;
  $('launch-title').innerHTML=all?ru.allTitle:first?ru.firstTitle:ru.returnTitle;
  $('launch-description').textContent=savedRun?ru.resumeDescription(next.id,savedRun.game.index+1):all?ru.allDescription:first?ru.firstDescription:ru.returnDescription;
  $('continue-game').innerHTML=(savedRun?ru.resume:first?ru.start:ru.continue)+' '+icon('arrow');
  $('mission-meta').textContent=ru.missionMeta(next);
  $('map-progress').textContent=ru.mapProgress(progress.completedLevels.length,TOTAL_STAGES);
  $('world-map').innerHTML=WORLDS.map(w=>{
    const levels=LEVELS.filter(l=>l.chapter===w.id), unlocked=levels.some(l=>l.id<=progress.unlockedLevel), active=next.chapter===w.id;
    const collected=levels.reduce((sum,l)=>sum+(progress.bestStarsByLevel[l.id]??0),0);
    return '<article class="world-card '+w.color+(active?' active-world':'')+(!unlocked?' locked-world':'')+'">'+
      '<div class="world-top"><span class="world-symbol '+(w.symbol.length>1?'compact-symbol':'')+'" aria-hidden="true">'+w.symbol+'</span><span class="world-index">'+String(w.id).padStart(2,'0')+'</span><span class="world-status">'+(collected?collected+' / 9 ★':active?ru.current:unlocked?ru.open:icon('lock'))+'</span></div>'+
      '<h3>'+w.title+'</h3><p>'+w.subtitle+'</p><div class="level-path">'+levels.map(l=>{
        const locked=l.id>progress.unlockedLevel,n=progress.bestStarsByLevel[l.id]??0;
        return '<div class="level-stop"><button type="button" class="level-button '+(n?'completed ':'')+(l.id===next.id?'current ':'')+(l.isBoss?'boss':'')+'" data-level="'+l.id+'" '+(locked?'disabled':'')+' aria-label="'+escape(ru.levelLabel(l,locked,n))+'" '+(l.id===next.id?'aria-current="step"':'')+'>'+
          (locked?icon('lock'):'<span>'+l.id+'</span>')+'</button><span class="round-label">'+l.roundTitle+'</span><span class="level-stars" aria-label="'+n+' '+starWord(n)+'">'+stars(n)+'</span></div>';
      }).join('')+'</div></article>';
  }).join('');
}
export function renderTimer(state) {
  show('practice-timer',!!state.timer);
  if(state.timer) $('practice-timer').textContent=ru.timerRemaining(Math.ceil((state.timer.durationMs-state.timer.elapsedMs)/1000));
}
export function renderHint(state, visible) {
  const task=currentTask(state), open=visible&&state.hintStep>0&&['answer','wrong'].includes(state.phase);
  show('hint-panel',open);
  $('hint-button').setAttribute('aria-expanded',String(open));
  $('hint-button').disabled=!['answer','wrong'].includes(state.phase);
  if(open) {
    $('hint-heading').textContent=ru.hintLabel(state.hintStep);
    $('hint-text').textContent=task.hints[state.hintStep-1];
    $('hint-next').textContent=state.hintStep<3?ru.hintNext:ru.hintDone;
  }
  const reaction=state.phase==='correct'?'correct':state.phase==='wrong'?'almost':open?'hint':'thinking';
  renderMascot(document.querySelector('.mascot-game'),reaction);
  [$('companion-title').textContent,$('companion-message').textContent]=ru.companion[reaction];
}
export function renderGame(state, fields, hintVisible=false) {
  const task=currentTask(state), active=state.phase==='answer', remainder=task.kind==='remainder', choice=!!task.choices;
  $('game-title').textContent=state.level.title;
  $('game-eyebrow').textContent=state.practice?(state.timer?ru.speed:ru.practice):ru.missionMeta(state.level);
  $('task-counter').textContent=ru.questionCount(state.index+1,state.tasks.length);
  $('task-progress').max=state.tasks.length; $('task-progress').value=state.index+(state.phase==='correct'?1:0);
  $('game-badge').textContent=state.practice?ru.practice:state.level.isSiriusPlus?ru.advanced:state.level.isBoss?ru.trial:state.level.roundTitle;
  $('hearts').innerHTML=state.practice?'<span aria-hidden="true">∞</span>':Array.from({length:3},(_,i)=>icon('heart',i<state.lives?'filled':'spent')).join('');
  $('hearts').setAttribute('aria-label',state.practice?ru.practiceLives:ru.lives(state.lives));
  $('task-kind').textContent=task.skill==='findError'?ru.findError:ru.taskLabels[task.kind];
  $('task-number').textContent=String(state.index+1).padStart(2,'0');
  $('expression').textContent=task.prompt;
  $('expression').setAttribute('aria-label',task.accessibleText);
  $('expression').classList.toggle('word-problem',task.prompt.length>38);
  $('expression').classList.toggle('long-expression',task.prompt.length>19&&task.prompt.length<=38);
  show('number-fields',!choice); show('remainder-wrap',remainder); show('choice-fields',choice); show('input-help',!choice);
  $('answer-label').textContent=remainder?ru.quotient:task.kind==='missingNumber'?ru.missing:ru.answer;
  $('answer-input').enterKeyHint=remainder?'next':'done';
  $('input-help').textContent=remainder?ru.remainderHelp:ru.inputHelp;
  for(const field of ['answer','remainder']) {
    const input=$(field+'-input');
    input.disabled=!active; input.removeAttribute('aria-invalid');
    if(input.value!==fields[field]) input.value=fields[field];
  }
  if(choice) $('choice-fields').innerHTML=task.choices.map(c=>'<button class="choice-button" type="button" data-choice="'+escape(c.value)+'" aria-pressed="'+(String(c.value)===fields.choice)+'" '+(!active?'disabled':'')+'>'+escape(c.label)+'</button>').join('');
  $('keypad').closest('aside').hidden=choice;
  document.querySelectorAll('#keypad button').forEach(button=>button.disabled=!active);
  $('submit-answer').disabled=!active;
  show('retry-answer',state.phase==='wrong');
  $('feedback').dataset.type=state.phase;
  $('feedback').textContent=state.phase==='correct'?ru.correct:state.phase==='wrong'?ru.wrong+' '+task.hints[0]:'';
  renderHint(state,hintVisible);
  renderTimer(state);
}
export function renderReference(mode, factors, cell=[7,8], mixed=false) {
  document.querySelectorAll('[data-mode]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.mode===mode)));
  const numbers=Array.from({length:8},(_,i)=>i+2),sym=mode==='multiply'?'×':'÷';
  $('factor-buttons').innerHTML=numbers.map(n=>'<button type="button" data-factor="'+n+'" aria-pressed="'+factors.includes(n)+'" aria-label="Тренировать '+sym+n+'">'+n+'</button>').join('');
  $('times-grid').innerHTML='<caption>'+ru.tableCaption(mode)+'</caption><thead><tr><th scope="col">'+sym+'</th>'+numbers.map(n=>'<th scope="col">'+n+'</th>').join('')+'</tr></thead><tbody>'+numbers.map(row=>'<tr><th scope="row">'+row+'</th>'+numbers.map(col=>'<td class="'+(factors.includes(col)?'highlight':'')+'"><button type="button" data-cell="'+row+','+col+'" aria-pressed="'+(row===cell[0]&&col===cell[1])+'" aria-label="'+(mode==='multiply'?row+' умножить на '+col+' равно '+row*col:row*col+' разделить на '+col+' равно '+row)+'">'+(mode==='multiply'?row*col:'<small>'+row*col+' ÷ '+col+'</small><b>'+row+'</b>')+'</button></td>').join('')+'</tr>').join('')+'</tbody>';
  $('times-grid').classList.toggle('division-grid',mode==='divide');
  const [a,b]=cell,n=a*b;
  $('fact-family').innerHTML='<p>'+a+' × '+b+' = <strong>'+n+'</strong></p><div><span>'+b+' × '+a+' = '+n+'</span><span>'+n+' ÷ '+a+' = '+b+'</span><span>'+n+' ÷ '+b+' = '+a+'</span></div>';
  $('practice-title').textContent=ru.practiceTitle(factors);
  const factor=factors[0];
  $('fact-list').innerHTML=numbers.slice(0,4).map(n=>'<div>'+(mode==='multiply'?factor+' × '+n:factor*n+' ÷ '+factor)+'<span>= <b>'+(mode==='multiply'?factor*n:n)+'</b></span></div>').join('');
  $('start-practice').innerHTML=ru.practiceStart(mixed?'mixed':mode,false)+' '+icon('arrow');
}
export function renderResults(state, progress, recovery=null) {
  const complete=state.phase==='completed',n=complete&&!state.practice?state.lives:0;
  const kind=state.phase==='timedOut'?'timedOut':state.practice?'practice':complete?(state.level.id===TOTAL_STAGES?'all':'complete'):'failed';
  $('result-eyebrow').textContent=state.practice?(state.timer?ru.speed:ru.practice):complete?ru.result.stageDone(state.level.id):ru.journey;
  renderMascot(document.querySelector('.mascot-result'),complete?'levelComplete':kind==='failed'?'noLives':'correct');
  $('result-stars').innerHTML=state.practice?'':stars(n);
  $('result-stars').setAttribute('aria-label',n+' '+starWord(n));
  $('results-title').textContent=ru.result[kind];
  $('result-description').textContent=ru.result[kind+'Text'];
  show('best-result',!state.practice&&!!progress.bestStarsByLevel[state.level.id]);
  $('best-result').textContent=ru.result.best(progress.bestStarsByLevel[state.level.id]??0);
  $('result-stats').innerHTML=[[state.correct+' / '+state.tasks.length,ru.result.solved],[state.mistakes,ru.result.errors],[state.hints,ru.result.hints],...(state.timer?[[Math.ceil(state.timer.elapsedMs/1000),ru.result.seconds]]:[])].map(([n,label])=>'<div><b>'+n+'</b><span>'+label+'</span></div>').join('');
  show('recovery-problem',!!recovery);
  $('recovery-problem').innerHTML=recovery?'<h2>'+ru.result.recovery+'</h2><p class="recovery-expression">'+escape(recovery.prompt)+'</p><details><summary>'+ru.result.readRecovery+'</summary><p>'+escape(recovery.explanation)+'</p></details>':'';
  const wrongIds=new Set(state.history.filter(h=>!h.correct).map(h=>h.taskId));
  const review=state.tasks.filter(t=>wrongIds.has(t.id));
  show('review-problems',review.length>0&&kind!=='failed');
  $('review-problems').innerHTML=review.length?'<details><summary>'+ru.result.review+'</summary>'+review.map(p=>'<p><strong>'+escape(p.prompt)+'</strong><span>'+escape(p.explanation)+'</span></p>').join('')+'</details>':'';
  show('next-level',complete&&!state.practice&&state.level.id<TOTAL_STAGES);
  $('replay-level').textContent=state.practice?ru.result.practiceReplay:complete?ru.result.replay:ru.result.retry;
}
let toastTimer;
export function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent=message; show('toast',true);
  toastTimer=setTimeout(()=>show('toast',false),5500);
}
