import type { JsonSchema } from '@form-engine/protocol';
import type { CompilerInputDefinition } from '@form-engine/protocol/definition';
import type { CapabilityCatalogSnapshot } from '@form-engine/protocol/capability';
import type { PreparedForm } from '@form-engine/protocol/prepared';

/** 核心仅接收已取得的固定快照与资源；Registry / 网络读取由调用环境负责。 */
export interface CompileInput {
  definition: CompilerInputDefinition;
  catalog: CapabilityCatalogSnapshot;
  /** 单视图可自动选择 profile；platform 可省略，不预设必须跨平台配置。 */
  target?: { profile?: string; platform?: string; preparedFormatVersion?: string };
  /** schema URI → 资源内容；只允许解析这里已提供的外部资源。 */
  schemaResources?: Record<string, JsonSchema>;
}
/** 轻量诊断：Definition 内的位置 + 必要外部来源；不是后期平台 AnalysisReport。 */
export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sourcePointer: string;
  relatedLocations?: Array<{ sourceId: string; pointer: string; message?: string }>;
}
/** 失败分支没有 prepared，调用者不能意外取得部分产物。 */
export type CompileResult =
  | { success: true; prepared: PreparedForm; diagnostics: Diagnostic[] }
  | { success: false; diagnostics: Diagnostic[] };
export interface ContractValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

/** 未发布交换格式身份；后续 Runtime 必须显式支持，不能据此认为已有可用消费端。 */
export const PREPARED_FORMAT_VERSION = 'form-engine.prepared/1';
