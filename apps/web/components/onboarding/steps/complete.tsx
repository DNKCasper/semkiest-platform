'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '../../ui/button';
import { useOnboarding } from '../../../context/onboarding-context';

// ─── Component ────────────────────────────────────────────────────────────────

export function CompleteStep() {
  const { organizationData, projectData, progressPercent } = useOnboarding();

  return (
    <div className="flex flex-col items-center space-y-8 py-4 text-center">
      {/* Celebration icon */}
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-5xl shadow-lg">
        🎉
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
          You&apos;re all set!
        </h2>
        <p className="max-w-md text-gray-500">
          {organizationData?.name
            ? `${organizationData.name} is ready to go.`
            : 'Your organization is ready.'}{' '}
          {projectData?.name
            ? `Your first project, "${projectData.name}", has been created and your initial test run completed.`
            : 'Your first project and test run are complete.'}
        </p>
      </div>

      {/* Progress pill */}
      <div className="flex items-center gap-2 rounded-full bg-green-100 px-4 py-1.5 text-sm font-medium text-green-800">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Setup {progressPercent}% complete
      </div>

      {/* Quick-start cards */}
      <div className="grid w-full max-w-lg grid-cols-1 gap-4 sm:grid-cols-2 text-left">
        <QuickStartCard
          emoji="📊"
          title="View dashboard"
          description="See your project overview and recent test runs."
          href="/projects"
        />
        <QuickStartCard
          emoji="🔧"
          title="Add more tests"
          description="Configure additional test suites for your project."
          href="/projects"
        />
        <QuickStartCard
          emoji="👥"
          title="Invite teammates"
          description="Collaborate with your engineering and QA teams."
          href="/projects"
        />
        <QuickStartCard
          emoji="📖"
          title="Read the docs"
          description="Explore guides, API references, and best practices."
          href="/help"
        />
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/projects">Go to dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/help">Explore help center</Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function QuickStartCard({
  emoji,
  title,
  description,
  href,
}: {
  emoji: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex gap-3 rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
    >
      <span className="mt-0.5 text-2xl">{emoji}</span>
      <div>
        <p className="font-medium text-gray-900">{title}</p>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
    </Link>
  );
}
