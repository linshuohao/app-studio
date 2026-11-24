'use client';
import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import { ValidationMessages } from '../_internal/validation-messages.js';
import { FieldContext } from '../_internal/field-context.js';
import { manifest } from './manifest.js';
export interface FieldProps {
  label: string;
  help?: string;
  requiredMark?: boolean;
}
const contract = defineMaterialContract<
  FieldProps,
  'value',
  Record<string, never>,
  Record<string, never>
>(manifest);
export function Field() {
  const a = useMaterialAdapter(contract),
    id = useId(),
    ids = useRef<string[]>([]),
    [first, setFirst] = useState<string>();
  const labelId = `${id}-label`,
    descriptionId = `${id}-description`;
  const register = useCallback((controlId: string) => {
    ids.current.push(controlId);
    setFirst(ids.current[0]);
    return () => {
      ids.current = ids.current.filter((v) => v !== controlId);
      setFirst(ids.current[0]);
    };
  }, []);
  const connection = useMemo(
    () => ({ labelId, descriptionId, register }),
    [labelId, descriptionId, register],
  );
  const validation = a.validation.value;
  return (
    <div className="fe-field" data-status={validation.status}>
      <label id={labelId} htmlFor={first}>
        {a.props.label}
        {a.props.requiredMark ? <span aria-hidden="true"> *</span> : null}
      </label>
      <FieldContext.Provider value={connection}>{a.slots.default}</FieldContext.Provider>
      <div id={descriptionId}>
        {a.props.help ? <p className="fe-help">{a.props.help}</p> : null}
        <ValidationMessages validation={validation} issuesLabel="字段问题" />
      </div>
    </div>
  );
}
export function createField(artifact: ArtifactIdentity) {
  return defineMaterial(contract, artifact, Field);
}
