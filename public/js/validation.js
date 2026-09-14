import { MAX_ANSWER_LENGTH } from './config.js';
export function normalizeAnswer(raw) {
  const text=String(raw ?? '').trim();
  if (!text) return {ok:false,error:'empty',message:'Введи ответ, а потом нажми «Проверить».'};
  if (!/^[0-9]+$/.test(text)) return {ok:false,error:'integer',message:'Здесь нужны только цифры. Исправь ответ.'};
  if(text.length>MAX_ANSWER_LENGTH || !Number.isSafeInteger(Number(text))) return {ok:false,error:'range',message:'Ответ слишком длинный. Здесь достаточно четырёх цифр.'};
  return {ok:true,value:Number(text)};
}
export function validateAnswer(task, fields) {
  if (task.choices) {
    if (!task.choices.some(c=>c.value===fields.choice)) return {valid:false,field:'choice',message:'Сначала выбери один из ответов.'};
    return {valid:true,correct:fields.choice===task.answer};
  }
  const number=normalizeAnswer(fields.answer);
  if(!number.ok) return {valid:false,field:'answer',message:number.message};
  if(task.kind==='remainder') {
    const remainder=normalizeAnswer(fields.remainder);
    if(!remainder.ok) return {valid:false,field:'remainder',message:remainder.error==='empty'?'Осталось ввести остаток.':remainder.message};
    if(remainder.value>=task.metadata.divisor) return {valid:false,field:'remainder',message:'Остаток всегда меньше делителя.'};
    return {valid:true,correct:number.value===task.answer.quotient && remainder.value===task.answer.remainder};
  }
  return {valid:true,correct:number.value===task.answer};
}
// Native input supplies its whole current value, including invalid input to explain.
// Touch buttons append, never reuse a stale selectionStart from a blurred field.
export function editAnswer(previous, action) {
  if(action.type==='native') return String(action.value ?? '');
  if(action.type==='clear') return '';
  if(action.type==='backspace') return previous.slice(0,-1);
  if(action.type==='append') return /^[0-9]$/.test(action.digit) && previous.length<MAX_ANSWER_LENGTH ? previous+action.digit : previous;
  return previous;
}
