import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from '@form-engine/studio-design-components/icon';
import { Menu } from '@form-engine/studio-design-components/menu';

function MenuSample() {
  const [action, setAction] = useState('');
  return (
    <>
      <Menu.Root>
        <Menu.Trigger>
          管理 <Icon name="ChevronDown" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner align="start">
            <Menu.Popup>
              <Menu.Item onClick={() => setAction('编辑名称与说明')}>编辑名称与说明</Menu.Item>
              <Menu.Item disabled>复制为新表单</Menu.Item>
              <Menu.Item onClick={() => setAction('归档表单')}>归档表单</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <p role="status">{action && '已选择「' + action + '」'}</p>
    </>
  );
}

createRoot(document.getElementById('menu-sample')).render(<MenuSample />);
