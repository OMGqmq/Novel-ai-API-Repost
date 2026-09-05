export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: '服务器未配置 D1 数据库绑定' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 校验管理员身份
  const adminToken = (request.headers.get('x-admin-token') || "").trim();
  const serverAdminToken = (env.ADMIN_TOKEN || "").trim();

  if (!serverAdminToken || adminToken !== serverAdminToken) {
    return new Response(JSON.stringify({ error: '权限不足，拒绝访问。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 500);
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
    const offset = (page - 1) * limit;

    const users = await db.prepare(
      "SELECT id, username, role, credits, status, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).bind(limit, offset).all();

    return new Response(JSON.stringify({
      success: true,
      users: users.results || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: '获取用户列表失败: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
