import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { STORAGE_KEY, SETTINGS_KEY } from '../public/js/config.js';
import { createAttempt } from '../public/js/generators.js';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
let dom,document,serial=0,registered=[],now=0,buzz=[];
async function boot(t,saved,settings,{vibration=true}={}){
  if(dom){dom.window.dispatchEvent(new dom.window.Event('unload'));dom.window.close();}
  t.mock.timers.reset();t.mock.timers.enable({apis:['setTimeout','setInterval']});
  now=0;t.mock.method(performance,'now',()=>now);
  dom=new JSDOM(html,{url:'https://example.test/anya-math/',pretendToBeVisual:true});
  document=dom.window.document;dom.window.scrollTo=()=>{};
  buzz=[];if(vibration)dom.window.navigator.vibrate=ms=>{buzz.push(ms);return true;};
  registered=[];document.modelContext={registerTool:tool=>registered.push(tool)};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('[autofocus]')?.focus();};
  dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
  for(const [key,value] of Object.entries({window:dom.window,document,navigator:dom.window.navigator,localStorage:dom.window.localStorage}))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  if(saved!==undefined)localStorage.setItem(STORAGE_KEY,typeof saved==='string'?saved:JSON.stringify(saved));
  if(settings)localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));
  await import('../public/js/app.js?case='+serial++);
  const thisDom=dom;
  t.after(()=>{thisDom.window.dispatchEvent(new thisDom.window.Event('unload'));thisDom.window.close();t.mock.timers.reset();});
}
const $=id=>document.getElementById(id);
function key(id,key,extra={}){
  const el=$(id);el.focus();
  const event=new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});
  el.dispatchEvent(event);return event;
}
// JSDOM has no native editing engine. These model full input events; native keys are tested by Playwright.
function type(id,text){
  const el=$(id);el.focus();
  for(const data of text){el.setRangeText(data,el.selectionStart,el.selectionEnd,'end');el.dispatchEvent(new dom.window.InputEvent('input',{inputType:'insertText',data,bubbles:true}));}
}
function value(id,text){const el=$(id);el.value=text;el.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true}));}
function clickKey(key){document.querySelector('[data-key="'+key+'"]').click();}
const saved=()=>JSON.parse(localStorage.getItem(STORAGE_KEY));
const tasks=id=>createAttempt(id,saved().lastAttemptSeedByLevel[id],saved().activeRun?.recent??[]);
const unlocked=(level)=>({schemaVersion:2,bestStarsByLevel:Object.fromEntries(Array.from({length:level-1},(_,i)=>[i+1,3]))});
function answer(p){
  if(p.choices){document.querySelector('[data-choice="'+p.answer+'"]').click();$('submit-answer').click();return;}
  value('answer-input',String(p.kind==='remainder'?p.answer.quotient:p.answer));
  if(p.kind==='remainder')value('remainder-input',String(p.answer.remainder));
  key('answer-input','Enter');
}
function tick(t,ms){now+=ms;t.mock.timers.tick(ms);}

