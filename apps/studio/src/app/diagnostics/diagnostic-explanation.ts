const explanations: Record<string, { title: string; next: string }> = {
  MATERIAL_UNAVAILABLE: {
    title: '表单物料无法装载',
    next: '先核对宿主是否注册了下方物料，再比对原发布锁定的物料版本、契约摘要和制品摘要。若三者一致，再用同一发布重跑渲染，检查物料的装配日志。',
  },
  'reaction.error': {
    title: '联动规则执行失败',
    next: '打开原配置定位该联动规则，核对失败阶段读取的字段、参数和纯函数。可将错误引用到 Agent 复验支持的联动条件。',
  },
  'reaction.action.error': {
    title: '联动动作执行失败',
    next: '检查原配置中的联动动作，确认写入目标、参数和宿主能力映射符合预期。',
  },
  'validation.error': {
    title: '校验规则执行失败',
    next: '检查规则的适用条件、依赖字段和断言，再使用相同输入复验。',
  },
  'validator.error': {
    title: '宿主校验器执行失败',
    next: '核对宿主校验器的注册、调用参数和返回值，再查相应的宿主日志。',
  },
  'flush.aborted': {
    title: '本次联动执行已中止',
    next: '检查执行链路中是否有规则反复触发或循环写入，并从最早的触发事件复验。',
  },
};

export function diagnosticExplanation(code: string) {
  return Object.hasOwn(explanations, code)
    ? explanations[code]!
    : { title: '表单运行异常', next: '核对失败阶段和原发布配置，并补充可复现的操作步骤。' };
}
