import { Component, type ErrorInfo } from 'react';
import type { BoundaryProps } from './boundary-types.js';

/**
 * 捕获后代呈现错误；既供根装配边界复用，也供单物料边界复用。
 * 输入为子树、恢复凭据和错误呈现选项；正常返回子树，失败返回局部业务提示。
 * 这里使用 class 承载 React 错误边界生命周期；其他普通呈现组件使用函数。
 * 错误状态只属于 UI；原生事件 / 普通异步回调的异常由 Adapter 对应入口处理。
 */
export class MaterialBoundary extends Component<
  BoundaryProps,
  { hasError: boolean; resetKey: unknown }
> {
  /** 只保存失败标志与恢复凭据；JS 可以抛出任何值，不能用错误值的真假代表失败。 */
  state = { hasError: false, resetKey: this.props.resetKey };
  // 配置或注册环境的恢复凭据改变时允许重试；普通渲染不会清除失败标志。
  static getDerivedStateFromProps(props: BoundaryProps, state: { resetKey: unknown }) {
    return props.resetKey !== state.resetKey ? { hasError: false, resetKey: props.resetKey } : null;
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown, _info: ErrorInfo) {
    let message = 'Unknown render error';
    try {
      message = String(error);
    } catch {
      // 异常对象自身也可能无法转成字符串，仍须保留局部降级和错误交付。
    }
    this.props.report?.({ ...this.props.diagnostic, message });
  }
  render() {
    if (this.state.hasError)
      return (
        <>
          {this.props.fallback ? (
            this.props.fallback(this.props.diagnostic)
          ) : (
            <div role="alert">此处暂时不可用，请稍后重试。</div>
          )}
        </>
      );
    return this.props.children;
  }
}
