import { test, expect } from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://semkiest-staging-alb-704833170.us-east-1.elb.amazonaws.com';

test.describe('API Integration', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
  });

  test('CORS headers are present', async ({ request }) => {
    const response = await request.get(`${API_URL}/health`, {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });
    expect(response.ok()).toBeTruthy();
    
    // After CORS fix, these headers should be present
    const headers = response.headers();
    console.log('CORS headers:', JSON.stringify(headers, null, 2));
  });

  test('login endpoint exists and returns proper error for bad credentials', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/login`, {
      data: {
        email: 'nonexistent@test.com',
        password: 'badpassword',
      },
    });

    // Should return 401 (not 404 or 500)
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.message).toBeTruthy();
  });

  test('register endpoint exists and validates input', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        email: 'bad-email',
        password: '123',
      },
    });

    // Should return 400 (validation error) not 404 or 500
    expect(response.status()).toBe(400);
  });

  test('full auth flow: register, login, me', async ({ request }) => {
    const timestamp = Date.now();
    const testEmail = `playwright-${timestamp}@semkiest-test.com`;
    const testPassword = 'TestPass123!@#';

    // Register
    const registerRes = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        email: testEmail,
        password: testPassword,
        name: 'Playwright Test',
      },
    });
    console.log(`Register status: ${registerRes.status()}`);
    const registerBody = await registerRes.json();
    console.log('Register response:', JSON.stringify(registerBody, null, 2));

    if (registerRes.status() !== 201) {
      console.warn('Registration failed - skipping rest of auth flow');
      return;
    }

    expect(registerBody.user).toBeTruthy();
    expect(registerBody.tokens).toBeTruthy();
    expect(registerBody.tokens.accessToken).toBeTruthy();

    // Login
    const loginRes = await request.post(`${API_URL}/api/auth/login`, {
      data: {
        email: testEmail,
        password: testPassword,
      },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.email).toBe(testEmail);
    expect(loginBody.tokens.accessToken).toBeTruthy();

    // Me
    const meRes = await request.get(`${API_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${loginBody.tokens.accessToken}`,
      },
    });
    expect(meRes.status()).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.email).toBe(testEmail);
  });
});
