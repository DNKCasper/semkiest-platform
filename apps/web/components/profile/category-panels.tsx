'use client';

import { useState } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Switch } from '../ui/switch';
import { UIConfigPanel } from './ui-config-panel';
import { VisualConfigPanel } from './visual-config-panel';
import { BrowserConfigPanel } from './browser-config-panel';
import { PerformanceConfigPanel } from './performance-config-panel';
import { LoadConfigPanel } from './load-config-panel';
import { AccessibilityConfigPanel } from './accessibility-config-panel';
import { SecurityConfigPanel } from './security-config-panel';
import { APIConfigPanel } from './api-config-panel';
import type { ProfileFormValues } from './profile-form';
import { cn } from '../../lib/utils';

interface CategoryPanelsProps {
  control: Control<ProfileFormValues>;
}

interface CategoryDefinition {
  key: keyof ProfileFormValues['categories'];
  label: string;
  description: string;
  Panel: React.ComponentType<{ control: Control<ProfileFormValues> }>;
}

const CATEGORIES: CategoryDefinition[] = [
  {
    key: 'ui',
    label: 'UI functional testing',
    description:
      'Test user interface interactions and functional correctness across pages.',
    Panel: UIConfigPanel,
  },
  {
    key: 'visual',
    label: 'Visual / appearance testing',
    description:
      'Capture and compare screenshots to detect unintended visual regressions.',
    Panel: VisualConfigPanel,
  },
  {
    key: 'browser',
    label: 'Cross-browser compatibility',
    description:
      'Run tests across multiple browsers and viewport sizes.',
    Panel: BrowserConfigPanel,
  },
  {
    key: 'performance',
    label: 'Performance testing',
    description:
      'Measure and enforce load time, memory, and CPU usage thresholds.',
    Panel: PerformanceConfigPanel,
  },
  {
    key: 'load',
    label: 'Load / stress testing',
    description:
      'Simulate concurrent users to assess stability under heavy traffic.',
    Panel: LoadConfigPanel,
  },
  {
    key: 'accessibility',
    label: 'Accessibility testing',
    description:
      'Validate WCAG conformance and check for common accessibility violations.',
    Panel: AccessibilityConfigPanel,
  },
  {
    key: 'security',
    label: 'Security testing',
    description:
      'Scan for known vulnerabilities using OWASP or CWE classification.',
    Panel: SecurityConfigPanel,
  },
  {
    key: 'api',
    label: 'API / backend testing',
    description:
      'Send HTTP requests and assert on responses to validate backend behaviour.',
    Panel: APIConfigPanel,
  },
];

interface CategoryRowProps {
  category: CategoryDefinition;
  control: Control<ProfileFormValues>;
}

function CategoryRow({ category, control }: CategoryRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const enabledPath =
    `categories.${category.key}.enabled` as `categories.${typeof category.key}.enabled`;

  return (
    <Card>
      <CardHeader className="p-4">
        <div className="flex items-center gap-3">
          {/* Enabled toggle */}
          <Controller
            control={control}
            name={enabledPath}
            render={({ field }) => (
              <Switch
                id={`toggle-${category.key}`}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />

          {/* Label + description */}
          <div className="flex-1">
            <p className="font-medium leading-none">{category.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {category.description}
            </p>
          </div>

          {/* Expand/collapse */}
          <Controller
            control={control}
            name={enabledPath}
            render={({ field }) =>
              field.value ? (
                <button
                  type="button"
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="rounded p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={isExpanded ? 'Collapse settings' : 'Expand settings'}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="w-6" />
              )
            }
          />
        </div>
      </CardHeader>

      <Controller
        control={control}
        name={enabledPath}
        render={({ field }) => (
          <div
            className={cn(
              'overflow-hidden transition-all',
              field.value && isExpanded ? 'max-h-screen' : 'max-h-0',
            )}
          >
            <CardContent className="border-t pt-4">
              <category.Panel control={control} />
            </CardContent>
          </div>
        )}
      />
    </Card>
  );
}

/**
 * Renders all eight test category rows with enable toggles and
 * collapsible configuration panels.
 */
export function CategoryPanels({ control }: CategoryPanelsProps) {
  return (
    <div className="space-y-3">
      <div className="mb-1">
        <h2 className="text-lg font-semibold">Test categories</h2>
        <p className="text-sm text-muted-foreground">
          Enable the categories you want to run and expand each to configure its
          settings.
        </p>
      </div>
      {CATEGORIES.map((category) => (
        <CategoryRow key={category.key} category={category} control={control} />
      ))}
    </div>
  );
}
