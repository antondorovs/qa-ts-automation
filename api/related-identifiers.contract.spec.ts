import { test, expect } from './fixtures/api.fixture';

for (const { endpoint, field, payload } of [
  { endpoint: '/posts', field: 'userId', payload: { title: 'Valid post', body: 'Post body' } },
  { endpoint: '/comments', field: 'postId', payload: { name: 'Valid comment', email: 'qa@example.com', body: 'Comment body' } },
]) {
  test(`@api @contract POST ${endpoint} rejects invalid ${field} without creating records`, async ({ request, mockApiServer }) => {
    const url = `${mockApiServer.baseUrl}${endpoint}`;
    const before = await request.get(url);
    expect(before.status()).toBe(200);
    const records = await before.json();

    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 1e100, '1', null, true]) {
      await test.step(`identifier ${JSON.stringify(value)}`, async () => {
        const response = await request.post(url, { data: { ...payload, [field]: value } });
        expect(response.status()).toBe(400);
        expect(response.headers()['content-type']).toContain('application/json');
        expect(await response.json()).toHaveProperty('error');
      });
    }

    const after = await request.get(url);
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual(records);
  });

  test(`@api @contract POST ${endpoint} accepts positive safe ${field} boundaries`, async ({ request, mockApiServer }) => {
    const url = `${mockApiServer.baseUrl}${endpoint}`;
    for (const value of [1, Number.MAX_SAFE_INTEGER]) {
      const response = await request.post(url, { data: { ...payload, [field]: value } });
      expect(response.status()).toBe(201);
      const created = await response.json();
      expect(created).toMatchObject({ ...payload, [field]: value });
      expect(Number.isSafeInteger(created.id)).toBe(true);
      expect(created.id).toBeGreaterThan(0);

      const filtered = await request.get(url, { params: { [field]: String(value) } });
      expect(filtered.status()).toBe(200);
      expect(await filtered.json()).toContainEqual(created);
    }
  });
}
