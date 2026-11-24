'use client';

import { createContext, useContext } from 'react';
import type { DataReference } from '@form-engine/protocol/definition';
import { FieldPickerControl, fieldReferenceId, type FieldRow } from './field-picker';
export { SearchableFieldTree, fieldReferenceId } from './field-picker';
export type { FieldRow } from './field-picker';
import type { LayoutBindingField } from './layout-material-value';

export const LayoutFieldStructure = createContext<FieldRow[]>([]);

export function LayoutFieldPicker({
  label,
  fields,
  value,
  set,
  accepts = () => true,
}: {
  label: string;
  fields: LayoutBindingField[];
  value?: DataReference;
  set: (ref: DataReference) => void;
  accepts?: (field: LayoutBindingField) => boolean;
}) {
  const outline = useContext(LayoutFieldStructure);
  const ordered = Map.groupBy(fields, (field) => field.ref.scope);
  const rows = [...ordered].reverse().flatMap<FieldRow>(([scope, group]) => {
    const ids = new Set(group.map((field) => field.ref.path));
    const groupId = fieldReferenceId({ source: 'data', scope, path: '' });
    if (scope === undefined && outline.length) {
      const candidates = new Map(group.map((field) => [field.schemaPath, field]));
      const root = group.find((field) => field.ref.path === '');
      const key = (id: string) => {
        const candidate = candidates.get(id);
        return candidate ? fieldReferenceId(candidate.ref) : id;
      };
      return [
        {
          id: groupId,
          depth: 0,
          label: '表单根',
          path: '',
          selectable: !!root,
          unavailable: root && accepts(root) ? undefined : '与此位置的要求不匹配',
        },
        ...outline.map((row) => {
          const candidate = candidates.get(row.id);
          return {
            ...row,
            id: key(row.id),
            parentId: row.parentId ? key(row.parentId) : groupId,
            depth: row.depth + 1,
            unavailable: candidate
              ? accepts(candidate)
                ? undefined
                : '与此位置的要求不匹配'
              : '需要进入对应作用域或在 JSON 中配置',
          };
        }),
      ];
    }
    const result = group.map(({ ref, schema, ...field }) => {
      const path = ref.path;
      const parent = path.slice(0, path.lastIndexOf('/'));
      const type = typeof schema === 'object' && schema !== null ? schema.type : undefined;
      return {
        id: fieldReferenceId(ref),
        parentId: path
          ? ids.has(parent)
            ? fieldReferenceId({ ...ref, path: parent })
            : groupId
          : undefined,
        depth: path.split('/').length - 1,
        label: path
          ? path
              .slice(path.lastIndexOf('/') + 1)
              .replaceAll('~1', '/')
              .replaceAll('~0', '~')
          : scope
            ? '局部作用域 · ' + scope
            : '表单根',
        path,
        detail: Array.isArray(type) ? type.join(' / ') : (type ?? '复合类型'),
        unavailable: accepts({ ref, schema, ...field }) ? undefined : '与此位置的要求不匹配',
      };
    });
    return ids.has('')
      ? result
      : [
          { id: groupId, depth: 0, label: scope ?? '表单根', path: '', selectable: false },
          ...result,
        ];
  });
  return (
    <FieldPickerControl
      label={label}
      rows={rows}
      value={value && fieldReferenceId(value)}
      valueLabel={
        value &&
        (fields.find((field) => fieldReferenceId(field.ref) === fieldReferenceId(value))?.label ??
          (value.scope ?? '表单根') + ' · ' + value.path)
      }
      onChange={(id) => {
        const field = fields.find((field) => fieldReferenceId(field.ref) === id);
        if (field && accepts(field)) set(field.ref);
      }}
    />
  );
}
