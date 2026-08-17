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

    // 3. 构造参数化 Prepared Statements 并通过 db.batch 一次性执行
    // 3.1 总体指标 (请求次数, 成功率, 平均耗时)
    const summaryStmt = db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        AVG(CASE WHEN status_code = 200 THEN 1.0 ELSE 0.0 END) * 100 as success_rate,
        AVG(duration_ms) as avg_duration
      FROM request_logs
      WHERE created_at >= datetime('now', '+8 hours', ?)
    `).bind(timeModifier);

    // 3.2 趋势数据
    const trendStmt = db.prepare(`
      SELECT 
        strftime(?, created_at) as time_bucket,
        COUNT(*) as request_count,
        AVG(duration_ms) as avg_duration
      FROM request_logs
      WHERE created_at >= datetime('now', '+8 hours', ?)
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `).bind(formatStr, timeModifier);

    // 3.3 模型分布比例
    const modelStmt = db.prepare(`
      SELECT 
        model,
        COUNT(*) as count
      FROM request_logs
      WHERE created_at >= datetime('now', '+8 hours', ?)
      GROUP BY model
      ORDER BY count DESC
    `).bind(timeModifier);

    // 3.4 常见报错 TOP 5
    const errorStmt = db.prepare(`
      SELECT 
        error_message,
        COUNT(*) as count
      FROM request_logs
      WHERE created_at >= datetime('now', '+8 hours', ?) AND status_code != 200 AND error_message IS NOT NULL
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT 5
    `).bind(timeModifier);

    // 3.5 活跃 IP TOP 10
    const ipStmt = db.prepare(`
      SELECT 
        ip,
        COUNT(*) as count
      FROM request_logs
      WHERE created_at >= datetime('now', '+8 hours', ?)
      GROUP BY ip
      ORDER BY count DESC
      LIMIT 10
    `).bind(timeModifier);

    // 单次 D1 RPC 往返批量执行 5 个查询
    const [summaryRes, trendRes, modelRes, errorRes, ipRes] = await db.batch([
      summaryStmt,
      trendStmt,
      modelStmt,
      errorStmt,
      ipStmt
    ]);

    const summaryRow = summaryRes?.results?.[0] || null;

    return new Response(JSON.stringify({
      success: true,
      summary: {
        total_requests: summaryRow?.total_requests || 0,
        success_rate: (summaryRow?.success_rate !== null && summaryRow?.success_rate !== undefined)
          ? parseFloat(Number(summaryRow.success_rate).toFixed(2))
          : 100,
        avg_duration: (summaryRow?.avg_duration !== null && summaryRow?.avg_duration !== undefined)
          ? Math.round(Number(summaryRow.avg_duration))
          : 0
      },
      trend: trendRes?.results || [],
      models: modelRes?.results || [],
      errors: errorRes?.results || [],
      ips: ipRes?.results || []
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
