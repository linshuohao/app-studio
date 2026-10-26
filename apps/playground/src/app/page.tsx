'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
export default function Home() {
  const [value, setValue] = useState('');
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16">
      <p className="text-sm text-muted-foreground">Next.js · pnpm · Turborepo</p>
      <h1 className="text-3xl font-semibold">动态表单引擎 · Playground</h1>
      <p>当前页面用于组件交互演示，尚未接入表单 Runtime。</p>
      <section aria-label="输入演示">
        <div className="space-y-3">
          <Label htmlFor="demo-input">示例输入</Label>
          <Input
            id="demo-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="输入内容"
          />
          <output className="block" aria-live="polite">
            当前输入：{value || '（空）'}
          </output>
          <Button type="button" onClick={() => setValue('')}>
            清空
          </Button>
        </div>
      </section>
    </main>
  );
}
