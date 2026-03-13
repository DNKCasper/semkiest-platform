import { redirect } from 'next/navigation';

/**
 * /onboarding — redirects immediately into the wizard flow.
 * Having a separate entry point makes it easy to link from
 * sign-up confirmation emails or nav CTAs.
 */
export default function OnboardingIndexPage() {
  redirect('/onboarding/wizard');
}
