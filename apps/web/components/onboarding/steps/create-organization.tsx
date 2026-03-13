'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { HelpTooltip } from '../../ui/tooltip-provider';
import {
  useOnboarding,
  type OrganizationData,
} from '../../../context/onboarding-context';

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateOrganizationStep() {
  const { setOrganizationData, completeStep, organizationData } = useOnboarding();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationData>({
    defaultValues: organizationData ?? {
      name: '',
      plan: 'free',
    },
  });

  function onSubmit(data: OrganizationData) {
    setOrganizationData(data);
    completeStep('create-organization');
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Create your organization
        </h2>
        <p className="text-sm text-gray-500">
          Your organization is the top-level container for all your projects and
          team members.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Organization name */}
        <div className="space-y-1.5">
          <Label htmlFor="org-name" className="flex items-center gap-1">
            Organization name
            <HelpTooltip text="This is the name displayed across the platform and in reports." />
          </Label>
          <Input
            id="org-name"
            placeholder="Acme Corp"
            {...register('name', {
              required: 'Organization name is required',
              minLength: {
                value: 2,
                message: 'Name must be at least 2 characters',
              },
              maxLength: {
                value: 80,
                message: 'Name must be 80 characters or fewer',
              },
            })}
            aria-invalid={errors.name ? 'true' : undefined}
          />
          {errors.name && (
            <p className="text-xs text-red-500" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        {/* Plan selection */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1">
            Plan
            <HelpTooltip text="You can upgrade at any time from your billing settings." />
          </Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                {
                  value: 'free',
                  label: 'Free',
                  description: 'Up to 3 projects · 100 test runs/mo',
                },
                {
                  value: 'pro',
                  label: 'Pro',
                  description: 'Unlimited projects · Priority support',
                },
                {
                  value: 'enterprise',
                  label: 'Enterprise',
                  description: 'SSO · SLA · Custom contracts',
                },
              ] as const
            ).map(({ value, label, description }) => (
              <label
                key={value}
                className="flex cursor-pointer flex-col rounded-lg border border-gray-200 p-4 hover:border-blue-400 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  value={value}
                  {...register('plan')}
                  className="sr-only"
                />
                <span className="font-medium text-gray-900">{label}</span>
                <span className="mt-0.5 text-xs text-gray-500">
                  {description}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
          Continue
        </Button>
      </form>
    </div>
  );
}
