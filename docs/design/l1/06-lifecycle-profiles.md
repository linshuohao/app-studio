---
id: L1-LIFECYCLE
title: 生命周期与多视图交付
type: protocol
status: active
layer: L1
modules:
- M13
- M15
tags: []
related:
  decisions:
  - ADR-FE-017
  - ADR-FE-008
  - ADR-FE-010
sources:
- SRC-COMPILERIO
- SRC-L1
- SRC-HOST
navigation:
  group: 02 · L1 协议
  order: 36
last_reviewed: '2026-10-19'
reading_next: L1-EXAMPLES
---

# 生命周期与多视图交付

> L1 架构与语义决策正文；正式类型、Schema 与发布验收状态见各节。

## 实例装载、Host 恢复与提交职责 {#lifecycle}

> 状态：已收敛

Runtime 管 Working Data、Scope Identity、Command、Dependency Index、Reaction、Validation 和 Flush。Host 管异步加载、业务 Baseline / Dirty / Reset 意图、保存及提交策略。2026.10.19 用户修订替代 Runtime 自动业务基准与 Reset 主动重算；定义不增加相应业务状态或生命周期脚本。

| 操作 / 概念 | 责任与语义约束 |
| --- | --- |
| Initialize / 实例装载 | Host 提供初始输入；保留既有 Host 值优先、补真正缺失默认值的语义，L3 创建 Data / Scope / 规则，新实例默认不执行 Reaction，显式开启 runOnActivate 才首次执行；不自动建立业务 Baseline |
| Update / 导入 | 通过普通 Command 修改当前 Working Data；按有效观察值变化决定现有规则是否入队，不保证导入结果满足作者未表达的业务期望 |
| Reinitialize / 新外部数据 | Host 明确选择更新现有实例或真实替换实例的接入方式，并处理旧请求 / 订阅；只有实际新建的规则实例应用首次激活，不把普通导入或 Reset 伪装成重建 |
| 业务 Baseline / Dirty | Host 可选 snapshot 与时点，自行保存业务基准和判断编辑状态；不属于 Runtime 核心 |
| Reset | Host 按自身业务规则生成恢复 Command；可封装便捷 API，但不绕过有效 Watch 变化检测主动重跑现存实例 |
| Submit / Readiness | L3 提供声明约束、校验及所需执行完成信息，Host 决定业务许可、输出保存与真实提交 |

Definition 不增加 onInit、onReset、beforeSubmit 通用脚本，也不增加 isDirty、markClean、resetToBaseline 核心状态方法。具体实例装载 / 替换、稳定快照、错误与完成观察 SDK 仍待固化；这些工程契约不重新把业务编辑语义放回 Runtime。

Runtime 随 Form / Scope 建立规则实例，runOnActivate 只控制新 Reaction 实例首次激活是否运行，默认不执行；根实例、新增成员与整数组替换的新成员一致适用。首次校验、主动完整校验与首次 View 读取分别有明确入口：完整校验覆盖全部适用规则，普通增量集合不能替代它。结果按来源 / 字段聚合，异步代次和完整结论仍须与有效输入关联，详见 [L3 校验](../l3-validation.md)。subscribe 不是规则首次执行的别称；View 重挂不重新激活同一业务实例。删除、真实替换或销毁须处理失效订阅、Scope 和外部报告适用性。

Host 如需初始联动完成后的业务快照，可观察相应完成结果后调用 snapshot 自行保存；何时保存和何时标 Clean 由业务决定。读取 snapshot 不隐式 Flush、不等待全部异步校验、不自动建立 Baseline。推荐 Host 先取得外部数据再创建实例；如提供显式装载入口，Host 仍须防止迟到响应覆盖编辑，不用普通 set 猜测业务加载是否结束。

Reset 后 Watch 未变，已有 Reaction 就不新增入队，即使当前费率或期望计算结果不同。业务需通过正确 Watch 配置或明确数据修改表达目标；本次经用户确认保留现行 Context 契约，不新增 Context 写入命令或 Context Reaction.watch。例子与现行边界验收见 [Runtime / Host 四条原则](../l3-reactive-engine.md#l3-runtime-host-boundary)。异常 / 整体预算停止、Pending 再触发与 异常轮次与 Validation / Submit 的完成衔接仍见 [L3 契约](../l3-reactive-engine.md#l3-consumers)，不增加业务 Reset 执行模式。

## 多 Profile 与按需交付 {#profiles}

多 Profile 是扩展能力，不是单视图调用的必填选项。单一 views 入口自动选中，无需指定平台；目标选择与资源锁定仍遵守[默认输入规则](../l2-preparation.md#compiler-io-contract)。表达式观察按当前挂载实例激活，切换 / 卸载释放旧接入。

> 状态：已收敛

View Profile 表达同一业务数据在不同终端或场景下采用不同的物料树。服务端或 L2 可以按请求只准备当前 Profile 的入口与其静态引用依赖，但共享 Data Schema、Constraint、Reaction 不能仅因为某字段不可见就被裁剪掉。

Profile 切换只释放旧视图订阅并挂载新视图订阅及局部 UI 状态；同一 FormRuntime 的业务规则不随 View 切换反复注册或销毁。隐藏、虚拟列表未挂载与数据 / 校验有效性属于不同生命周期，见 [跨层激活归属](../dependency-reactivity.md#dependency-layers)。

**Profile 是选择入口，不是复制 Form Definition**

```json
{
  "views": {
    "expanded": {
      "$use": "expanded-form"
    },
    "compact": {
      "$use": "compact-form"
    }
  }
}
```
