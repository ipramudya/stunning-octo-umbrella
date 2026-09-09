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
    function checkClassMembers(members) {
      for (let index = 1; index < members.length; index += 1) {
        const previous = members[index - 1];
        const current = members[index];

        if (current.loc.start.line - previous.loc.end.line < 2) {
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
      ClassBody(node) {
        checkClassMembers(node.body);
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

const typeDeclarations = new Set([
  'TSDeclareFunction',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
]);

const explicitDefaultComponent = {
  meta: {
    messages: {
      componentFirst:
        'Place the default component before other top-level declarations.',
      explicitDefault:
        'Declare the component with `export default function ComponentName()`.',
    },
  },
  create(context) {
    return {
      Program(node) {
        if (!context.filename.endsWith('.tsx')) {
          return;
        }

        const defaultExport = node.body.find(
          (statement) => statement.type === 'ExportDefaultDeclaration',
        );

        if (!defaultExport) {
          return;
        }

        const declaration = defaultExport.declaration;

        if (
          declaration.type !== 'FunctionDeclaration' ||
          !declaration.id ||
          !/^[A-Z]/.test(declaration.id.name)
        ) {
          context.report({
            node: defaultExport,
            messageId: 'explicitDefault',
          });

          return;
        }

        const firstDeclaration = node.body.find((statement) => {
          if (
            statement.type === 'ImportDeclaration' ||
            statement.directive ||
            typeDeclarations.has(statement.type)
          ) {
            return false;
          }

          if (statement.type === 'ExportNamedDeclaration') {
            return (
              statement.exportKind !== 'type' &&
              !typeDeclarations.has(statement.declaration?.type)
            );
          }

          return true;
        });

        if (defaultExport !== firstDeclaration) {
          context.report({
            node: defaultExport,
            messageId: 'componentFirst',
          });
        }
      },
    };
  },
};

const reactDefaultImportOnly = {
  meta: {
    messages: {
      defaultImportOnly:
        'Import React as the default export and access its members through React, for example React.useState.',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'react') {
          return;
        }

        const hasReactDefault = node.specifiers.some(
          (specifier) =>
            specifier.type === 'ImportDefaultSpecifier' &&
            specifier.local.name === 'React',
        );

        if (node.specifiers.length !== 1 || !hasReactDefault) {
          context.report({ node, messageId: 'defaultImportOnly' });
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
    'explicit-default-component': explicitDefaultComponent,
    'max-if-condition-terms': maxIfConditionTerms,
    'no-conditional-object-spread': noConditionalObjectSpread,
    'ordered-class-members': orderedClassMembers,
    'padding-between-logical-blocks': paddingBetweenLogicalBlocks,
    'react-default-import-only': reactDefaultImportOnly,
  },
};
