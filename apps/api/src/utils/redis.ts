import Redis from 'ioredis';

/** Refresh token TTL in seconds (7 days). */
export const REFRESH_TOKEN_TTL_SECONDS = 604800;

/** Key prefix for refresh token entries in Redis. */
const REFRESH_TOKEN_PREFIX = 'refresh_token:';

/**
 * Lazily-initialized Redis client singleton.
 * Connection is established on first use.
 */
let redisClient: Redis | null = null;

/**
 * Returns the Redis client singleton, creating it if it does not exist.
 * Reads the connection URL from the REDIS_URL environment variable.
 *
 * @returns The active Redis client instance.
 * @throws {Error} When REDIS_URL is not set.
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env['REDIS_URL'];
  if (!url) {
    throw new Error('REDIS_URL environment variable is not set');
  }

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redisClient.on('error', (_err: Error) => {
    // Redis errors are handled by ioredis retry logic; avoid noisy production logs.
    // Monitoring should be wired up at the infrastructure level.
  });

  return redisClient;
}

/**
 * Stores a refresh token in Redis, mapping it to the owning user's ID.
 * The entry expires automatically after {@link REFRESH_TOKEN_TTL_SECONDS}.
 *
 * @param token - The refresh token string (used as the Redis key suffix).
 * @param userId - The ID of the user this token belongs to.
 */
export async function storeRefreshToken(
  token: string,
  userId: string,
): Promise<void> {
  const client = getRedisClient();
  await client.set(
    `${REFRESH_TOKEN_PREFIX}${token}`,
    userId,
    'EX',
    REFRESH_TOKEN_TTL_SECONDS,
  );
}

/**
 * Looks up a refresh token in Redis and returns the associated user ID.
 *
 * @param token - The refresh token string to look up.
 * @returns The user ID if the token exists and has not expired, otherwise `null`.
 */
export async function getRefreshTokenUserId(
  token: string,
): Promise<string | null> {
  const client = getRedisClient();
  return client.get(`${REFRESH_TOKEN_PREFIX}${token}`);
}

/**
 * Removes a refresh token from Redis, effectively invalidating it.
 * Used during logout and token rotation.
 *
 * @param token - The refresh token string to invalidate.
 */
export async function deleteRefreshToken(token: string): Promise<void> {
  const client = getRedisClient();
  await client.del(`${REFRESH_TOKEN_PREFIX}${token}`);
}
