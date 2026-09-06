import ts from 'typescript';

const CONTEXT_FIELDS = Object.freeze(['weather', 'temp', 'city', 'query', 'tags'] as const);

function callName(node: ts.CallExpression): string | null {
  return ts.isIdentifier(node.expression) ? node.expression.text : null;
}

function isCurrentSnapshot(node: ts.Expression | undefined): boolean {
  if (!node || !ts.isCallExpression(node) || node.arguments.length !== 0) return false;
  const expression = node.expression;
  return ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === 'webStylePreferenceController'
    && expression.name.text === 'getSnapshot';
}

function isParamsField(node: ts.Expression, field: string): boolean {
  return ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === 'params'
    && node.name.text === field;
}

export function auditRecommendationPreferenceCall(source: string): string[] {
  const file = ts.createSourceFile(
    'recommendation.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const contextCalls: ts.CallExpression[] = [];
  const recommendationCalls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      if (callName(node) === 'withConfirmedStylePreferenceContext') contextCalls.push(node);
      if (callName(node) === 'aiRecommendOutfits') recommendationCalls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  const violations: string[] = [];
  if (contextCalls.length !== 1) violations.push('single_context_required');
  const context = contextCalls[0];
  if (!context) return violations;

  const owner = context.arguments[2];
  if (!owner || !ts.isIdentifier(owner) || owner.text !== 'userId') {
    violations.push('current_user_required');
  }
  if (!isCurrentSnapshot(context.arguments[1])) violations.push('current_snapshot_required');

  const fields = context.arguments[0];
  if (!fields || !ts.isObjectLiteralExpression(fields)) {
    violations.push('literal_context_required');
  } else {
    for (const field of CONTEXT_FIELDS) {
      const property = fields.properties.find((candidate): candidate is ts.PropertyAssignment => (
        ts.isPropertyAssignment(candidate)
        && ((ts.isIdentifier(candidate.name) || ts.isStringLiteral(candidate.name))
          && candidate.name.text === field)
      ));
      if (!property || !isParamsField(property.initializer, field)) {
        violations.push(`context_field_required:${field}`);
      }
    }
  }

  const directConsumer = recommendationCalls.some((call) => call.arguments[3] === context);
  if (!directConsumer) violations.push('direct_context_required');
  return violations;
}
