'use client';

import { useState } from 'react';
import { IconButton } from '../components/ui';
import { Modal } from './modal';

export function MaterialDescription({ title, text }: { title: string; text: string }) {
  const [trigger, setTrigger] = useState<HTMLButtonElement>();
  return (
    <>
      <IconButton
        icon="Info"
        aria-label={title}
        title={title}
        aria-haspopup="dialog"
        onClick={(event) => setTrigger(event.currentTarget)}
      />
      {trigger && (
        <Modal
          title={title}
          size="standard"
          returnFocus={trigger}
          onClose={() => setTrigger(undefined)}
        >
          <p className="material-description-text">{text}</p>
        </Modal>
      )}
    </>
  );
}
