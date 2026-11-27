import { Fragment } from 'react';
import './code-block.css';

function grammar(tokens: Record<string, RegExp>) {
  return new RegExp(
    Object.entries(tokens)
      .map(([kind, pattern]) => '(?<' + kind + '>' + pattern.source + ')')
      .join('|'),
    'g',
  );
}

// Consume unfinished quotes at the line boundary so escaped quotes inside them are
// never retried as new openings. Template literals can continue to the end of the source.
const doubleQuoted = /"(?:\\[^\r\n]|[^"\\\r\n])*(?:"|\\?(?=[\r\n]|$))/;
const singleQuoted = /'(?:\\[^\r\n]|[^'\\\r\n])*(?:'|\\?(?=[\r\n]|$))/;
const templateQuoted = /\x60(?:\\[\s\S]|[^\x60\\])*(?:\x60|\\?$)/;

const jsonTokens = grammar({
  property: /"(?:\\[^\r\n]|[^"\\\r\n])*"(?=\s*:)/,
  string: doubleQuoted,
  literal: /\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/,
});

const scriptTokens = {
  comment: /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)/,
  string: new RegExp([doubleQuoted.source, singleQuoted.source, templateQuoted.source].join('|')),
  keyword:
    /\b(?:as|async|await|break|case|catch|class|const|continue|default|else|export|extends|for|from|function|if|implements|import|in|instanceof|interface|keyof|let|new|of|readonly|return|satisfies|switch|throw|try|type|typeof|void|while|yield)\b/,
  literal: /\b(?:true|false|null|undefined|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/,
  type: /\b(?:any|bigint|boolean|never|number|object|string|symbol|unknown|[A-Z][\w$]*)\b/,
};

const javascriptTokens = grammar(scriptTokens);
const jsxTokens = grammar({ tag: /<\/?[A-Za-z][\w.:-]*/, ...scriptTokens });

type CodeLanguage = 'json' | 'javascript' | 'typescript' | 'jsx' | 'tsx' | 'text';

const grammars: Partial<Record<CodeLanguage, RegExp>> = {
  json: jsonTokens,
  javascript: javascriptTokens,
  typescript: javascriptTokens,
  jsx: jsxTokens,
  tsx: jsxTokens,
};

export function codeLanguage(language?: string): CodeLanguage {
  switch (language?.toLowerCase()) {
    case 'json':
      return 'json';
    case 'js':
    case 'javascript':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'typescript':
      return 'typescript';
    case 'jsx':
      return 'jsx';
    case 'tsx':
      return 'tsx';
    default:
      return 'text';
  }
}

function highlightedCode(source: string, language: CodeLanguage) {
  const grammar = grammars[language];
  if (!grammar || source.length > 100_000) return source;

  const parts = [];
  let end = 0;
  for (const match of source.matchAll(grammar)) {
    const kind = Object.entries(match.groups ?? {}).find(([, value]) => value !== undefined)?.[0];
    parts.push(
      <Fragment key={match.index}>
        {source.slice(end, match.index)}
        <span data-code-token={kind}>{match[0]}</span>
      </Fragment>,
    );
    end = match.index + match[0].length;
  }
  parts.push(source.slice(end));
  return parts;
}

export function CodeBlock({
  source,
  language = 'text',
  label,
}: {
  source: string;
  language?: CodeLanguage;
  label?: string;
}) {
  return (
    <pre
      className="studio-code-block"
      tabIndex={0}
      role={label ? 'group' : undefined}
      aria-label={label}
      translate="no"
    >
      <code data-language={language}>{highlightedCode(source, language)}</code>
    </pre>
  );
}
