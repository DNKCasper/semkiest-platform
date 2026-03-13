import { z } from 'zod';

/**
 * Password strength requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[^A-Za-z0-9]/,
    'Password must contain at least one special character',
  );

/**
 * Zod schema for the POST /api/v1/auth/register request body.
 */
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  role: z.enum(['admin', 'manager', 'viewer']).optional().default('viewer'),
  orgId: z.string().cuid('Invalid organization ID').optional(),
});

/**
 * Inferred TypeScript type for the register request body.
 */
export type RegisterInput = z.infer<typeof RegisterSchema>;

/**
 * Zod schema for the POST /api/v1/auth/login request body.
 */
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Inferred TypeScript type for the login request body.
 */
export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * Zod schema for the POST /api/v1/auth/refresh request body.
 */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Inferred TypeScript type for the refresh request body.
 */
export type RefreshInput = z.infer<typeof RefreshSchema>;

/**
 * Zod schema for the POST /api/v1/auth/logout request body.
 */
export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Inferred TypeScript type for the logout request body.
 */
export type LogoutInput = z.infer<typeof LogoutSchema>;
