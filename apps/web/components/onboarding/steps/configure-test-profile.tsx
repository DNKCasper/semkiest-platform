'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { HelpTooltip } from '../../ui/tooltip-provider';
import {
  useOnboarding,
  type TestProfileData,
} from '../../../context/onboarding-context';

// ─── Options ──────────────────────────────────────────────────────────────────

const BROWSER_OPTIONS = [
  {
    value: 'chromium',
    label: 'Chromium',
    description: 'Fastest · Best coverage · Recommended',
    icon: '🟦',
  },
  {
    value: 'firefox',
    label: 'Firefox',
    description: 'Cross-browser validation',
    icon: '🦊',
  },
  {
    value: 'webkit',
    label: 'WebKit',
    description: 'Safari compatibility testing',
    icon: '🍎',
  },
] as const;

const VIEWPORT_OPTIONS = [
  {
    value: '1280x720',
    label: '1280 × 720',
    description: 'HD Desktop',
  },
  {
    value: '1920x1080',
    label: '1920 × 1080',
    description: 'Full HD Desktop',
  },
  {
    value: '375x812',
    label: '375 × 812',
    description: 'iPhone (mobile)',
  },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfigureTestProfileStep() {
  const { setTestProfileData, completeStep, goToStep, testProfileData } =
    useOnboarding();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TestProfileData>({
    defaultValues: testProfileData ?? {
      browser: 'chromium',
      viewport: '1280x720',
      headless: true,
    },
  });

  const headless = watch('headless');

  function onSubmit(data: TestProfileData) {
    setTestProfileData(data);
    completeStep('configure-test-profile');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Configure a test profile
        </h2>
        <p className="text-sm text-gray-500">
          Test profiles define the browser and viewport settings used when
          running your tests.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Browser */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            Browser
            <HelpTooltip text="Tests run in a real browser engine — no screenshot faking." />
          </Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {BROWSER_OPTIONS.map(({ value, label, description, icon }) => (
              <label
                key={value}
                className="flex cursor-pointer flex-col rounded-lg border border-gray-200 p-4 hover:border-blue-400 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  value={value}
                  {...register('browser')}
                  className="sr-only"
                />
                <span className="text-lg">{icon}</span>
                <span className="mt-1 font-medium text-gray-900">{label}</span>
                <span className="mt-0.5 text-xs text-gray-500">{description}</span>
              </label>
            ))}
          </div>
          {errors.browser && (
            <p className="text-xs text-red-500" role="alert">
              {errors.browser.message}
            </p>
          )}
        </div>

        {/* Viewport */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            Viewport
            <HelpTooltip text="The browser window size used during test execution." />
          </Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {VIEWPORT_OPTIONS.map(({ value, label, description }) => (
              <label
                key={value}
                className="flex cursor-pointer flex-col rounded-lg border border-gray-200 p-4 hover:border-blue-400 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  value={value}
                  {...register('viewport')}
                  className="sr-only"
                />
                <span className="font-mono text-sm font-medium text-gray-900">
                  {label}
                </span>
                <span className="mt-0.5 text-xs text-gray-500">{description}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Headless toggle */}
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-4">
          <label className="flex flex-1 flex-col">
            <span className="flex items-center gap-1 font-medium text-gray-900">
              Headless mode
              <HelpTooltip text="Headless mode runs tests without a visible browser window — faster and CI-friendly." />
            </span>
            <span className="text-sm text-gray-500">
              {headless
                ? 'Tests run in the background (faster, ideal for CI)'
                : 'Browser window visible during test run (useful for debugging)'}
            </span>
          </label>
          <input
            type="checkbox"
            role="switch"
            aria-checked={headless}
            {...register('headless')}
            className="h-5 w-5 cursor-pointer rounded accent-blue-600"
          />
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => goToStep('create-project')}
          >
            Back
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
