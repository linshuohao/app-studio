'use client';

import { PageHeading } from './page-heading';
import {
  Button,
  DataTable,
  Form,
  Input,
  Icon,
  Menu,
  ListFilterBar,
  Pagination,
  type Column,
} from '@form-engine/studio-design-components';
import { Feedback } from '@form-engine/studio-design-components/controls';
import { Field, FormLayout } from '@form-engine/studio-design-components/form-layout';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import {
  addReference,
  diagnosticIdPattern,
  fetchDiagnosticReference,
  maxReferences,
  conversationKey,
  keepConversation,
  type ConversationLink,
  type MessageReference,
} from './agent-conversation';
import { AgentDraftBox } from './agent-draft-box';
import { AgentCreation } from './agent-creation';
import { AgentConversationList } from './agent-conversation-list';
import { AgentConversationPicker } from './agent-conversation-picker';
import type { PanelPosition } from './agent-conversation';
import {
  RailToggle,
  StudioBreadcrumb,
  StudioNavigation,
  type StudioPage,
} from './studio-navigation';
import { LoginScreen } from './login-screen';

import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { AccountAdmission, RegistrationConfirmation } from './account-entry';
import { writeLocation, listPosition, restorePosition, type ListPosition } from './studio-location';
import { AccountSecurity } from './account-security';
import { Members } from './members';
import { AssetCatalog } from './asset-catalog';
import { AssetRepairsWorkspace, type AssetRepairView } from './asset-repairs-workspace';
import { DiagnosticsWorkspace } from './diagnostics/diagnostics-workspace';
import { Modal } from './modal';
import { CopyForm, FormManagement } from './form-management';
import { clearAccountDrafts } from './local-drafts';
import { WorkingVersions } from './working-versions';
import { useGitHubResult } from './github-account';
import {
  type Access,
  type Account,
  type Registration,
  accessDenied,
  failureMessage,
  type FormSummary,
  type FormListEntry,
  type OpenForm,
  outcomeUnknown,
  platform,
  PlatformError,
} from './platform-api';

const formPageSizes = [10, 20, 50];
const defaultFormPageSize = 20;

