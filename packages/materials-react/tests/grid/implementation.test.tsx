import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { setup, field } from '../fixtures.js';
it('renders configured columns/gap with independently labelled child controls', () => {
  const form = setup(
    {
      material: 'grid',
      props: { columns: 3, gap: 'large' },
      slots: { default: [field('text-input'), field('text-input')] },
    },
    'A',
  );
  const grid = form.container.querySelector('.fe-grid');
  expect(grid).toHaveClass('fe-grid--columns-3', 'fe-grid--gap-large');
  const inputs = screen.getAllByRole('textbox');
  expect(inputs).toHaveLength(2);
  expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