test('DOM: no code screen, 36 stages, author link; only first stage unlocked',async t=>{
  await boot(t);
  assert.equal($('screen-home').hidden,false);
  assert.equal(document.querySelectorAll('[data-level]').length,36);
  assert.equal(document.querySelectorAll('[data-level]:not(:disabled)').length,1);
  assert.equal(document.querySelector('input[type=password]'),null);
  assert.equal(document.querySelector('[id*=gate]'),null);
  assert.equal(document.querySelector('.author-mark a').href,'https://t.me/ZGennadiy');
});
test('DOM regression: native values, cursor, selections and keypad share one stable LTR input',async t=>{
  await boot(t);$('continue-game').click();
  const input=$('answer-input');assert.equal(document.activeElement,input);assert.equal(input.dir,'ltr');
  type('answer-input','1');type('answer-input','5');assert.equal(input.value,'15');
  input.setSelectionRange(1,1);type('answer-input','2');assert.equal(input.value,'125');
  assert.equal(input.selectionStart,2);assert.equal($('answer-input'),input);
  input.select();type('answer-input','8');assert.equal(input.value,'8');
  clickKey('clear');type('answer-input','128');assert.equal(input.value,'128');
  clickKey('clear');clickKey('1');clickKey('5');assert.equal(input.value,'15');
  input.setSelectionRange(0,0);clickKey('3');assert.equal(input.value,'153');
  clickKey('backspace');assert.equal(input.value,'15');clickKey('clear');assert.equal(input.value,'');
  type('answer-input','1');clickKey('5');assert.equal(input.value,'15');
  for(const name of ['Delete','Backspace','ArrowLeft','ArrowRight','Tab'])assert.equal(key('answer-input',name).defaultPrevented,false);
  key('answer-input','Escape');assert.equal(input.value,'15');
});
test('DOM: invalid letters, decimals, empty and pasted mixed values produce text errors without losing lives',async t=>{
  await boot(t);$('continue-game').click();
  for(const raw of ['', 'abc','15abc','1.5','1,5','1e3','-2','+2','12345']){
    value('answer-input',raw);key('answer-input','Enter');
    assert.equal($('answer-input').value,raw);
    assert.equal($('feedback').dataset.type,'invalid');assert.ok($('feedback').textContent.length>5);
    assert.equal($('answer-input').getAttribute('aria-invalid'),'true');
    assert.equal(saved().activeRun.lives,3);assert.deepEqual(saved().skillStats,{});
  }
});
test('DOM: Enter submits exactly once; next question empties the same input and restores focus',async t=>{
  await boot(t);$('continue-game').click();const p=tasks(1)[0],input=$('answer-input');
  answer(p);key('answer-input','Enter');$('submit-answer').click();
  assert.equal(saved().skillStats[p.skillTag].correct,1);assert.equal(saved().activeRun.history.length,1);
  tick(t,900);assert.equal($('task-counter').textContent,'Задача 2 из 8');
  assert.equal($('answer-input'),input);assert.equal(input.value,'');assert.equal(document.activeElement,input);
});
test('DOM: double incorrect submit costs exactly one life and stays on the same problem',async t=>{
  await boot(t);$('continue-game').click();const prompt=$('expression').textContent;
  value('answer-input','999');key('answer-input','Enter');key('answer-input','Enter');$('submit-answer').click();
  assert.equal(saved().activeRun.lives,2);assert.equal(saved().activeRun.history.length,1);
  assert.equal($('expression').textContent,prompt);assert.equal(document.activeElement.id,'retry-answer');
  $('retry-answer').click();assert.equal($('expression').textContent,prompt);assert.equal($('answer-input').value,'');
  assert.equal(document.activeElement.id,'answer-input');
});
test('DOM: mascot images follow hint, almost, correct, levelComplete and noLives states',async t=>{
  await boot(t);const image=selector=>document.querySelector(selector+' img').getAttribute('src');
  assert.equal(image('.mascot-home'),'./assets/mascots/idle.png');
  $('continue-game').click();const list=tasks(1);
  assert.equal(image('.mascot-game'),'./assets/mascots/thinking.png');
  $('hint-button').click();assert.equal(image('.mascot-game'),'./assets/mascots/hint.png');
  $('hint-close').click();value('answer-input','999');key('answer-input','Enter');
  assert.equal(image('.mascot-game'),'./assets/mascots/almost.png');$('retry-answer').click();
  for(const p of list){answer(p);assert.equal(image('.mascot-game'),'./assets/mascots/correct.png');tick(t,900);}
  assert.equal(image('.mascot-result'),'./assets/mascots/levelComplete.png');assert.equal(saved().bestStarsByLevel[1],2);
  $('replay-level').click();
  for(let i=0;i<3;i++){value('answer-input','999');key('answer-input','Enter');if(i<2)$('retry-answer').click();}
  assert.equal(image('.mascot-result'),'./assets/mascots/noLives.png');
});
test('DOM: three-step hint changes content, never fills answer, closes with Escape and resumes at last step',async t=>{
  await boot(t,unlocked(22));document.querySelector('[data-level="22"]').click();
  value('answer-input','15');$('hint-button').click();const first=$('hint-text').textContent;
  assert.equal($('hint-panel').hidden,false);assert.equal($('hint-heading').textContent,'Подсказка 1 из 3');
  $('hint-next').click();assert.notEqual($('hint-text').textContent,first);
  $('hint-next').click();assert.equal($('hint-heading').textContent,'Подсказка 3 из 3');
  assert.equal($('answer-input').value,'15');assert.equal(saved().activeRun.hints,3);
  key('hint-next','Escape');assert.equal($('hint-panel').hidden,true);assert.equal(document.activeElement.id,'hint-button');
  $('hint-button').click();assert.equal(saved().activeRun.hints,3);assert.equal($('hint-heading').textContent,'Подсказка 3 из 3');
  $('hint-next').click();assert.equal($('hint-panel').hidden,true);
});
test('DOM: remainder Enter moves to remainder; keypad follows focus; invalid remainder does not cost a life',async t=>{
  await boot(t,unlocked(25));document.querySelector('[data-level="25"]').click();
  const p=tasks(25)[0];type('answer-input',String(p.answer.quotient));key('answer-input','Enter');
  assert.equal(document.activeElement.id,'remainder-input');assert.equal(saved().activeRun.lives,3);
  value('remainder-input',String(p.metadata.divisor));key('remainder-input','Enter');
  assert.equal($('feedback').textContent,'Остаток всегда меньше делителя.');assert.equal(saved().activeRun.lives,3);
  clickKey('clear');clickKey(String(p.answer.remainder));assert.equal($('remainder-input').value,String(p.answer.remainder));
  assert.equal($('answer-input').value,String(p.answer.quotient));
  key('remainder-input','Enter');tick(t,900);assert.equal($('task-counter').textContent,'Задача 2 из 8');
  assert.equal(document.activeElement.id,'answer-input');assert.equal($('remainder-input').value,'');
});
test('DOM: failure offers a different worked example; new run has new seed, no awarded stars',async t=>{
  await boot(t);$('continue-game').click();const seed=saved().activeRun.seed,prompt=$('expression').textContent;
  for(let i=0;i<3;i++){value('answer-input','999');key('answer-input','Enter');if(i<2)$('retry-answer').click();}
  assert.equal($('results-title').textContent,'Передышка со Снежкой');assert.deepEqual(saved().bestStarsByLevel,{});
  assert.equal(saved().activeRun,null);assert.equal($('recovery-problem').hidden,false);
  assert.notEqual(document.querySelector('.recovery-expression').textContent,prompt);
  assert.ok($('recovery-problem').querySelector('details p').textContent.includes('='));
  $('replay-level').click();assert.equal(saved().activeRun.lives,3);assert.notEqual(saved().activeRun.seed,seed);
});
test('DOM: completion unlocks next, replay differs, worse result preserves the best',async t=>{
  await boot(t);$('continue-game').click();const list=tasks(1),seed=saved().activeRun.seed;
  for(const p of list){answer(p);tick(t,900);}
  assert.equal($('results-title').textContent,'Созвездие становится ярче!');assert.equal(saved().bestStarsByLevel[1],3);assert.equal(saved().unlockedLevel,2);
  $('replay-level').click();assert.notEqual(saved().activeRun.seed,seed);
  const replay=tasks(1);assert.notDeepEqual(replay.map(t=>t.signature),list.map(t=>t.signature));
  value('answer-input','999');key('answer-input','Enter');$('retry-answer').click();
  for(const p of replay){answer(p);tick(t,900);}
  assert.equal(saved().bestStarsByLevel[1],3);assert.match($('best-result').textContent,/3 звезды/);
  $('next-level').click();assert.equal(saved().activeRun.levelId,2);
});
test('DOM: reload restores raw answer and completed-task progress, including life and hint state',async t=>{
  await boot(t);$('continue-game').click();answer(tasks(1)[0]);tick(t,900);
  value('answer-input','999');key('answer-input','Enter');$('retry-answer').click();$('hint-button').click();
  value('answer-input','15abc');const before=saved();
  await boot(t,before);
  assert.match($('continue-game').textContent,/с того же места/);$('continue-game').click();
  assert.equal($('task-counter').textContent,'Задача 2 из 8');assert.equal($('answer-input').value,'15abc');
  assert.equal(saved().activeRun.seed,before.activeRun.seed);assert.equal(saved().activeRun.lives,2);
  assert.equal($('hint-panel').hidden,false);assert.equal(saved().records[1].attempts,1);
});
test('DOM: reload during correct feedback advances once without counting the answer again',async t=>{
  await boot(t);$('continue-game').click();answer(tasks(1)[0]);const before=saved();
  await boot(t,before);$('continue-game').click();tick(t,900);
  assert.equal($('task-counter').textContent,'Задача 2 из 8');
  assert.equal(saved().activeRun.correct,1);assert.equal(saved().activeRun.history.length,1);
  assert.deepEqual(saved().skillStats,before.skillStats);
});
test('DOM: map and reference preserve the unfinished answer; explicit restart gets a new seed',async t=>{
  await boot(t);$('continue-game').click();const seed=saved().activeRun.seed;
  type('answer-input','15');$('table-button').click();$('table-back').click();assert.equal($('answer-input').value,'15');
  $('game-back').click();$('continue-game').click();assert.equal($('answer-input').value,'15');assert.equal(saved().activeRun.seed,seed);
  $('restart-run').click();document.querySelector('[data-close="restart-dialog"]').click();assert.equal(saved().activeRun.seed,seed);
  $('restart-run').click();$('confirm-restart').click();assert.notEqual(saved().activeRun.seed,seed);assert.equal($('answer-input').value,'');
  assert.equal(saved().records[1].attempts,2);
});
test('DOM: replacing an unfinished stage requires confirmation; cancel keeps it intact',async t=>{
  await boot(t,unlocked(2));document.querySelector('[data-level="1"]').click();
  const seed=saved().activeRun.seed;$('game-back').click();document.querySelector('[data-level="2"]').click();
  assert.equal($('leave-dialog').open,true);
  document.querySelector('[data-close="leave-dialog"]').click();assert.equal(saved().activeRun.seed,seed);
  document.querySelector('[data-level="2"]').click();$('confirm-leave').click();assert.equal(saved().activeRun.levelId,2);
});
test('DOM: table cell shows four linked facts; selected factors are multi-select with at least one',async t=>{
  await boot(t);$('table-button').click();document.querySelector('[data-cell="7,8"]').click();
  for(const fact of ['7 × 8 = 56','8 × 7 = 56','56 ÷ 7 = 8','56 ÷ 8 = 7'])assert.ok($('fact-family').textContent.includes(fact));
  document.querySelector('[data-factor="7"]').click();document.querySelector('[data-factor="2"]').click();
  assert.equal(document.querySelectorAll('[data-factor][aria-pressed="true"]').length,1);
  document.querySelector('[data-factor="7"]').click();assert.equal(document.querySelector('[data-factor="7"]').getAttribute('aria-pressed'),'true');
  document.querySelector('[data-mode="divide"]').click();$('start-practice').click();
  assert.match($('game-title').textContent,/7/);assert.ok($('expression').textContent.includes('÷ 7'));
  value('answer-input','999');key('answer-input','Enter');
  assert.equal($('hearts').getAttribute('aria-label'),'Тренировка без потери жизней');assert.equal(localStorage.getItem(STORAGE_KEY),null);
});
test('DOM: entering practice does not erase the saved campaign run',async t=>{
  await boot(t);$('continue-game').click();type('answer-input','15');const before=saved().activeRun;
  $('table-button').click();$('start-practice').click();value('answer-input','999');key('answer-input','Enter');
  assert.deepEqual(saved().activeRun,before);
  $('game-back').click();$('continue-game').click();assert.equal($('answer-input').value,'15');assert.equal(saved().activeRun.seed,before.seed);
});
test('DOM: table, settings and hidden tab pause the pending next question',async t=>{
  await boot(t);$('continue-game').click();const list=tasks(1);answer(list[0]);
  $('settings-button').click();tick(t,5000);assert.equal($('task-counter').textContent,'Задача 1 из 8');
  document.querySelector('[data-close="settings-dialog"]').click();tick(t,900);
  assert.equal($('task-counter').textContent,'Задача 2 из 8');
  answer(list[1]);$('table-button').click();tick(t,5000);$('table-back').click();tick(t,900);
  assert.equal($('task-counter').textContent,'Задача 3 из 8');
  answer(list[2]);Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new dom.window.Event('visibilitychange'));
  tick(t,5000);assert.equal($('task-counter').textContent,'Задача 3 из 8');
  Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new dom.window.Event('visibilitychange'));tick(t,900);
  assert.equal($('task-counter').textContent,'Задача 4 из 8');
});
test('DOM: speed practice pauses for help and settings, expires gently and leaves campaign stars unchanged',async t=>{
  await boot(t);$('table-button').click();$('speed-duration').value='30';$('start-speed').click();
  tick(t,200);tick(t,1000);assert.equal($('practice-timer').textContent,'Осталось 0:29');
  $('hint-button').click();tick(t,10000);assert.equal($('practice-timer').textContent,'Осталось 0:29');
  $('hint-close').click();$('settings-button').click();tick(t,10000);
  assert.equal($('practice-timer').textContent,'Осталось 0:29');
  document.querySelector('[data-close="settings-dialog"]').click();tick(t,200);tick(t,30000);
  assert.equal($('results-title').textContent,'Время закончилось — отдохнём?');
  assert.deepEqual(saved().bestStarsByLevel,{});assert.equal(saved().unlockedLevel,1);assert.equal(saved().practiceStats.runs,1);
});
test('DOM: reset confirmation clears all saved progress, retains sound/reduced motion and does not touch another game',async t=>{
  const settings={schemaVersion:1,sound:true,haptics:false,reducedMotion:true};
  await boot(t,unlocked(5),settings);localStorage.setItem('zakhar-teddy-game:v2','original');
  $('continue-game').click();type('answer-input','15');
  $('settings-button').click();$('reset-game').click();
  document.querySelector('[data-close="reset-dialog"]').click();assert.equal(saved().unlockedLevel,5);
  $('settings-button').click();$('reset-game').click();$('confirm-reset').click();
  assert.equal($('star-total').textContent,'0');assert.equal(saved().unlockedLevel,1);
  for(const key of ['bestStarsByLevel','skillStats','records','recentTaskSignatures','previousSeeds','lastAttemptSeedByLevel'])assert.deepEqual(saved()[key],{});
  assert.equal(saved().activeRun,null);assert.deepEqual(JSON.parse(localStorage.getItem(SETTINGS_KEY)),settings);
  assert.equal(document.body.classList.contains('reduce-motion'),true);assert.equal(localStorage.getItem('zakhar-teddy-game:v2'),'original');
  assert.equal(document.querySelector('[data-level="2"]').disabled,true);
});
test('DOM: corrupt storage and corrupt active run show a playable first stage',async t=>{
  await boot(t,'{broken');assert.equal($('screen-home').hidden,false);$('continue-game').click();assert.equal(saved().activeRun.levelId,1);
  await boot(t,{schemaVersion:2,activeRun:{levelId:1,seed:'broken'}});assert.equal(saved().activeRun,null);
  $('continue-game').click();assert.equal(saved().activeRun.levelId,1);
});
test('DOM: optional WebMCP shares UI state, does not reveal answer, rejects locked stages and out-of-range values',async t=>{
  await boot(t);
  assert.deepEqual(registered.map(t=>t.name),['read_math_constellation','start_math_stage']);
  const [read,start]=registered;assert.equal(read.annotations.readOnlyHint,true);
  assert.throws(()=>start.execute({levelId:37}));assert.throws(()=>start.execute({levelId:2}));
  assert.deepEqual(start.execute({levelId:1}),{levelId:1,screen:'game'});
  assert.equal(read.execute().task.number,1);assert.equal(read.execute().task.answer,undefined);
  assert.throws(()=>start.execute({levelId:1}));
});
test('DOM: the complete 36-stage campaign works through real handlers, including every mixed answer format',async t=>{
  await boot(t);$('continue-game').click();
  for(let stage=1;stage<=36;stage++){
    const list=tasks(stage);
    for(let i=0;i<list.length;i++){
      assert.equal($('task-counter').textContent,'Задача '+(i+1)+' из '+list.length);
      assert.ok($('expression').textContent.length>0);
      answer(list[i]);tick(t,900);
    }
    assert.equal($('screen-results').hidden,false);
    assert.equal(saved().bestStarsByLevel[stage],3);
    if(stage<36)$('next-level').click();
  }
  assert.equal($('results-title').textContent,'Твоё созвездие зажжено!');
  assert.equal(saved().completedLevels.length,36);
  assert.equal($('star-total').textContent,'108');
  assert.equal(saved().activeRun,null);
  assert.equal($('next-level').hidden,true);
});
test('DOM: vibration ticks the input, lasts longer for a wrong answer and stops when switched off',async t=>{
  await boot(t);assert.equal($('haptics-row').hidden,false);
  $('continue-game').click();const list=tasks(1);
  buzz.length=0;clickKey('1');clickKey('backspace');assert.deepEqual(buzz,[10,10]);
  buzz.length=0;answer({...list[0],answer:list[0].answer+1});assert.equal(buzz.at(-1),160);
  $('retry-answer').click();buzz.length=0;answer(list[0]);assert.equal(buzz.at(-1),35);
  tick(t,900);assert.equal($('task-counter').textContent,'Задача 2 из 8');
  $('settings-button').click();$('setting-haptics').checked=false;
  $('setting-haptics').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  document.querySelector('[data-close="settings-dialog"]').click();
  buzz.length=0;clickKey('1');answer(list[1]);assert.deepEqual(buzz,[]);
  assert.equal(JSON.parse(localStorage.getItem(SETTINGS_KEY)).haptics,false);
});
test('DOM: without the Vibration API the switch is hidden instead of doing nothing',async t=>{
  await boot(t,undefined,undefined,{vibration:false});
  assert.equal($('haptics-row').hidden,true);
  $('continue-game').click();clickKey('1');assert.equal($('answer-input').value,'1');
});
