import type { ComponentProps } from 'react';
export function EngineeringInput(props: ComponentProps<'input'>) {
  return <input {...props} className={`fe-engineering-input ${props.className ?? ''}`} />;
}
