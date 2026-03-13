/**
 * PaymentSandboxConfig
 *
 * Centralised configuration for sandbox / test-mode payment processors.
 *
 * Supported processors:
 *  - Stripe  (test mode via publishable_key / secret_key with prefix `sk_test_`)
 *  - PayPal  (sandbox via client_id / client_secret + sandbox base URL)
 *
 * Design notes:
 *  - This module is **configuration-only**.  It validates and packages
 *    credentials; it does not import the Stripe or PayPal SDKs directly so
 *    that consumers can tree-shake and choose their own SDK versions.
 *  - All credentials are validated with Zod to catch misconfiguration early.
 *  - Real (live) keys are actively rejected to prevent accidental charges.
 */

import { z } from 'zod';

// ─── Stripe ───────────────────────────────────────────────────────────────────

const stripeEnvSchema = z.object({
  STRIPE_TEST_SECRET_KEY: z
    .string()
    .min(1, 'Stripe test secret key is required')
    .regex(/^sk_test_/, 'Stripe secret key must start with sk_test_ (test mode only)'),
  STRIPE_TEST_PUBLISHABLE_KEY: z
    .string()
    .min(1, 'Stripe test publishable key is required')
    .regex(
      /^pk_test_/,
      'Stripe publishable key must start with pk_test_ (test mode only)',
    ),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_/, 'Stripe webhook secret must start with whsec_')
    .optional(),
  STRIPE_API_VERSION: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Stripe API version must be in YYYY-MM-DD format')
    .optional()
    .default('2024-04-10'),
});

export type StripeEnvInput = z.input<typeof stripeEnvSchema>;

/**
 * Validated Stripe test-mode configuration.
 */
export interface StripeTestConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string | undefined;
  apiVersion: string;
  /** Always `true`; confirms this config is safe for test usage. */
  isTestMode: true;
  /** Convenience reference to Stripe's test card numbers. */
  testCards: typeof STRIPE_TEST_CARDS;
}

/** Common Stripe test card numbers for various scenarios. */
export const STRIPE_TEST_CARDS = {
  /** Succeeds in test mode. */
  success: '4242424242424242',
  /** Requires authentication (3D Secure). */
  requiresAuth: '4000002500003155',
  /** Always declines. */
  declined: '4000000000000002',
  /** Declines with insufficient funds. */
  insufficientFunds: '4000000000009995',
  /** Declines due to expired card. */
  expiredCard: '4000000000000069',
  /** Declines due to incorrect CVC. */
  incorrectCvc: '4000000000000127',
  /** Declines with processing error. */
  processingError: '4000000000000119',
} as const;

// ─── PayPal ───────────────────────────────────────────────────────────────────

const paypalEnvSchema = z.object({
  PAYPAL_SANDBOX_CLIENT_ID: z.string().min(1, 'PayPal sandbox client ID is required'),
  PAYPAL_SANDBOX_CLIENT_SECRET: z
    .string()
    .min(1, 'PayPal sandbox client secret is required'),
  PAYPAL_SANDBOX_WEBHOOK_ID: z.string().optional(),
});

export type PayPalEnvInput = z.input<typeof paypalEnvSchema>;

/**
 * Validated PayPal sandbox configuration.
 */
export interface PayPalSandboxConfig {
  clientId: string;
  clientSecret: string;
  webhookId: string | undefined;
  /** Base URL for all PayPal sandbox API calls. */
  baseUrl: 'https://api-m.sandbox.paypal.com';
  /** OAuth token endpoint. */
  tokenUrl: 'https://api-m.sandbox.paypal.com/v1/oauth2/token';
  /** Always `true`; confirms this config is safe for test usage. */
  isSandbox: true;
  /** Common PayPal sandbox test accounts. */
  testAccounts: typeof PAYPAL_TEST_ACCOUNTS;
}

/** Standard PayPal sandbox buyer/seller account emails for testing. */
export const PAYPAL_TEST_ACCOUNTS = {
  /**
   * Use a dynamic sandbox buyer created in the PayPal developer dashboard.
   * Documented here as a reminder — the actual email comes from the dashboard.
   */
  buyerEmail: 'sandbox-buyer@example.com',
  sellerEmail: 'sandbox-seller@example.com',
} as const;

