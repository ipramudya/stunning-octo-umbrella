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

function isDeclarationAssignmentPair(previous, current) {
  if (
    previous.type !== 'VariableDeclaration' ||
    current.type !== 'IfStatement' ||
    current.consequent.type !== 'BlockStatement'
  ) {
    return false;
  }

  const names = new Set(
    previous.declarations
      .filter((declaration) => declaration.id.type === 'Identifier')
      .map((declaration) => declaration.id.name),
  );

  return current.consequent.body.some(
    (statement) =>
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'AssignmentExpression' &&
      statement.expression.left.type === 'Identifier' &&
      names.has(statement.expression.left.name),
  );
}

function needsLogicalPadding(previous, current) {
  return (
    !isDeclarationAssignmentPair(previous, current) &&
    (blockStatements.has(previous.type) ||
      blockStatements.has(current.type) ||
      isAwaitedDeclaration(previous) ||
      isAwaitedDeclaration(current) ||
      (previous.type === 'VariableDeclaration' &&
        current.type !== 'VariableDeclaration') ||
      (previous.type === 'ExpressionStatement' &&
        current.type === 'VariableDeclaration') ||
      current.type === 'ReturnStatement' ||
      current.type === 'ThrowStatement')
  );
}

const paddingBetweenLogicalBlocks = {
  meta: {
    fixable: 'whitespace',
    messages: {
      missingPadding: 'Add a blank line between logical blocks.',
      unexpectedPadding:
        'Keep a declaration next to the conditional that assigns it.',
    },
  },
  create(context) {
    function checkStatements(statements) {
      for (let index = 1; index < statements.length; index += 1) {
        const previous = statements[index - 1];
        const current = statements[index];

        const lineGap = current.loc.start.line - previous.loc.end.line;

        if (isDeclarationAssignmentPair(previous, current) && lineGap > 1) {
          context.report({
            node: current,
            messageId: 'unexpectedPadding',
            fix(fixer) {
              return fixer.replaceTextRange(
                [previous.end, current.start],
                `\n${' '.repeat(current.loc.start.column)}`,
              );
            },
          });
        } else if (needsLogicalPadding(previous, current) && lineGap < 2) {
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

function classMemberRank(member) {
  if (
    member.type === 'PropertyDefinition' ||
    member.type === 'AccessorProperty' ||
    member.type === 'StaticBlock'
  ) {
    return 0;
  }

  if (member.kind === 'constructor') {
    return 1;
  }

  if (
    member.accessibility === 'private' ||
    member.key?.type === 'PrivateIdentifier'
  ) {
    return 3;
  }

  return 2;
}

const orderedClassMembers = {
  meta: {
    messages: {
      invalidOrder:
        'Order class members as fields, constructor, public methods, then private methods.',
    },
  },
  create(context) {
    return {
      ClassBody(node) {
        let highestRank = 0;

        for (const member of node.body) {
          const rank = classMemberRank(member);

          if (rank < highestRank) {
            context.report({ node: member, messageId: 'invalidOrder' });
          } else {
            highestRank = rank;
          }
        }
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
    'ordered-class-members': orderedClassMembers,
    'padding-between-logical-blocks': paddingBetweenLogicalBlocks,
  },
};
