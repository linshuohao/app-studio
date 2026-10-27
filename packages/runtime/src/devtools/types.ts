/** 开发工具传输契约独立于 L1 Definition / Prepared，不包含写入或执行入口。 */
export interface DevtoolsSourceInfo {
  readonly id: string;
  readonly parentId?: string;
  readonly kind: 'runtime' | 'view' | 'material';
  readonly label: string;
  readonly formId: string;
  readonly profile?: string;
  readonly nodeId?: string;
  readonly occurrence?: string;
}
/** 按需复制的展示数据；truncated 表示展示副本有缺失，不是完整异常报告。 */
export interface DevtoolsSnapshot {
  readonly value: unknown;
  readonly truncated: boolean;
}
export interface DevtoolsEvent {
  readonly sequence: number;
  readonly sourceId: string;
  readonly kind: string;
  readonly payload?: DevtoolsSnapshot;
  /** 通知队列溢出时丢失的事件数，不伪造完整历史。 */
  readonly dropped: number;
}
/** 页面内发现接口，业务能力、Runtime 对象和可执行函数都不对工具暴露。 */
export interface DevtoolsHook {
  readonly version: 1;
  list(): readonly DevtoolsSourceInfo[];
  read(id: string): DevtoolsSnapshot | undefined;
  subscribe(listener: (event: DevtoolsEvent) => void): () => void;
}
/** 引擎内部使用的发布句柄；不是 DevtoolsHook 的一部分。 */
export interface DevtoolsSource {
  readonly id: string;
  publish(kind: string, payload?: unknown): void;
  dispose(): void;
}
