import { test, expect } from '@playwright/test';
import {
  assertBodyContainsFields,
  assertEmailField,
  assertHeader,
  assertJsonContentType,
  assertNumberField,
  assertPaginationShape,
  assertProblemDetails,
  buildAssertionResult,
  normalizeHeaders,
} from '../api/utils/response-assertions';
import { isClientError, isServerError, isSuccessStatus } from '../api/utils/status-code-helper';
import { buildApiBugFromFailure, renderMarkdown } from './bug-report-builder';
import { STATUS, type QaTestResult } from './qa-metrics';
import { buildQaRunReport } from './qa-report';
import { buildRegressionRiskSummary } from './regression-risk-summary';
import { buildCommentPayload, buildPaginationParams, buildPostPayload, buildUserPayload } from './test-data-builder';

test.describe('@utils @contract TypeScript QA utilities', () => {
  test('payload builders should return reusable typed API data', () => {
    expect(buildUserPayload({ email: 'qa@example.com' })).toMatchObject({
      name: 'QA Learning User',
      email: 'qa@example.com',
    });
    expect(buildPostPayload({ userId: 42 })).toMatchObject({
      title: 'API automation practice',
      userId: 42,
    });
    expect(buildCommentPayload({ postId: 7 })).toMatchObject({
      postId: 7,
      email: 'qa.regression@example.com',
    });
    expect(buildPaginationParams(2, 25)).toEqual({
      _page: '2',
      _limit: '25',
    });
  });

  test('response assertions should normalize headers and report failures', () => {
    const headers = normalizeHeaders({
      'Content-Type': ['application/json', 'charset=utf-8'],
      TraceId: 'abc-123',
    });

    expect(headers['content-type']).toBe('application/json, charset=utf-8');
    expect(assertHeader({ status: 200, headers }, 'traceid')).toBe('abc-123');
    expect(() => assertEmailField({ email: 'qa@example.com' })).not.toThrow();

    const result = buildAssertionResult('email shape', () => assertEmailField({ email: 'invalid' }));

    expect(result).toMatchObject({
      name: 'email shape',
      status: 'failed',
    });
  });

  test('header assertions should reject missing prototype-named headers', () => {
    for (const headerName of ['constructor', '__proto__']) {
      expect(() => assertHeader({ status: 200, headers: {} }, headerName))
        .toThrow(`Expected response header "${headerName}" to be present`);
      expect(() => assertHeader({ status: 200 }, headerName))
        .toThrow(`Expected response header "${headerName}" to be present`);
    }
  });

  test('header normalization should preserve own prototype-like names', () => {
    const headers = JSON.parse('{"__proto__":"trace-value","Constructor":"custom-value"}');
    const normalized = normalizeHeaders(headers);

    expect(Object.hasOwn(normalized, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(normalized)).toBe(Object.prototype);
    expect(assertHeader({ status: 200, headers }, '__proto__')).toBe('trace-value');
    expect(assertHeader({ status: 200, headers }, 'CONSTRUCTOR')).toBe('custom-value');
  });

  test('header normalization should preserve numeric and boolean values', () => {
    const headers = { 'X-Count': 0, 'X-Flag': false, 'X-Ids': [1, 2], 'X-Flags': [false, true] };
    expect(normalizeHeaders(headers)).toEqual({
      'x-count': '0', 'x-flag': 'false', 'x-ids': '1, 2', 'x-flags': 'false, true',
    });
    expect(assertHeader({ status: 200, headers }, 'x-count')).toBe('0');
    expect(assertHeader({ status: 200, headers }, 'x-flag')).toBe('false');
    expect(() => assertHeader({ status: 200, headers: { Empty: '' } }, 'empty'))
      .toThrow('Expected response header "empty" to be present');
  });

  test('JSON content type assertion should accept media types with case and parameters', () => {
    for (const contentType of [
      'application/json',
      'application/json; charset=utf-8',
      'APPLICATION/JSON',
      'Application/Json; Charset=UTF-8',
      ' application/json ; charset=utf-8',
    ]) {
      expect(() => assertJsonContentType({
        status: 200,
        headers: { 'Content-Type': contentType },
      }), contentType).not.toThrow();
    }
  });

  test('JSON content type assertion should reject lookalikes and parameter matches', () => {
    for (const contentType of [
      'application/jsonp',
      'application/json+xml',
      'text/application/json',
      'text/html; note=application/json',
      'text/plain',
    ]) {
      expect(() => assertJsonContentType({
        status: 200,
        headers: { 'content-type': contentType },
      }), contentType).toThrow('Expected JSON response');
    }

    expect(() => assertJsonContentType({ status: 200 }))
      .toThrow('Expected response header "content-type" to be present');
  });

  test('required response fields should reject properties inherited from Object.prototype', () => {
    expect(() => assertBodyContainsFields({}, ['constructor', 'toString', '__proto__']))
      .toThrow('Missing required fields: constructor, toString, __proto__');
  });

  test('required response fields should reject inherited numeric values', () => {
    const body = Object.create({ id: 7 });

    expect(() => assertNumberField(body, 'id')).toThrow('Missing required fields: id');
  });

  test('required response fields should accept own falsy values and prototype-like keys', () => {
    const body = JSON.parse('{"count":0,"enabled":false,"label":"","constructor":"value","toString":"value","__proto__":"value"}');
    expect(() => assertBodyContainsFields(body, [
      'count', 'enabled', 'label', 'constructor', 'toString', '__proto__',
    ])).not.toThrow();

    const withoutPrototype = Object.assign(Object.create(null), { id: 0 });
    expect(() => assertNumberField(withoutPrototype, 'id')).not.toThrow();
    expect(() => assertBodyContainsFields({ first: null, second: undefined }, ['first', 'second']))
      .toThrow('Missing required fields: first, second');
  });

  test('numeric response fields should accept finite values without coercion', () => {
    for (const value of [0, -1, 1.5, Number.MIN_VALUE, Number.MAX_VALUE]) {
      expect(() => assertNumberField({ value }, 'value')).not.toThrow();
    }
    for (const value of ['1', true, {}, []]) {
      expect(() => assertNumberField({ value }, 'value')).toThrow('Expected "value" to be a number');
    }
    expect(() => assertNumberField({}, 'value')).toThrow('Missing required fields: value');
    expect(() => assertNumberField({ value: null }, 'value')).toThrow('Missing required fields: value');
  });

  test('numeric response fields should reject non-finite values', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => assertNumberField({ value }, 'value')).toThrow('Expected "value" to be finite');
    }
  });

  test('response shape assertions should reject non-finite pagination and problem fields', () => {
    for (const field of ['page', 'limit', 'total']) {
      expect(() => assertPaginationShape({ page: 1, limit: 10, total: 0, items: [], [field]: NaN }))
        .toThrow(`Expected "${field}" to be finite`);
    }
    expect(() => assertProblemDetails({ title: 'Bad request', status: Infinity }))
      .toThrow('Expected "status" to be finite');
    expect(() => assertPaginationShape({ page: 1, limit: 10, total: 0, items: [] })).not.toThrow();
    expect(() => assertProblemDetails({ title: 'Bad request', status: 400 })).not.toThrow();
  });

  test('status helpers should classify HTTP status code ranges', () => {
    expect(isSuccessStatus(204)).toBe(true);
    expect(isClientError(404)).toBe(true);
    expect(isServerError(503)).toBe(true);
    expect(isSuccessStatus(500)).toBe(false);
  });

  test('bug report builder should render API failures as markdown', () => {
    const report = buildApiBugFromFailure({
      baseUrl: 'https://api.example.test',
      endpoint: '/users/1',
      expected: '200 OK with user contract',
      actual: '500 Internal Server Error',
      status: 500,
      evidence: 'Playwright trace attached',
    });

    expect(report.severity).toBe('high');
    expect(report.labels).toContain('area:api');
    expect(renderMarkdown(report)).toContain('## Steps to reproduce');
  });

  test('metrics and regression summaries should expose release risk signals', () => {
    const results: QaTestResult[] = [
      createQaResult('login smoke', 'ui', STATUS.PASSED, 300),
      createQaResult('users contract', 'api', STATUS.FAILED, 900, 'schema mismatch'),
      createQaResult('checkout regression', 'ui', STATUS.FLAKY, 1300),
    ];
    const report = buildQaRunReport(results, {
      runStatus: 'failed',
      durationMs: 2500,
      generatedAt: '2026-06-08T00:00:00.000Z',
    });

    const riskSummary = buildRegressionRiskSummary({
      failed: report.summary.failed,
      flaky: report.summary.flaky,
      slow: report.slowTests.length,
      skipped: report.summary.skipped,
    });

    expect(report.summary.total).toBe(3);
    expect(report.failedTests).toHaveLength(1);
    expect(report.qualityGate.status).toBe('blocked');
    expect(riskSummary.risk).toBe('medium');
  });
});

function createQaResult(
  title: string,
  suite: string,
  status: QaTestResult['status'],
  durationMs: number,
  error?: string,
): QaTestResult {
  return {
    id: `${suite}:${title}`,
    suite,
    title,
    status,
    durationMs,
    attempts: 1,
    tags: [],
    error,
  };
}
