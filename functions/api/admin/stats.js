export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: '服务器未配置 D1 数据库绑定' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 1. 校验管理员身份
  const adminToken = (request.headers.get('x-admin-token') || "").trim();
  const serverAdminToken = (env.ADMIN_TOKEN || "").trim();

  if (!serverAdminToken || adminToken !== serverAdminToken) {
    return new Response(JSON.stringify({ error: '权限不足，拒绝访问。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 2. 解析参数以确定时间范围
    const url = new URL(request.url);
    const range = url.searchParams.get('range') || '24h';

    let timeModifier = '-24 hours';
    let formatStr = '%m-%d %H:00'; // 默认 24h 按小时分组
    if (range === '7d') {
      timeModifier = '-7 days';
      formatStr = '%m-%d';
    } else if (range === '30d') {
      timeModifier = '-30 days';
      formatStr = '%m-%d';
    }

    // 统一生成 SQL 过滤的时间起点
    // 我们使用的是 datetime('now', '+8 hours') 写入，所以查询也需要按此偏移计算
    const timeFilterSql = `datetime('now', '+8 hours', '${timeModifier}')`;

    // 3. 执行 SQL 聚合查询

    // 3.1 总体指标 (请求次数, 成功率, 平均耗时)
    const summaryQuery = await db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        AVG(CASE WHEN status_code = 200 THEN 1.0 ELSE 0.0 END) * 100 as success_rate,
        AVG(duration_ms) as avg_duration
      FROM request_logs
      WHERE created_at >= ${timeFilterSql}
    `).first();

    // 3.2 趋势数据
    const trendResults = await db.prepare(`
      SELECT 
        strftime('${formatStr}', created_at) as time_bucket,
        COUNT(*) as request_count,
        AVG(duration_ms) as avg_duration
      FROM request_logs
      WHERE created_at >= ${timeFilterSql}
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `).all();

    // 3.3 模型分布比例
    const modelResults = await db.prepare(`
      SELECT 
        model,
        COUNT(*) as count
      FROM request_logs
      WHERE created_at >= ${timeFilterSql}
      GROUP BY model
      ORDER BY count DESC
    `).all();

    // 3.4 常见报错 TOP 5
    const errorResults = await db.prepare(`
      SELECT 
        error_message,
        COUNT(*) as count
      FROM request_logs
      WHERE created_at >= ${timeFilterSql} AND status_code != 200 AND error_message IS NOT NULL
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT 5
    `).all();

    // 3.5 活跃 IP TOP 10
    const ipResults = await db.prepare(`
      SELECT 
        ip,
        COUNT(*) as count
      FROM request_logs
      WHERE created_at >= ${timeFilterSql}
      GROUP BY ip
      ORDER BY count DESC
      LIMIT 10
    `).all();

    return new Response(JSON.stringify({
      success: true,
      summary: {
        total_requests: summaryQuery?.total_requests || 0,
        success_rate: summaryQuery?.success_rate !== null ? parseFloat(summaryQuery.success_rate.toFixed(2)) : 100,
        avg_duration: summaryQuery?.avg_duration !== null ? Math.round(summaryQuery.avg_duration) : 0
      },
      trend: trendResults.results || [],
      models: modelResults.results || [],
      errors: errorResults.results || [],
      ips: ipResults.results || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: '获取监控统计数据失败: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
