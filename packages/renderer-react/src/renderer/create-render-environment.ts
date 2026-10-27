import type { RendererContextValue } from './renderer-context.js';
import type { DiagnosticEmitter } from '../diagnostics/emitter.js';
import type { FormRendererProps } from './types.js';
import type { PreparedViewNode } from '@form-engine/protocol/prepared';
import type { RendererDiagnostic } from '../diagnostics/types.js';
import { RequestContracts } from '../requests/contracts.js';
import { canonical, digest } from '../material/json.js';
/** 本视图共用的装配结果：固定输入、静态检查结果及工具能力。
 * 不保存 Working Data / Issues，也不建立组件观察；实际接入在物料挂载后进行。
 */
export interface RenderEnvironment extends Omit<
  FormRendererProps,
  'onDiagnostic' | 'renderMaterialError' | 'prepared'
> {
  readonly compiledForm: NonNullable<RendererContextValue['compiledForm']>;
  readonly assemblyDiagnostics: readonly RendererDiagnostic[];
  readonly contracts: RequestContracts;
  readonly errors: ReadonlyMap<string, string>;
  readonly diagnostics: DiagnosticEmitter;
  readonly inspectionOwner: object;
  readonly report: (diagnostic: RendererDiagnostic) => void;
}
/** 已验证的静态执行输入，与物料 / 请求注册变更分开缓存。 */
export interface RenderInput {
  readonly compiledForm: NonNullable<RendererContextValue['compiledForm']>;
  readonly runtime: FormRendererProps['runtime'];
}
/** 检查接管失败、协议形状和执行兼容；不建立观察，也不创建业务实例。 */
export function validateRenderInput(
  runtime: FormRendererProps['runtime'],
  capturedForm: Pick<RendererContextValue, 'compiledForm' | 'captureError'>,
): RenderInput {
  if (capturedForm.captureError) throw capturedForm.captureError;
  const compiledForm = capturedForm.compiledForm;
  if (!compiledForm) throw Error('Renderer requires a compiled form');
  const compatibility = runtime.checkView(compiledForm);
  if (!compatibility.compatible) throw Error(compatibility.error);
  if (compiledForm.build.platform && compiledForm.build.platform !== 'web')
    throw Error('Renderer requires web Prepared');
  if (!Object.hasOwn(compiledForm.definition.views, compiledForm.build.profile))
    throw Error('Prepared Profile identity mismatch');
  return { compiledForm, runtime };
}
/** 使用已验证的配置创建注册环境；仅注册改变时不重复复制或验证整份配置。 */
export function createRenderEnvironment(
  renderInput: RenderInput,
  registrations: Pick<FormRendererProps, 'materials' | 'requests'>,
  contextValue: RendererContextValue,
): RenderEnvironment {
  const { compiledForm, runtime } = renderInput;
  // 执行契约固定，但 Runtime 可能已销毁：每次装配仍检查即时资格，不复用过期实例。
  if (!runtime.isScopeAlive()) throw Error('runtime: disposed');
  // 2. 可定位的物料 / 请求缺失记录为局部错误，保留其他可用节点。
  const errors = new Map<string, string>();
  const assemblyDiagnostics: RendererDiagnostic[] = [];
  // Manifest 摘要与实现制品身份分别核对；此处不重新读取组件制品字节。
  for (const [id, lock] of Object.entries(compiledForm.capabilityLock.materials)) {
    const material = Object.hasOwn(registrations.materials, id)
      ? registrations.materials[id]
      : undefined;
    if (
      !material ||
      material.contract.manifest.id !== id ||
      material.contract.manifest.version !== lock.version ||
      digest(material.contract.manifest) !== lock.manifestDigest ||
      canonical(material.artifact) !== canonical(lock.artifact) ||
      material.artifact.platform !== 'web'
    )
      errors.set(`material:${id}`, `Missing or incompatible material ${id}`);
  }
  for (const requirement of compiledForm.hostRequirements.requests) {
    if (
      !registrations.requests ||
      !Object.hasOwn(registrations.requests, requirement.name) ||
      typeof registrations.requests[requirement.name] !== 'function'
    ) {
      for (const node of requirement.nodeIds)
        errors.set(`node:${node}`, `Missing Host request ${requirement.name}`);
    }
  }
  // 3. 只遍历已准备好的静态结构，检查模板闭包并收集位置化诊断。
  // visited 避免重复扫描共享模板；active 区分真正的递归环。
  // 此过程不展开真实数组成员、不挂载组件，也不建立订阅。
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (node: PreparedViewNode, occurrence: string) => {
    if ('scope' in node) {
      visit(node.node, `${occurrence}/scope`);
      return;
    }
    if ('$use' in node) {
      if (active.has(node.$use)) throw Error('Prepared template cycle');
      if (visited.has(node.$use)) return;
      const template = Object.hasOwn(compiledForm.definition.viewTemplates ?? {}, node.$use)
        ? compiledForm.definition.viewTemplates![node.$use]
        : undefined;
      if (!template) throw Error('Missing Prepared template');
      active.add(node.$use);
      visit(template.node, `${occurrence}/template/${node.$use}`);
      active.delete(node.$use);
      visited.add(node.$use);
      return;
    }
    const base = {
      phase: 'assembly' as const,
      formId: compiledForm.definition.id,
      profile: compiledForm.build.profile,
      nodeId: node.id,
      material: node.material,
      occurrence,
    };
    const materialError = errors.get(`material:${node.material}`);
    if (materialError)
      assemblyDiagnostics.push({ ...base, code: 'MATERIAL_UNAVAILABLE', message: materialError });
    for (const mapping of Object.values(node.requests ?? {})) {
      if (
        !registrations.requests ||
        !Object.hasOwn(registrations.requests, mapping.request) ||
        typeof registrations.requests[mapping.request] !== 'function'
      ) {
        const message = `Missing Host request ${mapping.request}`;
        errors.set(`node:${node.id}`, message);
        assemblyDiagnostics.push({
          ...base,
          code: 'REQUEST_UNAVAILABLE',
          request: mapping.request,
          message,
        });
      }
    }
    for (const [slot, children] of Object.entries(node.slots ?? {}))
      children.forEach((child, i) => visit(child, `${occurrence}/slots/${slot}/${i}`));
  };
  visit(compiledForm.definition.views[compiledForm.build.profile]!, 'root');
  // 4. 固定注册字典并预编译请求 Schema。后续请求只复用检查器，不逐次编译。
  const diagnostics = contextValue.diagnostics;
  return {
    runtime,
    compiledForm,
    materials: Object.freeze({ ...registrations.materials }),
    requests: Object.freeze({ ...registrations.requests }),
    contracts: new RequestContracts(compiledForm),
    errors,
    assemblyDiagnostics,
    diagnostics,
    inspectionOwner: contextValue.inspectionOwner,
    report: diagnostics.report,
  };
}
