import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getLevel, STORAGE_KEY, SETTINGS_KEY, TOTAL_STAGES, GENERATOR_VERSION } from '../public/js/config.js';
import { createProblem, createAttempt, createFreshAttempt, attemptSignature, validateProblem, practiceConfig } from '../public/js/generators.js';
import { binary, evaluateAst, formatAst, inspectAst, accessibleMath } from '../public/js/math.js';
import { normalizeAnswer, editAnswer, validateAnswer } from '../public/js/validation.js';
import { createGame, currentTask, submitAnswer, advance, useHint, starsForGame, tickGameTimer } from '../public/js/game-state.js';
import { initialProgress, loadProgress, saveProgress, saveSettings, recordAttempt, recordAnswer, completeLevel, resetProgress } from '../public/js/storage.js';
import { snapshotRun, restoreRun } from '../public/js/run-storage.js';
import { plural } from '../public/js/strings.js';

function memoryStorage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function answerFor(p){return p.kind==='remainder'?{answer:String(p.answer.quotient),remainder:String(p.answer.remainder),choice:''}:p.choices?{answer:'',remainder:'',choice:String(p.answer)}:{answer:String(p.answer),remainder:'',choice:''};}
function finishedGame(lives=3){
  let g=createGame(getLevel(1),createAttempt(1,35),35);g={...g,lives};
  while(g.phase!=='completed')g=advance(submitAnswer(g,answerFor(currentTask(g))).state);
  return g;
}
// Independent parser: neither the generator nor its AST evaluator is used here.
function parseMath(text){
  const tokens=text.match(/\d+|[()+×÷−]/g);let i=0;
  const atom=()=>{if(tokens[i]==='('){i++;const v=sum();assert.equal(tokens[i++],')');return v;}return Number(tokens[i++]);};
  const product=()=>{let v=atom();while(['×','÷'].includes(tokens[i])){const op=tokens[i++],right=atom();v=op==='×'?v*right:v/right;}return v;};
  const sum=()=>{let v=product();while(['+','−'].includes(tokens[i])){const op=tokens[i++],right=product();v=op==='+'?v+right:v-right;}return v;};
  const result=sum();assert.equal(i,tokens.length);return result;
}
test('36 stages: 12 worlds × training, mix and 10-task trial; final world is advanced',()=>{
  assert.equal(LEVELS.length,36);assert.equal(new Set(LEVELS.map(l=>l.chapter)).size,12);
  for(const l of LEVELS){
    assert.equal(l.problemCount,l.round===3?10:8);assert.equal(l.lives,3);
    assert.equal(l.curriculumMode,l.chapter===12?'grade3-advanced':'grade3-core');
    assert.equal(l.isBoss,l.round===3);assert.equal(l.isSiriusPlus,l.chapter===12);
  }
});
for(const level of LEVELS)test('stage '+level.id+': 10,000 generated problems, independent math and bounds',()=>{
  const modes=new Set();
  for(let seed=0;seed<10000;seed++){
    const p=createProblem(level,seed);assert.equal(validateProblem(p),true);modes.add(p.metadata.generatorKind);
    assert.equal(p.generatorVersion,GENERATOR_VERSION);
    assert.equal(p.levelId,level.id);assert.equal(p.hints.length,3);assert.ok(p.hints.every(h=>typeof h==='string'&&h.length>10));
    assert.ok(p.accessibleText.length>0);
    if(p.ast){
      const x=p.kind==='missingNumber'?p.answer:undefined;
      for(const {node,value} of inspectAst(p.ast,x)){
        assert.ok(Number.isSafeInteger(value)&&value>=0&&value<=level.maxIntermediate);
        if(node.operator==='divide'){
          const divisor=evaluateAst(node.right,x),dividend=evaluateAst(node.left,x);
          assert.ok(divisor>0);assert.equal(dividend%divisor,0);
          // The explicitly required ÷10 / ÷100 facts are the only large-divisor exception.
          if(p.skill!=='special')assert.ok(divisor<=9);
        }
      }
      const display=formatAst(p.ast),result=parseMath(display.replaceAll('?',String(x)));
      assert.equal(result,p.kind==='missingNumber'?p.metadata.right:p.answer);
      assert.ok(p.prompt.includes(display));
      const counts={twoSteps:2,threeSteps:3,parentheses:3,chain:3,fourSteps:4,equation:2};
      if(counts[p.metadata.generatorKind])assert.equal(inspectAst(p.ast,x).filter(n=>n.node.type==='binary').length,counts[p.metadata.generatorKind]);
    }
    if(p.kind==='remainder'){
      const {divisor,dividend}=p.metadata;
      assert.ok(p.answer.remainder>0&&p.answer.remainder<divisor);
      assert.equal(dividend,divisor*p.answer.quotient+p.answer.remainder);
      assert.ok(dividend<=100);
    }
    if(p.skill==='outside')assert.ok(p.metadata.dividend<=100&&p.metadata.quotient>9);
    if(p.skill==='largeMultiply')assert.ok(p.answer<=100);
    if(p.skill==='bigDivision')assert.ok(p.metadata.dividend>=100&&p.metadata.dividend<=999);
    if(p.skill==='remainderProperty'&&p.choices){
      const valid=p.choices.filter(c=>p.metadata.property==='possible'?Number(c.value)<p.metadata.divisor:Number(c.value)>=p.metadata.divisor);
      assert.equal(valid.length,1);assert.equal(valid[0].value,p.answer);
    }
    if(p.skill==='trueFalse')assert.equal(p.answer==='yes',p.metadata.a*p.metadata.c===p.metadata.other);
    if(p.skill==='missingSign'){
      const {left:a,right:b,result}=p.metadata;
      const possibilities={add:a+b,subtract:a-b,multiply:a*b,divide:a/b};
      assert.deepEqual(Object.keys(possibilities).filter(k=>possibilities[k]===result),[p.answer]);
    }
    assert.equal(validateAnswer(p,answerFor(p)).correct,true);
  }
  for(const mode of level.allowedProblemKinds)assert.ok(modes.has(mode),'missing mode '+mode);
});
test('AST rejects fractional, negative, infinite and out-of-bounds intermediate results',()=>{
  for(const ast of [
    binary('multiply',binary('divide',6,4),2),binary('add',binary('subtract',5,20),30),
    binary('divide',0,0),binary('add',999,2),binary('add',NaN,1),binary('multiply',Infinity,0)
  ])assert.throws(()=>evaluateAst(ast));
});
test('rendered precedence, parentheses and Russian accessible operations match mathematics',()=>{
  const ast=binary('subtract',20,binary('subtract',8,3));
  assert.equal(formatAst(ast),'20 − (8 − 3)');assert.equal(parseMath(formatAst(ast)),15);
  assert.equal(parseMath('40 − 16 ÷ 4 + 7'),43);assert.equal(parseMath('(40 − 16) ÷ 3 + 7'),15);
  assert.equal(parseMath('7 × (18 − 9) + 27 ÷ 3'),72);
  assert.match(accessibleMath('7 × 8'),/умножить/);assert.match(accessibleMath('72 ÷ 9'),/разделить/);
});
test('seed determinism, fresh seeds, unique runs and boss coverage',()=>{
  for(const level of LEVELS){
    for(let seed=0;seed<30;seed++){
      const tasks=createAttempt(level,seed);
      assert.equal(tasks.length,level.problemCount);
      assert.equal(new Set(tasks.map(t=>t.signature)).size,tasks.length);
      if(level.isBoss)assert.deepEqual(new Set(tasks.map(t=>t.metadata.generatorKind)),new Set(level.allowedProblemKinds));
    }
    const first=createAttempt(level,1234);
    assert.deepEqual(createAttempt(level,1234),first);
    assert.notEqual(attemptSignature(createAttempt(level,1235)),attemptSignature(first));
    const next=createFreshAttempt(level,1234,attemptSignature(first),first.map(t=>t.signature),[1234,42]);
    assert.ok(![1234,42].includes(next.seed));assert.notEqual(next.signature,attemptSignature(first));
    assert.deepEqual(createAttempt(level,next.seed,next.recent),next.tasks);
  }
});
test('small table pools prioritize unseen tasks and gracefully reuse least recent pairs',()=>{
  let recent=[],previous='';
  for(let run=0;run<20;run++){
    const tasks=createAttempt(1,run,recent),signature=attemptSignature(tasks);
    assert.equal(new Set(tasks.map(t=>t.signature)).size,8);
    if(run<4)for(const task of tasks)assert.ok(!recent.includes(task.signature));
    assert.notEqual(signature,previous);
    recent=[...recent,...tasks.map(t=>t.signature)].slice(-48);previous=signature;
  }
});
test('single- and multi-factor practice use exactly selected tables; no invalid configuration',()=>{
  for(const mode of ['multiply','divide','mixed'])for(const factors of [[2],[7],[2,7,9]]){
    const level=practiceConfig(mode,factors),tasks=createAttempt(level,79);
    assert.equal(tasks.length,8);assert.equal(new Set(tasks.map(t=>t.signature)).size,8);
    for(const p of tasks)assert.ok(factors.includes(evaluateAst(p.skill==='multiply'?p.ast.left:p.ast.right)));
  }
  assert.throws(()=>practiceConfig('multiply',[]));assert.throws(()=>practiceConfig('unknown',[7]));assert.throws(()=>practiceConfig('divide',[10]));
});
test('input regression: physical whole value and append preserve 1,5 = 15; no sanitizing corrupt text',()=>{
  let s='';for(const digit of '153')s=editAnswer(s,{type:'append',digit});assert.equal(s,'153');
  s=editAnswer('',{type:'native',value:'1'});s=editAnswer(s,{type:'append',digit:'5'});assert.equal(s,'15');
  s=editAnswer(s,{type:'backspace'});assert.equal(s,'1');assert.equal(editAnswer(s,{type:'clear'}),'');
  assert.equal(editAnswer('1234',{type:'append',digit:'5'}),'1234');
  for(const raw of ['15abc','1e','1.5','+1','-1','1,5','1a'])assert.equal(editAnswer('1',{type:'native',value:raw}),raw);
});
test('strict parsing rejects invalid raw text, empty, signs, decimals and overlength without losing lives',()=>{
  const game=createGame(getLevel(1),createAttempt(1,1),1);
  for(const raw of ['','  ','e','abc','42a','4.2','4,2','+4','-3','1e3','12345','９']){
    assert.equal(normalizeAnswer(raw).ok,false);
    const result=submitAnswer(game,{answer:raw});
    assert.ok(result.invalid);assert.strictEqual(result.state,game);assert.ok(result.message);
  }
  assert.equal(normalizeAnswer(' 42 ').value,42);assert.equal(normalizeAnswer('0').value,0);
});
test('remainder validation: empty and remainder >= divisor cost no lives; valid wrong answer costs one',()=>{
  const game=createGame(getLevel(25),createAttempt(25,1),1),p=currentTask(game);
  for(const fields of [{answer:''},{answer:String(p.answer.quotient),remainder:''},{answer:'1',remainder:String(p.metadata.divisor)},{answer:'1',remainder:'999'}]){
    const result=submitAnswer(game,fields);assert.ok(result.invalid);assert.strictEqual(result.state,game);
  }
  assert.equal(submitAnswer(game,answerFor(p)).correct,true);
  const wrong=submitAnswer(game,{answer:'999',remainder:'0'});assert.equal(wrong.correct,false);assert.equal(wrong.state.lives,2);
});
test('one submission means one attempt: wrong and correct phases both block repeats',()=>{
  let g=createGame(getLevel(1),createAttempt(1,1),1);
  const first=currentTask(g).id;
  g=submitAnswer(g,{answer:'999'}).state;assert.equal(g.lives,2);assert.equal(g.phase,'wrong');
  assert.strictEqual(submitAnswer(g,{answer:'999'}).state,g);assert.equal(currentTask(g).id,first);
  g=advance(g);assert.equal(g.phase,'answer');assert.equal(currentTask(g).id,first);
  g=submitAnswer(g,answerFor(currentTask(g))).state;assert.equal(g.correct,1);assert.strictEqual(submitAnswer(g,{answer:'999'}).state,g);
  g=advance(g);assert.equal(g.index,1);assert.equal(g.phase,'answer');
});
test('third error ends this run; stars only exist after completion',()=>{
  let g=createGame(getLevel(1),createAttempt(1,1),1);
  for(let i=0;i<3;i++){g=submitAnswer(g,{answer:'999'}).state;if(i<2)g=advance(g);}
  assert.equal(g.phase,'failed');assert.equal(g.lives,0);assert.equal(starsForGame(g),0);assert.strictEqual(advance(g),g);
  for(const n of [1,2,3])assert.equal(starsForGame(finishedGame(n)),n);
  assert.equal(starsForGame(createGame(getLevel(1),createAttempt(1,1),1)),0);
});
test('three hint steps persist on retry; next question resets the step, not the total',()=>{
  let game=createGame(getLevel(22),createAttempt(22,8),8);
  for(let i=0;i<5;i++)game=useHint(game);
  assert.equal(game.hintStep,3);assert.equal(game.hints,3);
  game=advance(submitAnswer(game,{answer:'999'}).state);assert.equal(game.hintStep,3);
  game=advance(submitAnswer(game,answerFor(currentTask(game))).state);assert.equal(game.hintStep,0);assert.equal(game.hints,3);
});
test('practice: unlimited retries; speed timer only ticks during answer/wrong; never awards story stars',()=>{
  const level=practiceConfig('mixed',[7,8],true);
  let game=createGame(level,createAttempt(level,1),1,true,{seconds:30});
  for(let i=0;i<12;i++)game=advance(submitAnswer(game,{answer:'999'}).state);
  assert.equal(game.lives,3);assert.equal(game.phase,'answer');
  game=tickGameTimer(game,1000);assert.equal(game.timer.elapsedMs,1000);
  const correct=submitAnswer(game,answerFor(currentTask(game))).state;
  assert.strictEqual(tickGameTimer(correct,5000),correct);
  game=tickGameTimer(game,30000);assert.equal(game.phase,'timedOut');assert.equal(game.timer.elapsedMs,30000);
  assert.equal(starsForGame(game),0);assert.strictEqual(submitAnswer(game,{answer:'1'}).state,game);
  const story=createGame(getLevel(1),createAttempt(1,1),1);assert.strictEqual(tickGameTimer(story,1000),story);
});
test('complete unlocks next; better stars replace worse; replay cannot erase best; reload persists',()=>{
  const storage=memoryStorage();let p=initialProgress();
  p=recordAttempt(p,1,1,'signature');p=completeLevel(p,1,2);assert.equal(p.unlockedLevel,2);
  p=recordAttempt(p,1,2,'new');p=completeLevel(p,1,1);assert.equal(p.bestStarsByLevel[1],2);
  p=recordAttempt(p,1,3,'newer');p=completeLevel(p,1,3);assert.equal(p.bestStarsByLevel[1],3);
  assert.equal(saveProgress(p,storage),true);
  const reloaded=loadProgress(storage);assert.deepEqual(reloaded.bestStarsByLevel,{1:3});assert.equal(reloaded.unlockedLevel,2);
  assert.strictEqual(completeLevel(p,36,3),p);
  for(let stage=2;stage<=TOTAL_STAGES;stage++)p=completeLevel(p,stage,3);
  assert.equal(p.unlockedLevel,36);assert.equal(p.completedLevels.length,36);
});
test('bounded recent signatures and seed history survive serialization',()=>{
  const storage=memoryStorage();let p=initialProgress();
  for(let seed=0;seed<20;seed++){
    const tasks=createAttempt(1,seed,p.recentTaskSignatures[1]??[]);
    p=recordAttempt(p,1,seed,attemptSignature(tasks),tasks);
  }
  assert.equal(p.recentTaskSignatures[1].length,48);assert.equal(p.previousSeeds[1].length,8);
  saveProgress(p,storage);assert.deepEqual(loadProgress(storage).recentTaskSignatures,p.recentTaskSignatures);
});
test('reload restores a deterministic active run including raw fields, hints, lives and pending correct phase',()=>{
  const level=getLevel(1),recent=createAttempt(1,6).map(t=>t.signature),tasks=createAttempt(level,8,recent);
  let game=createGame(level,tasks,8,false,{recent});
  const fields={answer:'15abc',remainder:'',choice:''};
  assert.deepEqual(restoreRun(snapshotRun(game,fields,true)),{game,fields,hintVisible:true});
  game=useHint(game);game=submitAnswer(game,{answer:'999'}).state;
  assert.deepEqual(restoreRun(snapshotRun(game,fields,true)).game,game);
  game=advance(game);const correctFields=answerFor(currentTask(game));
  game=submitAnswer(game,correctFields).state;
  const restored=restoreRun(snapshotRun(game,correctFields,false));
  assert.deepEqual(restored.game,game);
  assert.equal(advance(restored.game).index,1);
  assert.equal(submitAnswer(restored.game,correctFields).ignored,true);
});
test('corrupt active snapshots and stale generator versions are safely discarded',()=>{
  const game=createGame(getLevel(1),createAttempt(1,8),8),valid=snapshotRun(game,{answer:'',remainder:'',choice:''});
  for(const invalid of [null,{}, {...valid,seed:-1},{...valid,index:999},{...valid,lives:0},{...valid,correct:5},
    {...valid,generatorVersion:'old'},{...valid,history:[{}]},{...valid,fields:{answer:'1'}}])assert.equal(restoreRun(invalid),null);
  assert.equal(snapshotRun({...game,practice:true},{answer:''}),null);
  assert.equal(snapshotRun({...game,phase:'completed'},{answer:''}),null);
});
test('full reset clears all campaign data but retains accessibility settings and unrelated records',()=>{
  const storage=memoryStorage();storage.setItem('other-game','keep');
  const settings={schemaVersion:1,sound:true,reducedMotion:true};saveSettings(settings,storage);
  let p=recordAttempt(initialProgress(settings),1,42,'old tasks',createAttempt(1,42));
  p=completeLevel(p,1,3);p=recordAnswer(p,'multiply',false);saveProgress(p,storage);
  const {progress,saved}=resetProgress(storage);
  assert.equal(saved,true);assert.deepEqual(progress,initialProgress(settings));assert.deepEqual(loadProgress(storage),initialProgress(settings));
  assert.equal(storage.getItem('other-game'),'keep');
  assert.deepEqual(JSON.parse(storage.getItem(SETTINGS_KEY)),settings);
  for(const key of ['completedLevels','bestStarsByLevel','skillStats','lastAttemptSeedByLevel','lastAttemptSignatureByLevel','recentTaskSignatures','previousSeeds','records'])assert.equal(Object.keys(progress[key]).length,0);
});
test('malformed storage, legacy v1 and unavailable storage recover safely',()=>{
  const storage=memoryStorage();
  for(const value of ['{broken','null','42','{"schemaVersion":999}','{"schemaVersion":2,"bestStarsByLevel":{"1":999}}']){
    storage.setItem(STORAGE_KEY,value);assert.equal(loadProgress(storage).unlockedLevel,1);
  }
  storage.removeItem(STORAGE_KEY);
  storage.setItem('anya-math:progress:v1',JSON.stringify({schemaVersion:1,levels:[{levelId:'1',bestStars:2}],settings:{sound:true,animations:false}}));
  const migrated=loadProgress(storage);assert.equal(migrated.unlockedLevel,2);assert.equal(migrated.settings.reducedMotion,true);
  const blocked={getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){throw new Error('blocked')}};
  assert.deepEqual(loadProgress(blocked),initialProgress());assert.equal(saveProgress(initialProgress(),blocked),false);assert.equal(resetProgress(blocked).saved,false);
});
test('Russian plural forms include teen exceptions',()=>{
  const words=['жизнь','жизни','жизней'];
  assert.deepEqual([1,2,3,5,11,12,21,22].map(n=>plural(n,words)),['жизнь','жизни','жизни','жизней','жизней','жизней','жизнь','жизни']);
});
