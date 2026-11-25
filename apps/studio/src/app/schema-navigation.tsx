import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './modal';

type PendingEdit = { apply?: () => boolean; discard: () => void };
type Owner = 'inspector' | 'rules';
type Navigation = {
  pendingOwner: Owner | null;
  register: (owner: Owner, readEdit: () => PendingEdit | null) => () => void;
  beforeLeave: (go: () => void) => void;
};
const Context = createContext<Navigation | null>(null);

export function SchemaNavigation({
  text,
  children,
  onPendingChange,
}: {
  text: string;
  children: ReactNode;
  onPendingChange?: (value: boolean) => void;
}) {
  const currentEdit = useRef<(() => PendingEdit | null) | null>(null);
  const [pendingOwner, setPendingOwner] = useState<Owner | null>(null);
  const [request, setRequest] = useState<{
    go: () => void;
    text: string;
    canApply: boolean;
    drawer: Element | null;
  }>();
  const register = useCallback((owner: Owner, readEdit: () => PendingEdit | null) => {
    currentEdit.current = readEdit;
    setPendingOwner(owner);
    return () => {
      if (currentEdit.current === readEdit) {
        currentEdit.current = null;
        setPendingOwner(null);
        setRequest(undefined);
      }
    };
  }, []);
  useLayoutEffect(() => {
    onPendingChange?.(pendingOwner !== null);
    return () => {
      if (pendingOwner) onPendingChange?.(false);
    };
  }, [pendingOwner, onPendingChange]);
  const beforeLeave = useCallback(
    (go: () => void) => {
      const edit = currentEdit.current?.();
      if (!edit) go();
      else
        setRequest({
          go,
          text,
          canApply: !!edit.apply,
          drawer:
            document.activeElement?.closest('[role="dialog"][data-studio-part="drawer"]') ?? null,
        });
    },
    [text],
  );
  const navigation = useMemo(
    () => ({ pendingOwner, register, beforeLeave }),
    [pendingOwner, register, beforeLeave],
  );
  const confirmation =
    request && request.text === text ? (
      <Modal title="当前修改尚未应用" closeLabel="留在此处" onClose={() => setRequest(undefined)}>
        <p>
          {request.canApply
            ? '将本次属性修改加入草稿后继续，或放弃本次输入。'
            : '可以留在此处完成编辑，或放弃本次输入后继续。'}
        </p>
        <div className="action-row">
          {request.canApply && (
            <button
              type="button"
              onClick={() => {
                setRequest(undefined);
                if (currentEdit.current?.()?.apply?.()) request.go();
              }}
            >
              应用并继续
            </button>
          )}
          <button
            type="button"
            className="quiet"
            onClick={() => {
              currentEdit.current?.()?.discard();
              setRequest(undefined);
              request.go();
            }}
          >
            放弃修改并继续
          </button>
        </div>
      </Modal>
    ) : null;
  return (
    <Context.Provider value={navigation}>
      {children}
      {request?.drawer?.isConnected ? createPortal(confirmation, request.drawer) : confirmation}
    </Context.Provider>
  );
}

export function useSchemaNavigation() {
  const navigation = useContext(Context);
  if (!navigation) throw Error('Schema editor requires a navigation context');
  return navigation;
}

export function usePendingNavigation(owner: Owner, edit: PendingEdit | null) {
  const { register } = useSchemaNavigation();
  const latest = useRef(edit);
  useLayoutEffect(() => {
    latest.current = edit;
  }, [edit]);
  const editing = edit !== null;
  useLayoutEffect(
    () => (editing ? register(owner, () => latest.current) : undefined),
    [owner, editing, register],
  );
}
