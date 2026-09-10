import { defineConfig } from 'oxlint';
import core from 'ultracite/oxlint/core';
import { jsPluginSettings, selectJsPlugins } from 'ultracite/oxlint/js-plugins';
import next from 'ultracite/oxlint/next';
import nextJsPlugins from 'ultracite/oxlint/next/js-plugins';
import react from 'ultracite/oxlint/react';

const reactDoctor = selectJsPlugins(['react-doctor']);

export default defineConfig({
  extends: [core, react, next, reactDoctor, nextJsPlugins],
  ignorePatterns: [...(core.ignorePatterns ?? [])],
  jsPlugins: [
    '../../packages/oxc/lint-plugin.mjs',
    ...(reactDoctor.jsPlugins ?? []),
  ],
  rules: {
    'dexa/explicit-default-component': 'error',
    'dexa/react-default-import-only': 'error',
    'react/function-component-definition': 'off',
  },
  settings: {
    ...jsPluginSettings,
    next: {
      rootDir: '.',
    },
    react: {
      version: '19.2.8',
    },
  },
});
