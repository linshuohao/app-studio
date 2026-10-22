import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EngineeringPanel } from '../src/engineering.js';
it('renders a child through the built runtime dependency', () => {
  render(
    <EngineeringPanel>
      <button>工程按钮</button>
    </EngineeringPanel>,
  );
  expect(screen.getByRole('region', { name: /工程验证/ })).toContainElement(
    screen.getByRole('button'),
  );
});