// ─── Combined config ──────────────────────────────────────────────────────────

/**
 * Combined payment sandbox configuration for both processors.
 */
export interface PaymentSandboxConfig {
  stripe: StripeTestConfig;
  paypal: PayPalSandboxConfig;
}

// ─── Factory functions ────────────────────────────────────────────────────────

/**
 * Parses and validates Stripe test-mode credentials from an environment-like
 * object, returning a typed `StripeTestConfig`.
 *
 * Throws a `ZodError` if any required variable is missing or uses a live key.
 *
 * @example
 * ```ts
 * const stripeConfig = createStripeTestConfig({
 *   STRIPE_TEST_SECRET_KEY:      process.env.STRIPE_TEST_SECRET_KEY!,
 *   STRIPE_TEST_PUBLISHABLE_KEY: process.env.STRIPE_TEST_PUBLISHABLE_KEY!,
 * });
 * ```
 */
export function createStripeTestConfig(env: StripeEnvInput): StripeTestConfig {
  const parsed = stripeEnvSchema.parse(env);

  return {
    secretKey: parsed.STRIPE_TEST_SECRET_KEY,
    publishableKey: parsed.STRIPE_TEST_PUBLISHABLE_KEY,
    webhookSecret: parsed.STRIPE_WEBHOOK_SECRET,
    apiVersion: parsed.STRIPE_API_VERSION,
    isTestMode: true,
    testCards: STRIPE_TEST_CARDS,
  };
}

/**
 * Parses and validates PayPal sandbox credentials from an environment-like
 * object, returning a typed `PayPalSandboxConfig`.
 *
 * Throws a `ZodError` if any required variable is missing.
 *
 * @example
 * ```ts
 * const paypalConfig = createPayPalSandboxConfig({
 *   PAYPAL_SANDBOX_CLIENT_ID:     process.env.PAYPAL_SANDBOX_CLIENT_ID!,
 *   PAYPAL_SANDBOX_CLIENT_SECRET: process.env.PAYPAL_SANDBOX_CLIENT_SECRET!,
 * });
 * ```
 */
export function createPayPalSandboxConfig(env: PayPalEnvInput): PayPalSandboxConfig {
  const parsed = paypalEnvSchema.parse(env);

  return {
    clientId: parsed.PAYPAL_SANDBOX_CLIENT_ID,
    clientSecret: parsed.PAYPAL_SANDBOX_CLIENT_SECRET,
    webhookId: parsed.PAYPAL_SANDBOX_WEBHOOK_ID,
    baseUrl: 'https://api-m.sandbox.paypal.com',
    tokenUrl: 'https://api-m.sandbox.paypal.com/v1/oauth2/token',
    isSandbox: true,
    testAccounts: PAYPAL_TEST_ACCOUNTS,
  };
}

/**
 * Creates the combined payment sandbox configuration for both processors.
 *
 * Pass the merged environment object (or `process.env`) and both Stripe and
 * PayPal configs will be parsed and validated together.
 *
 * @example
 * ```ts
 * const paymentConfig = createPaymentSandboxConfig(process.env);
 * // paymentConfig.stripe.secretKey   → 'sk_test_...'
 * // paymentConfig.paypal.baseUrl     → 'https://api-m.sandbox.paypal.com'
 * ```
 */
export function createPaymentSandboxConfig(
  env: StripeEnvInput & PayPalEnvInput,
): PaymentSandboxConfig {
  return {
    stripe: createStripeTestConfig(env),
    paypal: createPayPalSandboxConfig(env),
  };
}

// ─── Environment schema (re-exported for use with shared-config) ──────────────

/**
 * Combined Zod schema for payment sandbox environment variables.
 * Useful for integrating with the shared-config validation layer.
 */
export const paymentSandboxEnvSchema = stripeEnvSchema.merge(paypalEnvSchema);

export type PaymentSandboxEnv = z.infer<typeof paymentSandboxEnvSchema>;
