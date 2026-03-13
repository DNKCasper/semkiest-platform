import type { Metadata } from 'next';
import { OnboardingProvider } from '../../../context/onboarding-context';
import { OnboardingWizard } from '../../../components/onboarding/wizard';

export const metadata: Metadata = {
  title: 'Get Started — SemkiEst',
  description: 'Set up your organization, project, and run your first test.',
};

/**
 * /onboarding/wizard — server component that bootstraps the provider.
 * All interactive state lives in OnboardingProvider (client).
 */
export default function OnboardingWizardPage() {
  return (
    <OnboardingProvider>
      <OnboardingWizard />
    </OnboardingProvider>
  );
}
