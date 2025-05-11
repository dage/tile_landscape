module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'prettier',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'plugin:prettier/recommended',
  ],
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  rules: {
    'prettier/prettier': 'warn',
    // Add any project-specific rules here
  },
  ignorePatterns: ['dist', 'node_modules', '*.cjs'],
}; 