/** 导航只保存场景信息；表单定义与本地 Host 在各自目录中，首页不装载 Runtime。 */
export const scenarios = [
  {
    id: 'basic',
    title: '基础资料',
    description: '从一份简单资料表开始，体验输入、选项、字段提示与校验交付。',
    features: ['基础输入', '字段校验', '快照交付'],
  },
  {
    id: 'members',
    title: '家庭成员',
    description: '管理多位成员，在平铺编辑与摘要弹层之间切换，观察数据如何保留。',
    features: ['动态成员', '条件呈现', '双视图'],
  },
  {
    id: 'interactions',
    title: '日期与城市',
    description: '确认出行日期、搜索目的地，尝试请求失败、取消和迟到返回。',
    features: ['日期确认', '远程选择', '可控请求'],
  },
  {
    id: 'travel',
    title: '家庭出行',
    description: '串联行程、成员、费用试算和资格核验，完成草稿保存与模拟提交。',
    features: ['业务联动', '异步校验', '完整表单'],
  },
  {
    id: 'observation',
    title: 'DevTools 联动观测',
    description: '36 名成员跨对象联动，查看条件分支、异步校验与执行路径。',
    features: ['影响链', '成员折叠', '自动推送'],
  },
] as const;
