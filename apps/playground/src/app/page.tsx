'use client';
import { useState } from 'react';
import { EngineeringPanel } from '@form-engine/renderer-react/engineering';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
export default function Home() {
  const [value, setValue] = useState('');
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16">
      <p className="text-sm text-muted-foreground">Next.js · pnpm · Turborepo</p>
      <h1 className="text-3xl font-semibold">动态表单引擎 · 工程验证</h1>
      <p>当前仅验证工作区、组件与构建链路，尚未实现表单 Runtime。</p>
      <EngineeringPanel>
        <div className="space-y-3">
          <Label htmlFor="engineering-input">工程输入</Label>
          <Input
            id="engineering-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="输入以验证组件接入"
          />
          <output className="block" aria-live="polite">
            当前输入：{value || '（空）'}
          </output>
          <Button type="button" onClick={() => setValue('')}>
            清空
          </Button>
        </div>
      </EngineeringPanel>
    </main>
  );
}
