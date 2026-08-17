import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequest } from '../functions/api/admin/stats.js';

describe('Admin Stats API', () => {
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      ADMIN_TOKEN: 'super-admin-secret',
      DB: {
        prepare: vi.fn().mockImplementation((sql) => {
          return {
            sql,
            bind: vi.fn().mockReturnThis()
          };
        }),
        batch: vi.fn().mockResolvedValue([
          { results: [{ total_requests: 15, success_rate: 80.0, avg_duration: 1200.5 }] },
          { results: [{ time_bucket: '06-19 12:00', request_count: 10, avg_duration: 1100 }] },
          { results: [{ model: 'nai-diffusion-4-5-full', count: 12 }] },
          { results: [{ error_message: '503 Service Unavailable', count: 3 }] },
          { results: [{ ip: '127.0.0.1', count: 15 }] }
        ])
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

  it('should return 500 if env.DB is missing', async () => {
    const req = createRequest('http://localhost/api/admin/stats', { 'x-admin-token': 'super-admin-secret' });
    const response = await onRequest({ request: req, env: { ADMIN_TOKEN: 'super-admin-secret' } });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('未配置 D1');
  });

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

  it('should correctly aggregate metrics via single db.batch call and return standard response layout', async () => {
    const req = createRequest('http://localhost/api/admin/stats?range=24h', {
      'x-admin-token': 'super-admin-secret'
    });

    const response = await onRequest({ request: req, env: mockEnv });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(mockEnv.DB.batch).toHaveBeenCalledTimes(1);
    expect(mockEnv.DB.prepare).toHaveBeenCalledTimes(5);

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

  it('should handle different time ranges (7d, 30d)', async () => {
    const req7d = createRequest('http://localhost/api/admin/stats?range=7d', {
      'x-admin-token': 'super-admin-secret'
    });
    const res7d = await onRequest({ request: req7d, env: mockEnv });
    expect(res7d.status).toBe(200);

    const req30d = createRequest('http://localhost/api/admin/stats?range=30d', {
      'x-admin-token': 'super-admin-secret'
    });
    const res30d = await onRequest({ request: req30d, env: mockEnv });
    expect(res30d.status).toBe(200);
  });

  it('should handle empty result sets gracefully with defaults', async () => {
    mockEnv.DB.batch.mockResolvedValue([
      { results: [] },
      { results: [] },
      { results: [] },
      { results: [] },
      { results: [] }
    ]);

    const req = createRequest('http://localhost/api/admin/stats', {
      'x-admin-token': 'super-admin-secret'
    });
    const response = await onRequest({ request: req, env: mockEnv });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.summary.total_requests).toBe(0);
    expect(body.summary.success_rate).toBe(100);
    expect(body.summary.avg_duration).toBe(0);
    expect(body.trend).toEqual([]);
    expect(body.models).toEqual([]);
    expect(body.errors).toEqual([]);
    expect(body.ips).toEqual([]);
  });

  it('should return 500 when database throws an error', async () => {
    mockEnv.DB.batch.mockRejectedValue(new Error('D1 Network Error'));

    const req = createRequest('http://localhost/api/admin/stats', {
      'x-admin-token': 'super-admin-secret'
    });
    const response = await onRequest({ request: req, env: mockEnv });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('获取监控统计数据失败');
    expect(body.error).toContain('D1 Network Error');
  });
});
