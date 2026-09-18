import { getLevel, TOTAL_STAGES } from './config.js';
import { createFreshAttempt, practiceConfig } from './generators.js';
import { createGame, currentTask, submitAnswer, advance, useHint, starsForGame, tickGameTimer } from './game-state.js';
import { loadProgress, saveProgress, saveSettings, recordAttempt, recordAnswer, completeLevel, resetProgress } from './storage.js';
import { snapshotRun, restoreRun } from './run-storage.js';
import { editAnswer } from './validation.js';
import { ru } from './strings.js';
import { $, show, icon, initIcons, setScreen, renderHome, renderGame, renderHint, renderTimer, renderReference, renderResults, wallet, toast } from './ui.js';
import { playTone } from './audio.js';
import { vibrate } from './haptics.js';
import { registerGameTools } from './webmcp.js';

const emptyFields=()=>({answer:'',remainder:'',choice:''});
let progress=loadProgress(),game=null,screen='home',fields=emptyFields(),focusedField='answer',hintVisible=false;
let tableMode='multiply',tableFactors=[2],tableCell=[7,8],tableReturn='home';
let transitionTimer=null,warnedStorage=false,practicePrevious=null,practiceLast=null,recovery=null,pendingStart=null,finishedRun=null;
let clockLast=performance.now(),clockWasActive=false;
let installPrompt=null;
const openDialog=()=>[...document.querySelectorAll('dialog')].some(d=>d.open);
const savedRun=()=>restoreRun(progress.activeRun);
const isActive=state=>state&&['answer','wrong','correct'].includes(state.phase);
function markClock(){clockLast=performance.now();clockWasActive=false;}
function persist() {
  if(!saveProgress(progress)&&!warnedStorage){warnedStorage=true;toast(ru.storageWarning);}
}
function persistRun() {
  if(game&&!game.practice){progress={...progress,activeRun:snapshotRun(game,fields,hintVisible)};persist();}
}
function cancelTransition(){clearTimeout(transitionTimer);transitionTimer=null;}
function applySettings(){
  document.body.classList.toggle('reduce-motion',progress.settings.reducedMotion);
  $('setting-motion').checked=progress.settings.reducedMotion;$('setting-sound').checked=progress.settings.sound;
  $('setting-haptics').checked=progress.settings.haptics;
}
function changeScreen(next){
  screen=next;setScreen(next);markClock();window.scrollTo({top:0,behavior:'instant'});
}
function focusAnswer(field='answer') {
  if(screen!=='game'||!game||openDialog())return;
  if(game.phase==='wrong'){$('retry-answer').focus({preventScroll:true});return;}
  if(game.phase!=='answer')return;
  const target=currentTask(game).choices?$('choice-fields').querySelector('button'):$(field==='remainder'?'remainder-input':'answer-input');
  target?.focus({preventScroll:true});
}
function clearFields(){fields=emptyFields();focusedField='answer';hintVisible=false;}
function drawGame(newQuestion=false){
  if(newQuestion)clearFields();
  renderGame(game,fields,hintVisible);
}
function home(scrollMap=false) {
  cancelTransition();persistRun();changeScreen('home');
  renderHome(progress,savedRun());
  if(scrollMap){
    const current=$('world-map').querySelector('[aria-current="step"]');
    const reduced=progress.settings.reducedMotion||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    current?.scrollIntoView?.({block:'center',behavior:reduced?'instant':'smooth'});
    current?.focus({preventScroll:true});
  }else $('continue-game').focus({preventScroll:true});
}
function resumeRun() {
  const saved=savedRun();
  if(!saved)return startLevel(progress.currentLevel);
  cancelTransition();({game,fields,hintVisible}=saved);focusedField='answer';finishedRun=null;
  changeScreen('game');drawGame();focusAnswer();scheduleNext();
}
function startLevel(id,force=false) {
  const level=getLevel(id);
  if(!level||id>progress.unlockedLevel)return;
  const saved=savedRun();
  if(saved&&!force){
    if(saved.game.level.id===id)return resumeRun();
    pendingStart=()=>startLevel(id,true);cancelTransition();markClock();$('leave-dialog').showModal();return;
  }
  const attempt=createFreshAttempt(level,progress.lastAttemptSeedByLevel[id],progress.lastAttemptSignatureByLevel[id],
    progress.recentTaskSignatures[id]??[],progress.previousSeeds[id]??[]);
  cancelTransition();
  progress=recordAttempt(progress,id,attempt.seed,attempt.signature,attempt.tasks);
  game=createGame(level,attempt.tasks,attempt.seed,false,{recent:attempt.recent});
  finishedRun=null;recovery=null;
  changeScreen('game');drawGame(true);persistRun();focusAnswer();
}
function startPractice(replay=false,speed=false) {
  persistRun(); // Keep an unfinished story stage intact while using the table.
  const selection=replay&&practiceLast?practiceLast:{
    mode:$('practice-mixed').checked?'mixed':tableMode,
    factors:[...tableFactors],seconds:speed?Number($('speed-duration').value):0
  };
  practiceLast=selection;
  const level=practiceConfig(selection.mode,selection.factors,!!selection.seconds);
  const attempt=createFreshAttempt(level,practicePrevious?.seed,practicePrevious?.signature);
  practicePrevious=attempt;cancelTransition();
  game=createGame(level,attempt.tasks,attempt.seed,true,{seconds:selection.seconds});
  finishedRun=null;recovery=null;changeScreen('game');drawGame(true);focusAnswer();
}
function finish() {
  cancelTransition();markClock();
  if(finishedRun===game.runId)return;
  finishedRun=game.runId;
  if(!game.practice){
    progress=game.phase==='completed'?completeLevel(progress,game.level.id,starsForGame(game)):{...progress,activeRun:null};
  }else{
    const s=progress.practiceStats;
    progress={...progress,practiceStats:{runs:s.runs+1,correct:s.correct+game.correct,wrong:s.wrong+game.mistakes}};
  }
  recovery=null;
  if(game.phase==='failed'){
    const task=currentTask(game),level={...game.level,problemCount:1,allowedProblemKinds:[task.metadata.generatorKind]};
    recovery=createFreshAttempt(level,game.seed,'',game.tasks.map(t=>t.signature)).tasks[0];
  }
  persist();wallet(progress);changeScreen('results');renderResults(game,progress,recovery);
  playTone(game.phase==='completed'?'complete':'wrong',progress.settings.sound);
  $('results-title').tabIndex=-1;$('results-title').focus({preventScroll:true});
}
function nextQuestion() {
  transitionTimer=null;
  if(screen!=='game'||openDialog()||document.hidden||game?.phase!=='correct')return;
  game=advance(game);
  if(game.phase==='completed')finish();else{drawGame(true);persistRun();focusAnswer();markClock();}
}
function scheduleNext(){
  cancelTransition();
  if(game?.phase==='correct'&&screen==='game'&&!openDialog()&&!document.hidden)transitionTimer=setTimeout(nextQuestion,850);
}
function submit() {
  if(screen!=='game'||!game||openDialog())return;
  const task=currentTask(game),transition=submitAnswer(game,fields);
  if(transition.ignored)return;
  if(transition.invalid){
    $('feedback').dataset.type='invalid';$('feedback').textContent=transition.message;
    if(['answer','remainder'].includes(transition.invalid))$(transition.invalid+'-input').setAttribute('aria-invalid','true');
    focusAnswer(transition.invalid);return;
  }
  game=transition.state;hintVisible=false;markClock();
  if(!game.practice)progress=recordAnswer(progress,task.skillTag,transition.correct);
  persistRun();playTone(transition.correct?'correct':'wrong',progress.settings.sound);
  vibrate(transition.correct?'correct':'wrong',progress.settings.haptics);
  if(game.phase==='failed'){finish();return;}
  drawGame();
  if(transition.correct)scheduleNext();else $('retry-answer').focus({preventScroll:true});
}
function changeField(field,action){
  if(game?.phase!=='answer'||screen!=='game'||openDialog())return;
  fields={...fields,[field]:editAnswer(fields[field],action)};
  vibrate('tap',progress.settings.haptics);
  const input=$(field+'-input');
  // Native input already has the complete value and caret. Never rewrite it per keystroke.
  if(input.value!==fields[field])input.value=fields[field];
  input.removeAttribute('aria-invalid');
  if($('feedback').dataset.type==='invalid')$('feedback').textContent='';
  persistRun();
}
function drawTable(){
  renderReference(tableMode,tableFactors,tableCell,$('practice-mixed').checked);
}
function openTable(){
  if(screen==='table')return;
  tableReturn=screen;cancelTransition();persistRun();changeScreen('table');drawTable();
  $('table-back-label').textContent=ru.tableBack[tableReturn];
  $('table-back').focus({preventScroll:true});
}
function closeTable(){
  changeScreen(tableReturn);
  if(tableReturn==='game'&&game){drawGame();focusAnswer(focusedField);scheduleNext();}
  else if(tableReturn==='results'&&game){renderResults(game,progress,recovery);$('results-title').focus({preventScroll:true});}
  else{renderHome(progress,savedRun());$('table-button').focus({preventScroll:true});}
}
function closeHint(){
  hintVisible=false;renderHint(game,false);persistRun();markClock();$('hint-button').focus({preventScroll:true});
}
function askRestart(){
  if(!isActive(game)||screen!=='game')return;
  cancelTransition();markClock();$('restart-dialog').showModal();
}

