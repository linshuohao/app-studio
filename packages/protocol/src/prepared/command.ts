import type { ArrayIndexPosition } from '../common.js';
import type { PreparedValueSpec } from './expression.js';
import type { PreparedDataReference, PreparedScopeHandle } from './reference.js';
/** 数字位置在编译前后语义相同；保留公开名称，复用共同定义，实际数组边界仍在执行时检查。 */
export type PreparedIndexPosition = ArrayIndexPosition;
/** 静态解析后的目的位置；before / after 的锚点通过模式绑定真实成员，不是写死的当前 Scope ID。 */
export type PreparedArrayPosition =
  | PreparedIndexPosition
  | { kind: 'before'; item: PreparedScopeHandle }
  | { kind: 'after'; item: PreparedScopeHandle };
/**
 * 七类命令的执行输入。目标 / 值 / 成员身份引用已准备，保留与 Definition 相同的修改语义。
 * 不复用 Command<T...> 泛型框架，避免作者引用混入运行端；业务 Schema 不拦截非法工作态。
 */
export type PreparedCommand =
  | {
      op: 'set';
      /** 已解析的可写位置。 */
      target: PreparedDataReference;
      /** 实际执行时才求值，不保存某次运行的结果。 */
      value: PreparedValueSpec;
    }
  | {
      op: 'patch';
      target: PreparedDataReference;
      /** 浅层字段更新，不递归深合并。 */
      value: Record<string, PreparedValueSpec>;
    }
  | { op: 'remove'; target: PreparedDataReference }
  | {
      op: 'array.insert';
      target: PreparedDataReference;
      position: PreparedArrayPosition;
      value: PreparedValueSpec;
    }
  | {
      op: 'array.remove';
      target: PreparedDataReference;
      /** 由当前执行 Scope 解析稳定成员，不按旧下标定位。 */
      item: PreparedScopeHandle;
    }
  | {
      op: 'array.move';
      target: PreparedDataReference;
      item: PreparedScopeHandle;
      /** 校验失败不得留下半完成移除；成功移动保留成员身份。 */
      position: PreparedArrayPosition;
    }
  | {
      op: 'batch';
      /** 有序、非原子；不回滚前序成功操作，也不合并命令次数。 */
      commands: PreparedCommand[];
    };
