import { test, expect } from '@playwright/test';
import { STORAGE_KEY } from '../../public/js/config.js';
import { createAttempt } from '../../public/js/generators.js';

// Touch devices answer with the on-screen keypad only: the fields are read-only so no
// virtual keyboard can cover it. Native typing is a desktop path, covered by game.spec.js.
const keypad=async(page,digits)=>{
  for(const digit of String(digits))await page.getByRole('button',{name:'Цифра '+digit,exact:true}).tap();
};

test('mobile: read-only fields, touch keypad keeps 15, check is above decorations',async({page},testInfo)=>{
  await page.goto('/anya-math/');
  await page.locator('#continue-game').tap();
  const input=page.locator('#answer-input');
  await expect(input).toHaveAttribute('inputmode','none');
  await expect(input).toHaveJSProperty('readOnly',true);
  await expect(input).toHaveAttribute('dir','ltr');
  await expect(page.locator('#submit-answer')).toBeInViewport();
  const check=await page.locator('#submit-answer').boundingBox(),mascot=await page.locator('.mascot-game').boundingBox();
  expect(check.y+check.height).toBeLessThan(mascot.y+mascot.height);
  await keypad(page,'15');
  await expect(input).toHaveValue('15');
  await page.getByRole('button',{name:'Очистить ответ',exact:true}).tap();
  await input.tap();await page.keyboard.type('128');
  await expect(input).toHaveValue(''); // No keyboard can open, and a stray key must not edit the field.
  await keypad(page,'128');await expect(input).toHaveValue('128');
  await page.getByRole('button',{name:'Удалить последнюю цифру',exact:true}).tap();
  await expect(input).toHaveValue('12');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await testInfo.attach('mobile-game',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});

test('mobile: Enter submits once, clears the next field and restores focus',async({page})=>{
  await page.goto('/anya-math/');await page.locator('#continue-game').tap();
  const run=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).activeRun,STORAGE_KEY);
  const task=createAttempt(1,run.seed,run.recent)[0],input=page.locator('#answer-input');
  await keypad(page,task.answer);await input.press('Enter');await page.keyboard.press('Enter');
  await expect(page.locator('#task-counter')).toHaveText('Задача 2 из 8');
  await expect(input).toHaveValue('');await expect(input).toBeFocused();
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).activeRun.correct,STORAGE_KEY)).toBe(1);
});

test('mobile: long expressions, remainders and table remain inside the viewport',async({page},testInfo)=>{
  await page.goto('/anya-math/');
  await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({schemaVersion:2,bestStarsByLevel:Object.fromEntries(Array.from({length:35},(_,i)=>[i+1,3]))})),STORAGE_KEY);
  await page.reload();await page.locator('[data-level="36"]').tap();
  const run=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).activeRun,STORAGE_KEY);
  const tasks=createAttempt(36,run.seed,run.recent);
  for(let i=0;i<tasks.length;i++){
    await expect(page.locator('#task-counter')).toHaveText('Задача '+(i+1)+' из 10');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const task=tasks[i];
    if(task.choices){await page.locator('[data-choice="'+task.answer+'"]').tap();await page.locator('#submit-answer').tap();}
    else{
      await page.locator('#answer-input').tap();
      await keypad(page,task.kind==='remainder'?task.answer.quotient:task.answer);
      if(task.kind==='remainder'){await page.locator('#remainder-input').tap();await keypad(page,task.answer.remainder);}
      await page.locator('#answer-input').press('Enter');
    }
  }
  await expect(page.locator('#screen-results')).toBeVisible();
  await page.locator('#table-button').tap();await page.locator('[data-mode="divide"]').tap();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await testInfo.attach('mobile-table',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
