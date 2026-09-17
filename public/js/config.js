export const APP_TITLE = 'Аня и Снежка';
export const APP_SUBTITLE = 'Математическое созвездие';
export const GENERATOR_VERSION = 'anya-constellation-3';
export const STORAGE_KEY = 'anya-math:progress:v2';
export const SETTINGS_KEY = 'anya-math:settings:v1';
export const MAX_ANSWER_LENGTH = 4;
export const MAX_RAW_LENGTH = 64;
export const RECENT_TASK_LIMIT = 48;
export const PREVIOUS_SEED_LIMIT = 8;
export const ROUND_NAMES = ['Тренировка', 'Микс', 'Звёздное испытание'];
const worldDefinitions = [
  ['Разминка Снежки', 'Дружим с таблицей ×2–5', '✿', 'rose', ['multiply'], [], [2,3,4,5]],
  ['Лапки делят', 'Умножение в обратную сторону', '÷', 'blue', ['divide'], ['multiply'], [2,3,4,5]],
  ['Радужная таблица', 'Открываем ×6 и ×7', '☀', 'mint', ['multiply'], ['divide'], [6,7]],
  ['Звёздная таблица', '×8, ×9 и секреты деления', '✦', 'violet', ['multiply','divide'], [], [8,9]],
  ['Пропавшая звезда', 'Находим неизвестное число', '?', 'gold', ['missingFactor','missingDividend','missingDivisor'], ['multiply','divide','trueFalse']],
  ['Круглая орбита', 'Десятки, сотни и удобные части', '100', 'blue', ['roundDivision','outside','largeMultiply','special'], ['missingFactor']],
  ['Две ступеньки', 'Решаем в два действия', '↗', 'mint', ['twoSteps'], ['multiply','divide']],
  ['Скобки Ани', 'У каждого действия своё место', '( )', 'rose', ['parentheses'], ['twoSteps','missingFactor']],
  ['Остаток Снежки', 'Когда делится не поровну', '…', 'violet', ['remainder'], ['divide','remainderProperty']],
  ['Большое деление', 'Большие числа, знакомые шаги', '✧', 'gold', ['bigDivision','roundDivision'], ['outside','largeMultiply','remainder']],
  ['Цепочки PRO', 'Думаем на три шага вперёд', '⋆', 'blue', ['chain','threeSteps'], ['parentheses','remainder']],
  ['Созвездие Сириус+', 'Дополнительное испытание', '♔', 'violet', ['fourSteps','chain','equation'], ['multiply','divide','remainder','missingFactor','parentheses','findError','missingSign']],
];
export const WORLDS = worldDefinitions.map(([title, subtitle, symbol, color, skills, review, factors], index) =>
  Object.freeze({ id:index+1, title, subtitle, symbol, color, skills, review, factors, advanced:index >= 9 }));
export const LEVELS = WORLDS.flatMap(world => ROUND_NAMES.map((roundTitle, index) => {
  const round = index+1, id = (world.id-1)*3+round;
  const review = round === 1 ? [] : round === 2 ? world.review.slice(0,3) : world.review;
  return Object.freeze({
    id, title:world.title, roundTitle, round, chapter:world.id, problemCount:round === 3 ? 10 : 8,
    lives:3, difficulty:world.id, isBoss:round === 3, isSiriusPlus:world.id === 12,
    curriculumMode:world.id === 12 ? 'grade3-advanced' : 'grade3-core',
    maxIntermediate:1000, allowedProblemKinds:[...new Set([...world.skills,...review])],
    generatorConfig:{ ...(world.factors ? {factors:world.factors} : {}), remainderMaxQuotient:round === 1 ? 9 : 14 },
  });
}));
export const TOTAL_STAGES = LEVELS.length;
export const TOTAL_STARS = TOTAL_STAGES * 3;
export const getLevel = id => LEVELS.find(level => level.id === Number(id));
