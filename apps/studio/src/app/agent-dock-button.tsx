'use client';

import { useRef, useState } from 'react';
import { Icon } from '@form-engine/studio-design-components';
import type { PanelPosition } from './agent-conversation';

export function AgentDockButton({
  initialPosition,
  onPosition,
  onOpen,
}: {
  initialPosition?: PanelPosition;
  onPosition?: (position: PanelPosition) => void;
  onOpen: () => void;
}) {
  const [position, setPosition] = useState(initialPosition);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | undefined>(
    undefined,
  );
  const moved = useRef(false);
  const positioned = position !== undefined;

  return (
    <button
      type="button"
      className="agent-dock-button"
      aria-label="展开 Agent 聊天"
      title="展开 Agent 聊天。可拖动图标移动位置。"
      style={
        positioned
          ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
          : undefined
      }
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        moved.current = false;
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current?.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
        if (!moved.current) return;
        const next = {
          x: Math.max(8, Math.min(current.left + dx, document.documentElement.clientWidth - 60)),
          y: Math.max(8, Math.min(current.top + dy, window.innerHeight - 60)),
        };
        setPosition(next);
        onPosition?.(next);
      }}
      onPointerUp={() => {
        drag.current = undefined;
      }}
      onLostPointerCapture={() => {
        drag.current = undefined;
      }}
      onClick={() => {
        if (moved.current) {
          moved.current = false;
          return;
        }
        onOpen();
      }}
    >
      <Icon name="Bot" />
    </button>
  );
}
