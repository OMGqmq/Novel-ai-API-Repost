import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from '../functions/api/admin/stats.js';

describe('Admin Stats API', () => {
  let mockEnv;
  let mockRequest;

  beforeEach(() => {
    mockEnv = {
      ADMIN_TOKEN: 'super-admin-secret',
      DB: {
        prepare: vi.fn()
      }
    };
  });

  const createRequest = (url, headers = {}) => {
    const headerMap = new Map(Object.entries(headers));
    return {
      url,
      headers: {
        get: (key) => headerMap.get(key.toLowerCase()) || null
      }
    };
  };

  it('should return 401 if x-admin-token header is missing or incorrect', async () => {
    const req1 = createRequest('http://localhost/api/admin/stats', {});
    const response1 = await onRequest({ request: req1, env: mockEnv });
    expect(response1.status).toBe(401);
    const body1 = await response1.json();
    expect(body1.error).toContain('权限不足');

    const req2 = createRequest('http://localhost/api/admin/stats', { 'x-admin-token': 'wrong-token' });
    const response2 = await onRequest({ request: req2, env: mockEnv });
    expect(response2.status).toBe(401);
  });

  it('should correctly aggregate metrics and return standard response layout', async () => {
    const req = createRequest('http://localhost/api/admin/stats?range=24h', {
      'x-admin-token': 'super-admin-secret'
    });

    // Mock each database prepare query response in sequence
    // 3.1 summaryQuery -> first()
    // 3.2 trendResults -> all()
    // 3.3 modelResults -> all()
    // 3.4 errorResults -> all()
    // 3.5 ipResults -> all()
    let queryIndex = 0;
    mockEnv.DB.prepare.mockImplementation((sql) => {
      queryIndex++;
      return {
        first: async () => {
          if (queryIndex === 1) {
            return { total_requests: 15, success_rate: 80.0, avg_duration: 1200.5 };
          }
          return null;
        },
        all: async () => {
          if (queryIndex === 2) {
            return { results: [{ time_bucket: '06-19 12:00', request_count: 10, avg_duration: 1100 }] };
          }
          if (queryIndex === 3) {
            return { results: [{ model: 'nai-diffusion-4-5-full', count: 12 }] };
          }
          if (queryIndex === 4) {
            return { results: [{ error_message: '503 Service Unavailable', count: 3 }] };
          }
          if (queryIndex === 5) {
            return { results: [{ ip: '127.0.0.1', count: 15 }] };
          }
          return { results: [] };
        }
      };
    });

    const response = await onRequest({ request: req, env: mockEnv });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.summary.total_requests).toBe(15);
    expect(body.summary.success_rate).toBe(80.0);
    expect(body.summary.avg_duration).toBe(1201); // Math.round(1200.5)

    expect(body.trend.length).toBe(1);
    expect(body.trend[0].time_bucket).toBe('06-19 12:00');

    expect(body.models.length).toBe(1);
    expect(body.models[0].model).toBe('nai-diffusion-4-5-full');

    expect(body.errors.length).toBe(1);
    expect(body.errors[0].error_message).toBe('503 Service Unavailable');

    expect(body.ips.length).toBe(1);
    expect(body.ips[0].ip).toBe('127.0.0.1');
  });
});
