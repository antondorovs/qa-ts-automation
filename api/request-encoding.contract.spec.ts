import { test, expect } from './fixtures/api.fixture';

const createCases = [
  { endpoint: '/users', payload: { name: 'MARKER', username: 'encoding', email: 'qa@example.com' } },
  { endpoint: '/posts', payload: { title: 'MARKER', body: 'Post body', userId: 1 } },
  { endpoint: '/comments', payload: { name: 'MARKER', email: 'qa@example.com', body: 'Comment body', postId: 1 } },
];

for (const { endpoint, payload } of [
  ...createCases,
  { endpoint: '/api/login', payload: { email: 'MARKER', password: 'password' } },
]) {
  test(`@api @contract POST ${endpoint} rejects malformed UTF-8 without changing data`, async ({ request, mockApiServer }) => {
    const collections = ['/users', '/posts', '/comments'];
    const before = await Promise.all(collections.map(async (path) => {
      const response = await request.get(`${mockApiServer.baseUrl}${path}`);
      expect(response.status()).toBe(200);
      return response.json();
    }));
    const [prefix, suffix] = JSON.stringify(payload).split('MARKER');

    for (const bytes of [[0xc3, 0x28], [0xe2, 0x82], [0xff]]) {
      await test.step(`invalid bytes ${Buffer.from(bytes).toString('hex')}`, async () => {
        const response = await request.post(`${mockApiServer.baseUrl}${endpoint}`, {
          headers: { 'content-type': 'application/json' },
          data: Buffer.concat([Buffer.from(prefix!), Buffer.from(bytes), Buffer.from(suffix!)]),
        });
        expect(response.status()).toBe(400);
        expect(response.headers()['content-type']).toContain('application/json');
        expect(await response.json()).toEqual({ error: 'Request body must contain valid UTF-8' });
      });
    }

    for (const [index, path] of collections.entries()) {
      const response = await request.get(`${mockApiServer.baseUrl}${path}`);
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual(before[index]);
    }
  });
}

for (const { endpoint, payload } of createCases) {
  test(`@api @contract POST ${endpoint} preserves valid Unicode text`, async ({ request, mockApiServer }) => {
    const data = JSON.stringify(payload).replace('MARKER', 'Тест 😀 \uFFFD');
    const response = await request.post(`${mockApiServer.baseUrl}${endpoint}`, {
      headers: { 'content-type': 'application/json' },
      data: Buffer.from(data),
    });
    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject(JSON.parse(data));
    const collection = await request.get(`${mockApiServer.baseUrl}${endpoint}`);
    expect(collection.status()).toBe(200);
    expect(await collection.json()).toContainEqual(created);
  });
}
