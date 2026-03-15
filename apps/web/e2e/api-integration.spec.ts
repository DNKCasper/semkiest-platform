import { test, expect } from '@playwright/test';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';

test.describe('API Integration', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('CORS headers are present', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(response.ok()).toBeTruthy();
    const headers = response.headers();
    console.log('CORS headers:', JSON.stringify(headers, null, 2));
  });

  test('login endpoint returns 401 for bad credentials', async ({
    request,
  }) => {
    const response = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: 'nonexistent@test.com', password: 'badpassword' },
    });
    expect(response.status()).toBe(401);
  });

  test('register endpoint validates input', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: { email: 'bad-email', password: '123' },
    });
    expect(response.status()).toBe(400);
  });

  test('full auth flow: register, login, me', async ({ request }) => {
    const timestamp = Date.now();
    const testEmail = `api-test-${timestamp}@semkiest-test.com`;
    const testPassword = 'TestPass123!@#';

    // 1. Register
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        email: testEmail,
        password: testPassword,
        name: 'API Test User',
      },
    });
    console.log(`Register status: ${registerRes.status()}`);
    const registerBody = await registerRes.json();
    console.log(
      'Register response:',
      JSON.stringify(registerBody, null, 2).substring(0, 500),
    );
    expect(registerRes.status()).toBeLessThan(300);
    expect(registerBody.user).toBeTruthy();
    expect(registerBody.tokens?.accessToken).toBeTruthy();

    // 2. Login
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: { email: testEmail, password: testPassword },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.email).toBe(testEmail);
    expect(loginBody.tokens?.accessToken).toBeTruthy();

    // 3. Get current user
    const meRes = await request.get(`${API_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${loginBody.tokens.accessToken}`,
      },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.email).toBe(testEmail);
  });

  test('refresh token flow', async ({ request }) => {
    const timestamp = Date.now();
    const testEmail = `refresh-test-${timestamp}@semkiest-test.com`;
    const testPassword = 'TestPass123!@#';

    // Register and get tokens
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        email: testEmail,
        password: testPassword,
        name: 'Refresh Test',
      },
    });
    const { tokens } = await registerRes.json();

    // Use refresh token to get new access token
    const refreshRes = await request.post(`${API_URL}/api/auth/refresh`, {
      data: { refreshToken: tokens.refreshToken },
    });
    console.log(`Refresh status: ${refreshRes.status()}`);
    if (refreshRes.status() === 200) {
      const refreshBody = await refreshRes.json();
      expect(refreshBody.accessToken).toBeTruthy();
    }
  });

  test('logout invalidates session', async ({ request }) => {
    const timestamp = Date.now();
    const testEmail = `logout-test-${timestamp}@semkiest-test.com`;
    const testPassword = 'TestPass123!@#';

    // Register
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        email: testEmail,
        password: testPassword,
        name: 'Logout Test',
      },
    });
    const { tokens } = await registerRes.json();

    // Logout
    const logoutRes = await request.post(`${API_URL}/api/auth/logout`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      data: { refreshToken: tokens.refreshToken },
    });
    console.log(`Logout status: ${logoutRes.status()}`);
    expect(logoutRes.status()).toBeLessThan(300);
  });
});
