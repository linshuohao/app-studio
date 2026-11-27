'use client';

import { useState } from 'react';
import { Button, Icon, Menu, type IconName } from '@form-engine/studio-design-components';
import type { Access, Account } from './platform-api';
import './studio-navigation.css';

const destinations = [
  ['agent', 'Agent', 'Bot'],
  ['forms', '表单', 'FileText'],
  ['materials', '物料', 'Component'],
  ['functions', '纯函数', 'FunctionSquare'],
  ['diagnostics', '表单错误', 'Info'],
] as const;

export type StudioPage = (typeof destinations)[number][0] | 'members' | 'account' | 'draft';

const workspaceLabels = {
  agent: 'Agent',
  draft: '表单草稿',
  forms: '表单',
  materials: '物料',
  functions: '纯函数',
  diagnostics: '表单错误',
  members: '成员',
  account: '账号与权限',
};

function visibleDestinations(access: Access) {
  return destinations.filter(([page]) => {
    if (page === 'agent') return access.permissions.includes('form:edit');
    if (page === 'diagnostics') return access.permissions.includes('diagnostic:view');
    return true;
  });
}

export function StudioBreadcrumb({
  page,
  access,
  formName,
  releaseDetail,
  busy,
  navigate,
  openForms,
}: {
  page: StudioPage;
  access: Access;
  formName?: string;
  releaseDetail?: boolean;
  busy: boolean;
  navigate: (page: StudioPage) => void;
  openForms: () => void;
}) {
  const pages: StudioPage[] = visibleDestinations(access).map(([id]) => id);
  if (access.permissions.includes('member:manage')) pages.push('members');
  pages.push('account');

  return (
    <nav className="studio-breadcrumb" aria-label="面包屑导航">
      <Menu.Root>
        <Menu.Trigger render={<Button variant="text" />} disabled={busy}>
          默认空间 <Icon name="ChevronDown" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="start"
            sideOffset={8}
            className="studio-account-positioner"
          >
            <Menu.Popup className="studio-account-menu">
              {pages.map((id) => (
                <Menu.Item
                  key={id}
                  aria-current={id === page ? 'page' : undefined}
                  onClick={() => navigate(id)}
                >
                  {workspaceLabels[id]}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <span aria-hidden="true">/</span>
      {formName === undefined ? (
        <span aria-current="page">{workspaceLabels[page]}</span>
      ) : (
        <>
          <Button variant="text" disabled={busy} onClick={openForms}>
            表单
          </Button>
          <span aria-hidden="true">/</span>
          <span aria-current={releaseDetail ? undefined : 'page'}>{formName}</span>
          {releaseDetail && (
            <>
              <span aria-hidden="true">/</span>
              <span aria-current="page">发布详情</span>
            </>
          )}
        </>
      )}
    </nav>
  );
}

export function RailToggle({
  open,
  label,
  controls,
  onToggle,
}: {
  open: boolean;
  label: string;
  controls: string;
  onToggle: () => void;
}) {
  const action = (open ? '收起' : '展开') + label;
  return (
    <Button
      variant="text"
      className="studio-rail-toggle"
      aria-label={action}
      title={action}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <Icon name={open ? 'PanelLeftClose' : 'PanelLeftOpen'} />
    </Button>
  );
}

export function StudioNavigation({
  page,
  access,
  account,
  busy,
  navigate,
  logout,
  openSecurity,
}: {
  page: StudioPage;
  access: Access;
  account: Account | null;
  busy: boolean;
  navigate: (page: StudioPage) => void;
  logout: () => void;
  openSecurity: () => void;
}) {
  const [expanded, setExpanded] = useState(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        localStorage.getItem('studio-navigation-expanded') === 'true'
      );
    } catch {
      return false;
    }
  });
  const name = account?.username || account?.githubLogin || '我的账号';

  function destination(id: StudioPage, label: string, icon: IconName) {
    return (
      <Button
        key={id}
        className="studio-nav-destination"
        variant="text"
        aria-current={page === id || (id === 'forms' && page === 'draft') ? 'page' : undefined}
        aria-label={label}
        title={expanded ? undefined : label}
        disabled={busy}
        onClick={() => navigate(id)}
      >
        <Icon name={icon} />
        <span>{label}</span>
      </Button>
    );
  }

  return (
    <aside className="studio-navigation" data-expanded={expanded}>
      <div className="studio-navigation-header">
        {expanded && (
          <div className="studio-navigation-brand">
            <span className="studio-navigation-mark" aria-hidden="true">
              S
            </span>
            <strong>Studio</strong>
          </div>
        )}
        <RailToggle
          label="导航"
          open={expanded}
          controls="studio-destinations studio-space-actions"
          onToggle={() => {
            setExpanded(!expanded);
            try {
              localStorage.setItem('studio-navigation-expanded', String(!expanded));
            } catch {
              // Storage is optional in this browser.
            }
          }}
        />
      </div>
      <nav id="studio-destinations" aria-label="主导航">
        {visibleDestinations(access).map(([id, label, icon]) => destination(id, label, icon))}
      </nav>
      <div id="studio-space-actions" className="studio-space-actions">
        {access.permissions.includes('member:manage') && destination('members', '成员', 'Users')}
        <Menu.Root>
          <Menu.Trigger
            render={<Button variant="text" className="studio-nav-destination" />}
            aria-label="我的账号"
            aria-current={page === 'account' ? 'page' : undefined}
            title={name}
          >
            <span className="studio-account-avatar" aria-hidden="true">
              {Array.from(name)[0]}
            </span>
            {expanded && <span>{name}</span>}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              side="right"
              align="end"
              sideOffset={8}
              className="studio-account-positioner"
            >
              <Menu.Popup className="studio-account-menu">
                <Menu.Item onClick={() => navigate('account')}>账号与权限</Menu.Item>
                <Menu.Item onClick={openSecurity}>安全记录</Menu.Item>
                <Menu.Item disabled={busy} onClick={logout}>
                  退出登录
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </aside>
  );
}
