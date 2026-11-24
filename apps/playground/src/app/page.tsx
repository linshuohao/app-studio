import Link from 'next/link';
import { scenarios } from '@/demos/scenarios';
export default function Home() {
  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-16">
      <header className="max-w-2xl space-y-4">
        <p className="text-sm font-medium text-muted-foreground">场景演示</p>
        <h1 className="text-3xl font-semibold tracking-tight">动态表单引擎 · Playground</h1>
        <p className="leading-7 text-muted-foreground">
          从基础填写到完整业务流程，选择一个场景体验。所有表单均使用现有正式物料库，服务与提交使用本地模拟数据。
        </p>
      </header>
      <nav aria-label="表单场景" className="grid gap-5 md:grid-cols-2">
        {scenarios.map((scenario, index) => (
          <article key={scenario.id} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            <p className="text-sm text-muted-foreground">DEMO 0{index + 1}</p>
            <h2 className="text-xl font-semibold">{scenario.title}</h2>
            <p className="grow leading-7 text-muted-foreground">{scenario.description}</p>
            <ul aria-label={`${scenario.title}能力`} className="flex flex-wrap gap-2">
              {scenario.features.map((feature) => (
                <li key={feature} className="rounded bg-muted px-2 py-1 text-xs">
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={`/demos/${scenario.id}`}
              className="mt-2 rounded-md border px-4 py-2 text-center text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              打开{scenario.title}
            </Link>
          </article>
        ))}
      </nav>
      <p className="text-sm text-muted-foreground">
        离开场景后会释放当前表单，重新进入从示例数据开始。草稿与提交结果仅在当前场景内保留。
      </p>
    </main>
  );
}
