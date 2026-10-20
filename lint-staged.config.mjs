export default {
  '*.{ts,tsx,js,mjs,cjs}': ['prettier --write', 'eslint --max-warnings 0 --no-warn-ignored'],
  '*.{json,yaml,yml,css}': ['prettier --write'],
};
