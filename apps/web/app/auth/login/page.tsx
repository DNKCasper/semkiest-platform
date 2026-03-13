import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { LoginForm } from '../../../components/auth/login-form';

export const metadata: Metadata = {
  title: 'Sign in · SemkiEst',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Link href="/" className="inline-block text-2xl font-bold tracking-tight">
            SemkiEst
          </Link>
          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account to continue.</p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
