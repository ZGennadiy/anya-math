// AST evaluator and formatter retained from the first game's vanilla-JS design.
// Every node is checked, so a valid final result cannot hide an invalid intermediate.
const symbols = { multiply: '×', divide: '÷', add: '+', subtract: '−' };
const precedence = { add: 1, subtract: 1, multiply: 2, divide: 2 };
export const number = value => ({ type: 'number', value });
export const unknown = () => ({ type: 'unknown' });
export const group = child => ({ type: 'group', child });
export const binary = (operator, left, right) => ({ type: 'binary', operator,
  left: typeof left === 'number' ? number(left) : left,
  right: typeof right === 'number' ? number(right) : right });
export function evaluateAst(ast, x) {
  let value;
  if (ast.type === 'number') value = ast.value;
  else if (ast.type === 'unknown') value = x;
  else if (ast.type === 'group') value = evaluateAst(ast.child, x);
  else {
    const a = evaluateAst(ast.left, x), b = evaluateAst(ast.right, x);
    switch (ast.operator) {
      case 'multiply': value = a * b; break;
      case 'divide':
        if (b === 0 || a % b !== 0) throw new Error('Division must be exact and nonzero');
        value = a / b; break;
      case 'add': value = a + b; break;
      case 'subtract': value = a - b; break;
      default: throw new Error('Unknown operator');
    }
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > 1000) throw new Error('Node out of range');
  return value;
}
export function formatAst(ast) {
  if (ast.type === 'number') return String(ast.value);
  if (ast.type === 'unknown') return '?';
  if (ast.type === 'group') return `(${formatAst(ast.child)})`;
  const p = precedence[ast.operator];
  const side = (child, right) => {
    const s = formatAst(child), cp = precedence[child.operator];
    return child.type === 'binary' && (cp < p || (right && cp === p)) ? `(${s})` : s;
  };
  return `${side(ast.left, false)} ${symbols[ast.operator]} ${side(ast.right, true)}`;
}
export function inspectAst(ast, x) {
  const nodes = [];
  function visit(node) {
    if (node.type === 'binary') { visit(node.left); visit(node.right); }
    if (node.type === 'group') visit(node.child);
    nodes.push({ node, value: evaluateAst(node, x) });
  }
  visit(ast); return nodes;
}
export function explanationForAst(ast, x) {
  return inspectAst(ast, x).filter(({node}) => node.type === 'binary').map(({node, value}) =>
    `${evaluateAst(node.left, x)} ${symbols[node.operator]} ${evaluateAst(node.right, x)} = ${value}`).join(' → ');
}
export function accessibleMath(text) {
  return text.replaceAll('×',' умножить на ').replaceAll('÷',' разделить на ')
    .replaceAll('−',' минус ').replaceAll('+',' плюс ').replaceAll('=',' равно ')
    .replaceAll('(',' открывается скобка ').replaceAll(')',' закрывается скобка ')
    .replace(/\s+/g,' ').trim();
}
