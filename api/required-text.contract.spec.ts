import { test, expect } from './fixtures/api.fixture';

const createCases = [
  {
    endpoint: '/users',
    fields: ['name', 'username', 'email'],
    payload: { name: 'QA User', username: 'qa_user', email: 'qa@example.com' },
  },
  {
    endpoint: '/posts',
    fields: ['title', 'body'],
    payload: { title: 'QA Post', body: 'Post body', userId: 1 },
  },
  {
    endpoint: '/comments',
    fields: ['name', 'email', 'body'],
    payload: { name: 'QA Comment', email: 'qa@example.com', body: 'Comment body', postId: 1 },
  },
];

for (const { endpoint, fields, payload } of createCases) {
  test(`@api @contract POST ${endpoint} rejects missing, blank and non-string required text`, async ({ request, mockApiServer }) => {
    const url = `${mockApiServer.baseUrl}${endpoint}`;
    const before = await request.get(url);
    expect(before.status()).toBe(200);
    const records = await before.json();

    for (const field of fields) {
      for (const value of [undefined, null, '', ' \t\n ', 17, false, {}, []]) {
        await test.step(`${field}=${JSON.stringify(value) ?? 'omitted'}`, async () => {
          const response = await request.post(url, { data: { ...payload, [field]: value } });
          expect(response.status()).toBe(400);
          expect(response.headers()['content-type']).toContain('application/json');
          const body = await response.json();
          expect(typeof body.error).toBe('string');
          expect(body.error.length).toBeGreaterThan(0);
        });
      }
    }

    const after = await request.get(url);
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual(records);
  });

  test(`@api @contract POST ${endpoint} preserves nonblank text and creates one record`, async ({ request, mockApiServer }) => {
    const url = `${mockApiServer.baseUrl}${endpoint}`;
    const before = await request.get(url);
    expect(before.status()).toBe(200);
    const records = await before.json();
    const data = {
      ...payload,
      ...Object.fromEntries(fields.map((field) => [
        field, field === 'email' ? 'qa@example.com' : `  ${field}: Пример 😀\n`,
      ])),
    };

    const response = await request.post(url, { data });
    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject(data);
    expect(Number.isSafeInteger(created.id)).toBe(true);
    expect(created.id).toBeGreaterThan(0);

    const after = await request.get(url);
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual([...records, created]);
  });
}
