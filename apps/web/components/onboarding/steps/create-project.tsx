'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { HelpTooltip } from '../../ui/tooltip-provider';
import {
  useOnboarding,
  type ProjectData,
} from '../../../context/onboarding-context';

// ─── Component ────────────────────────────────────────────────────────────────

const ENVIRONMENT_OPTIONS = [
  { value: 'development', label: 'Development', hint: 'localhost or dev server' },
  { value: 'staging', label: 'Staging', hint: 'Pre-production environment' },
  { value: 'production', label: 'Production', hint: 'Live site' },
] as const;

export function CreateProjectStep() {
  const { setProjectData, completeStep, goToStep, projectData } = useOnboarding();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProjectData>({
    defaultValues: projectData ?? {
      name: '',
      url: '',
      environment: 'staging',
    },
  });

  function onSubmit(data: ProjectData) {
    setProjectData(data);
    completeStep('create-project');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Create your first project
        </h2>
        <p className="text-sm text-gray-500">
          A project groups your test suites and runs for a single application or
          website.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Project name */}
        <div className="space-y-1.5">
          <Label htmlFor="project-name">
            Project name
          </Label>
          <Input
            id="project-name"
            placeholder="My Web App"
            {...register('name', {
              required: 'Project name is required',
              minLength: { value: 2, message: 'Name must be at least 2 characters' },
              maxLength: { value: 100, message: 'Name must be 100 characters or fewer' },
            })}
            aria-invalid={errors.name ? 'true' : undefined}
          />
          {errors.name && (
            <p className="text-xs text-red-500" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        {/* URL */}
        <div className="space-y-1.5">
          <Label htmlFor="project-url" className="flex items-center gap-1">
            Application URL
            <HelpTooltip text="The base URL tests will run against. You can use environment variables later." />
          </Label>
          <Input
            id="project-url"
            type="url"
            placeholder="https://staging.example.com"
            {...register('url', {
              required: 'URL is required',
              pattern: {
                value: /^https?:\/\/.+/,
                message: 'Must be a valid URL starting with http:// or https://',
              },
            })}
            aria-invalid={errors.url ? 'true' : undefined}
          />
          {errors.url && (
            <p className="text-xs text-red-500" role="alert">
              {errors.url.message}
            </p>
          )}
        </div>

        {/* Environment */}
        <div className="space-y-2">
          <Label>Environment</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {ENVIRONMENT_OPTIONS.map(({ value, label, hint }) => (
              <label
                key={value}
                className="flex cursor-pointer flex-col rounded-lg border border-gray-200 p-4 hover:border-blue-400 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  value={value}
                  {...register('environment')}
                  className="sr-only"
                />
                <span className="font-medium text-gray-900">{label}</span>
                <span className="mt-0.5 text-xs text-gray-500">{hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => goToStep('create-organization')}
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
