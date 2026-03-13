'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '../ui/input';
import { globalHelpSearch } from '../../lib/help-content';

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Help center search bar with live results overlay.
 * Searches FAQ items, video walkthroughs, and troubleshooting guides.
 */
export function HelpSearch() {
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();
  const [results, setResults] = useState<
    ReturnType<typeof globalHelpSearch> | null
  >(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    startTransition(() => {
      setResults(value.trim() ? globalHelpSearch(value) : null);
    });
  }

  function handleClear() {
    setQuery('');
    setResults(null);
  }

  const totalCount =
    (results?.faq.length ?? 0) +
    (results?.videos.length ?? 0) +
    (results?.troubleshooting.length ?? 0);

  return (
    <div className="relative w-full">
      {/* Input */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          🔍
        </span>
        <Input
          type="search"
          value={query}
          onChange={handleChange}
          placeholder="Search guides, FAQs, videos…"
          className="pl-9 pr-9"
          aria-label="Search help center"
          aria-expanded={results !== null}
          aria-controls="help-search-results"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {results !== null && (
        <div
          id="help-search-results"
          role="region"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[480px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          {totalCount === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* FAQ results */}
              {results.faq.length > 0 && (
                <ResultSection title="FAQs" emoji="❓">
                  {results.faq.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      href={`/help/faq#${item.id}`}
                      onClick={handleClear}
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {item.question}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                        {item.answer}
                      </p>
                    </Link>
                  ))}
                </ResultSection>
              )}

              {/* Video results */}
              {results.videos.length > 0 && (
                <ResultSection title="Video Guides" emoji="🎬">
                  {results.videos.slice(0, 3).map((item) => (
                    <Link
                      key={item.id}
                      href={`/help/videos#${item.id}`}
                      onClick={handleClear}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                    >
                      <span className="text-2xl">{item.thumbnailEmoji}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.category} · {item.durationLabel}
                        </p>
                      </div>
                    </Link>
                  ))}
                </ResultSection>
              )}

              {/* Troubleshooting results */}
              {results.troubleshooting.length > 0 && (
                <ResultSection title="Troubleshooting" emoji="🔧">
                  {results.troubleshooting.slice(0, 3).map((item) => (
                    <Link
                      key={item.id}
                      href={`/help/troubleshooting#${item.id}`}
                      onClick={handleClear}
                      className="block px-4 py-3 hover:bg-gray-50"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {item.symptom}
                      </p>
                      <p className="text-xs text-gray-500">{item.category}</p>
                    </Link>
                  ))}
                </ResultSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function ResultSection({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="sticky top-0 bg-gray-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {emoji} {title}
      </div>
      {children}
    </div>
  );
}
