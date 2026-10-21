import type { FormDefinition } from '../src/definition/index.js';
import type {
  CapabilityCatalogSnapshot,
  MaterialManifest,
  PureFunctionManifest,
} from '../src/capability/index.js';
import type { PreparedForm } from '../src/prepared/index.js';

export const simpleDefinition: FormDefinition = {
  protocolVersion: 'test-protocol',
  id: 'enrollment',
  version: 'draft',
  data: {
    schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 2 } },
      required: ['name'],
    },
  },
  views: {
    desktop: { material: 'text-input', bindings: { value: { source: 'data', path: '/name' } } },
  },
};
export const arrayDefinition: FormDefinition = {
  ...simpleDefinition,
  id: 'family',
  data: {
    schema: {
      type: 'object',
      properties: { members: { type: 'array', items: { $ref: '#/$defs/Member' } } },
      $defs: {
        Member: {
          type: 'object',
          properties: { name: { type: 'string' }, age: { type: 'integer' } },
        },
      },
    },
  },
  constraints: [
    {
      id: 'eligibility',
      kind: 'external',
      validator: 'family.eligibility',
      scope: { from: { source: 'data', path: '/members' }, as: 'member', mode: 'each' },
      target: { source: 'data', scope: 'member', path: '/name' },
      watch: [{ source: 'data', scope: 'member', path: '/age' }],
      requires: [
        { kind: 'field', target: { source: 'data', scope: 'member', path: '/age' }, phase: 'sync' },
      ],
    },
  ],
  reactions: [
    {
      id: 'clear-name',
      watch: [{ source: 'data', path: '/enabled' }],
      runOnActivate: false,
      then: [{ op: 'set', target: { source: 'data', path: '/name' }, value: '' }],
    },
  ],
  views: {
    desktop: {
      scope: { from: { source: 'data', path: '/members' }, as: 'member', mode: 'each' },
      node: {
        $use: 'member-fields',
        with: { member: { source: 'data', scope: 'member', path: '' } },
      },
    },
    mobile: {
      material: 'summary',
      props: { nested: [{ visible: { $expr: { op: 'core.eq', args: [1, 1] } } }] },
    },
  },
  viewTemplates: {
    'member-fields': {
      params: { member: { schemaRef: '#/$defs/Member' } },
      node: {
        material: 'text-input',
        bindings: { value: { source: 'data', scope: 'member', path: '/name' } },
      },
    },
  },
};
export const materialManifest: MaterialManifest = {
  id: 'text-input',
  version: 'test-capability',
  propsSchema: { type: 'object', properties: { label: { type: 'string' } } },
  bindings: { value: { schema: { type: 'string' } } },
  slots: ['default', 'suffix'],
  events: {
    activate: {},
    select: {
      payloadSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
      },
    },
  },
};
export const functionManifest: PureFunctionManifest = {
  id: 'family.check',
  version: 'test-capability',
  parameters: [{ name: 'age', schema: { type: 'integer' } }],
  returns: { type: 'boolean' },
};
const digest = `sha256:${'a'.repeat(64)}` as const;
export const capabilityCatalog: CapabilityCatalogSnapshot = {
  id: 'test-catalog',
  materials: {
    'text-input': {
      manifest: materialManifest,
      artifact: { id: 'test-material-package', platform: 'web', digest },
    },
  },
  pureFunctions: {
    'family.check': {
      manifest: functionManifest,
      artifact: { id: 'test-function-package', platform: 'web', digest },
    },
  },
};
/** Hand-built contract fixture, not a Compiler implementation or proof of execution. */
export const preparedForm = {
  preparedFormatVersion: 'test-prepared',
  build: {
    compilerVersion: 'test-compiler',
    catalogSnapshotId: 'test-catalog',
    profile: 'desktop',
  },
  definition: {
    protocolVersion: simpleDefinition.protocolVersion,
    id: simpleDefinition.id,
    version: simpleDefinition.version,
    data: simpleDefinition.data,
    views: {
      desktop: {
        id: 'name-input',
        material: 'text-input',
        bindings: { value: { source: 'data', path: '/name' } },
      },
    },
  },
  resources: { schemas: {}, requestSchemas: {} },
  capabilityLock: {
    materials: {
      'text-input': {
        id: 'text-input',
        version: 'test-capability',
        manifestDigest: digest,
        artifact: { id: 'test-material-package', platform: 'web', digest },
      },
    },
    pureFunctions: {},
  },
  hostRequirements: { validators: [], events: [], requests: [] },
} satisfies PreparedForm;
