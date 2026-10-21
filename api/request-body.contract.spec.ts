import { test, expect } from './fixtures/api.fixture';

const invalidBodies = [
  { name: 'malformed JSON', body: '{', error: 'Request body must contain valid JSON' },
  ...['null', '[]', '"text"', '42', 'true'].map((body) => ({
    name: `non-object JSON (${body})`,
    body,
    error: 'JSON request body must be an object',
  })),
];

for (const endpoint of ['/users', '/posts', '/comments', '/api/login']) {
  test(`@api @contract POST ${endpoint} rejects invalid JSON bodies without changing data`, async ({
    request,
    mockApiServer,
  }) => {
    const collections = ['/users', '/posts', '/comments'];
    const before = await Promise.all(collections.map(async (path) => {
      const response = await request.get(`${mockApiServer.baseUrl}${path}`);
      expect(response.status()).toBe(200);
      return response.json();
    }));

    for (const { name, body, error } of invalidBodies) {
      await test.step(name, async () => {
        const response = await request.post(`${mockApiServer.baseUrl}${endpoint}`, {
          headers: { 'content-type': 'application/json' },
          data: Buffer.from(body),
        });

        expect(response.status()).toBe(400);
        expect(response.headers()['content-type']).toContain('application/json');
        expect(await response.json()).toEqual({ error });
      });
    }

    for (const [index, path] of collections.entries()) {
      const response = await request.get(`${mockApiServer.baseUrl}${path}`);
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(before[index]);
    }
  });
}
