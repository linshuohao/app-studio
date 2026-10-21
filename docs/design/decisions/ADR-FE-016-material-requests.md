---
id: ADR-FE-016
title: ADR-FE-016：物料请求与 Host 输入输出解耦
type: decision
status: accepted
layer: 跨层
modules:
- M04
- M06
- M14
related:
  decisions:
  - ADR-FE-003
  - ADR-FE-011
  - ADR-FE-015
sources:
- SRC-PROTOCOLBASELINE
navigation:
  group: 09 · 决策与追溯
  order: 126
last_reviewed: '2026-10-21'
status_note: 完整方案已确认；协议结构可实施，Compiler 与公共桥接运行时尚未验收
---

# ADR-FE-016：物料请求与 Host 输入输出解耦

## 背景与比较

物料无法预知不同应用的服务组织及名称。原 MaterialManifest.services 使其依赖 Host 服务，逐物料工厂注入又增加包装负担。仅通知 Host 而由 Host 写表单则混合网络处理与物料交互职责。用户确认独立请求通道，让 Host 聚焦输入输出，由公共桥接交付结果。

## 已确认决策

保留 events / on 无返回通知，新增 MaterialManifest.requests（payloadSchema / resultSchema / concurrency）、MaterialNode.requests（host.request 名称及可选 payload）和 HostContract.requests（输入输出签名）。页面解耦物料名与 Host 名，省略 payload 原样转发，显式参数复用本次 event 引用。首期不增加响应转换 DSL、自动回填或异步工作流。

共用 Adapter 处理请求桥接、输入输出小范围校验、挂载有效性及结果状态。latest 为默认，按实际物料实例 + 请求名淘汰旧调用；parallel 独立交付。卸载 / 改绑 / 实例替换使旧调用 discarded，可选取消仅优化资源。Host 网络及业务失败转为局部 error，不默认停止整表。结果由物料消费，写入仍经 Binding / Command。

Prepared View 保存已解析映射及独立 Schema 闭包，Host Requirements 按请求名称收集节点来源。Host 静态契约仍可选；缺声明报告无法证明的兼容性，不能认定实现缺失。输入输出为 JSON，函数 / Promise / 取消句柄留在运行时 SDK。

移除 MaterialManifest.services、HostContract.services 及 Prepared HostRequirements.services；Host 内部仍自由组织服务。请求不进入 Validator Pending、完整校验或 Reaction 调度。

## 修订关系与代价

局部修订 ADR-FE-003 的“不增加返回能力”边界及 ADR-FE-011 的物料服务需求；这两份 ADR 的其余决策继续有效，因此不将整份 ADR 标记失效。双方均链接本修订。通知仍无返回，不扩大为通用 RPC 方法目录。

新增请求映射与边界验证的成本，换取物料跨 Host 复用、Host 业务函数职责集中和生命周期逻辑共用。旧 services 配置须显式迁移，不能按名称猜测；Prepared 新必填集合及格式兼容须同步生产者消费者，不虚构发布版本。结构测试不能替代 Compiler 类型连接或 Adapter 后发先至等执行验收。

## 现行正文与来源

- [完整请求契约](../l1/05-view-material-host.md#material-requests)
- [用户确认与演进](../design-history.md#material-requests-confirmed)
- [来源](../source-map.md)
