import crypto from 'crypto';

/** Maximum allowed age (in seconds) for a Slack request timestamp before it is rejected. */
const SLACK_REQUEST_MAX_AGE_SECONDS = 5 * 60;

/**
 * Verifies that an incoming HTTP request originates from Slack by validating the
 * HMAC-SHA256 signature using the app's signing secret.
 *
 * @param signingSecret - Slack app signing secret (SLACK_SIGNING_SECRET env var).
 * @param rawBody       - Raw (unparsed) request body string.
 * @param timestamp     - Value of the X-Slack-Request-Timestamp header.
 * @param signature     - Value of the X-Slack-Signature header.
 * @returns `true` if the request is authentic; `false` otherwise.
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequest(
  signingSecret: string,
  rawBody: string,
  timestamp: string,
  signature: string,
): boolean {
  const ts = Number(timestamp);

  if (Number.isNaN(ts)) {
    return false;
  }

  // Reject requests older than 5 minutes to prevent replay attacks.
  const ageSeconds = Math.abs(Date.now() / 1000 - ts);
  if (ageSeconds > SLACK_REQUEST_MAX_AGE_SECONDS) {
    return false;
  }

  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(sigBaseString);
  const expectedSignature = `v0=${hmac.digest('hex')}`;

  try {
    // Use timing-safe comparison to prevent timing attacks.
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(signature, 'utf8'),
    );
  } catch {
    return false;
  }
}
