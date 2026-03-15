'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Progress } from '../ui/progress';
import { useAuth } from '../../hooks/use-auth';

const PASSWORD_MIN_LENGTH = 12;

const registerSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms of Service' }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: 'bg-secondary' };

  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password) && /[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = [
    'bg-destructive',
    'bg-orange-400',
    'bg-yellow-400',
    'bg-green-400',
    'bg-green-600',
  ];

  return {
    score,
    label: labels[score] ?? 'Weak',
    color: colors[score] ?? 'bg-destructive',
  };
}

export function RegisterForm() {
  const { register: registerUser } = useAuth();
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { acceptTerms: false as unknown as true },
  });

  const strength = getPasswordStrength(passwordValue);

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);
    try {
      await registerUser(values);
      router.push('/auth/verify-email');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="Jane Smith"
          aria-invalid={!!errors.name}
          {...register('name')}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            className="pr-10"
            aria-invalid={!!errors.password}
            {...register('password', {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                setPasswordValue(e.target.value),
            })}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {passwordValue && (
          <div className="space-y-1">
            <Progress
              value={strength.score}
              max={4}
              indicatorClassName={strength.color}
              aria-label="Password strength"
            />
            <p className="text-xs text-muted-foreground">
              Strength:{' '}
              <span className="font-medium text-foreground">{strength.label}</span>
            </p>
          </div>
        )}

        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}

        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {[
            { re: /.{12,}/, label: '12+ characters' },
            { re: /[A-Z]/, label: 'Uppercase letter' },
            { re: /[a-z]/, label: 'Lowercase letter' },
            { re: /[0-9]/, label: 'Number' },
            { re: /[^A-Za-z0-9]/, label: 'Special character' },
          ].map(({ re, label }) => {
            const met = re.test(passwordValue);
            return (
              <li key={label} className={`flex items-center gap-1 ${met ? 'text-green-600' : ''}`}>
                <CheckCircle2 className={`h-3 w-3 ${met ? 'text-green-600' : 'text-muted-foreground/40'}`} />
                {label}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••"
            className="pr-10"
            aria-invalid={!!errors.confirmPassword}
            {...register('confirmPassword')}
          />
          <button
            type="button"
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowConfirmPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Checkbox
          id="acceptTerms"
          label=""
          aria-invalid={!!errors.acceptTerms}
          {...register('acceptTerms')}
        />
        <label htmlFor="acceptTerms" className="ml-6 -mt-6 block text-sm leading-none">
          I agree to the{' '}
          <Link
            href="/terms"
            className="text-primary underline-offset-4 hover:underline"
            target="_blank"
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/privacy"
            className="text-primary underline-offset-4 hover:underline"
            target="_blank"
          >
            Privacy Policy
          </Link>
        </label>
        {errors.acceptTerms && (
          <p className="text-xs text-destructive">{errors.acceptTerms.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/auth/login"
          className="text-primary underline-offset-4 hover:underline font-medium"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
