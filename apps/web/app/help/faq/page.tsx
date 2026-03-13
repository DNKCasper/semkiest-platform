'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  FAQ_ITEMS,
  FAQ_CATEGORY_LABELS,
  searchFaq,
  type FaqCategory,
  type FaqItem,
} from '../../../lib/help-content';

// ─── Component ────────────────────────────────────────────────────────────────

export default function FaqPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [activeCategory, setActiveCategory] = useState<FaqCategory | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  // Apply initial query from URL
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Filter by search + category
  const searched = query ? searchFaq(query) : FAQ_ITEMS;
  const filtered =
    activeCategory === 'all'
      ? searched
      : searched.filter((item) => item.category === activeCategory);

  // Group by category
  const grouped = filtered.reduce<Record<string, FaqItem[]>>((acc, item) => {
    const key = FAQ_CATEGORY_LABELS[item.category] ?? item.category;
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <nav className="mb-4 text-sm text-gray-400">
            <Link href="/help" className="hover:text-gray-700">
              Help Center
            </Link>{' '}
            / FAQ
          </nav>
          <h1 className="text-3xl font-bold text-gray-900">
            Frequently Asked Questions
          </h1>
          <p className="mt-1.5 text-gray-500">
            {FAQ_ITEMS.length} questions across{' '}
            {Object.keys(FAQ_CATEGORY_LABELS).length} categories
          </p>

          {/* Search */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search FAQs…"
            className="mt-5 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10 sm:flex-row">
        {/* Category sidebar */}
        <aside className="shrink-0 sm:w-48">
          <nav className="space-y-1">
            <CategoryButton
              label="All topics"
              active={activeCategory === 'all'}
              count={FAQ_ITEMS.length}
              onClick={() => setActiveCategory('all')}
            />
            {(Object.entries(FAQ_CATEGORY_LABELS) as [FaqCategory, string][]).map(
              ([key, label]) => {
                const count = FAQ_ITEMS.filter(
                  (item) => item.category === key,
                ).length;
                return (
                  <CategoryButton
                    key={key}
                    label={label}
                    active={activeCategory === key}
                    count={count}
                    onClick={() => setActiveCategory(key)}
                  />
                );
              },
            )}
          </nav>
        </aside>

        {/* FAQ items */}
        <main className="flex-1 space-y-8">
          {Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-gray-400">
              No results found for &ldquo;{query}&rdquo;
            </p>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <section key={category}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
                  {category}
                </h2>
                <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                  {items.map((item) => (
                    <FaqAccordion
                      key={item.id}
                      item={item}
                      isOpen={openId === item.id}
                      onToggle={() =>
                        setOpenId((prev) =>
                          prev === item.id ? null : item.id,
                        )
                      }
                    />
                  ))}
                </dl>
              </section>
            ))
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CategoryButton({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-blue-50 font-medium text-blue-700'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-xs ${
          active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FaqAccordion({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div id={item.id}>
      <dt>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          <span>{item.question}</span>
          <span
            className={`ml-3 shrink-0 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden
          >
            ▾
          </span>
        </button>
      </dt>
      {isOpen && (
        <dd className="px-5 pb-4 text-sm leading-relaxed text-gray-600">
          {item.answer}
        </dd>
      )}
    </div>
  );
}
