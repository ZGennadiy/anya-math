import { binary as b, group as g, unknown, evaluateAst, formatAst, explanationForAst, inspectAst, accessibleMath } from './math.js';
import { createRng, int, pick, shuffle, newSeed } from './random.js';
import { getLevel, GENERATOR_VERSION } from './config.js';
import { hintsForProblem } from './hints.js';

const arithmetic = (ast, skill, hint) => ({ kind: 'numericAnswer', prompt: formatAst(ast), answer: evaluateAst(ast), ast,
  skill, hint, explanation: explanationForAst(ast), metadata: {} });
const divisionHint = (a, d) => a % 10 === 0 && a >= 100
  ? `Представь ${a} как ${a / 10} десятков. Раздели количество десятков на ${d}.`
  : `Какое число нужно умножить на ${d}, чтобы получить ${a}?`;
const stepsHint = 'Сначала скобки, затем умножение и деление, потом сложение и вычитание. Действия одной ступени — слева направо.';

function multiply(rng, config = {}) {
  const a = pick(rng, config.factors ?? [2,3,4,5,6,7,8,9]), c = int(rng, 2, 9);
  return arithmetic(b('multiply', a, c), 'multiply', `Возьми по ${a} всего ${c} раз. Можно вспомнить соседний пример и прибавить ещё ${a}.`);
}
function divide(rng, config = {}) {
  const divisor = pick(rng, config.factors ?? [2,3,4,5,6,7,8,9]), quotient = int(rng, 2, 9), dividend = divisor * quotient;
  const p = arithmetic(b('divide', dividend, divisor), 'divide', divisionHint(dividend, divisor));
  p.metadata = { divisor, quotient, dividend, exact: true }; return p;
}
function missing(rng, mode) {
  const a = int(rng, 2, 9), c = int(rng, 2, 9), product = a * c;
  let ast, answer, right, hint;
  if (mode === 'missingFactor') {
    answer = c; right = product; ast = rng() < .5 ? b('multiply', a, unknown()) : b('multiply', unknown(), a);
    hint = `Чтобы найти неизвестный множитель, раздели ${product} на известный множитель ${a}.`;
  } else if (mode === 'missingDividend') {
    answer = product; right = c; ast = b('divide', unknown(), a);
    hint = `Чтобы найти делимое, умножь частное ${c} на делитель ${a}.`;
  } else {
    answer = a; right = c; ast = b('divide', product, unknown());
    hint = `Чтобы найти делитель, раздели делимое ${product} на частное ${c}.`;
  }
  const actualRight = evaluateAst(ast, answer);
  if (right !== actualRight) throw new Error('Invalid equation');
  return { kind: 'missingNumber', prompt: `${formatAst(ast)} = ${actualRight}`, answer, ast, skill: mode, hint,
    explanation: `Вместо ? подставим ${answer}: ${explanationForAst(ast, answer)}.`, metadata: { right: actualRight } };
}
function special(rng) {
  const a = int(rng, 2, 9), mode = int(rng, 0, 6);
  let ast, hint;
  if (mode === 0) { ast = b('multiply', a, 0); hint = 'Умножение на ноль означает: ни одной группы.'; }
  if (mode === 1) { ast = b('multiply', a, 1); hint = 'Умножение на один — взять число один раз.'; }
  if (mode === 2) { ast = b('divide', a, 1); hint = 'Если всё отдать в одну группу, сколько будет в этой группе?'; }
  if (mode === 3) { ast = b('multiply', a, 10); hint = 'Один десяток — это десять единиц.'; }
  if (mode === 4) { ast = b('divide', a * 10, 10); hint = 'Посчитай, сколько десятков в делимом.'; }
  if (mode === 5) { ast = b('divide', a * 100, 100); hint = 'Посчитай, сколько сотен в делимом.'; }
  if (mode === 6) { ast = b('divide', 0, a); hint = 'Если нечего раскладывать по группам, сколько окажется в каждой?'; }
  return arithmetic(ast, 'special', hint);
}
function large(rng, mode) {
  if (mode === 'largeMultiply') {
    const c = int(rng, 2, 6), a = int(rng, 11, Math.min(29, Math.floor(100/c))), tens = Math.floor(a / 10) * 10;
    return arithmetic(b('multiply', a, c), mode, `Разложи ${a} на ${tens} и ${a % 10}. Умножь обе части на ${c}, затем сложи.`);
  }
  const divisor = int(rng, 2, 9);
  const quotient = mode === 'outside' ? int(rng, 11, Math.floor(100 / divisor))
    : mode === 'roundDivision' ? int(rng, 2, 9) * 10
    : int(rng, Math.max(10, Math.ceil(100 / divisor / 10)), Math.floor(990 / divisor / 10)) * 10;
  const dividend = divisor * quotient;
  const p = arithmetic(b('divide', dividend, divisor), mode, mode === 'outside'
    ? `Разложи ${dividend} на ${divisor * 10} и ${dividend - divisor * 10}. Раздели обе части на ${divisor}, затем сложи.`
    : divisionHint(dividend, divisor));
  p.metadata = { divisor, quotient, dividend, exact: true }; return p;
}
function remainder(rng, small, config = {}) {
  const divisor = int(rng, 2, small ? 5 : 9), rest = int(rng, 1, divisor - 1);
  const quotient = int(rng, 1, small ? 5 : Math.min(config.remainderMaxQuotient ?? 14, Math.floor((100-rest)/divisor)));
  const dividend = divisor * quotient + rest;
  return { kind: 'remainder', prompt: `${dividend} ÷ ${divisor}`, answer: { quotient, remainder: rest }, skill: 'remainder',
    hint: `Найди самое большое произведение на ${divisor}, которое не превосходит ${dividend}. Оставшаяся часть должна быть меньше ${divisor}.`,
    explanation: `${dividend} = ${divisor} × ${quotient} + ${rest}. Остаток ${rest} меньше делителя ${divisor}.`,
    metadata: { dividend, divisor, quotient, remainder: rest } };
}
function remainderProperty(rng) {
  const divisor = int(rng, 2, 9), type = int(rng, 0, 2);
  if (type === 0) {
    return { kind: 'numericAnswer', prompt: `Какой самый большой остаток возможен при делении на ${divisor}?`, answer: divisor - 1,
      skill: 'remainderProperty', hint: 'Остаток всегда меньше делителя. Ищи ближайшее меньшее целое число.',
      explanation: `Остаток меньше ${divisor}, поэтому самый большой — ${divisor - 1}.`, metadata: { divisor, property: 'largest' } };
  }
  const valid = int(rng, 0, divisor - 1), invalid = divisor + int(rng, 0, 6);
  const correct = type === 1 ? valid : invalid;
  const others = type === 1 ? [invalid, invalid + 1, invalid + 2] : shuffle(rng, Array.from({length: divisor}, (_,i) => i)).slice(0, 3);
  return { kind: 'chooseCorrect', prompt: `Какой остаток ${type === 1 ? 'возможен' : 'невозможен'} при делении на ${divisor}?`, answer: String(correct),
    choices: shuffle(rng, [correct, ...others]).map(v => ({ value: String(v), label: String(v) })), skill: 'remainderProperty',
    hint: 'При точном делении остаток равен нулю. В остальных случаях он больше нуля, но всегда меньше делителя.',
    explanation: `Допустимы остатки от 0 до ${divisor - 1}. ${correct} ${type === 1 ? 'входит' : 'не входит'} в этот диапазон.`, metadata: { divisor, property: type === 1 ? 'possible' : 'impossible' } };
}
function expression(rng, mode) {
  const a = int(rng, 2, 9), c = int(rng, 2, 9), k = int(rng, 2, 12);
  let ast;
  if (mode === 'twoSteps') ast = rng() < .5 ? b('add', b('divide', a*c, c), k) : b('subtract', b('multiply', a, c), int(rng, 1, a*c));
  if (mode === 'threeSteps') ast = rng() < .5
    ? b('add', b('subtract', a + k, b('divide', a*c, c)), int(rng, 1, 20))
    : b('subtract', b('multiply', a, c), b('divide', Math.min(k,a*c) * c, c));
  if (mode === 'parentheses') {
    if (rng() < .5) ast = b('add', b('divide', g(b('subtract', a*c+k, k)), c), int(rng, 1, 12));
    else {
      const d = int(rng, 2, 9), q = int(rng, Math.ceil((a*c+1)/d), Math.ceil((a*c+1)/d)+8);
      ast = b('divide', g(b('add', b('multiply', a, c), d*q-a*c)), d);
    }
  }
  if (mode === 'chain') {
    const m = int(rng, 2, 9);
    ast = b('multiply', g(b('add', b('divide', a*c, c), k)), m);
  }
  if (mode === 'fourSteps') {
    const extra = int(rng, 2, 9), q = int(rng, 2, 9);
    ast = b('add', b('multiply', a, g(b('subtract', c+extra, extra))), b('divide', k*q, k));
    // k may be 10..12 in other expression modes; exact divisors here stay one digit.
    if (k > 9) ast = b('add', b('multiply', a, g(b('subtract', c+extra, extra))), b('divide', a*q, a));
  }
  return { ...arithmetic(ast, mode, stepsHint), kind: 'expression' };
}
function equation(rng) {
  const x = int(rng, 3, 18), c = int(rng, 2, 9); let ast, hint;
  if (rng() < .5) {
    const k = int(rng, 1, x*c-1); ast = b('subtract', b('multiply', unknown(), c), k);
    hint = `Двигайся с конца: сначала верни вычтенное число ${k}, затем раздели результат на ${c}.`;
  } else {
    const q = int(rng, Math.ceil((x+1)/c), Math.ceil((x+1)/c)+6), k = q*c-x;
    ast = b('divide', g(b('add', unknown(), k)), c);
    hint = `Двигайся с конца: умножь правую часть на ${c}, затем вычти ${k}.`;
  }
  const right = evaluateAst(ast, x);
  return { kind: 'missingNumber', prompt: `${formatAst(ast)} = ${right}`, ast, answer: x, skill: 'equation', hint,
    explanation: `Проверим число ${x}: ${explanationForAst(ast,x)}.`, metadata: { right } };
}
function reasoning(rng, mode) {
  const a = int(rng, 2, 9), c = int(rng, 2, 9), product = a*c;
  if (mode === 'trueFalse') {
    const correct = rng() < .5, other = correct ? product : product + int(rng, 1, 8);
    return { kind: 'trueFalse', prompt: `Аня: «Если ${product} ÷ ${a} = ${c}, то ${c} × ${a} = ${other}». Аня права?`, answer: correct ? 'yes' : 'no',
      choices: [{value:'yes',label:'Да, права'},{value:'no',label:'Нет, ошибка'}], skill: mode,
      hint: 'Умножение и деление — обратные действия. Проверь второе равенство.', explanation: `${c} × ${a} = ${product}.`, metadata: { a, c, other } };
  }
  if (mode === 'findError') {
    const k = int(rng, 2, 12), ast = b('add', k, b('multiply', a, c)), wrong = (k+a)*c;
    return { kind:'numericAnswer', prompt:`Снежка решила: ${formatAst(ast)} = ${wrong}. Исправь ответ.`, ast, answer:evaluateAst(ast), skill:mode,
      hint:'Снежка начала со сложения. Вспомни, какое действие нужно выполнить первым.', explanation:explanationForAst(ast), metadata:{ wrong } };
  }
  // Distinct operands avoid ambiguous 2 + 2 = 2 × 2. Product is bigger than either operand.
  const left = int(rng, 3, 9), right = int(rng, 3, 9), sign = rng() < .5 ? 'multiply' : 'add', ast = b(sign,left,right);
  return { kind:'chooseCorrect', prompt:`${left} ? ${right} = ${evaluateAst(ast)}`, answer:sign,
    choices:[{value:'add',label:'+'},{value:'subtract',label:'−'},{value:'multiply',label:'×'},{value:'divide',label:'÷'}],
    skill:mode, hint:'Попробуй действия по очереди. Какое из них даёт число справа?', explanation:explanationForAst(ast), metadata:{ left,right,result:evaluateAst(ast) } };
}
function generateKind(rng, mode, config) {
  if (mode === 'multiply') return multiply(rng, config);
  if (mode === 'divide') return divide(rng, config);
  if (mode.startsWith('missing') && mode !== 'missingSign') return missing(rng, mode);
  if (mode === 'special') return special(rng);
  if (['outside','largeMultiply','roundDivision','bigDivision'].includes(mode)) return large(rng, mode);
  if (mode === 'remainder' || mode === 'remainderSmall') return remainder(rng, mode === 'remainderSmall', config);
  if (mode === 'remainderProperty') return remainderProperty(rng);
  if (['twoSteps','threeSteps','parentheses','chain','fourSteps'].includes(mode)) return expression(rng, mode);
  if (mode === 'equation') return equation(rng);
  if (['trueFalse','findError','missingSign'].includes(mode)) return reasoning(rng, mode);
  throw new Error(`Unknown generator: ${mode}`);
}
export function validateProblem(p) {
  if (!p.prompt || !p.hint || !p.explanation) throw new Error('Incomplete problem');
  const values = typeof p.answer === 'object' ? Object.values(p.answer) : typeof p.answer === 'number' ? [p.answer] : [];
  if (values.some(n => !Number.isSafeInteger(n) || n < 0 || n > 1000)) throw new Error('Invalid answer');
  if (p.ast) {
    const result = evaluateAst(p.ast, p.kind === 'missingNumber' ? p.answer : undefined);
    if (result !== (p.kind === 'missingNumber' ? p.metadata.right : p.answer)) throw new Error('AST answer mismatch');
    inspectAst(p.ast, p.kind === 'missingNumber' ? p.answer : undefined);
  }
  if (p.kind === 'remainder') {
    const {dividend,divisor} = p.metadata, {quotient,remainder:r} = p.answer;
    if (!(divisor >= 2 && divisor <= 9 && quotient >= 1 && r > 0 && r < divisor && dividend === divisor*quotient+r)) throw new Error('Invalid remainder');
  }
  if (p.choices && (new Set(p.choices.map(c=>c.value)).size !== p.choices.length || !p.choices.some(c=>c.value === p.answer))) throw new Error('Invalid choices');
  return true;
}
function decorate(problem, mode, level) {
  problem.metadata = {...problem.metadata, generatorKind:mode};
  problem.levelId = level.id;
  problem.generatorVersion = GENERATOR_VERSION;
  problem.difficulty = level.difficulty;
  problem.solution = problem.kind === 'remainder' ? {kind:'remainder',...problem.answer}
    : problem.choices ? {kind:'choice',value:problem.answer} : {kind:'integer',value:problem.answer};
  problem.signature = [problem.kind, problem.ast ? formatAst(problem.ast) : problem.prompt, JSON.stringify(problem.solution)].join('|');
  problem.accessibleText = accessibleMath(problem.prompt);
  problem.hints = hintsForProblem(problem);
  problem.skillTag = level.generatorConfig?.factors?.length === 1 ? problem.skill + '-' + level.generatorConfig.factors[0] : problem.skill;
  validateProblem(problem);
  if (problem.ast) {
    const nodes = inspectAst(problem.ast, problem.kind === 'missingNumber' ? problem.answer : undefined);
    if (nodes.some(n => n.value > (level.maxIntermediate ?? 1000))) throw new Error('Level bounds exceeded');
    const counts = {twoSteps:2,threeSteps:3,parentheses:3,chain:3,fourSteps:4,equation:2};
    if (counts[mode] && nodes.filter(n => n.node.type === 'binary').length !== counts[mode]) throw new Error('Wrong operation count');
  }
  if (mode === 'fourSteps' && level.curriculumMode !== 'grade3-advanced') throw new Error('Advanced expression in core');
  return problem;
}
function tablePool(mode, level) {
  const candidates = [];
  for (const a of level.generatorConfig?.factors ?? [2,3,4,5,6,7,8,9]) for (let q=2;q<=9;q++) {
    let problem;
    if (mode === 'multiply') problem = arithmetic(b('multiply',a,q),'multiply', 'Разложи произведение на знакомый соседний пример и ещё одну группу.');
    else {
      problem = arithmetic(b('divide',a*q,a),'divide',divisionHint(a*q,a));
      problem.metadata = {divisor:a,quotient:q,dividend:a*q,exact:true};
    }
    candidates.push(decorate(problem, mode, level));
  }
  return candidates;
}
export function createProblem(levelOrId, seed) {
  const level = typeof levelOrId === 'object' ? levelOrId : getLevel(levelOrId);
  if (!level) throw new Error('Unknown stage');
  const rng=createRng(seed), mode=pick(rng,level.allowedProblemKinds);
  const problem=decorate(generateKind(rng,mode,level.generatorConfig),mode,level);
  return {...problem,id:String(seed)+'-single'};
}
export function createAttempt(levelOrId, seed, recentSignatures = []) {
  const level = typeof levelOrId === 'object' ? levelOrId : getLevel(levelOrId);
  if (!level) throw new Error('Unknown stage');
  const rng=createRng(seed), tasks=[], used=new Set();
  const modes=shuffle(rng,level.allowedProblemKinds);
  const recency = new Map(recentSignatures.map((signature,index)=>[signature,index]));
  const pools = new Map(modes.map(mode=>{
    let pool;
    if (mode === 'multiply' || mode === 'divide') pool=tablePool(mode,level);
    else {
      const unique = new Map();
      for (let i=0;i<40;i++) {
        const p=decorate(generateKind(rng,mode,level.generatorConfig),mode,level);
        unique.set(p.signature,p);
      }
      pool=[...unique.values()];
    }
    // Randomise equally recent candidates; unseen first, then least recently used.
    pool=shuffle(rng,pool).sort((a,b)=>(recency.get(a.signature)??-1)-(recency.get(b.signature)??-1));
    return [mode,pool];
  }));
  for(let index=0;index<level.problemCount;index++) {
    const mode=modes[index % modes.length], pool=pools.get(mode);
    const problem=pool.find(p=>!used.has(p.signature));
    if (!problem) throw new Error('Not enough unique problems for '+mode);
    used.add(problem.signature);
    tasks.push({...problem,id:String(seed)+'-'+index});
  }
  return tasks;
}
export const attemptSignature = tasks => tasks.map(p => p.signature).join('\n');
export function createFreshAttempt(level, previousSeed, previousSignature = '', recent = [], previousSeeds = []) {
  let seed=newSeed(previousSeed);
  for(let i=0;i<50;i++) {
    if(previousSeeds.includes(seed)) {seed=(seed+1)>>>0;continue;}
    const tasks=createAttempt(level,seed,recent), signature=attemptSignature(tasks);
    if(signature!==previousSignature) return {seed,tasks,signature,recent:[...recent]};
    seed=(seed+1)>>>0;
  }
  throw new Error('Unable to refresh attempt');
}
export function practiceConfig(mode, factor, speed = false) {
  const factors = Array.isArray(factor) ? [...new Set(factor)] : [factor];
  if (!factors.length || factors.some(n=>!Number.isInteger(n)||n<2||n>9)) throw new Error('Invalid practice factors');
  if (!['multiply','divide','mixed'].includes(mode)) throw new Error('Invalid practice mode');
  const sign=mode==='multiply'?'×':mode==='divide'?'÷':'× и ÷';
  return {id:0,title:(speed?'На скорость ':'Тренировка ')+sign+factors.join(', '),roundTitle:'Свободная тренировка',round:1,
    chapter:1,difficulty:1,problemCount:8,lives:3,curriculumMode:'grade3-core',maxIntermediate:1000,
    allowedProblemKinds:mode==='mixed'?['multiply','divide']:[mode],generatorConfig:{factors}};
}
