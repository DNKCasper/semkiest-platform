import type { Metadata } from 'next';
import Link from 'next/link';
import { TROUBLESHOOTING_ITEMS } from '../../../lib/help-content';

export const metadata: Metadata = {
  title: 'Troubleshooting — SemkiEst Help',
  description:
    'Diagnose and fix common issues: unreachable URLs, flaky screenshots, failed scheduled runs, and more.',
};

export default function TroubleshootingPage() {
  const categories = Array.from(
    new Set(TROUBLESHOOTING_ITEMS.map((t) => t.category)),
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <nav className="mb-4 text-sm text-gray-400">
            <Link href="/help" className="hover:text-gray-700">
              Help Center
            </Link>{' '}
            / Troubleshooting
          </nav>
          <h1 className="text-3xl font-bold text-gray-900">Troubleshooting</h1>
          <p className="mt-1.5 text-gray-500">
            Step-by-step solutions to common problems. Can't find your issue?{' '}
            <Link href="/help/faq" className="text-blue-600 hover:underline">
              Browse the FAQ
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-12">
        {categories.map((category) => {
          const items = TROUBLESHOOTING_ITEMS.filter(
            (t) => t.category === category,
          );
          return (
            <section key={category}>
              <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="h-1 w-4 rounded-full bg-blue-600" />
                {category}
              </h2>
              <div className="space-y-4">
                {items.map((item) => (
                  <TroubleshootingCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function TroubleshootingCard({
  item,
}: {
  item: (typeof TROUBLESHOOTING_ITEMS)[number];
}) {
  return (
    <article
      id={item.id}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
    >
      {/* Symptom */}
      <div className="flex items-start gap-3 border-b border-gray-100 bg-red-50 px-5 py-4">
        <span className="mt-0.5 text-red-500">⚠</span>
        <h3 className="font-semibold text-gray-900">{item.symptom}</h3>
      </div>

      <div className="grid divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {/* Causes */}
        <div className="px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Possible Causes
          </p>
          <ul className="space-y-2">
            {item.causes.map((cause, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                {cause}
              </li>
            ))}
          </ul>
        </div>

        {/* Solutions */}
        <div className="px-5 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Solutions
          </p>
          <ol className="space-y-2">
            {item.solutions.map((solution, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                  {i + 1}
                </span>
                {solution}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </article>
  );
}
