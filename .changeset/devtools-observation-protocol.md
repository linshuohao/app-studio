---
'@form-engine/runtime': major
'@form-engine/renderer-react': major
'@form-engine/devtools': major
---

直接替换旧 DevTools 协议为版本 2：自动订阅与推送、固定快照及版本增量、完整规则和校验执行事实、四视图图投影。删除旧 list/read、手动 startCapture/stopCapture 及 captureId，不提供兼容层。Runtime、Renderer 和扩展必须同步升级；生产默认不开启观测。业务表单协议与 Runtime Command 不变。
