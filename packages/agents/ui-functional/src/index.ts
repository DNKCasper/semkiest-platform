export {
  FieldType,
  detectFormFields,
  filterInteractableFields,
  groupRadioFields,
} from './field-detector';

export type { DetectedField } from './field-detector';

export {
  generateRandomValue,
  generateEdgeValue,
  fillField,
  autoFillForm,
} from './data-filler';

export type {
  FillStrategy,
  FillOptions,
  FieldFillResult,
  FillResult,
} from './data-filler';

export {
  testFormValidation,
  testHappyPath,
  testEdgeCases,
  runFormTests,
} from './form-tester';

export type {
  FormTestStep,
  RequiredFieldResult,
  ValidationTestResult,
  HappyPathResult,
  EdgeCaseScenario,
  EdgeCaseResult,
  FormTestReport,
  FormTestOptions,
} from './form-tester';
