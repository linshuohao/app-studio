'use client';
import {
  createTextInput,
  createNumberInput,
  createCheckbox,
  createSelect,
  createButton,
  createField,
  createValueDisplay,
  createSection,
  createGrid,
  createCondition,
  createDialogEditor,
  createInsuredSummary,
  createDateRange,
  createRemoteSelect,
} from '@form-engine/materials-react';
import { createMaterialRegistry } from '@form-engine/renderer-react';
export const artifact = {
  id: 'materials-verification',
  platform: 'web',
  digest: `sha256:${'5'.repeat(64)}` as const,
};
export const definitions = [
  createTextInput,
  createNumberInput,
  createCheckbox,
  createSelect,
  createButton,
  createField,
  createValueDisplay,
  createSection,
  createGrid,
  createCondition,
  createDialogEditor,
  createInsuredSummary,
  createDateRange,
  createRemoteSelect,
].map((create) => create(artifact));
export const materials = createMaterialRegistry(definitions);
