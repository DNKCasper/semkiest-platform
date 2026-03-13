import type { Metadata } from 'next';
import Link from 'next/link';
import { VIDEO_ITEMS } from '../../../lib/help-content';

export const metadata: Metadata = {
  title: 'Video Guides — SemkiEst Help',
  description:
    'Step-by-step video walkthroughs for getting started, managing projects, and integrating SemkiEst into your workflow.',
};

export default function VideosPage() {
  const categories = Array.from(new Set(VIDEO_ITEMS.map((v) => v.category)));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <nav className="mb-4 text-sm text-gray-400">
            <Link href="/help" className="hover:text-gray-700">
              Help Center
            </Link>{' '}
            / Video Guides
          </nav>
          <h1 className="text-3xl font-bold text-gray-900">Video Guides</h1>
          <p className="mt-1.5 text-gray-500">
            Visual walkthroughs for every major feature — from setup to
            advanced configuration.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-10">
        {categories.map((category) => {
          const videos = VIDEO_ITEMS.filter((v) => v.category === category);
          return (
            <section key={category} className="mb-12">
              <h2 className="mb-5 text-lg font-semibold text-gray-900">
                {category}
              </h2>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {videos.map((video) => (
                  <VideoCard key={video.id} video={video} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({
  video,
}: {
  video: (typeof VIDEO_ITEMS)[number];
}) {
  return (
    <article
      id={video.id}
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
    >
      {/* Thumbnail placeholder */}
      <div className="flex h-40 items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
        <div className="flex flex-col items-center gap-2">
          <span className="text-5xl">{video.thumbnailEmoji}</span>
          {/* Play button overlay */}
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
            ▶
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900">{video.title}</h3>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {video.durationLabel}
          </span>
        </div>
        <p className="mt-2 flex-1 text-sm text-gray-500">{video.description}</p>
        <div className="mt-4">
          <span className="inline-block rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
            {video.category}
          </span>
        </div>
      </div>

      {/* Coming-soon notice */}
      <div className="border-t border-gray-100 bg-amber-50 px-5 py-3 text-xs text-amber-700">
        📹 Video walkthrough coming soon — check back shortly!
      </div>
    </article>
  );
}
