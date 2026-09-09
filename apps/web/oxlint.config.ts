import { defineConfig } from 'oxlint';
import core from 'ultracite/oxlint/core';
import next from 'ultracite/oxlint/next';
import react from 'ultracite/oxlint/react';

export default defineConfig({
  extends: [core, react, next],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    'src/components/ui/calendar.tsx',
    'src/components/ui/map.tsx',
    'src/components/ui/popover.tsx',
  ],
  jsPlugins: ['../../packages/oxc/lint-plugin.mjs'],
  rules: {
    'dexa/explicit-default-component': 'error',
    'dexa/react-default-import-only': 'error',
    'react/function-component-definition': 'off',
  },
  settings: {
    next: {
      rootDir: '.',
    },
    react: {
      version: '19.2.8',
    },
  },
});
