import { verifyJwt } from '../../_crypto-helper.js';
import { USER_DAILY_FREE_LIMIT } from '../../_config.js';

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: '服务器未配置 D1 数据库绑定' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 获取 Bearer Token
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未提供合法的登录凭证' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.substring(7);
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    return new Response(JSON.stringify({ error: "服务器未配置 JWT_SECRET" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  const payload = await verifyJwt(token, jwtSecret);

  if (!payload) {
    return new Response(JSON.stringify({ error: '登录会话已过期，请重新登录。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // 查库获取最新余额，防止被并发篡改
    const user = await db.prepare("SELECT id, username, role, credits FROM users WHERE id = ?").bind(payload.id).first();
    if (!user) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 获取当前北京时间日期并计算用户的每日免费已用额度
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
    const userLimitKey = `user_limit:${today}:${user.id}`;
    const userLimitRow = await db.prepare("SELECT count FROM free_limits WHERE key = ?").bind(userLimitKey).first();
    const userLimitCount = userLimitRow ? userLimitRow.count : 0;

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        credits: user.credits,
        daily_limit: USER_DAILY_FREE_LIMIT,
        daily_count: userLimitCount
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("Profile Exception:", err);
    return new Response(JSON.stringify({ error: "获取个人信息失败" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