initIcons();
$('keypad').innerHTML=['1','2','3','4','5','6','7','8','9','clear','0','backspace'].map(key=>
  '<button type="button" data-key="'+key+'" aria-label="'+(key==='clear'?'Очистить ответ':key==='backspace'?'Удалить последнюю цифру':'Цифра '+key)+'" class="'+(/^[0-9]$/.test(key)?'digit':'utility-key')+'">'+(key==='clear'?'C':key==='backspace'?icon('backspace'):key)+'</button>').join('');
// iOS Safari opens its keyboard despite inputmode="none". Read-only fields never open one
// anywhere, and focus, caret, the keypad and Enter keep working. Only touch-first devices:
// a read-only field cannot be typed into, and desktops have no on-screen keyboard to hide.
const touchOnly=window.matchMedia?.('(pointer: coarse)').matches??false;
for(const field of ['answer','remainder']){
  const input=$(field+'-input');
  input.readOnly=touchOnly;
  input.addEventListener('focus',()=>{focusedField=field;});
  input.addEventListener('input',()=>changeField(field,{type:'native',value:input.value}));
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){
      event.preventDefault();
      if(event.repeat||!game)return;
      if(currentTask(game).kind==='remainder'&&fields.answer.trim()&&!fields.remainder.trim()){
        focusAnswer('remainder');$('feedback').textContent=ru.incompleteRemainder;return;
      }
      submit();
    }
    // Digits, NumPad, Backspace, Delete, arrows, selection, paste and Tab are all native.
  });
}
$('keypad').addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
$('keypad').addEventListener('click',event=>{
  const button=event.target.closest('[data-key]'),key=button?.dataset.key;
  if(!key||button.disabled)return;
  changeField(focusedField,/^[0-9]$/.test(key)?{type:'append',digit:key}:{type:key});
  focusAnswer(focusedField);
  const input=$(focusedField+'-input');input.setSelectionRange(input.value.length,input.value.length);
});
$('choice-fields').addEventListener('click',event=>{
  const button=event.target.closest('[data-choice]');
  if(!button||game.phase!=='answer')return;
  fields={...fields,choice:button.dataset.choice};
  vibrate('tap',progress.settings.haptics);
  document.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  if($('feedback').dataset.type==='invalid')$('feedback').textContent='';
  persistRun();
});
$('submit-answer').addEventListener('click',submit);
$('retry-answer').addEventListener('click',()=>{
  if(game?.phase!=='wrong')return;
  game=advance(game);drawGame(true);persistRun();focusAnswer();markClock();
});
$('hint-button').addEventListener('click',()=>{
  if(!['answer','wrong'].includes(game?.phase))return;
  if(hintVisible){closeHint();return;}
  if(game.hintStep===0)game=useHint(game);
  hintVisible=true;renderHint(game,true);persistRun();markClock();
});
$('hint-next').addEventListener('click',()=>{
  if(!hintVisible)return;
  if(game.hintStep===3){closeHint();return;}
  game=useHint(game);renderHint(game,true);persistRun();
});
$('hint-close').addEventListener('click',closeHint);
$('continue-game').addEventListener('click',()=>savedRun()?resumeRun():startLevel(progress.currentLevel));
$('world-map').addEventListener('click',event=>{
  const button=event.target.closest('[data-level]');if(button&&!button.disabled)startLevel(Number(button.dataset.level));
});
$('game-back').addEventListener('click',()=>home(true));
$('map-button').addEventListener('click',()=>home(true));
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();home();});
$('confirm-leave').addEventListener('click',()=>{
  const action=pendingStart;pendingStart=null;$('leave-dialog').close();action?.();
});
$('restart-run').addEventListener('click',askRestart);
$('confirm-restart').addEventListener('click',()=>{
  $('restart-dialog').close();
  if(game.practice)startPractice(true);else startLevel(game.level.id,true);
});
$('table-button').addEventListener('click',openTable);$('table-back').addEventListener('click',closeTable);
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{tableMode=button.dataset.mode;drawTable();}));
$('factor-buttons').addEventListener('click',event=>{
  const button=event.target.closest('[data-factor]');if(!button)return;
  const factor=Number(button.dataset.factor);
  if(tableFactors.includes(factor)){
    if(tableFactors.length===1){toast(ru.oneFactor);return;}
    tableFactors=tableFactors.filter(n=>n!==factor);
  }else tableFactors=[...tableFactors,factor].sort((a,b)=>a-b);
  drawTable();$('factor-buttons').querySelector('[data-factor="'+factor+'"]').focus({preventScroll:true});
});
$('times-grid').addEventListener('click',event=>{
  const button=event.target.closest('[data-cell]');if(!button)return;
  tableCell=button.dataset.cell.split(',').map(Number);drawTable();
  $('times-grid').querySelector('[data-cell="'+tableCell.join(',')+'"]').focus({preventScroll:true});
});
$('practice-mixed').addEventListener('change',drawTable);
$('start-practice').addEventListener('click',()=>startPractice());
$('start-speed').addEventListener('click',()=>startPractice(false,true));
$('next-level').addEventListener('click',()=>{if(game.level.id<TOTAL_STAGES)startLevel(game.level.id+1);});
$('replay-level').addEventListener('click',()=>game.practice?startPractice(true):startLevel(game.level.id,true));
$('results-map').addEventListener('click',()=>home(true));
$('settings-button').addEventListener('click',()=>{applySettings();cancelTransition();markClock();$('settings-dialog').showModal();});
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{scheduleNext();markClock();}));
for(const [id,key] of [['setting-motion','reducedMotion'],['setting-sound','sound'],['setting-haptics','haptics']]){
  $(id).addEventListener('change',event=>{
    progress={...progress,settings:{...progress.settings,[key]:event.target.checked}};
    applySettings();if(!saveSettings(progress.settings))toast(ru.storageWarning);
    if(key==='sound')playTone('correct',progress.settings.sound);
    if(key==='haptics')vibrate('tap',progress.settings.haptics);
  });
}
// iOS Safari has no Vibration API, so the switch would be a dead control there.
show('haptics-row','vibrate' in navigator);
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
show('install-open',!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone));
$('install-open').addEventListener('click',()=>{$('settings-dialog').close();cancelTransition();markClock();$('install-dialog').showModal();});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;show('install-now',true);});
$('install-now').addEventListener('click',async()=>{
  const prompt=installPrompt;installPrompt=null;show('install-now',false);
  await prompt?.prompt();$('install-dialog').close();
});
$('reset-game').addEventListener('click',()=>{$('settings-dialog').close();cancelTransition();markClock();$('reset-dialog').showModal();});
$('confirm-reset').addEventListener('click',()=>{
  cancelTransition();markClock();
  const result=resetProgress(undefined,progress.settings);
  progress=result.progress;game=null;practicePrevious=null;practiceLast=null;pendingStart=null;recovery=null;finishedRun=null;warnedStorage=false;
  $('reset-dialog').close();applySettings();home();toast(result.saved?ru.resetDone:ru.storageWarning);
});
// No global digit handler. Escape only dismisses help; Tab remains ordinary navigation.
document.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.repeat)event.preventDefault();
  if(event.key==='Escape'&&hintVisible&&screen==='game'&&!openDialog()){event.preventDefault();closeHint();}
});
document.addEventListener('visibilitychange',()=>{markClock();if(document.hidden){cancelTransition();persistRun();}else scheduleNext();});
window.addEventListener('pagehide',persistRun);
const clock=setInterval(()=>{
  const now=performance.now();
  const active=screen==='game'&&game?.timer&&['answer','wrong'].includes(game.phase)&&!openDialog()&&!hintVisible&&!document.hidden;
  if(active&&clockWasActive){
    game=tickGameTimer(game,now-clockLast);renderTimer(game);
    if(game.phase==='timedOut')finish();
  }
  clockWasActive=!!active;clockLast=now;
},200);
window.addEventListener('unload',()=>{clearInterval(clock);cancelTransition();});
const viewport=window.visualViewport;
if(viewport){
  const updateKeyboard=()=>document.body.classList.toggle('keyboard-open',viewport.height<window.innerHeight*0.74);
  viewport.addEventListener('resize',updateKeyboard);updateKeyboard();
}
if(progress.activeRun&&!savedRun()){progress={...progress,activeRun:null};persist();}
applySettings();setScreen('home');renderHome(progress,savedRun());
registerGameTools({
  read:()=>({screen,unlockedLevel:progress.unlockedLevel,stars:progress.bestStarsByLevel,
    task:screen==='game'&&game?{prompt:currentTask(game).prompt,number:game.index+1,total:game.tasks.length,lives:game.practice?null:game.lives,phase:game.phase}:null}),
  start:id=>{
    if(openDialog()||!['home','results'].includes(screen))throw new Error('Return to the map first');
    if(id>progress.unlockedLevel)throw new Error('Stage is locked');
    if(savedRun()&&savedRun().game.level.id!==id)throw new Error('An unfinished stage is saved. Choose the next action in the game.');
    startLevel(id);return {levelId:id,screen};
  }
});
