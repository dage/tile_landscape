// eslint.config.js
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended'; // For "plugin:prettier/recommended"

export default tseslint.config(
  {
    // Global ignores
    ignores: ['dist/', 'node_modules/', '*.cjs', '*.config.js'], // Ignoring self and other common config files
  },
  {
    // Configuration for TypeScript files
    files: ['**/*.ts', '**/*.tsx'], // Apply to all .ts and .tsx files
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json', // Link to your tsconfig for typed linting
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      // 'prettier' plugin is often implicitly handled by prettierRecommended or configured separately
    },
    rules: {
      // Start with ESLint recommended rules
      ...tseslint.configs.eslintRecommended.rules,
      // Add TypeScript-ESLint recommended rules
      ...tseslint.configs.recommended.rules,
      // Add any project-specific rules here
      // 'prettier/prettier': 'warn', // This rule comes from eslint-plugin-prettier
    },
  },
  // Apply Prettier rules LAST so it can override other formatting rules
  prettierRecommended,
  // Add a specific rule for Prettier if not covered by recommended
  {
    rules: {
      'prettier/prettier': 'warn',
    },
  }
);
