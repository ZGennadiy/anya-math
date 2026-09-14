import { inspectAst, evaluateAst, formatAst, binary } from './math.js';

export function hintsForProblem(problem) {
  const strategy = problem.hint;
  const { divisor, dividend } = problem.metadata;
  if (problem.kind === 'remainder') {
    const q = problem.answer.quotient, smaller = Math.max(1, q - 2);
    return [strategy,
      `${divisor} × ${smaller} = ${divisor * smaller}. Можно ли взять ещё одну такую группу?`,
      `Заполни равенство: ${dividend} = ${divisor} × □ + остаток. Остаток должен быть от 0 до ${divisor-1}.`];
  }
  if (problem.kind === 'missingNumber') {
    if (problem.skill === 'equation') {
      const ast = problem.ast, right = problem.metadata.right;
      return [strategy,
        ast.operator === 'subtract' ? `Сначала прибавь ${evaluateAst(ast.right)} к ${right}. Это вернёт произведение.`
          : `Сначала умножь ${right} на ${evaluateAst(ast.right)}. Это вернёт значение в скобках.`,
        ast.operator === 'subtract' ? `□ = (${right} + ${evaluateAst(ast.right)}) ÷ ${evaluateAst(ast.left.right)}`
          : `□ = ${right} × ${evaluateAst(ast.right)} − ${evaluateAst(ast.left.child.right)}`];
    }
    return [strategy,
      'Запиши обратное действие с двумя известными числами. Делению помогает умножение, а умножению — деление.',
      'Подставь найденное число вместо вопроса. Левая и правая части должны стать равными.'];
  }
  if (problem.ast) {
    const steps = inspectAst(problem.ast).filter(({node}) => node.type === 'binary');
    if (steps.length > 1) {
      const first = steps[0], root = problem.ast.type === 'group' ? problem.ast.child : problem.ast;
      const lastExpression = formatAst(binary(root.operator, evaluateAst(root.left), evaluateAst(root.right)));
      return [strategy,
        `Первый шаг: ${formatAst(first.node)} = ${first.value}. Теперь переходи к следующему действию.`,
        `После промежуточных шагов остаётся ${lastExpression}. Последнее действие — за тобой!`];
    }
    if (problem.ast.operator === 'multiply' && problem.skill !== 'special') {
      const a = evaluateAst(problem.ast.left), count = evaluateAst(problem.ast.right), previous = a * (count - 1);
      return [strategy, `${a} × ${count-1} = ${previous}. Нужна ещё одна группа по ${a}.`, `Осталось сложить ${previous} + ${a}.`];
    }
    if (divisor && dividend) {
      const tens = Math.floor(dividend / (divisor * 10));
      return [strategy,
        tens > 0 ? `${divisor} × 10 = ${divisor * 10}. Сколько таких десятков поместится в ${dividend}?`
          : `Вспомни строку таблицы на ${divisor}. Ищи произведение ${dividend}.`,
        `Проверь свой ответ умножением: □ × ${divisor} должно дать ${dividend}.`];
    }
  }
  return [strategy, 'Проверь правило на маленьком примере с другими числами.',
    'Вернись к заданию и проверь каждый шаг. Можно проговорить рассуждение вслух.'];
}
