'use client';

import { useState } from 'react';
import type { ReactionWatch, ValidationObservation } from '@form-engine/protocol/definition';
import { Button } from '@form-engine/studio-design-components';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { Modal } from './modal';
import {
  FieldPickerContent,
  FieldPickerDialog,
  fieldReferenceId,
  referenceFieldRows,
} from './field-picker';
import { schemaTypeLabel, watchIdentity, watchLabel, type ReactionField } from './reaction-fields';
import './reaction-fields.css';

type PickerProps = {
  fields: ReactionField[];
  title: string;
  allowValidation?: boolean;
  multiple?: boolean;
  expectedType?: string;
  parameterMeaning?: string;
  accepts?: (field: ReactionField) => boolean;
  initial?: ReactionWatch[];
  closeOnApply?: boolean;
  busy?: boolean;
  feedback?: string;
  onApply: (refs: ReactionWatch[]) => void;
  onClose: () => void;
};
export function ReactionFieldPicker({
  fields,
  title,
  allowValidation = false,
  multiple = false,
  expectedType,
  parameterMeaning,
  accepts = () => true,
  initial = [],
  onApply,
  closeOnApply = true,
  busy,
  feedback,
  onClose,
}: PickerProps) {
  const [projection, setProjection] = useState<'data' | ValidationObservation>(
    allowValidation && initial[0]?.source === 'validation' ? initial[0].observe : 'data',
  );
  const [selected, setSelected] = useState(
    () => new Map(initial.map((ref) => [watchIdentity(ref), ref])),
  );
  const projections = {
    data: '字段值',
    status: '校验状态',
    issues: '校验问题列表',
    state: '完整校验结果',
  };
  const choices = new Map(
    fields.map((field) => {
      const { ref, schema, title } = field;
      const watch: ReactionWatch =
        projection === 'data' ? ref : { source: 'validation', field: ref, observe: projection };
      return [
        fieldReferenceId(ref),
        {
          watch,
          ref,
          allowed: accepts(field),
          label: title,
          detail:
            projection === 'data'
              ? schemaTypeLabel(schema)
              : { status: 'string', issues: 'array', state: 'object' }[projection],
        },
      ];
    }),
  );
  const rows = referenceFieldRows([...choices.values()]).map((row) => {
    const choice = choices.get(row.id);
    return choice
      ? {
          ...row,
          choiceLabel: watchLabel(choice.watch),
          unavailable: choice.allowed ? row.unavailable : '与此操作的目标类型不匹配',
        }
      : row;
  });
  function applySelection() {
    onApply(
      [...selected.values()].filter(
        (ref) =>
          choices.get(fieldReferenceId(ref.source === 'data' ? ref : ref.field))?.allowed ?? true,
      ),
    );
    if (closeOnApply) onClose();
  }
  const picker = (
    <FieldPickerContent
      rows={rows}
      multiple={multiple}
      nativeChoice
      busy={busy}
      selected={[...selected].map(([id, ref]) => ({
        id,
        label:
          ref.source === 'data'
            ? watchLabel(ref)
            : watchLabel(ref.field) + ' · ' + projections[ref.observe],
      }))}
      selectedRowIds={[...choices]
        .filter(([, { watch }]) => selected.has(watchIdentity(watch)))
        .map(([id]) => id)}
      onSelect={(id) => {
        const choice = choices.get(id);
        if (!choice?.allowed) return;
        const key = watchIdentity(choice.watch);
        setSelected((old) => {
          const next = multiple ? new Map(old) : new Map<string, ReactionWatch>();
          if (multiple && next.has(key)) next.delete(key);
          else next.set(key, choice.watch);
          return next;
        });
      }}
      onRemove={(id) =>
        setSelected((old) => {
          const next = new Map(old);
          next.delete(id);
          return next;
        })
      }
      options={
        (expectedType || parameterMeaning) && (
          <>
            {parameterMeaning && <p className="expression-picker-meaning">{parameterMeaning}</p>}
            {expectedType && (
              <span>
                期望类型 <code>{expectedType}</code>
              </span>
            )}
          </>
        )
      }
    />
  );
  if (!allowValidation) {
    return (
      <FieldPickerDialog
        {...picker.props}
        title={title}
        feedback={feedback}
        onClose={onClose}
        onApply={applySelection}
      />
    );
  }
  return (
    <Modal
      title={title}
      size="wide"
      className="reaction-observation-dialog"
      onClose={onClose}
      closeDisabled={busy}
      closeLabel="取消"
      actions={
        <Button disabled={busy || selected.size === 0} onClick={applySelection}>
          应用选择
        </Button>
      }
    >
      <div className="reaction-observation-body">
        <label className="reaction-scope-field reaction-observation-source">
          观察来源
          <StudioSelect
            aria-label="观察来源"
            value={projection}
            disabled={busy}
            onValueChange={(value) => {
              if (value === 'data' || value === 'status' || value === 'issues' || value === 'state')
                setProjection(value);
            }}
          >
            {Object.entries(projections).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </StudioSelect>
        </label>
        {picker}
        {feedback && <p role="alert">{feedback}</p>}
      </div>
    </Modal>
  );
}
