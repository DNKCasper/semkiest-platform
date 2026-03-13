import type { LLMRequest, LLMResponse } from '../types/index.js';

/**
 * Context object passed through the middleware pipeline.
 * Middleware can read and mutate this object.
 */
export interface GatewayContext {
  /** The incoming request (may be mutated by middleware, e.g. to inject defaults) */
  request: LLMRequest;
  /** The provider response — populated after the core handler runs */
  response?: LLMResponse;
  /** Error thrown during processing (if any) */
  error?: unknown;
  /** Arbitrary data bag for middleware-to-middleware communication */
  meta: Record<string, unknown>;
}

/** Advances the middleware chain to the next handler */
export type NextFunction = () => Promise<void>;

/**
 * A middleware function receives the context and a `next` callback.
 * It must call `next()` to continue the chain, or skip it to short-circuit.
 */
export type MiddlewareFn = (ctx: GatewayContext, next: NextFunction) => Promise<void>;

/**
 * Composes an ordered list of middleware functions into a single function
 * using the "onion" (Koa-style) model.
 *
 * Each middleware wraps the remainder of the chain. The innermost function
 * (the core provider call) is the `finalHandler`.
 */
export function composeMiddleware(
  middlewares: MiddlewareFn[],
  finalHandler: (ctx: GatewayContext) => Promise<void>,
): (ctx: GatewayContext) => Promise<void> {
  return async (ctx: GatewayContext) => {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times within the same middleware');
      }
      index = i;

      if (i === middlewares.length) {
        await finalHandler(ctx);
        return;
      }

      const middleware = middlewares[i];
      if (!middleware) return;

      await middleware(ctx, () => dispatch(i + 1));
    };

    await dispatch(0);
  };
}
