'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingStep =
  | 'create-organization'
  | 'create-project'
  | 'configure-test-profile'
  | 'run-first-test'
  | 'complete';

export interface OrganizationData {
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface ProjectData {
  name: string;
  url: string;
  environment: 'development' | 'staging' | 'production';
}

export interface TestProfileData {
  browser: 'chromium' | 'firefox' | 'webkit';
  viewport: '1280x720' | '1920x1080' | '375x812';
  headless: boolean;
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: Set<OnboardingStep>;
  organizationData: OrganizationData | null;
  projectData: ProjectData | null;
  testProfileData: TestProfileData | null;
  isComplete: boolean;
  isDismissed: boolean;
}

export interface OnboardingContextValue extends OnboardingState {
  goToStep: (step: OnboardingStep) => void;
  completeStep: (step: OnboardingStep) => void;
  setOrganizationData: (data: OrganizationData) => void;
  setProjectData: (data: ProjectData) => void;
  setTestProfileData: (data: TestProfileData) => void;
  dismiss: () => void;
  reset: () => void;
  isStepComplete: (step: OnboardingStep) => boolean;
  progressPercent: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const ONBOARDING_STEPS: OnboardingStep[] = [
  'create-organization',
  'create-project',
  'configure-test-profile',
  'run-first-test',
  'complete',
];

const STORAGE_KEY = 'semkiest:onboarding';

// ─── Persistence helpers ──────────────────────────────────────────────────────

function loadFromStorage(): Partial<OnboardingState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      currentStep?: OnboardingStep;
      completedSteps?: OnboardingStep[];
      organizationData?: OrganizationData;
      projectData?: ProjectData;
      testProfileData?: TestProfileData;
      isComplete?: boolean;
      isDismissed?: boolean;
    };
    return {
      ...parsed,
      completedSteps: new Set(parsed.completedSteps ?? []),
    };
  } catch {
    return {};
  }
}

function saveToStorage(state: OnboardingState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...state,
        completedSteps: Array.from(state.completedSteps),
      }),
    );
  } catch {
    // storage unavailable — ignore
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

function buildInitialState(): OnboardingState {
  const saved = loadFromStorage();
  return {
    currentStep: saved.currentStep ?? 'create-organization',
    completedSteps: saved.completedSteps ?? new Set(),
    organizationData: saved.organizationData ?? null,
    projectData: saved.projectData ?? null,
    testProfileData: saved.testProfileData ?? null,
    isComplete: saved.isComplete ?? false,
    isDismissed: saved.isDismissed ?? false,
  };
}

/** Wraps the app (or onboarding section) with onboarding state. */
export function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<OnboardingState>(buildInitialState);

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveToStorage(next);
      return next;
    });
  }, []);

  const goToStep = useCallback(
    (step: OnboardingStep) => {
      update({ currentStep: step });
    },
    [update],
  );

  const completeStep = useCallback(
    (step: OnboardingStep) => {
      setState((prev) => {
        const completedSteps = new Set(prev.completedSteps);
        completedSteps.add(step);
        const isComplete = step === 'complete';
        const stepIndex = ONBOARDING_STEPS.indexOf(step);
        const nextStep =
          stepIndex < ONBOARDING_STEPS.length - 1
            ? ONBOARDING_STEPS[stepIndex + 1]
            : 'complete';
        const next: OnboardingState = {
          ...prev,
          completedSteps,
          isComplete,
          currentStep: isComplete ? 'complete' : nextStep,
        };
        saveToStorage(next);
        return next;
      });
    },
    [],
  );

  const setOrganizationData = useCallback(
    (organizationData: OrganizationData) => {
      update({ organizationData });
    },
    [update],
  );

  const setProjectData = useCallback(
    (projectData: ProjectData) => {
      update({ projectData });
    },
    [update],
  );

  const setTestProfileData = useCallback(
    (testProfileData: TestProfileData) => {
      update({ testProfileData });
    },
    [update],
  );

  const dismiss = useCallback(() => {
    update({ isDismissed: true });
  }, [update]);

  const reset = useCallback(() => {
    const fresh: OnboardingState = {
      currentStep: 'create-organization',
      completedSteps: new Set(),
      organizationData: null,
      projectData: null,
      testProfileData: null,
      isComplete: false,
      isDismissed: false,
    };
    setState(fresh);
    saveToStorage(fresh);
  }, []);

  const isStepComplete = useCallback(
    (step: OnboardingStep) => state.completedSteps.has(step),
    [state.completedSteps],
  );

  // Steps excluding 'complete' sentinel
  const totalActionableSteps = ONBOARDING_STEPS.length - 1;
  const progressPercent = Math.round(
    (state.completedSteps.size / totalActionableSteps) * 100,
  );

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ...state,
      goToStep,
      completeStep,
      setOrganizationData,
      setProjectData,
      setTestProfileData,
      dismiss,
      reset,
      isStepComplete,
      progressPercent,
    }),
    [
      state,
      goToStep,
      completeStep,
      setOrganizationData,
      setProjectData,
      setTestProfileData,
      dismiss,
      reset,
      isStepComplete,
      progressPercent,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

/** Hook to consume the onboarding context. Must be inside OnboardingProvider. */
export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