export default function Studio() {
  const [account, setAccount] = useState<Account | null>();
  const [registration, setRegistration] = useState<Registration>();
  const accountRef = useRef<Account | null>(null);
  const identitySequence = useRef(0);
  const sessionGenerationRef = useRef(0);
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [access, setAccess] = useState<Access | null>();
  const [forms, setForms] = useState<FormListEntry[]>([]);
  const [entryPoint, setEntryPoint] = useState<{
    tab: 'config' | 'history' | 'releases';
    id?: string;
  }>({ tab: 'config' });
  const [retainedForm, setForm] = useState<OpenForm | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const parkedSearch = useRef('');
  const form = formOpen ? retainedForm : null;
  const [agentRevision, setAgentRevision] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [draftPageId, setDraftPageId] = useState<string>();
  const [draftOpenedFromAgent, setDraftOpenedFromAgent] = useState(false);
  const [agentPanelPosition, setAgentPanelPosition] = useState<PanelPosition>();
  const [agentDockPosition, setAgentDockPosition] = useState<PanelPosition>();
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const [renamedConversation, setRenamedConversation] = useState<{ id: string; title: string }>();
  const openedDraft = useRef<string | undefined>(undefined);
  const draftConversation = useRef<string | undefined>(undefined);
  const [agentInstance, setAgentInstance] = useState(0);
  const agentInstanceRef = useRef(0);
  function resetAgentInstance() {
    const next = ++agentInstanceRef.current;
    setAgentInstance(next);
    setReferenceDraft(undefined);
    return next;
  }
  const [referenceDraft, setReferenceDraft] = useState<{
    instance: number;
    items: MessageReference[];
  }>();
  const [pickingReference, setPickingReference] = useState(false);
  const pageReferenceTrigger = useRef<HTMLButtonElement>(null);
  function cancelPageReference() {
    setPickingReference(false);
    pageReferenceTrigger.current?.focus({ preventScroll: true });
  }
  const cancelPageReferenceFromKeyboard = useEffectEvent(cancelPageReference);
  useEffect(() => {
    if (!pickingReference) return;
    const cancel = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      cancelPageReferenceFromKeyboard();
    };
    document.addEventListener('keydown', cancel);
    return () => document.removeEventListener('keydown', cancel);
  }, [pickingReference]);
  const [referenceFocus, setReferenceFocus] = useState(0);
  const currentReferenceDraft =
    referenceDraft?.instance === agentInstance ? referenceDraft : undefined;
  function updateReferences(change: (items: MessageReference[]) => MessageReference[]) {
    if (agentInstanceRef.current !== agentInstance) return;
    setReferenceDraft((current) => ({
      instance: agentInstance,
      items: change(current?.instance === agentInstance ? current.items : []),
    }));
  }
  function attachReference(reference: MessageReference) {
    if (
      !activeConversationId &&
      !continuation &&
      (currentReferenceDraft?.items.length ?? 0) >= maxReferences
    ) {
      setNotice('一条消息最多添加 5 个引用，请先移除已有引用。');
      return;
    }
    setNotice('');
    if (activeConversationId || continuation) {
      const instance = resetAgentInstance();
      setReferenceDraft({ instance, items: [reference] });
      setResumeResource(undefined);
      setActiveConversationId(undefined);
      writeLocation({ page: 'agent' });
      void readRoute({ preserveAgentInstance: true });
    } else {
      updateReferences((items) => addReference(items, reference));
    }
    setPickingReference(false);
    setAgentPanelOpen(true);
    setReferenceFocus((value) => value + 1);
  }
  const [historyOpen, setHistoryOpen] = useState(true);
  const [catalog, setCatalog] = useState<'materials' | 'functions'>();
  const [members, setMembers] = useState(false);
  const lastDiagnosticPosition = useRef<ListPosition | undefined>(undefined);
  const [assetRepairs, setAssetRepairs] = useState<{ task?: string; view: AssetRepairView }>();
  const [diagnosticRoute, setDiagnosticRoute] = useState<{
    event?: string;
    group?: string;
    view?: string;
  }>();
  const [settings, setSettings] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [continuation, setContinuation] = useState<{
    key: string;
    conversation: ConversationLink;
  }>();
  const [draftBoxOpen, setDraftBoxOpen] = useState(false);
  const [resumeResource, setResumeResource] = useState<{
    kind: 'conversations' | 'drafts';
    id: string;
  }>();
  const [agentOpen, setAgentOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [managementBusy, setManagementBusy] = useState({ metadata: false, copy: false });
  const [management, setManagement] = useState<string>();
  const [managementAction, setManagementAction] = useState<
    'edit' | 'copy' | 'archive' | 'restore'
  >();
  const [managementError, setManagementError] = useState('');
  const [filter, setFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [draftFilters, setDraftFilters] = useState({
    search: '',
    status: 'active' as typeof filter,
  });
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(defaultFormPageSize);
  const restoreManagementFocus = useRef(false);
  const [dialogTrigger, setDialogTrigger] = useState<HTMLButtonElement>();
  const searchInput = useRef<HTMLInputElement>(null);
  const lastFormPosition = useRef<ListPosition>(undefined);
  const [listReturn, setListReturn] = useState<ListPosition>();
  const [name, setName] = useState('');
  const [creation, setCreation] = useState<{ key: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const formRef = useRef(form);
  formRef.current = retainedForm;
  const routeSequence = useRef(0);
  const [actionBusy, setBusy] = useState(false);
  const [routeBusy, setRouteBusy] = useState(false);
  const busy = actionBusy || routeBusy;
  const { result: githubResult, clear: clearGitHubResult } = useGitHubResult();

  async function loadForms() {
    const identity = identitySequence.current;
    setListLoading(true);
    setListError('');
    try {
      const rows = await platform<FormListEntry[]>('/forms');
      if (
        identity === identitySequence.current &&
        accountRef.current?.membership.status === 'active'
      )
        setForms(rows);
    } catch (reason) {
      if (identity === identitySequence.current) {
        setListError(failureMessage(reason));
        if (accessDenied(reason)) {
          setForms([]);
          await refreshAccount(false).catch(() => undefined);
        }
      }
    } finally {
      if (identity === identitySequence.current) setListLoading(false);
    }
  }
  async function readRoute({ keepForm = false, preserveAgentInstance = false } = {}) {
    setPickingReference(false);
    let query = new URLSearchParams(window.location.search);
    if (query.has('studio')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('studio');
      history.replaceState(history.state, '', url);
      query = url.searchParams;
    }
    if (query.get('page') === 'agent' && query.has('draft')) {
      writeLocation(
        {
          page: 'draft',
          draft: query.get('draft') ?? undefined,
          conversation: query.get('conversation') ?? undefined,
        },
        true,
      );
      query = new URLSearchParams(window.location.search);
    }
    if (accountRef.current?.membership.status !== 'active') {
      setSettings(new URLSearchParams(window.location.search).get('page') === 'account');
      return;
    }
    const sequence = ++routeSequence.current;
    const kind = query.get('catalog');
    const page = query.get('page');
    const routeDraft = page === 'draft' ? (query.get('draft') ?? undefined) : undefined;
    setDraftPageId(routeDraft);
    setDraftOpenedFromAgent(!!routeDraft && query.get('from') === 'agent');
    setCatalog(kind === 'materials' || kind === 'functions' ? kind : undefined);
    setSettings(page === 'account');
    setMembers(page === 'members');
    setAssetRepairs(
      page === 'asset-repairs'
        ? {
            task: query.get('task') ?? undefined,
            view: query.get('view') === 'reviews' ? 'reviews' : 'tasks',
          }
        : undefined,
    );
    setDiagnosticRoute(
      page === 'diagnostics'
        ? {
            event: query.get('event') ?? undefined,
            group: query.get('group') ?? undefined,
            view: query.get('view') ?? undefined,
          }
        : undefined,
    );
    if (page !== 'account') setSecurityOpen(false);
    const id = query.get('form');
    setRouteBusy(false);
    const showAgent =
      !id &&
      !kind &&
      page === 'agent' &&
      accountRef.current?.membership.permissions.includes('form:edit');
    const showDraft =
      !id &&
      !kind &&
      !!routeDraft &&
      accountRef.current?.membership.permissions.includes('form:edit');
    setAgentOpen(Boolean(showAgent));
    if (showDraft) {
      if (routeDraft !== openedDraft.current) {
        openedDraft.current = routeDraft;
        draftConversation.current = query.get('conversation') ?? undefined;
        setResumeResource(
          draftConversation.current
            ? { kind: 'conversations', id: draftConversation.current }
            : { kind: 'drafts', id: routeDraft },
        );
        setActiveConversationId(draftConversation.current);
        if (!preserveAgentInstance || draftConversation.current !== activeConversationId)
          resetAgentInstance();
      } else if (draftConversation.current !== (query.get('conversation') ?? undefined)) {
        resetAgentInstance();
        draftConversation.current = query.get('conversation') ?? undefined;
        setResumeResource(
          draftConversation.current
            ? { kind: 'conversations', id: draftConversation.current }
            : { kind: 'drafts', id: routeDraft },
        );
        setActiveConversationId(draftConversation.current);
      }
    } else {
      openedDraft.current = undefined;
      draftConversation.current = undefined;
      if (resumeResource?.kind === 'drafts') setResumeResource(undefined);
    }
    if (showAgent) {
      const routeDraft = query.get('draft') ?? undefined;
      const routeConversation = query.get('conversation') ?? undefined;
      const diagnosticId = query.get('diagnostic');
      if (!routeConversation && diagnosticId && diagnosticIdPattern.test(diagnosticId)) {
        const instance = resetAgentInstance();
        setActiveConversationId(undefined);
        setResumeResource(undefined);
        writeLocation({ page: 'agent' }, true);
        void fetchDiagnosticReference(diagnosticId).then(
          (reference) => {
            if (sequence !== routeSequence.current || instance !== agentInstanceRef.current) return;
            setReferenceDraft((current) => ({
              instance,
              items: addReference(current?.instance === instance ? current.items : [], reference),
            }));
            setAgentPanelOpen(true);
            setReferenceFocus((value) => value + 1);
          },
          (reason: unknown) => {
            if (sequence === routeSequence.current) setNotice(failureMessage(reason));
          },
        );
      } else if (
        !preserveAgentInstance &&
        (routeDraft !== openedDraft.current || routeConversation !== activeConversationId)
      ) {
        openedDraft.current = routeDraft;
        draftConversation.current = routeConversation;
        setResumeResource(
          routeDraft
            ? { kind: 'drafts', id: routeDraft }
            : routeConversation
              ? { kind: 'conversations', id: routeConversation }
              : undefined,
        );
        setActiveConversationId(draftConversation.current);
        resetAgentInstance();
      }
    }
    if (!id) {
      const saved = history.state?.formsList;
      if (saved && (!page || page === 'forms') && !kind) {
        setSearch(saved.search);
        setFilter(saved.filter);
        setDraftFilters({ search: saved.search, status: saved.filter });
        setListPage(Math.max(1, saved.page ?? 1));
        setListPageSize(
          formPageSizes.includes(saved.pageSize) ? saved.pageSize : defaultFormPageSize,
        );
        setListReturn(saved.position);
      } else setListReturn(undefined);
      setFormOpen(false);
      if (!keepForm && !kind && (!page || page === 'forms')) setForm(null);
      return;
    }
    parkedSearch.current = window.location.search;
    setFormOpen(true);
    const tab = query.get('tab');
    const entry = {
      tab: (tab === 'history' || tab === 'releases' ? tab : 'config') as
        'config' | 'history' | 'releases',
      id: query.get(tab === 'releases' ? 'release' : 'version') ?? undefined,
    };
    if (formRef.current?.formId === id) {
      setEntryPoint(entry);
      return;
    }
    setRouteBusy(true);
    setForm(null);
    setError('');
    try {
      const opened = await platform<OpenForm>(`/forms/${encodeURIComponent(id)}`);
      if (sequence === routeSequence.current) {
        setEntryPoint(entry);
        setForm(opened);
      }
    } catch (reason) {
      if (sequence === routeSequence.current) {
        setForm(null);
        setError(failureMessage(reason));
        if (accessDenied(reason)) await refreshAccount(false).catch(() => undefined);
      }
    } finally {
      if (sequence === routeSequence.current) setRouteBusy(false);
    }
  }
  function applyAccount(current: Account | null) {
    const changedIdentity = accountRef.current?.userId !== current?.userId;
    accountRef.current = current;
    setAccount(current);
    setAccess(
      current?.membership.status === 'active'
        ? {
            userId: current.userId,
            spaceId: current.membership.spaceId,
            permissions: current.membership.permissions,
          }
        : null,
    );
    if (current?.membership.status !== 'active')
      setSettings(new URLSearchParams(window.location.search).get('page') === 'account');
    if (changedIdentity || current?.membership.status !== 'active') {
      setListPage(1);
      setListPageSize(defaultFormPageSize);
      ++routeSequence.current;
      setForm(null);
      setFormOpen(false);
      parkedSearch.current = '';
      setAgentOpen(false);
      setActiveConversationId(undefined);
      resetAgentInstance();
      setRenamedConversation(undefined);
      openedDraft.current = undefined;
      draftConversation.current = undefined;
      setResumeResource(undefined);
      setForms([]);
      setMembers(false);
      setAssetRepairs(undefined);
      setCatalog(undefined);
      setCreating(false);
      setCreation(null);
      setManagement(undefined);
      setManagementAction(undefined);
    }
  }

  async function refreshAccount(loadResources = true) {
    const identity = ++identitySequence.current;
    try {
      const current = await platform<Account>('/account');
      if (identity !== identitySequence.current) return;
      applyAccount(current);
      setRegistration(undefined);
      if (loadResources && current.membership.status === 'active') {
        await loadForms();
        if (identity === identitySequence.current) await readRoute();
      }
    } catch (reason) {
      if (identity !== identitySequence.current) return;
      if (reason instanceof PlatformError && reason.status === 401) applyAccount(null);
      throw reason;
    }
  }

  const applyAccountFromEffect = useEffectEvent(applyAccount);
  const loadInitialTeam = useEffectEvent(() => {
    void loadForms();
    void readRoute();
  });
  const readBrowserRoute = useEffectEvent(() => {
    void readRoute();
  });

  useEffect(() => {
    let active = true;
    const identity = ++identitySequence.current;
    void platform<Account>('/account').then(
      (current) => {
        if (!active || identity !== identitySequence.current) return;
        applyAccountFromEffect(current);
        if (current.membership.status === 'active') loadInitialTeam();
      },
      async (reason) => {
        if (!active || identity !== identitySequence.current) return;
        applyAccountFromEffect(null);
        if (!(reason instanceof PlatformError && reason.status === 401)) {
          setError(failureMessage(reason));
          return;
        }
        try {
          const pending = await platform<Registration>('/github/registration');
          if (active && identity === identitySequence.current) setRegistration(pending);
        } catch (failure) {
          if (
            active &&
            identity === identitySequence.current &&
            !(failure instanceof PlatformError && failure.status === 401)
          )
            setError(failureMessage(failure));
        }
      },
    );
    const logoutChannel =
      typeof BroadcastChannel === 'undefined'
        ? undefined
        : new BroadcastChannel('studio-account-logout');
    if (logoutChannel)
      logoutChannel.onmessage = (event) => {
        if (accountRef.current?.userId !== event.data) return;
        ++identitySequence.current;
        applyAccountFromEffect(null);
        writeLocation({});
      };
    const pop = () => readBrowserRoute();
    window.addEventListener('popstate', pop);
    return () => {
      active = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 卸载时使最新身份请求失效。
      ++identitySequence.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 请求序号不是 DOM 引用；卸载使最新在途路由请求失效。
      ++routeSequence.current;
      logoutChannel?.close();
      window.removeEventListener('popstate', pop);
    };
  }, []);
  function navigatePage(page: StudioPage) {
    setNotice('');
    setError('');
    if (form) {
      parkedSearch.current = window.location.search;
    }
    if (page === activePage) return;
    if (page === 'forms' && retainedForm && parkedSearch.current) {
      const search = new URLSearchParams(parkedSearch.current);
      history.pushState(null, '', '/?' + search.toString());
    } else {
      writeLocation(page === 'materials' || page === 'functions' ? { catalog: page } : { page });
    }
    void readRoute();
    if (page === 'forms') void loadForms();
  }

  function openFormsFromBreadcrumb() {
    parkedSearch.current = window.location.search;
    writeLocation({ page: 'forms' });
    void readRoute({ keepForm: true });
    setListReturn(lastFormPosition.current);
    void loadForms();
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(failureMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function advanceSessionGeneration() {
    setSessionGeneration(++sessionGenerationRef.current);
    ++identitySequence.current;
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void run(async () => {
      advanceSessionGeneration();
      clearGitHubResult();
      await platform('/login', {
        body: { username: fields.get('username'), password: fields.get('password') },
      });
      await refreshAccount();
    });
  }

  function logout() {
    return run(async () => {
      advanceSessionGeneration();
      const userId = accountRef.current?.userId;
      await platform('/logout', {});
      if (userId)
        await clearAccountDrafts(userId).catch(() => setNotice('已退出，本机草稿清理失败。'));
      if (userId && typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('studio-account-logout');
        channel.postMessage(userId);
        channel.close();
      }
      ++identitySequence.current;
      clearGitHubResult();
      setForm(null);
      setForms([]);
      setCreation(null);
      setCreating(false);
      setAgentOpen(false);
      setManagement(undefined);
      setManagementAction(undefined);
      setSettings(false);
      setMembers(false);
      setName('');
      applyAccount(null);
      setRegistration(undefined);
      setCatalog(undefined);
      writeLocation({});
    });
  }

  function createForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sequence = routeSequence.current;
    void run(async () => {
      const snapshot = creation ?? { key: crypto.randomUUID(), name };
      setCreation(snapshot);
      let formId: string;
      try {
        ({ formId } = await platform<{ formId: string }>('/forms', {
          key: snapshot.key,
          body: { name: snapshot.name },
        }));
      } catch (error) {
        if (!outcomeUnknown(error) && (!creation || !accessDenied(error))) setCreation(null);
        if (accessDenied(error)) removeEditPermission();
        throw error;
      }
      if (sequence !== routeSequence.current) return;
      setCreation(null);
      setCreating(false);
      setName('');
      setFilter('active');
      setSearch('');
      setDraftFilters({ search: '', status: 'active' });
      setListPage(1);
      setForms((current) => [
        ...current.filter((entry) => entry.formId !== formId),
        {
          formId,
          name: snapshot.name.trim(),
          description: '',
          archived: false,
          revision: 0,
          latestSave: null,
          latestRelease: null,
        },
      ]);
      if (sequence !== routeSequence.current) return;
      let opened: OpenForm;
      try {
        opened = await platform<OpenForm>(`/forms/${formId}`);
      } catch (error) {
        if (sequence !== routeSequence.current) return;
        throw error;
      }
      if (sequence !== routeSequence.current) return;
      setEntryPoint({ tab: 'config' });
      setForm(opened);
      setFormOpen(true);
      writeLocation({ form: formId });
      parkedSearch.current = window.location.search;
    });
  }

  function removeEditPermission() {
    setAccess(
      (current) =>
        current && {
          ...current,
          permissions: current.permissions.filter((permission) => permission !== 'form:edit'),
        },
    );
  }

  function refreshAccess() {
    return run(refreshAccount);
  }

  function backToList() {
    if (history.state?.studioOrigin === '表单列表') {
      history.back();
      return;
    }
    setForm(null);
    setFormOpen(false);
    setListReturn(lastFormPosition.current);
    writeLocation({ page: 'forms' });
    return run(refreshAccount);
  }

  function openForm(
    formId: string,
    tab: 'config' | 'history' | 'releases' = 'config',
    id?: string,
    work?: string,
  ) {
    lastFormPosition.current = listPosition();
    history.replaceState(
      {
        ...history.state,
        formsList: {
          search,
          filter,
          page: currentListPage,
          pageSize: listPageSize,
          position: lastFormPosition.current,
        },
      },
      '',
    );
    writeLocation({
      form: formId,
      work,
      tab: tab === 'config' ? undefined : tab,
      version: tab === 'history' ? id : undefined,
      release: tab === 'releases' ? id : undefined,
    });
    history.replaceState({ ...history.state, studioOrigin: '表单列表' }, '');
    return readRoute();
  }

  function updateEntry(changed: FormSummary) {
    setForms((current) =>
      current.map((item) => (item.formId === changed.formId ? { ...item, ...changed } : item)),
    );
  }

  function openDrafts(event: MouseEvent<HTMLButtonElement>) {
    setDialogTrigger(event.currentTarget);
    setDraftBoxOpen(true);
  }

  function closeManagement() {
    restoreManagementFocus.current = true;
    setManagementAction(undefined);
    setManagementError('');
    setManagement(undefined);
    setListReturn(undefined);
    void loadForms();
  }

  function openManagement(entry: FormListEntry, action: NonNullable<typeof managementAction>) {
    const trigger = document.getElementById('form-menu-' + entry.formId);
    if (trigger instanceof HTMLButtonElement) setDialogTrigger(trigger);
    setManagementError('');
    setManagementAction(action);
    setManagement(entry.formId);
  }

  function changeArchiveState(entry: FormListEntry, action: 'archive' | 'restore') {
    void run(async () => {
      setManagementError('');
      try {
        const changed = await platform<FormSummary>(`/forms/${entry.formId}/${action}`, {
          body: undefined,
        });
        updateEntry(changed);
        closeManagement();
      } catch (reason) {
        setManagementError(failureMessage(reason));
      }
    });
  }

  const canEdit = access?.permissions.includes('form:edit') ?? false;
  const canManage = access?.permissions.includes('form:manage') ?? false;

  const managed = forms.find((entry) => entry.formId === management);
  const visible = forms.filter(
    (entry) =>
      (filter === 'all' || entry.archived === (filter === 'archived')) &&
      `${entry.name} ${entry.description} ${entry.formId}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const lastListPage = Math.max(1, Math.ceil(visible.length / listPageSize));
  const currentListPage = Math.min(listPage, lastListPage);
  if (!listLoading && !listError && visible.length && currentListPage !== listPage)
    setListPage(currentListPage);
  const pageRows = visible.slice(
    (currentListPage - 1) * listPageSize,
    currentListPage * listPageSize,
  );
  const formList =
    !!access &&
    !registration &&
    !form &&
    !draftPageId &&
    !agentOpen &&
    !members &&
    !diagnosticRoute &&
    !assetRepairs &&
    !catalog &&
    !settings &&
    account?.membership.status === 'active';
  useEffect(() => {
    if (!restoreManagementFocus.current || busy || management) return;
    restoreManagementFocus.current = false;
    if (formList && document.activeElement === document.body) {
      const target = dialogTrigger?.isConnected ? dialogTrigger : searchInput.current;
      target?.focus({ preventScroll: true });
    }
  }, [busy, management, formList, dialogTrigger]);
  useEffect(() => {
    if (!formList || !listReturn || listLoading) return;
    const target = listReturn.focus;
    if (target) {
      const control = document.querySelector('[data-return-focus="' + CSS.escape(target) + '"]');
      if (!control) return restorePosition({ ...listReturn, focus: 'form-search', resultLeft: 0 });
    }
    return restorePosition(listReturn);
  }, [formList, listReturn, listLoading]);
  const date = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });

  const columns: readonly Column<FormListEntry>[] = [
    {
      key: 'name',
      title: '表单',
      render: (entry) => (
        <>
          <Button
            type="button"
            variant="text"
            className="form-name"
            aria-label={`打开 ${entry.name}`}
            data-return-focus={'form-name-' + entry.formId}
            disabled={busy}
            onClick={() => void openForm(entry.formId)}
          >
            {entry.name}
          </Button>
          {entry.description && <small>{entry.description}</small>}
        </>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (entry) => (
        <span className="form-list-badge">{entry.archived ? '已归档' : '使用中'}</span>
      ),
    },
    {
      key: 'save',
      title: '最近保存',
      render: (entry) =>
        entry.latestSave ? (
          <Button
            data-return-focus={'form-save-' + entry.formId}
            variant="text"
            type="button"
            disabled={busy}
            onClick={() => void openForm(entry.formId, 'history', entry.latestSave!.versionId)}
          >
            <span className="sr-only">查看最近保存：</span>
            <time dateTime={entry.latestSave.savedAt}>
              {date.format(new Date(entry.latestSave.savedAt))}
            </time>
          </Button>
        ) : (
          '未保存'
        ),
    },
    {
      key: 'release',
      title: '最近发布',
      render: (entry) =>
        entry.latestRelease ? (
          <Button
            data-return-focus={'form-release-' + entry.formId}
            variant="text"
            type="button"
            disabled={busy}
            onClick={() => void openForm(entry.formId, 'releases', entry.latestRelease!.releaseId)}
          >
            <span className="sr-only">查看最近发布：</span>
            {entry.latestRelease.name && (
              <span className="release-name" title={entry.latestRelease.name}>
                {entry.latestRelease.name}
              </span>
            )}
            <time dateTime={entry.latestRelease.publishedAt}>
              {date.format(new Date(entry.latestRelease.publishedAt))}
            </time>
          </Button>
        ) : (
          '未发布'
        ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (entry) => (
        <div className="action-row">
          {(canManage || (canEdit && (!entry.archived || entry.latestSave))) && (
            <Menu.Root>
              <Menu.Trigger
                id={'form-menu-' + entry.formId}
                aria-label={`管理 ${entry.name}`}
                disabled={busy}
              >
                管理 <Icon name="ChevronDown" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner align="end">
                  <Menu.Popup>
                    {canEdit && !entry.archived && (
                      <Menu.Item onClick={() => openManagement(entry, 'edit')}>
                        编辑名称与说明
                      </Menu.Item>
                    )}
                    {canEdit && entry.latestSave && (
                      <Menu.Item
                        onClick={() =>
                          attachReference({
                            formId: entry.formId,
                            name: entry.name,
                            ...entry.latestSave!,
                          })
                        }
                      >
                        引用到 Agent
                      </Menu.Item>
                    )}
                    {canEdit && entry.latestSave && (
                      <Menu.Item onClick={() => openManagement(entry, 'copy')}>
                        复制为新表单
                      </Menu.Item>
                    )}
                    {canManage && (
                      <Menu.Item
                        onClick={() =>
                          openManagement(entry, entry.archived ? 'restore' : 'archive')
                        }
                      >
                        {entry.archived ? '恢复表单' : '归档表单'}
                      </Menu.Item>
                    )}
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          )}
        </div>
      ),
    },
  ];
  const formEmpty =
    listLoading || listError
      ? null
      : search
        ? '没有匹配的表单，请更换关键词。'
        : '当前状态下暂无表单。';
  function applyFormFilters(next: typeof draftFilters) {
    setSearch(next.search);
    setFilter(next.status);
    setListPage(1);
    setListReturn(undefined);
  }

  const formFilters = (
    <ListFilterBar
      label="表单筛选"
      onApply={() => applyFormFilters(draftFilters)}
      onReset={() => {
        const defaults = { search: '', status: 'active' } as const;
        setDraftFilters(defaults);
        applyFormFilters(defaults);
      }}
    >
      <Input
        ref={searchInput}
        type="search"
        name="search"
        aria-label="搜索表单"
        autoComplete="off"
        placeholder="搜索表单名称或说明…"
        value={draftFilters.search}
        data-return-focus="form-search"
        onChange={(event) => setDraftFilters({ ...draftFilters, search: event.target.value })}
      />
      <StudioSelect
        aria-label="表单状态"
        visibleLabel="状态"
        value={draftFilters.status}
        onValueChange={(status) => {
          if (status === 'active' || status === 'archived' || status === 'all')
            setDraftFilters({ ...draftFilters, status });
        }}
      >
        <option value="active">使用中</option>
        <option value="archived">已归档</option>
        <option value="all">全部</option>
      </StudioSelect>
    </ListFilterBar>
  );

  function openDraft(id: string, conversation?: string) {
    setDraftBoxOpen(false);
    if (conversation) setAgentPanelOpen(true);
    writeLocation({
      page: 'draft',
      draft: id,
      conversation,
      from: conversation && agentOpen ? 'agent' : undefined,
    });
    void readRoute({ preserveAgentInstance: !!conversation });
  }

  function openConversation(entry: { id: string }) {
    setActiveConversationId(entry.id);
    setAgentPanelOpen(true);
    setResumeResource({ kind: 'conversations', id: entry.id });
    if (draftPageId) {
      if (draftConversation.current !== entry.id) resetAgentInstance();
      draftConversation.current = entry.id;
      writeLocation(
        {
          page: 'draft',
          draft: draftPageId,
          conversation: entry.id,
          from: draftOpenedFromAgent ? 'agent' : undefined,
        },
        true,
      );
      return;
    }
    setContinuation(undefined);
    openedDraft.current = undefined;
    draftConversation.current = undefined;
    if (agentOpen) writeLocation({ page: 'agent', conversation: entry.id }, true);
    resetAgentInstance();
  }

  const activePage =
    draftPageId && canEdit
      ? 'draft'
      : agentOpen && !form
        ? 'agent'
        : settings
          ? 'account'
          : members
            ? 'members'
            : diagnosticRoute
              ? 'diagnostics'
              : assetRepairs
                ? 'asset-repairs'
                : (catalog ?? 'forms');
  const showAgentWorkspace = activePage === 'agent' && canEdit;
  const showDraftWorkspace = activePage === 'draft' && canEdit && !!draftPageId;
  const presentation = showDraftWorkspace ? 'draft' : showAgentWorkspace ? 'page' : 'dock';
  const showGlobalDock = !showAgentWorkspace && !showDraftWorkspace && (!form || !continuation);
  function openAgentPage() {
    writeLocation({ page: 'agent', conversation: activeConversationId });
    void readRoute({ preserveAgentInstance: true });
  }
  const agentWorkspace = account &&
    access &&
    canEdit &&
    ((showGlobalDock && (!!activeConversationId || !!currentReferenceDraft)) ||
      showDraftWorkspace ||
      showAgentWorkspace) && (
      <AgentCreation
        key={JSON.stringify([account.userId, access.spaceId, agentInstance])}
        resumeId={
          resumeResource?.kind === 'conversations' ? resumeResource.id : draftConversation.current
        }
        draftId={showDraftWorkspace ? draftPageId : undefined}
        owner={account.userId}
        space={access.spaceId}
        references={currentReferenceDraft?.items ?? []}
        updateReferences={updateReferences}
        referenceFocus={referenceFocus}
        presentation={presentation}
        initialPanelPosition={agentPanelPosition}
        openAgentPage={openAgentPage}
        onOpenDraft={openDraft}
        draftOpenedFromAgent={draftOpenedFromAgent}
        initialDockPosition={agentDockPosition}
        panelOpen={agentPanelOpen}
        onPanelPosition={setAgentPanelPosition}
        onDockPosition={setAgentDockPosition}
        onPanelOpenChange={setAgentPanelOpen}
        conversationTitle={renamedConversation}
        onConversationRename={(entry) => {
          setRenamedConversation(entry);
          setAgentRevision((value) => value + 1);
        }}
        onConversationChange={(conversation) => {
          if (agentInstanceRef.current !== agentInstance) return;
          setActiveConversationId(conversation.id);
          setResumeResource({ kind: 'conversations', id: conversation.id });
          setAgentRevision((current) => current + 1);
        }}
        close={() => {
          if (showDraftWorkspace && draftOpenedFromAgent) {
            openAgentPage();
            return;
          }
          if (showDraftWorkspace) {
            openedDraft.current = undefined;
            draftConversation.current = undefined;
            setDraftPageId(undefined);
            writeLocation({ page: 'forms' });
            void readRoute();
            setResumeResource(
              activeConversationId
                ? { kind: 'conversations', id: activeConversationId }
                : undefined,
            );
            resetAgentInstance();
            return;
          }
          if (openedDraft.current) {
            const conversationId = draftConversation.current;
            openedDraft.current = undefined;
            draftConversation.current = undefined;
            writeLocation({ page: 'agent' }, true);
            setResumeResource(
              conversationId ? { kind: 'conversations', id: conversationId } : undefined,
            );
            setActiveConversationId(conversationId);
            resetAgentInstance();
            return;
          }
          navigatePage('forms');
        }}
        saved={(id, work, conversation) => {
          const key = conversationKey(account.userId, access.spaceId, id, work);
          keepConversation(key, conversation);
          setContinuation(conversation ? { key, conversation } : undefined);
          setDraftPageId(undefined);
          setAgentOpen(false);
          void openForm(id, 'config', undefined, work);
        }}
      />
    );
  return (
    <>
      <a className="skip-link" href="#studio-main">
        跳到主内容
      </a>
      {access && (
        <StudioNavigation
          page={activePage}
          access={access}
          account={account ?? null}
          busy={busy}
          navigate={navigatePage}
          logout={() => void logout()}
          openSecurity={() => {
            navigatePage('account');
            setSecurityOpen(true);
          }}
        />
      )}
      <div
        className={
          access
            ? `studio-content${form || agentOpen ? ' studio-immersive' : ''} studio-next`
            : undefined
        }
        data-studio-list-shell={
          formList ||
          (assetRepairs && !assetRepairs.task && canEdit) ||
          (activePage === 'diagnostics' && !diagnosticRoute?.group && !diagnosticRoute?.event) ||
          undefined
        }
        data-agent-chat-page={
          (showAgentWorkspace && resumeResource?.kind !== 'drafts') || undefined
        }
      >
        {access && (
          <header className="toolbar studio-next-top">
            <StudioBreadcrumb
              page={activePage}
              access={access}
              formName={form?.name ?? (showDraftWorkspace ? '表单草稿' : undefined)}
              releaseDetail={entryPoint.tab === 'releases' && !!entryPoint.id}
              busy={busy}
              navigate={navigatePage}
              openForms={openFormsFromBreadcrumb}
            />
            {canEdit && form && (
              <Button
                ref={pageReferenceTrigger}
                variant="secondary"
                aria-pressed={pickingReference}
                onClick={() => setPickingReference(!pickingReference)}
              >
                引用页面对象
              </Button>
            )}
            {canEdit && !showAgentWorkspace && (
              <AgentConversationPicker
                activeId={activeConversationId}
                revision={agentRevision}
                disabled={busy}
                onOpen={openConversation}
                onNew={openAgentPage}
              />
            )}
          </header>
        )}
        <main id="studio-main" tabIndex={-1}>
          {notice && <p role="status">{notice}</p>}
          {githubResult && (githubResult.code !== 'signed-in' || access) && (
            <p role="status">{githubResult.message}</p>
          )}
          {account === undefined ? (
            <p role="status">正在载入</p>
          ) : account && account.membership.status !== 'active' ? (
            <AccountAdmission
              account={account}
              settings={settings}
              onSettingsChange={(next) => {
                setSettings(next);
                writeLocation(next ? { page: 'account' } : {});
              }}
              onRefresh={async () => {
                if (sessionGenerationRef.current !== sessionGeneration) return;
                clearGitHubResult();
                await refreshAccount();
              }}
              onLogout={logout}
              onSessionLost={(message) => {
                if (sessionGenerationRef.current !== sessionGeneration) return;
                advanceSessionGeneration();
                applyAccount(null);
                setNotice(message ?? '登录已过期，请重新登录。');
              }}
            />
          ) : registration ? (
            <RegistrationConfirmation
              registration={registration}
              onComplete={async () => {
                clearGitHubResult();
                await refreshAccount();
              }}
              onCancel={async () => {
                await platform('/logout', {});
                setRegistration(undefined);
                clearGitHubResult();
                writeLocation({});
              }}
            />
          ) : !access ? (
            <LoginScreen
              busy={busy}
              onPasswordLogin={login}
              onLocalLogin={() =>
                void run(async () => {
                  advanceSessionGeneration();
                  clearGitHubResult();
                  await platform('/local-login', {});
                  await refreshAccount();
                })
              }
            />
          ) : showAgentWorkspace || showDraftWorkspace || form ? null : members ? (
            <Members
              currentUser={access.userId}
              onAccessChange={async () => {
                const identity = identitySequence.current;
                try {
                  const context = await platform<Access>('/access');
                  if (identity !== identitySequence.current) return false;
                  setAccess(context);
                  const allowed = context.permissions.includes('member:manage');
                  if (!allowed) {
                    navigatePage('account');
                    setNotice('成员设置已保存，当前角色已调整。');
                  }
                  return allowed;
                } catch (reason) {
                  if (identity !== identitySequence.current) return false;
                  if (accessDenied(reason)) {
                    await refreshAccount();
                    setNotice('成员设置已保存，当前账号已失去团队访问资格。');
                    return false;
                  }
                  throw reason;
                }
              }}
            />
          ) : diagnosticRoute ? (
            access.permissions.includes('diagnostic:view') ? (
              <DiagnosticsWorkspace
                key={JSON.stringify([diagnosticRoute.group, diagnosticRoute.view])}
                {...diagnosticRoute}
                returnPosition={lastDiagnosticPosition.current}
                onNavigate={(location, trigger) => {
                  if (trigger) lastDiagnosticPosition.current = listPosition(trigger);
                  writeLocation(location);
                  void readRoute();
                }}
              />
            ) : (
              <Feedback kind="error">当前账号无权查看错误记录。</Feedback>
            )
          ) : assetRepairs ? (
            canEdit ? (
              <AssetRepairsWorkspace
                taskId={assetRepairs.task}
                view={assetRepairs.view}
                access={access}
                onNavigate={(view, task) => {
                  writeLocation({
                    page: 'asset-repairs',
                    task,
                    view: view === 'reviews' ? view : undefined,
                  });
                  void readRoute();
                }}
              />
            ) : (
              <Feedback kind="error">当前账号无权查看资产修复任务。</Feedback>
            )
          ) : catalog ? (
            <AssetCatalog
              key={catalog}
              kind={catalog}
              onReference={canEdit ? attachReference : undefined}
            />
          ) : settings ? (
            <>
              <PageHeading title="账号与权限">
                <button
                  type="button"
                  className="quiet"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  退出登录
                </button>
              </PageHeading>
              {account && (
                <AccountSecurity
                  key={account.userId}
                  account={account}
                  recordsRequested={securityOpen}
                  onRecordsClose={() => setSecurityOpen(false)}
                  disabled={busy}
                  onRefresh={async () => {
                    if (sessionGenerationRef.current !== sessionGeneration) return;
                    clearGitHubResult();
                    await refreshAccount();
                  }}
                  onSessionLost={(message) => {
                    if (sessionGenerationRef.current !== sessionGeneration) return;
                    advanceSessionGeneration();
                    applyAccount(null);
                    setNotice(message ?? '登录已过期，请重新登录。');
                  }}
                />
              )}
              <section className="surface authoring-panel">
                <h2>当前访问权限</h2>
                <ul>
                  {access.permissions.map((permission) => (
                    <li key={permission}>
                      {{
                        'form:view': '查看表单',
                        'form:edit': '编辑表单',
                        'form:publish': '发布表单',
                        'form:manage': '归档与恢复',
                        'member:manage': '成员管理',
                        'diagnostic:view': '查看表单错误',
                      }[permission] ?? permission}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <>
              <PageHeading title="表单列表" className="form-list-heading" data-studio-ui>
                {canEdit && (
                  <>
                    <Button variant="secondary" onClick={openDrafts}>
                      表单草稿
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={(event) => {
                        setDialogTrigger(event.currentTarget);
                        setCreating(true);
                      }}
                    >
                      新建表单
                    </Button>
                  </>
                )}
              </PageHeading>
              {draftBoxOpen && canEdit && (
                <AgentDraftBox
                  returnFocus={dialogTrigger}
                  close={() => setDraftBoxOpen(false)}
                  resume={(entry) => openDraft(entry.id)}
                />
              )}
              {creating && (
                <Modal
                  returnFocus={dialogTrigger}
                  title="新建表单"
                  size="standard"
                  closeDisabled={busy || !!creation}
                  onClose={() => {
                    if (!busy && !creation) setCreating(false);
                  }}
                >
                  <Form noValidate={false} onSubmit={createForm}>
                    <FormLayout
                      feedback={error && <Feedback kind="error">{error}</Feedback>}
                      actions={
                        <>
                          {creation && !canEdit && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void refreshAccess()}
                            >
                              刷新访问权限
                            </Button>
                          )}
                          <Button type="submit" disabled={busy || !canEdit}>
                            {creation ? '重试创建' : '创建表单'}
                          </Button>
                        </>
                      }
                    >
                      <Field label="表单名称">
                        {(control) => (
                          <Input
                            {...control}
                            name="name"
                            autoComplete="off"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={120}
                            required
                            readOnly={!!creation || busy}
                          />
                        )}
                      </Field>
                    </FormLayout>
                  </Form>
                </Modal>
              )}
              {managed && managementAction === 'edit' && (
                <Modal
                  returnFocus={dialogTrigger}
                  title="编辑名称与说明"
                  size="standard"
                  onClose={closeManagement}
                  closeDisabled={managementBusy.metadata}
                >
                  <FormManagement
                    form={managed}
                    path={`/forms/${managed.formId}`}
                    editable={canEdit && !managed.archived}
                    disabled={busy}
                    onMetadata={updateEntry}
                    onEditClose={closeManagement}
                    onBusyChange={(metadata) =>
                      setManagementBusy((current) => ({ ...current, metadata }))
                    }
                  />
                </Modal>
              )}
              {managed?.latestSave && managementAction === 'copy' && (
                <Modal
                  returnFocus={dialogTrigger}
                  title="复制为新表单"
                  size="standard"
                  onClose={closeManagement}
                  closeDisabled={managementBusy.copy}
                >
                  <CopyForm
                    path={`/forms/${managed.formId}`}
                    versionId={managed.latestSave.versionId}
                    disabled={busy}
                    allowNew={canEdit}
                    onClose={(copiedName) => {
                      if (copiedName) setNotice(`已创建「${copiedName}」，可在表单列表中打开。`);
                      closeManagement();
                    }}
                    onBusyChange={(copy) => setManagementBusy((current) => ({ ...current, copy }))}
                  />
                </Modal>
              )}
              {managed && (managementAction === 'archive' || managementAction === 'restore') && (
                <Modal
                  returnFocus={dialogTrigger}
                  title={managementAction === 'archive' ? '归档表单' : '恢复表单'}
                  size="standard"
                  onClose={closeManagement}
                  closeDisabled={busy}
                  actions={
                    <Button
                      disabled={busy || !canManage}
                      onClick={() => changeArchiveState(managed, managementAction)}
                    >
                      {managementAction === 'archive' ? '确认归档' : '确认恢复'}
                    </Button>
                  }
                >
                  <p>
                    {managementAction === 'archive'
                      ? `归档「${managed.name}」后将停止编辑和新发布，已有发布仍可装载。`
                      : `将「${managed.name}」恢复到使用中列表。`}
                  </p>
                  {managementError && <Feedback kind="error">{managementError}</Feedback>}
                </Modal>
              )}
              {listError && (
                <p role="alert">
                  列表加载失败：{listError}{' '}
                  <Button type="button" variant="text" onClick={() => void loadForms()}>
                    重新加载列表
                  </Button>
                </p>
              )}
              {listLoading && <Feedback kind="status">正在加载表单…</Feedback>}
              <DataTable
                layout="fill"
                panelClassName="form-list-results"
                label="表单结果"
                columns={canEdit || canManage ? columns : columns.slice(0, -1)}
                rows={pageRows}
                rowKey={(entry) => entry.formId}
                filters={formFilters}
                empty={formEmpty}
                pagination={
                  (!listLoading || visible.length > 0) && !listError ? (
                    <Pagination
                      total={visible.length}
                      page={currentListPage}
                      pageSize={listPageSize}
                      pageSizeOptions={formPageSizes}
                      onChange={(page, size) => {
                        setListPage(page);
                        setListPageSize(size);
                        setListReturn(undefined);
                        const results = searchInput.current
                          ?.closest('[data-studio-table-layout]')
                          ?.querySelector('[data-return-scroll]');
                        if (results) results.scrollTop = 0;
                      }}
                    />
                  ) : undefined
                }
              />
            </>
          )}
          {agentWorkspace && (
            <div
              data-config-workspace={showAgentWorkspace || showDraftWorkspace || undefined}
              className={
                showAgentWorkspace
                  ? 'studio-agent-entry'
                  : showDraftWorkspace
                    ? 'studio-draft-entry'
                    : 'agent-dock-entry'
              }
              data-collapsed={!historyOpen}
            >
              {showAgentWorkspace && (
                <aside className="studio-agent-history" aria-label="对话">
                  <header>
                    {historyOpen && <h2>对话</h2>}
                    <RailToggle
                      label="对话列表"
                      open={historyOpen}
                      controls="studio-conversations"
                      onToggle={() => setHistoryOpen(!historyOpen)}
                    />
                  </header>
                  <div id="studio-conversations" hidden={!historyOpen}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        openedDraft.current = undefined;
                        draftConversation.current = undefined;
                        writeLocation({ page: 'agent' }, true);
                        setResumeResource(undefined);
                        setActiveConversationId(undefined);
                        resetAgentInstance();
                      }}
                    >
                      新对话
                    </Button>
                    <AgentConversationList
                      activeId={activeConversationId}
                      revision={agentRevision}
                      onOpen={(entry) => {
                        if (entry.id !== activeConversationId || openedDraft.current)
                          openConversation(entry);
                      }}
                      onRename={(entry) => {
                        if (entry.id === activeConversationId) setRenamedConversation(entry);
                      }}
                      onDelete={(id, next) => {
                        if (id !== activeConversationId) return;
                        if (next) {
                          openConversation(next);
                          return;
                        }
                        openedDraft.current = undefined;
                        draftConversation.current = undefined;
                        writeLocation({ page: 'agent' }, true);
                        setResumeResource(undefined);
                        setActiveConversationId(undefined);
                        resetAgentInstance();
                      }}
                    />
                  </div>
                </aside>
              )}
              {agentWorkspace}
            </div>
          )}
          {access && retainedForm && (
            <div
              className="studio-retained-form"
              hidden={!formOpen}
              data-config-workspace={formOpen || undefined}
            >
              <WorkingVersions
                continuation={continuation}
                key={JSON.stringify([access.userId, access.spaceId, retainedForm.formId])}
                userId={access.userId}
                spaceId={access.spaceId}
                form={retainedForm}
                parkedSearch={formOpen ? undefined : parkedSearch.current}
                refreshRoute={() => void readRoute()}
                canEdit={canEdit}
                canPublish={access.permissions.includes('form:publish')}
                canManage={canManage}
                onMetadata={(metadata) =>
                  setForm((current) =>
                    current === retainedForm && current.formId === metadata.formId
                      ? { ...current, ...metadata }
                      : current,
                  )
                }
                navigating={busy}
                onBack={backToList}
                onReference={attachReference}
                pickingReference={pickingReference && formOpen}
                onAccessLost={removeEditPermission}
                onRefreshAccess={refreshAccess}
              />
            </div>
          )}
          {error && !creating && (
            <p className="page-error" role="alert">
              {error}
            </p>
          )}
        </main>
      </div>
    </>
  );
}
