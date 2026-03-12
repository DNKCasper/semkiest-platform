/** @type {import('lint-staged').Config} */
const config = {
  // TypeScript/JavaScript files — lint and format
  '**/*.{ts,tsx,js,jsx,mjs,cjs}': [
    'eslint --fix --max-warnings=0',
    'prettier --write',
  ],
  // JSON, YAML, Markdown, CSS — format only
  '**/*.{json,yaml,yml,md,css,scss}': ['prettier --write'],
};

module.exports = config;
