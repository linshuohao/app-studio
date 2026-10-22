import type { JsonSchema } from '@form-engine/protocol';
import type { HostContract, MaterialManifest } from '@form-engine/protocol/capability';
import type { MaterialNode } from '@form-engine/protocol/definition';
import type {
  HostEventRequirement,
  HostRequestRequirement,
  PreparedHostRequestIntent,
} from '@form-engine/protocol/prepared';
import type { LexicalEnvironment } from '../analysis/reference/environment.js';
import { ValueCompiler } from '../analysis/value/compile.js';
import { checkCommand } from '../rules/command.js';
import { own, record } from '../common/object.js';
import { at } from '../common/pointer.js';

/** 事件 / 请求复用值与表达式分析，按调用求值，不把 Payload 读取变成持续 watch。 */
export class InteractionCompiler {
  private readonly events = new Map<string, HostEventRequirement>();
  private readonly requests = new Map<string, Set<string>>();
  private readonly schemas = new Map<string, JsonSchema>();
  constructor(
    private readonly values: ValueCompiler,
    private readonly host?: HostContract,
  ) {}

  private resource(schema: JsonSchema, key: string, pointer: string): string {
    const { expressions } = this.values;
    const node = expressions.models.addRoot(
      schema,
      `https://form-engine.invalid/request/${encodeURIComponent(key)}`,
      expressions.source(pointer),
    );
    expressions.models.scan(node);
    // 根基址显式化，避免相对引用在移入资源表后改变含义；嵌套 $id 保持原语义。
    this.schemas.set(key, record(schema) ? { ...schema, $id: node.document.uri } : schema);
    return '#' + at('/resources/requestSchemas', key);
  }
  compile(
    node: MaterialNode,
    manifest: MaterialManifest,
    env: LexicalEnvironment,
    pointer: string,
    nodeId: string,
  ) {
    const { expressions } = this.values;
    const { models, diagnostics, source } = expressions;
    for (const [name, intent] of Object.entries(node.on ?? {})) {
      const location = at(at(pointer, 'on'), name);
      const event =
        manifest.events && own(manifest.events, name) ? manifest.events[name] : undefined;
      if (!event) {
        diagnostics.error(
          'EVENT_NOT_DECLARED',
          source(location),
          `Material ${node.material} has no event ${name}.`,
        );
        continue;
      }
      const eventModel =
        event.payloadSchema === undefined
          ? undefined
          : models.addRoot(
              event.payloadSchema,
              `https://form-engine.invalid/material/${encodeURIComponent(node.material)}/event/${encodeURIComponent(name)}`,
              source(location),
            );
      if (eventModel) models.scan(eventModel);
      const context = { ...env, event: eventModel };
      if (intent.type === 'form.command')
        checkCommand(intent.command, context, at(location, 'command'), this.values);
      else {
        const contract =
          this.host?.events && own(this.host.events, intent.event)
            ? this.host.events[intent.event]
            : undefined;
        if (this.host && !contract)
          diagnostics.error(
            'HOST_EVENT_NOT_FOUND',
            source(at(location, 'event')),
            `No Host event ${intent.event}.`,
          );
        this.events.set(intent.event, {
          name: intent.event,
          optional: contract?.optional ?? false,
        });
        const payload = this.values.compile(
          intent.payload ?? null,
          context,
          at(location, 'payload'),
          false,
        );
        if (contract?.payloadSchema !== undefined) {
          const target = models.addRoot(
            contract.payloadSchema,
            `https://form-engine.invalid/host/event/${encodeURIComponent(intent.event)}`,
            source(location),
          );
          models.scan(target);
          this.values.expect(payload, target, at(location, 'payload'), 'HOST_EVENT_PAYLOAD');
        }
      }
    }
    for (const name of Object.keys(manifest.requests ?? {}))
      if (!node.requests || !own(node.requests, name))
        diagnostics.error(
          'REQUEST_MAPPING_MISSING',
          source(at(pointer, 'requests')),
          `Material ${node.material} requires request mapping ${name}.`,
        );
    const requests: Record<string, PreparedHostRequestIntent> = {};
    for (const [name, intent] of Object.entries(node.requests ?? {})) {
      const location = at(at(pointer, 'requests'), name);
      const contract =
        manifest.requests && own(manifest.requests, name) ? manifest.requests[name] : undefined;
      if (!contract) {
        diagnostics.error(
          'REQUEST_NOT_DECLARED',
          source(location),
          `Material ${node.material} has no request ${name}.`,
        );
        continue;
      }
      const resourceKey = `material:${encodeURIComponent(node.material)}:request:${encodeURIComponent(name)}`;
      const payloadRef = this.resource(contract.payloadSchema, resourceKey + ':payload', location);
      const resultRef = this.resource(contract.resultSchema, resourceKey + ':result', location);
      const payloadModel = models.addRoot(
        contract.payloadSchema,
        `https://form-engine.invalid/request/${encodeURIComponent(resourceKey + ':payload')}`,
        source(location),
      );
      const resultModel = models.addRoot(
        contract.resultSchema,
        `https://form-engine.invalid/request/${encodeURIComponent(resourceKey + ':result')}`,
        source(location),
      );
      const payload =
        intent.payload === undefined
          ? { node: payloadModel, reads: [] }
          : this.values.compile(
              intent.payload,
              { ...env, event: payloadModel },
              at(location, 'payload'),
              false,
            );
      const host =
        this.host?.requests && own(this.host.requests, intent.request)
          ? this.host.requests[intent.request]
          : undefined;
      if (this.host && !host)
        diagnostics.error(
          'HOST_REQUEST_NOT_FOUND',
          source(at(location, 'request')),
          `No Host request ${intent.request}.`,
        );
      const prepared: PreparedHostRequestIntent = {
        ...intent,
        concurrency: contract.concurrency ?? 'latest',
        payloadSchemaRef: payloadRef,
        resultSchemaRef: resultRef,
      };
      if (host) {
        const hostKey = `host:${encodeURIComponent(intent.request)}`;
        prepared.hostPayloadSchemaRef = this.resource(
          host.payloadSchema,
          hostKey + ':payload',
          location,
        );
        prepared.hostResultSchemaRef = this.resource(
          host.resultSchema,
          hostKey + ':result',
          location,
        );
        const hostInput = models.addRoot(
          host.payloadSchema,
          `https://form-engine.invalid/request/${encodeURIComponent(hostKey + ':payload')}`,
          source(location),
        );
        const hostOutput = models.addRoot(
          host.resultSchema,
          `https://form-engine.invalid/request/${encodeURIComponent(hostKey + ':result')}`,
          source(location),
        );
        this.values.expect(payload, hostInput, at(location, 'payload'), 'REQUEST_PAYLOAD');
        expressions.expect(
          { node: hostOutput, reads: [] },
          resultModel,
          location,
          'REQUEST_RESULT',
        );
      }
      const nodeIds = this.requests.get(intent.request) ?? new Set<string>();
      nodeIds.add(nodeId);
      this.requests.set(intent.request, nodeIds);
      requests[name] = prepared;
    }
    return { ...(node.on ? { on: node.on } : {}), ...(node.requests ? { requests } : {}) };
  }
  result(): {
    events: HostEventRequirement[];
    requests: HostRequestRequirement[];
    schemas: Record<string, JsonSchema>;
  } {
    const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    return {
      events: [...this.events.values()].sort((a, b) => compare(a.name, b.name)),
      requests: [...this.requests]
        .sort(([a], [b]) => compare(a, b))
        .map(([name, ids]) => ({ name, nodeIds: [...ids].sort(compare) })),
      schemas: Object.fromEntries([...this.schemas].sort(([a], [b]) => compare(a, b))),
    };
  }
}
