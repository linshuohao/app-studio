// Keep the editable module and its prebuilt preview derived from the same JSX.
import ts from 'typescript';
import { readFileSync } from 'node:fs';

export function exampleSources() {
  return {
    name: 'handbook-example-sources',
    enforce: 'pre',
    generateBundle: {
      order: 'post',
      handler(options, bundle) {
        const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry);
        const name = entry.fileName.replace(/\.js$/, '');
        const css = ['studio.css', 'studio-ui.css']
          .map((file) =>
            readFileSync(new URL('../../apps/studio/src/app/' + file, import.meta.url), 'utf8'),
          )
          .concat(
            Object.values(bundle)
              .filter((item) => item.fileName.endsWith('.css'))
              .map((item) => item.source),
          )
          .join('\n');
        // An opaque file:// frame must carry its own scripts and styles.
        const script = entry.code.replace(/<\/script/gi, '<\\/script');
        this.emitFile({
          type: 'asset',
          fileName: name + '-runner.html',
          source:
            '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>组件运行结果</title><style>' +
            css +
            '</style><main id="' +
            name +
            '"></main><script>' +
            script +
            '</script></html>',
        });
      },
    },
    transform(code, id) {
      if (
        !/studio-components\/(playground|business-playground|field-picker-demo|card-list-example)\.jsx$/.test(
          id,
        )
      )
        return;
      const file = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
      const declarations = new Map();
      const replacements = [];
      const modules = new Map();
      const imports = file.statements.filter(ts.isImportDeclaration);
      for (const stmt of file.statements) {
        if (ts.isFunctionDeclaration(stmt)) declarations.set(stmt.name.text, stmt);
        if (ts.isVariableStatement(stmt))
          for (const d of stmt.declarationList.declarations)
            declarations.set(d.name.getText(file), stmt);
      }
      function describe(tuple) {
        if (!ts.isArrayLiteralExpression(tuple)) return;
        const entry = tuple.elements[0];
        const used = new Set();
        const local = new Set();
        function visit(node) {
          if (ts.isIdentifier(node) && !used.has(node.text)) {
            used.add(node.text);
            const declaration = declarations.get(node.text);
            if (declaration && !local.has(declaration)) {
              local.add(declaration);
              ts.forEachChild(declaration, visit);
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(entry);
        const lines = [];
        const registry = [];
        for (const stmt of imports) {
          const clause = stmt.importClause;
          if (!clause) continue;
          const bindings =
            clause.namedBindings?.elements?.filter((item) => used.has(item.name.text)) ?? [];
          const defaultName =
            clause.name && (used.has(clause.name.text) || clause.name.text === 'React')
              ? clause.name.text
              : '';
          if (!bindings.length && !defaultName) continue;
          const bindingsText = bindings.length
            ? '{ ' + bindings.map((b) => b.getText(file)).join(', ') + ' }'
            : '';
          const path = stmt.moduleSpecifier.text;
          lines.push(
            'import ' +
              [defaultName, bindingsText].filter(Boolean).join(', ') +
              ' from ' +
              JSON.stringify(path) +
              ';',
          );
          if (!modules.has(path)) modules.set(path, 'handbookModule' + modules.size);
          registry.push(JSON.stringify(path) + ': ' + modules.get(path));
        }
        const declarationsText = file.statements
          .filter((stmt) => local.has(stmt))
          .map((stmt) => stmt.getText(file).replace(/^export /, ''))
          .join('\n\n');
        const named = ts.isIdentifier(entry);
        const body = [declarationsText, named ? '' : 'const Sample = ' + entry.getText(file) + ';']
          .filter(Boolean)
          .join('\n\n');
        const source = {
          imports: lines.join('\n'),
          body,
          component: named ? entry.text : 'Sample',
        };
        replacements.push([
          tuple.end - 1,
          ', { ...' + JSON.stringify(source) + ', modules: {' + registry.join(', ') + '} }',
        ]);
      }
      for (const stmt of file.statements.filter(ts.isVariableStatement)) {
        for (const d of stmt.declarationList.declarations) {
          if (d.name.text === 'stories')
            for (const p of d.initializer.properties) describe(p.initializer);
          if (['pickerStory', 'cardListStory'].includes(d.name.text)) describe(d.initializer);
        }
      }
      for (const [index, insertion] of replacements.reverse()) {
        // Multiline story tuples may already have a trailing comma.
        code = code.slice(0, index).replace(/,\s*$/, '') + insertion + code.slice(index);
      }
      return (
        [...modules]
          .map(([path, name]) => 'import * as ' + name + ' from ' + JSON.stringify(path) + ';')
          .join('\n') +
        '\n' +
        code
      );
    },
  };
}
