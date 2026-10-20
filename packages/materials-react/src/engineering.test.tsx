import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { EngineeringInput } from './engineering';
it('forwards real controlled input without adding form state semantics', async () => {
  function Example() {
    const [value, setValue] = useState('');
    return (
      <>
        <EngineeringInput
          aria-label="工程输入"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <output>{value}</output>
      </>
    );
  }
  render(<Example />);
  await userEvent.type(screen.getByRole('textbox', { name: '工程输入' }), 'sample');
  expect(screen.getByRole('status')).toHaveTextContent('sample');
});
