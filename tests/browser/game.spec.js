import { test, expect } from '@playwright/test';
import { createAttempt } from '../../public/js/generators.js';
import { STORAGE_KEY, SETTINGS_KEY } from '../../public/js/config.js';
const input=page=>page.locator('#answer-input');
async function play(page){await page.goto('/anya-math/');await page.locator('#continue-game').click();await expect(input(page)).toBeFocused();}
async function progress(page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),STORAGE_KEY);}
async function currentTasks(page,id=1){const p=await progress(page);return createAttempt(id,p.lastAttemptSeedByLevel[id],p.activeRun?.recent??[]);}
async function unlock(page,id){
  await page.goto('/anya-math/');
  await page.evaluate(({key,id})=>localStorage.setItem(key,JSON.stringify({schemaVersion:2,bestStarsByLevel:Object.fromEntries(Array.from({length:id-1},(_,i)=>[i+1,3]))})),{key:STORAGE_KEY,id});
  await page.reload();
}
async function enter(page,p){
  if(p.choices){await page.locator('[data-choice="'+p.answer+'"]').click();await page.locator('#submit-answer').click();}
  else{
    await input(page).fill(String(p.kind==='remainder'?p.answer.quotient:p.answer));
    if(p.kind==='remainder')await page.locator('#remainder-input').fill(String(p.answer.remainder));
    await input(page).press('Enter');
  }
}
async function finishTasks(page,tasks){
  for(let i=0;i<tasks.length;i++){
    await expect(page.locator('#task-counter')).toHaveText('Задача '+(i+1)+' из '+tasks.length);
    await enter(page,tasks[i]);
  }
  await expect(page.locator('#screen-results')).toBeVisible();
}
test('native keyboard regression: 15 and 128, Backspace, Delete, arrows, selection, one submit',async({page})=>{
  await play(page);
  await page.keyboard.type('1');await page.keyboard.type('5');await expect(input(page)).toHaveValue('15');
  await page.keyboard.press('ArrowLeft');await page.keyboard.type('2');await expect(input(page)).toHaveValue('125');
  await input(page).press('ControlOrMeta+A');await page.keyboard.type('8');await expect(input(page)).toHaveValue('8');
  await input(page).press('ControlOrMeta+A');await page.keyboard.type('128');await expect(input(page)).toHaveValue('128');
  await input(page).press('Backspace');await expect(input(page)).toHaveValue('12');
  await input(page).press('Home');await input(page).press('Delete');await expect(input(page)).toHaveValue('2');
  await input(page).press('End');await input(page).press('Delete');await expect(input(page)).toHaveValue('2');
  const tasks=await currentTasks(page);
  await input(page).fill(String(tasks[0].answer));await input(page).press('Enter');await page.keyboard.press('Enter');
  await expect(page.locator('#task-counter')).toHaveText('Задача 2 из 8');
  await expect(input(page)).toHaveValue('');await expect(input(page)).toBeFocused();
  expect((await progress(page)).activeRun.correct).toBe(1);
  expect((await progress(page)).skillStats[tasks[0].skillTag].correct).toBe(1);
});
test('keypad regression: native and screen input share order even after moving the caret',async({page})=>{
  await play(page);
  await page.getByRole('button',{name:'Цифра 1',exact:true}).click();
  await page.getByRole('button',{name:'Цифра 5',exact:true}).click();await expect(input(page)).toHaveValue('15');
  await input(page).press('Home');await page.getByRole('button',{name:'Цифра 3',exact:true}).click();
  await expect(input(page)).toHaveValue('153');
  await page.getByRole('button',{name:'Удалить последнюю цифру'}).click();await expect(input(page)).toHaveValue('15');
  await page.getByRole('button',{name:'Очистить ответ',exact:true}).click();await expect(input(page)).toHaveValue('');
  await page.keyboard.type('1');await page.getByRole('button',{name:'Цифра 5',exact:true}).click();await expect(input(page)).toHaveValue('15');
});
test('native NumPad 1 then 5 generates trusted input in natural order',async({page,browserName})=>{
  test.skip(browserName!=='chromium','NumLock-on protocol is Chromium-specific; ordinary native digits run in all engines.');
  await play(page);
  await input(page).evaluate(el=>{
    window.numpadEvents={keys:[],inputs:[]};
    el.addEventListener('keydown',e=>window.numpadEvents.keys.push({key:e.key,code:e.code,location:e.location,trusted:e.isTrusted}));
    el.addEventListener('input',e=>window.numpadEvents.inputs.push({data:e.data,trusted:e.isTrusted}));
  });
  // Browser-native NumLock-on input. Do not assign el.value or dispatch a synthetic DOM event.
  const session=await page.context().newCDPSession(page);
  try{
    for(const digit of ['1','5']){
      const key={key:digit,code:'Numpad'+digit,windowsVirtualKeyCode:96+Number(digit),isKeypad:true,modifiers:0};
      await session.send('Input.dispatchKeyEvent',{...key,type:'keyDown',text:digit,unmodifiedText:digit});
      await session.send('Input.dispatchKeyEvent',{...key,type:'keyUp'});
    }
    await expect(input(page)).toHaveValue('15');
    expect(await page.evaluate(()=>window.numpadEvents)).toEqual({
      keys:[{key:'1',code:'Numpad1',location:3,trusted:true},{key:'5',code:'Numpad5',location:3,trusted:true}],
      inputs:[{data:'1',trusted:true},{data:'5',trusted:true}]
    });
  }finally{await session.detach();}
});
test('native paste preserves valid and invalid complete text; invalid format costs no lives',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','Clipboard permission test uses Chromium; full input handling is shared.');
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await play(page);
  for(const text of ['128','15abc']){
    await page.evaluate(text=>navigator.clipboard.writeText(text),text);
    await input(page).fill('');await input(page).press('ControlOrMeta+V');await expect(input(page)).toHaveValue(text);
  }
  await input(page).press('Enter');await expect(page.locator('#feedback')).toContainText('только цифры');
  expect((await progress(page)).activeRun.lives).toBe(3);
});
test('invalid answers stay visible and never cost lives; no auth or transliteration gate',async({page})=>{
  await play(page);
  for(const raw of ['', 'abc','15abc','1.5','1,5','1e3','-2','+2']){
    await input(page).fill(raw);await input(page).press('Enter');
    await expect(page.locator('#feedback')).toHaveAttribute('data-type','invalid');await expect(input(page)).toHaveValue(raw);
    expect((await progress(page)).activeRun.lives).toBe(3);
  }
  await expect(page.locator('[id*=gate],input[type=password]')).toHaveCount(0);
});
test('wrong answer double-click loses one life, failure gives a similar worked example and fresh retry',async({page})=>{
  await play(page);const original=await progress(page),prompt=await page.locator('#expression').textContent();
  await input(page).fill('999');await page.locator('#submit-answer').dblclick({force:true});
  expect((await progress(page)).activeRun.lives).toBe(2);
  await expect(page.locator('#expression')).toHaveText(prompt);await page.locator('#retry-answer').click();
  for(let i=0;i<2;i++){await input(page).fill('999');await input(page).press('Enter');if(i===0)await page.locator('#retry-answer').click();}
  await expect(page.locator('#results-title')).toHaveText('Передышка со Снежки');
  expect((await progress(page)).bestStarsByLevel).toEqual({});
  await expect(page.locator('.recovery-expression')).not.toHaveText(prompt);
  await page.locator('#recovery-problem summary').click();await expect(page.locator('#recovery-problem details p')).toBeVisible();
  await page.locator('#replay-level').click();expect((await progress(page)).activeRun.seed).not.toBe(original.activeRun.seed);
  expect((await progress(page)).activeRun.lives).toBe(3);
});
test('complete, reload, new replay, preserve best stars, reset preserves reduced motion',async({page})=>{
  await play(page);const before=await progress(page);
  await finishTasks(page,await currentTasks(page));
  expect((await progress(page)).bestStarsByLevel[1]).toBe(3);
  await page.reload();await expect(page.locator('#star-total')).toHaveText('3');
  await expect(page.locator('[data-level="2"]')).toBeEnabled();
  await page.locator('[data-level="1"]').click();
  const after=await progress(page);expect(after.lastAttemptSeedByLevel[1]).not.toBe(before.lastAttemptSeedByLevel[1]);
  expect(after.lastAttemptSignatureByLevel[1]).not.toBe(before.lastAttemptSignatureByLevel[1]);
  const replay=await currentTasks(page);await input(page).fill('999');await input(page).press('Enter');await page.locator('#retry-answer').click();
  await finishTasks(page,replay);expect((await progress(page)).bestStarsByLevel[1]).toBe(3);
  await page.locator('#settings-button').click();await page.locator('#setting-motion').check();
  await page.locator('#reset-game').click();await page.getByRole('button',{name:'Отмена',exact:true}).click();
  expect((await progress(page)).bestStarsByLevel[1]).toBe(3);
  await page.locator('#settings-button').click();await page.locator('#reset-game').click();await page.locator('#confirm-reset').click();
  await page.reload();await expect(page.locator('#star-total')).toHaveText('0');await expect(page.locator('[data-level="2"]')).toBeDisabled();
  const cleared=await progress(page);
  expect(cleared.unlockedLevel).toBe(1);expect(cleared.lastAttemptSeedByLevel).toEqual({});expect(cleared.skillStats).toEqual({});
  expect(cleared.recentTaskSignatures).toEqual({});expect(cleared.activeRun).toBeNull();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).reducedMotion,SETTINGS_KEY)).toBe(true);
});
test('unfinished stage resumes after reload with the same seed, task, lives, hints and answer',async({page})=>{
  await play(page);
  const list=await currentTasks(page);await enter(page,list[0]);
  await expect(page.locator('#task-counter')).toHaveText('Задача 2 из 8');
  await input(page).fill('999');await input(page).press('Enter');await page.locator('#retry-answer').click();
  await page.locator('#hint-button').click();await page.locator('#hint-next').click();
  await input(page).fill('15');const before=await progress(page);
  await page.reload();await page.locator('#continue-game').click();
  await expect(input(page)).toHaveValue('15');await expect(page.locator('#task-counter')).toHaveText('Задача 2 из 8');
  expect((await progress(page)).activeRun.seed).toBe(before.activeRun.seed);
  expect((await progress(page)).activeRun.lives).toBe(2);
  await expect(page.locator('#hint-heading')).toHaveText('Подсказка 2 из 3');
  await page.locator('#restart-run').click();await page.locator('#confirm-restart').click();
  expect((await progress(page)).activeRun.seed).not.toBe(before.activeRun.seed);await expect(input(page)).toHaveValue('');
});
test('remainder: native Tab and Enter, keypad targets focus, invalid remainder leaves lives intact',async({page})=>{
  await unlock(page,25);await page.locator('[data-level="25"]').click();
  const p=(await currentTasks(page,25))[0];
  await expect(input(page)).toBeFocused();await input(page).fill(String(p.answer.quotient));await input(page).press('Enter');
  const remainder=page.locator('#remainder-input');await expect(remainder).toBeFocused();
  await remainder.fill(String(p.metadata.divisor));await remainder.press('Enter');
  await expect(page.locator('#feedback')).toHaveText('Остаток всегда меньше делителя.');
  expect((await progress(page)).activeRun.lives).toBe(3);
  await page.getByRole('button',{name:'Очистить ответ',exact:true}).click();
  await page.getByRole('button',{name:'Цифра '+p.answer.remainder,exact:true}).click();
  await expect(remainder).toHaveValue(String(p.answer.remainder));await remainder.press('Enter');
  await expect(page.locator('#task-counter')).toHaveText('Задача 2 из 8');await expect(input(page)).toBeFocused();
  await page.keyboard.press('Tab');await expect(remainder).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.locator('#submit-answer')).toBeFocused();
});
test('keyboard-only stage: visible focus, native Tab reaches hint and Escape returns to its trigger',async({page})=>{
  await page.goto('/anya-math/');
  await page.locator('#continue-game').focus();await page.keyboard.press('Enter');
  for(let i=0;i<20;i++){
    await page.keyboard.press('Tab');
    if(await page.locator('#hint-button').evaluate(el=>el===document.activeElement))break;
  }
  await expect(page.locator('#hint-button')).toBeFocused();await page.keyboard.press('Space');
  await expect(page.locator('#hint-panel')).toBeVisible();await page.keyboard.press('Tab');
  await expect(page.locator('#hint-close')).toBeFocused();await page.keyboard.press('Escape');
  await expect(page.locator('#hint-panel')).toBeHidden();await expect(page.locator('#hint-button')).toBeFocused();
  await input(page).focus();const list=await currentTasks(page);
  for(let i=0;i<list.length;i++){
    await expect(page.locator('#task-counter')).toHaveText('Задача '+(i+1)+' из 8');
    await expect(input(page)).toBeFocused();await page.keyboard.type(String(list[i].answer));await page.keyboard.press('Enter');
  }
  await expect(page.locator('#screen-results')).toBeVisible();
});
test('table cells show related facts; practice preserves saved story attempt',async({page})=>{
  await play(page);await input(page).fill('15');const before=(await progress(page)).activeRun;
  await page.locator('#table-button').click();await page.locator('[data-cell="7,8"]').click();
  for(const fact of ['7 × 8 = 56','8 × 7 = 56','56 ÷ 7 = 8','56 ÷ 8 = 7'])await expect(page.locator('#fact-family')).toContainText(fact);
  await page.locator('[data-factor="7"]').click();await page.locator('[data-factor="2"]').click();
  await page.locator('[data-mode="divide"]').click();await page.locator('#start-practice').click();
  await expect(page.locator('#expression')).toContainText('÷ 7');
  await input(page).fill('999');await input(page).press('Enter');
  expect((await progress(page)).activeRun).toEqual(before);
  await page.locator('#game-back').click();await page.locator('#continue-game').click();await expect(input(page)).toHaveValue('15');
});
test('speed practice pauses in table/settings/help and ends without changing story stars',async({page})=>{
  await page.clock.install({time:new Date('2026-09-14T10:00:00Z')});await page.clock.pauseAt(new Date('2026-09-14T10:00:01Z'));
  await page.goto('/anya-math/');await page.locator('#table-button').click();
  await page.locator('#speed-duration').selectOption('30');await page.locator('#start-speed').click();
  await page.clock.runFor(1400);await expect(page.locator('#practice-timer')).toHaveText('Осталось 0:29');
  await page.locator('#hint-button').click();await page.clock.runFor(5000);
  await expect(page.locator('#practice-timer')).toHaveText('Осталось 0:29');
  await page.locator('#hint-close').click();await page.locator('#settings-button').click();await page.clock.runFor(5000);
  await expect(page.locator('#practice-timer')).toHaveText('Осталось 0:29');
  await page.getByRole('button',{name:'Закрыть настройки'}).click();await page.clock.runFor(31000);
  await expect(page.locator('#results-title')).toHaveText('Время закончилось — отдохнём?');
  expect((await progress(page)).bestStarsByLevel).toEqual({});expect((await progress(page)).practiceStats.runs).toBe(1);
});
test('three hint steps show a strategy and intermediate work; never change the answer',async({page})=>{
  await unlock(page,22);await page.locator('[data-level="22"]').click();await input(page).fill('15');
  await page.locator('#hint-button').click();const texts=[];
  for(let step=1;step<=3;step++){
    await expect(page.locator('#hint-heading')).toHaveText('Подсказка '+step+' из 3');
    texts.push(await page.locator('#hint-text').textContent());await expect(input(page)).toHaveValue('15');
    if(step<3)await page.locator('#hint-next').click();
  }
  expect(new Set(texts).size).toBe(3);
  await page.keyboard.press('Escape');await expect(page.locator('#hint-panel')).toBeHidden();
});
test('bad storage recovers, author link persists, all stage buttons exist',async({page})=>{
  await page.addInitScript(key=>localStorage.setItem(key,'{oops'),STORAGE_KEY);
  await page.goto('/anya-math/');await expect(page.locator('#continue-game')).toHaveText(/Начать путешествие/);
  await expect(page.getByRole('link',{name:'@ZGennadiy'})).toHaveAttribute('href','https://t.me/ZGennadiy');
  await expect(page.locator('[data-level]')).toHaveCount(36);await expect(page.locator('input[type=password]')).toHaveCount(0);
});
for(const width of [320,390,768,1024,1440])test('responsive '+width+'px: game, table and dialogs do not overflow',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await play(page);
  await expect(page.locator('#expression')).toBeVisible();await expect(page.locator('#submit-answer')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#table-button').click();await page.locator('[data-mode="divide"]').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#settings-button').click();await expect(page.getByRole('dialog',{name:'Настройки созвездия'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('final mixed trial handles numeric, remainder, choices and long expressions at 320px',async({page})=>{
  await unlock(page,36);await page.setViewportSize({width:320,height:900});await page.locator('[data-level="36"]').click();
  const tasks=await currentTasks(page,36);
  for(let i=0;i<tasks.length;i++){
    await expect(page.locator('#task-counter')).toHaveText('Задача '+(i+1)+' из 10');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await enter(page,tasks[i]);
  }
  await expect(page.locator('#results-title')).toHaveText('Твоё созвездие зажжено!');
});
test('200% text scaling and system reduced motion keep all controls usable',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:768,height:1024});await play(page);
  await page.addStyleTag({content:':root { font-size:32px!important }'});
  await expect(input(page)).toBeVisible();await expect(page.locator('#submit-answer')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#table-button')).toBeInViewport();await expect(page.locator('#settings-button')).toBeInViewport();
  expect(await page.locator('.mascot-game').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.locator('#settings-button').click();await expect(page.getByRole('dialog',{name:'Настройки созвездия'})).toBeVisible();
});
