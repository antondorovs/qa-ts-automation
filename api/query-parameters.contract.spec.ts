import { test, expect } from './fixtures/api.fixture';

for (const { endpoint, parameter } of [
  { endpoint: '/posts', parameter: 'userId' },
  { endpoint: '/comments', parameter: 'postId' },
]) {
  test(`@api @contract GET ${endpoint} rejects invalid ${parameter} filters`, async ({ request, mockApiServer }) => {
    for (const value of ['invalid', '', '0', '-1', '1.5', '1e0', 'Infinity', '9007199254740992']) {
      await test.step(`filter ${JSON.stringify(value)}`, async () => {
        const response = await request.get(`${mockApiServer.baseUrl}${endpoint}`, {
          params: { [parameter]: value },
        });

        expect(response.status()).toBe(400);
        expect(response.headers()['content-type']).toContain('application/json');
        expect(await response.json()).toEqual({ error: `${parameter} must be a positive safe integer` });
      });
    }
  });

  test(`@api @contract GET ${endpoint} preserves omitted and valid ${parameter} filters`, async ({ request, mockApiServer }) => {
    const response = await request.get(`${mockApiServer.baseUrl}${endpoint}`);
    expect(response.status()).toBe(200);
    const all: Record<string, unknown>[] = await response.json();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((item) => item[parameter] === 1)).toBe(true);

    for (const value of ['1', '01', String(Number.MAX_SAFE_INTEGER)]) {
      const filtered = await request.get(`${mockApiServer.baseUrl}${endpoint}`, {
        params: { [parameter]: value },
      });

      expect(filtered.status()).toBe(200);
      expect(await filtered.json()).toEqual(all.filter((item) => item[parameter] === Number(value)));
    }
  });
}
