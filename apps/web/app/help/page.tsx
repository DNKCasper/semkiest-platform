import type { Metadata } from 'next';
import Link from 'next/link';
import { HelpSearch } from '../../components/help/help-search';

export const metadata: Metadata = {
  title: 'Help Center — SemkiEst',
  description: 'Guides, FAQs, video walkthroughs, and troubleshooting for SemkiEst.',
};

const HELP_CATEGORIES = [
  {
    href: '/help/faq',
    emoji: '❓',
    title: 'FAQ',
    description: 'Answers to the most common questions about SemkiEst.',
  },
  {
    href: '/help/videos',
    emoji: '🎬',
    title: 'Video Guides',
    description: 'Step-by-step video walkthroughs for key workflows.',
  },
  {
    href: '/help/troubleshooting',
    emoji: '🔧',
    title: 'Troubleshooting',
    description: 'Diagnose and fix common issues quickly.',
  },
  {
    href: '/onboarding/wizard',
    emoji: '🚀',
    title: 'Onboarding Wizard',
    description: 'Restart the setup wizard to reconfigure your workspace.',
  },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-16 text-white">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">Help Center</h1>
          <p className="mt-3 text-blue-100">
            Find answers, watch tutorials, and troubleshoot issues.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <HelpSearch />
          </div>
        </div>
      </section>

      {/* Category cards */}
      <section className="mx-auto max-w-4xl px-6 py-14">
        <h2 className="mb-6 text-xl font-semibold text-gray-900">
          Browse by topic
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {HELP_CATEGORIES.map(({ href, emoji, title, description }) => (
            <Link
              key={href}
              href={href}
              className="flex gap-4 rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <span className="mt-0.5 text-3xl">{emoji}</span>
              <div>
                <p className="font-semibold text-gray-900">{title}</p>
                <p className="mt-1 text-sm text-gray-500">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Popular topics */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Popular topics
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            'Getting started',
            'Test profiles',
            'Scheduling',
            'CI/CD integration',
            'Viewports',
            'Headless mode',
            'Team management',
            'Billing',
            'API keys',
            'Notifications',
          ].map((topic) => (
            <Link
              key={topic}
              href={`/help/faq?q=${encodeURIComponent(topic)}`}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-blue-300 hover:text-blue-600"
            >
              {topic}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
