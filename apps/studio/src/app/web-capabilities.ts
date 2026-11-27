import {
  createArrayEditor,
  createButton,
  createCheckbox,
  createCheckboxGroup,
  createCondition,
  createDatePicker,
  createDateRange,
  createDialogEditor,
  createField,
  createGrid,
  createInsuredSummary,
  createNumberInput,
  createRadioGroup,
  createRemoteSelect,
  createSection,
  createSelect,
  createTextarea,
  createTextInput,
  createValueDisplay,
} from '@form-engine/materials-react';
import {
  createArrayCountNormalizedText,
  createArraySumProducts,
  createCoreFunctions,
  createDateAgeInYears,
  createDateInclusiveDays,
  createExpenseCountInvoiceMatches,
  createExpenseHotelStandardStatus,
  createTextIsNonBlank,
  createTravelIsEligibleAge,
  createTravelIsTripRangeAllowed,
  createTravelPersonPremium,
  createTravelRequiresGuardian,
  createTravelTotalPremium,
} from '@form-engine/pure-functions';
import { createMaterialRegistry } from '@form-engine/renderer-react';

import type { ArtifactIdentity, ContentDigest } from '@form-engine/protocol';

export function createWebCapabilities(
  materialArtifact: ArtifactIdentity,
  functionArtifact: ArtifactIdentity,
) {
  const materials = createMaterialRegistry(
    [
      createArrayEditor,
      createButton,
      createCheckbox,
      createCheckboxGroup,
      createCondition,
      createDatePicker,
      createDateRange,
      createDialogEditor,
      createField,
      createGrid,
      createInsuredSummary,
      createNumberInput,
      createRadioGroup,
      createRemoteSelect,
      createSection,
      createSelect,
      createTextarea,
      createTextInput,
      createValueDisplay,
    ].map((create) => create(materialArtifact)),
  );
  const businessFunctions = [
    createArrayCountNormalizedText,
    createArraySumProducts,
    createDateAgeInYears,
    createDateInclusiveDays,
    createExpenseCountInvoiceMatches,
    createExpenseHotelStandardStatus,
    createTextIsNonBlank,
    createTravelIsEligibleAge,
    createTravelIsTripRangeAllowed,
    createTravelPersonPremium,
    createTravelRequiresGuardian,
    createTravelTotalPremium,
  ].map((create) => create(functionArtifact));
  const functions = {
    ...createCoreFunctions(functionArtifact),
    ...Object.fromEntries(businessFunctions.map((binding) => [binding.manifest.id, binding])),
  };

  return { materials, functions };
}

const previewArtifact = {
  id: 'studio-web-preview',
  platform: 'web',
  digest: `sha256:${'5'.repeat(64)}` as const,
};
export const webPreviewCapabilities = createWebCapabilities(previewArtifact, previewArtifact);

export const installedWebCapabilities = createWebCapabilities(
  {
    id: 'materials-react',
    platform: 'web',
    digest: process.env.RELEASE_MATERIAL_DIGEST as ContentDigest,
  },
  {
    id: 'pure-functions',
    platform: 'web',
    digest: process.env.RELEASE_FUNCTION_DIGEST as ContentDigest,
  },
);
