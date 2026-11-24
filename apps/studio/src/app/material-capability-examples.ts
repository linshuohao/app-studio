import type { ViewNode } from '@form-engine/protocol/definition';

export function capabilitySetup(
  material: { id: string; version: string },
  configuration: ViewNode | undefined,
  capability: string,
) {
  if (material.version !== '0.1.0' || !configuration || !('material' in configuration)) return;
  if (
    material.id === 'remote-select' &&
    capability === 'search' &&
    configuration.requests?.search?.request === 'travel.searchCities'
  ) {
    return {
      name: 'travel.searchCities',
      configuration,
      title: 'Host 请求注册与 Renderer 装配',
      description:
        '在 Host 注册与 requests.search 映射同名的处理函数，再把注册表传给 FormRenderer。',
      jsx: `import { remoteSelectRequests } from '@form-engine/materials-react';
import { defineHostRequests, FormRenderer } from '@form-engine/renderer-react';

const cities = ['杭州', '上海', '广州'];
const requests = defineHostRequests(
  { 'travel.searchCities': remoteSelectRequests.search },
  {
    'travel.searchCities': async ({ query }) => ({
      items: cities
        .filter((city) => city.includes(query.trim()))
        .map((city) => ({ id: city, label: city })),
    }),
  },
);

export function TravelForm({ prepared, runtime, materials }) {
  return (
    <FormRenderer
      prepared={prepared}
      runtime={runtime}
      materials={materials}
      requests={requests}
    />
  );
}`,
    };
  }
  if (material.id === 'button' && capability === 'activate') {
    const mapping = configuration.on?.activate;
    if (mapping?.type !== 'host.emit' || mapping.event !== 'travel.saveDraft') return;
    return {
      name: 'travel.saveDraft',
      configuration,
      title: 'Runtime 事件注册与 Renderer 装配',
      description:
        '创建 Runtime 时，在 host.events 注册与 on.activate 映射同名的处理函数。Host 持有 Runtime，并在视图卸载后释放。',
      jsx: `import { createRuntime } from '@form-engine/runtime';
import { FormRenderer } from '@form-engine/renderer-react';

export function startTravelForm({ prepared, functions, data, materials, onDraft }) {
  async function saveDraft() {
    await runtime.flush();
    onDraft(runtime.snapshot());
  }

  const runtime = createRuntime({
    prepared,
    functions,
    data,
    host: {
      events: {
        'travel.saveDraft': () => {
          void saveDraft().catch(console.error);
        },
      },
    },
  });

  return {
    runtime,
    element: (
      <FormRenderer prepared={prepared} runtime={runtime} materials={materials} />
    ),
  };
}`,
    };
  }
}
