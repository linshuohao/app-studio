import { BadRequestException } from '@nestjs/common';
import {
  compile,
  type CompileInput,
  type CompileResult,
  type Diagnostic,
} from '@form-engine/compiler';
import * as materials from '@form-engine/materials-react/manifests';
import { createCoreFunctions } from '@form-engine/pure-functions';
import * as businessFunctions from '@form-engine/pure-functions/manifests';
import { parseTree, type Node, type ParseError } from 'jsonc-parser';

// The Web travel acceptance fixture has no production credentials or Host bindings.
const artifact = {
  id: 'studio-web-preview',
  platform: 'web',
  digest: `sha256:${'5'.repeat(64)}` as const,
};
export function webCatalog(
  id: string,
  materialArtifact: typeof artifact,
  functionArtifact: typeof artifact,
): CompileInput['catalog'] {
  return {
    id,
    materials: Object.fromEntries(
      Object.values(materials).map((manifest) => [
        manifest.id,
        { manifest, artifact: materialArtifact },
      ]),
    ),
    pureFunctions: {
      ...Object.fromEntries(
        Object.entries(createCoreFunctions(functionArtifact)).map(([id, binding]) => [
          id,
          { manifest: binding.manifest, artifact: binding.artifact },
        ]),
      ),
      ...Object.fromEntries(
        Object.values(businessFunctions).map((manifest) => [
          manifest.id,
          { manifest, artifact: functionArtifact },
        ]),
      ),
    },
  };
}

const catalog = webCatalog('studio-web-preview', artifact, artifact);

export type ConfigInput = { text?: unknown; versionId?: unknown; profile?: unknown };

export type LocatedDiagnostic = Diagnostic & {
  location?: { offset: number; length: number; line: number; column: number };
};
export type ConfigCheck = {
  catalogId: string;
  target: { platform: string; profile?: string };
  diagnostics: LocatedDiagnostic[];
} & (
  | { success: false }
  | { success: true; prepared: Extract<CompileResult, { success: true }>['prepared'] }
);

function sourceNode(tree: Node, pointer: string): Node | undefined {
  if (!pointer) return tree;
  if (!pointer.startsWith('/')) return undefined;
  let node: Node | undefined = tree;
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (node?.type === 'object') {
      // JSON.parse uses the last occurrence of a repeated property.
      node = node.children?.findLast((child) => child.children?.[0]?.value === key)?.children?.[1];
    } else if (node?.type === 'array' && /^(0|[1-9][0-9]*)$/.test(key)) {
      node = node.children?.[Number(key)];
    } else {
      return undefined;
    }
  }
  return node;
}

function location(text: string, offset: number, length: number) {
  const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
  return { offset, length, line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function syntaxTree(text: string, errors: ParseError[] = []) {
  try {
    return parseTree(text, errors, { disallowComments: true });
  } catch (error) {
    // Compiler applies its own depth budget. A failed location lookup must not mask diagnostics.
    if (!(error instanceof RangeError)) throw error;
    return undefined;
  }
}

export function webTarget(profile: unknown): CompileInput['target'] & { platform: string } {
  if (profile !== undefined && (typeof profile !== 'string' || !profile || profile.length > 120))
    throw new BadRequestException('Invalid Web view profile');

  return { platform: 'web', ...(profile === undefined ? {} : { profile }) };
}

export function withTravelPreviewHost(source: CompileInput['catalog']): CompileInput['catalog'] {
  const { payloadSchema, resultSchema } =
    source.materials['remote-select']!.manifest.requests!.search!;
  return {
    ...source,
    host: {
      ...source.host,
      requests: {
        ...source.host?.requests,
        'travel.searchCities': { payloadSchema, resultSchema },
      },
      events: {
        ...source.host?.events,
        'travel.previewUnderwritingSubmit': {},
        'business.addExpense': {},
      },
      validators: {
        ...source.host?.validators,
        'travel.checkPassportDuplicates': { contractVersion: '1' },
      },
    },
  };
}

export function checkWebConfig(text: string, profile: unknown, travelHost = false): ConfigCheck {
  return compileWebConfig(text, {
    catalog: travelHost ? withTravelPreviewHost(catalog) : catalog,
    target: webTarget(profile),
  });
}

export function compileWebConfig(
  text: string,
  input: Omit<CompileInput, 'definition'> & { target: { platform: string; profile?: string } },
): ConfigCheck {
  const { catalog, target } = input;
  const identity = { catalogId: catalog.id, target };
  // Parse JSON first. Keep the syntax tree separate from the object passed to Compiler.
  let definition: CompileInput['definition'];
  try {
    definition = JSON.parse(text) as CompileInput['definition'];
  } catch {
    const errors: ParseError[] = [];
    syntaxTree(text, errors);
    const error = errors[0];
    return {
      ...identity,
      success: false as const,
      diagnostics: [
        {
          code: 'JSON_SYNTAX',
          severity: 'error' as const,
          message: '配置原文无法解析为 JSON。',
          sourcePointer: '',
          location: location(text, error?.offset ?? text.length, error?.length ?? 0),
        },
      ],
    };
  }

  const result = compile({ ...input, definition });
  const tree = syntaxTree(text);
  const diagnostics = result.diagnostics.map((diagnostic: Diagnostic) => {
    const node = tree && sourceNode(tree, diagnostic.sourcePointer);
    return {
      ...diagnostic,
      ...(node && { location: location(text, node.offset, node.length) }),
    };
  });
  if (!result.success) return { ...identity, success: false as const, diagnostics };
  return {
    ...identity,
    target: { ...target, profile: result.prepared.build.profile },
    success: true as const,
    diagnostics,
    prepared: result.prepared,
  };
}
