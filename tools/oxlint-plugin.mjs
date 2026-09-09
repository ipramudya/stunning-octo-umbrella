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
  },
};
