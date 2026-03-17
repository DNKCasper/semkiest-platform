'use client';

import * as React from 'react';
import {
  Monitor,
  Eye,
  Zap,
  Accessibility,
  Shield,
  Globe,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';
import { ResultCard } from './result-card';
import { EvidenceViewer } from './evidence-viewer';
import type { CategoryResults, TestCategory, Evidence } from '../../types/run';

const CATEGORY_CONFIG: Record<
  TestCategory,
  { label: string; icon: React.ReactNode; description: string }
> = {
  ui: {
    label: 'UI Tests',
    icon: <Monitor className="h-4 w-4" />,
    description: 'User interface interactions and component behaviour',
  },
  visual: {
    label: 'Visual Tests',
    icon: <Eye className="h-4 w-4" />,
    description: 'Screenshot comparison and visual regression detection',
  },
  performance: {
    label: 'Performance Tests',
    icon: <Zap className="h-4 w-4" />,
    description: 'Page load, Core Web Vitals, and runtime performance',
  },
  accessibility: {
    label: 'Accessibility Tests',
    icon: <Accessibility className="h-4 w-4" />,
    description: 'WCAG compliance, ARIA, and keyboard navigation',
  },
  security: {
    label: 'Security Tests',
    icon: <Shield className="h-4 w-4" />,
    description: 'Headers, authentication flows, and vulnerability checks',
  },
  api: {
    label: 'API Tests',
    icon: <Globe className="h-4 w-4" />,
    description: 'Endpoint contracts, response schemas, and error handling',
  },
};

interface CategoryHeaderProps {
  category: CategoryResults;
  isExpanded: boolean;
  onToggle: () => void;
}

function CategoryHeader({ category, isExpanded, onToggle }: CategoryHeaderProps) {
  const config = CATEGORY_CONFIG[category.category];
  const { stats } = category;
  const allPassed = stats.failed === 0 && stats.warnings === 0 && stats.total > 0;
  const hasFailed = stats.failed > 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left',
        'transition-colors hover:bg-muted/50',
        isExpanded && 'rounded-b-none border-b-0',
      )}
      aria-expanded={isExpanded}
    >
      {/* Chevron */}
      <span className="text-muted-foreground shrink-0" aria-hidden>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </span>

      {/* Category icon + name */}
      <span
        className={cn(
          'flex items-center gap-2 font-medium text-sm',
          hasFailed ? 'text-red-600' : allPassed ? 'text-green-600' : 'text-foreground',
        )}
      >
        {config.icon}
        {config.label}
      </span>

      {/* Description */}
      <span className="hidden sm:block text-xs text-muted-foreground flex-1 truncate">
        {config.description}
      </span>

      {/* Stats pills */}
      <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
        {stats.passed > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {stats.passed}
          </span>
        )}
        {stats.failed > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-red-600">
            <XCircle className="h-3.5 w-3.5" />
            {stats.failed}
          </span>
        )}
        {stats.warnings > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {stats.warnings}
          </span>
        )}
        {stats.skipped > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MinusCircle className="h-3.5 w-3.5" />
            {stats.skipped}
          </span>
        )}
        <Badge variant="outline" className="text-xs">
          {stats.total} test{stats.total !== 1 ? 's' : ''}
        </Badge>
      </div>
    </button>
  );
}

interface CategorySectionProps {
  category: CategoryResults;
  /** Whether section is expanded by default. Defaults to true when any tests failed. */
  defaultExpanded?: boolean;
}

/**
 * Expandable/collapsible section for a single test category.
 * Manages its own expansion state and evidence viewer state.
 */
export function CategorySection({ category, defaultExpanded }: CategorySectionProps) {
  const [isExpanded, setIsExpanded] = React.useState(
    defaultExpanded ?? (category.stats.failed > 0 || category.stats.total > 0),
  );

  const [viewerState, setViewerState] = React.useState<{
    open: boolean;
    evidence: Evidence | null;
    allEvidence: Evidence[];
  }>({ open: false, evidence: null, allEvidence: [] });

  const handleEvidenceOpen = React.useCallback(
    (evidence: Evidence, allEvidence: Evidence[]) => {
      setViewerState({ open: true, evidence, allEvidence });
    },
    [],
  );

  const handleViewerClose = React.useCallback((open: boolean) => {
    setViewerState((s) => ({ ...s, open }));
  }, []);

  return (
    <>
      <div className="rounded-lg">
        <CategoryHeader
          category={category}
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((v) => !v)}
        />

        {/* Results list with animation */}
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            isExpanded ? 'opacity-100' : 'max-h-0 opacity-0',
          )}
          aria-hidden={!isExpanded}
        >
          {isExpanded && (
            <div className="rounded-b-lg border border-t-0 bg-muted/20 p-4 space-y-3">
              {category.results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No results in this category.
                </p>
              ) : (
                category.results.map((result) => (
                  <ResultCard
                    key={result.id}
                    result={result}
                    onEvidenceOpen={handleEvidenceOpen}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <EvidenceViewer
        evidence={viewerState.evidence}
        allEvidence={viewerState.allEvidence}
        open={viewerState.open}
        onOpenChange={handleViewerClose}
      />
    </>
  );
}
