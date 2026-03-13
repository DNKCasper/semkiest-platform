import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '../../../components/auth/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password · SemkiEst',
};

interface ResetPasswordPageProps {
  searchParams: { token?: string };
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = searchParams.token ?? '';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Link href="/" className="inline-block text-2xl font-bold tracking-tight">
            SemkiEst
          </Link>
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a strong password to secure your account.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm text-destructive">
                Invalid or missing reset token. Please request a new password reset link.
              </p>
              <Link
                href="/auth/forgot-password"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Request new link
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
