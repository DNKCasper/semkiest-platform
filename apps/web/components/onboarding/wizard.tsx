'use client';

import React from 'react';
import {
  useOnboarding,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from '../../context/onboarding-context';
import { CreateOrganizationStep } from './steps/create-organization';
import { CreateProjectStep } from './steps/create-project';
import { ConfigureTestProfileStep } from './steps/configure-test-profile';
import { RunFirstTestStep } from './steps/run-first-test';
import { CompleteStep } from './steps/complete';

// ─── Step metadata ────────────────────────────────────────────────────────────

interface StepMeta {
  id: OnboardingStep;
  label: string;
  description: string;
}

const STEP_META: StepMeta[] = [
  {
    id: 'create-organization',
    label: 'Organization',
    description: 'Set up your workspace',
  },
  {
    id: 'create-project',
    label: 'Project',
    description: 'Add your first app',
  },
  {
    id: 'configure-test-profile',
    label: 'Test Profile',
    description: 'Choose browser & viewport',
  },
  {
    id: 'run-first-test',
    label: 'First Test',
    description: 'See it in action',
  },
];

// ─── Wizard ───────────────────────────────────────────────────────────────────

/**
 * Multi-step onboarding wizard.
 * Renders a progress indicator and the active step component.
 */
export function OnboardingWizard() {
  const { currentStep, isStepComplete, progressPercent } = useOnboarding();

  const activeIndex = ONBOARDING_STEPS.indexOf(currentStep);
  const isComplete = currentStep === 'complete';

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top bar */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-lg font-bold text-gray-900">SemkiEst</span>
          {!isComplete && (
            <span className="text-sm text-gray-400">
              Step {Math.min(activeIndex + 1, STEP_META.length)} of{' '}
              {STEP_META.length}
            </span>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-10">
        <div className="w-full max-w-3xl space-y-8">
          {/* Progress tracker (hidden on complete screen) */}
          {!isComplete && (
            <nav aria-label="Onboarding progress">
              {/* Mobile: simple progress bar */}
              <div className="mb-6 sm:hidden">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  {progressPercent}% complete
                </p>
              </div>

              {/* Desktop: step indicators */}
              <ol className="hidden items-center sm:flex">
                {STEP_META.map((step, i) => {
                  const completed = isStepComplete(step.id);
                  const active = step.id === currentStep;

                  return (
                    <React.Fragment key={step.id}>
                      <li className="flex flex-col items-center">
                        <StepIndicator
                          index={i}
                          active={active}
                          completed={completed}
                        />
                        <div className="mt-2 text-center">
                          <p
                            className={`text-xs font-medium ${
                              active
                                ? 'text-blue-600'
                                : completed
                                  ? 'text-green-600'
                                  : 'text-gray-400'
                            }`}
                          >
                            {step.label}
                          </p>
                        </div>
                      </li>
                      {/* Connector */}
                      {i < STEP_META.length - 1 && (
                        <div
                          className={`h-0.5 flex-1 transition-colors ${
                            completed ? 'bg-green-400' : 'bg-gray-200'
                          }`}
                          aria-hidden
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </ol>
            </nav>
          )}

          {/* Step content card */}
          <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-100">
            <StepContent currentStep={currentStep} />
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Step indicator bubble ────────────────────────────────────────────────────

function StepIndicator({
  index,
  active,
  completed,
}: {
  index: number;
  active: boolean;
  completed: boolean;
}) {
  const base =
    'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors';

  if (completed) {
    return (
      <span className={`${base} bg-green-500 text-white`} aria-label="Completed">
        ✓
      </span>
    );
  }
  if (active) {
    return (
      <span
        className={`${base} bg-blue-600 text-white ring-2 ring-blue-200`}
        aria-current="step"
      >
        {index + 1}
      </span>
    );
  }
  return (
    <span className={`${base} bg-gray-100 text-gray-400`}>
      {index + 1}
    </span>
  );
}

// ─── Step content dispatcher ──────────────────────────────────────────────────

function StepContent({ currentStep }: { currentStep: OnboardingStep }) {
  switch (currentStep) {
    case 'create-organization':
      return <CreateOrganizationStep />;
    case 'create-project':
      return <CreateProjectStep />;
    case 'configure-test-profile':
      return <ConfigureTestProfileStep />;
    case 'run-first-test':
      return <RunFirstTestStep />;
    case 'complete':
      return <CompleteStep />;
    default:
      return null;
  }
}
