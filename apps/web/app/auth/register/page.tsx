import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '../../../components/auth/register-form';

export const metadata: Metadata = {
  title: 'Create account · SemkiEst',
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <Link href="/" className="inline-block text-2xl font-bold tracking-tight">
            SemkiEst
          </Link>
          <h1 className="text-xl font-semibold">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            Start testing smarter — no credit card required.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <RegisterForm />
        </div>
      </div>
    </main>
  );
}
