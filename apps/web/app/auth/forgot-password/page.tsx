import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '../../../components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password · SemkiEst',
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Link href="/" className="inline-block text-2xl font-bold tracking-tight">
            SemkiEst
          </Link>
          <h1 className="text-xl font-semibold">Forgot your password?</h1>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
