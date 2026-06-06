module.exports = {
  root: true,
  reportUnusedDisableDirectives: true,
  ignorePatterns: ['dist/*', 'playwright-report/*', 'test-results/*'],
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  extends: ['eslint:recommended'],
};
