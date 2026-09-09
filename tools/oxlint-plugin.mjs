function logicalTermCount(node) {
  if (node.type !== 'LogicalExpression') {
    return 1;
  }

  return logicalTermCount(node.left) + logicalTermCount(node.right);
}

const maxIfConditionTerms = {
  meta: {
    messages: {
      maxIfConditionTerms:
        'An if condition may contain at most four logical terms; extract a named predicate.',
    },
  },
  create(context) {
    return {
      IfStatement(node) {
        if (logicalTermCount(node.test) > 4) {
          context.report({ node: node.test, messageId: 'maxIfConditionTerms' });
        }
      },
    };
  },
};

const blockStatements = new Set([
  'BlockStatement',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'IfStatement',
  'SwitchStatement',
  'TryStatement',
  'WhileStatement',
  'WithStatement',
]);

function isAwaitedDeclaration(statement) {
  return (
    statement.type === 'VariableDeclaration' &&
    statement.declarations.some(
      (declaration) => declaration.init?.type === 'AwaitExpression',
    )
  );
}

function needsLogicalPadding(previous, current) {
  return (
    blockStatements.has(previous.type) ||
    blockStatements.has(current.type) ||
    isAwaitedDeclaration(previous) ||
    isAwaitedDeclaration(current) ||
    (previous.type === 'VariableDeclaration' &&
      current.type !== 'VariableDeclaration') ||
    (previous.type === 'ExpressionStatement' &&
      current.type === 'VariableDeclaration') ||
    current.type === 'ReturnStatement' ||
    current.type === 'ThrowStatement'
  );
}

const paddingBetweenLogicalBlocks = {
  meta: {
    fixable: 'whitespace',
    messages: {
      missingPadding: 'Add a blank line between logical blocks.',
    },
  },
  create(context) {
    function checkStatements(statements) {
      for (let index = 1; index < statements.length; index += 1) {
        const previous = statements[index - 1];
        const current = statements[index];

        if (
          needsLogicalPadding(previous, current) &&
          current.loc.start.line - previous.loc.end.line < 2
        ) {
          context.report({
            node: current,
            messageId: 'missingPadding',
            fix(fixer) {
              return fixer.insertTextAfter(previous, '\n');
            },
          });
        }
      }
    }

    return {
      BlockStatement(node) {
        checkStatements(node.body);
      },
      Program(node) {
        checkStatements(node.body);
      },
      SwitchCase(node) {
        checkStatements(node.consequent);
      },
    };
  },
};

const noConditionalObjectSpread = {
  meta: {
    messages: {
      noConditionalObjectSpread:
        'Do not conditionally spread an object; assign the property explicitly instead.',
    },
  },
  create(context) {
    return {
      SpreadElement(node) {
        if (
          node.parent?.type === 'ObjectExpression' &&
          node.argument.type === 'ConditionalExpression'
        ) {
          context.report({
            node,
            messageId: 'noConditionalObjectSpread',
          });
        }
      },
    };
  },
};

export default {
  meta: { name: 'dexa' },
  rules: {
    'max-if-condition-terms': maxIfConditionTerms,
    'no-conditional-object-spread': noConditionalObjectSpread,
    'padding-between-logical-blocks': paddingBetweenLogicalBlocks,
  },
};
