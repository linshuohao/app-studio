/* eslint @typescript-eslint/no-require-imports: "off" -- Turbopack 同步 loader 使用 CommonJS 入口。 */
const ts = require('typescript');
const { existsSync } = require('node:fs');
const { dirname, resolve, relative } = require('node:path');
/**
 * Turbopack 开发源码接入：仅将真实相邻 TS 文件的 .js ESM 标识解析到 .ts / .tsx。
 * 不生成或改写库源码；生产继续消费 dist。用 AST 定位模块标识，避免替换业务字符串。
 */
module.exports = function (source) {
  const local = relative(resolve(__dirname, '../..'), this.resourcePath).replaceAll('\\', '/');
  if (!/^(packages|apps)\/[^/]+\/src\//.test(local)) return source;
  const ast = ts.createSourceFile(this.resourcePath, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  const rewrite = (literal) => {
    if (!literal || !ts.isStringLiteral(literal) || !/^\.{1,2}\/.+\.js$/.test(literal.text)) return;
    if (existsSync(resolve(dirname(this.resourcePath), literal.text))) return;
    for (const extension of ['.ts', '.tsx']) {
      const specifier = literal.text.slice(0, -3) + extension;
      if (!existsSync(resolve(dirname(this.resourcePath), specifier))) continue;
      edits.push({
        start: literal.getStart(ast),
        end: literal.end,
        text: JSON.stringify(specifier),
      });
      break;
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) rewrite(node.moduleSpecifier);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      rewrite(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
};
