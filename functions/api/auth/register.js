import { generateSalt, hashPassword } from '../../_crypto-helper.js';

export async function onRequest(context) {
  // 只允许 POST 请求
  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { request, env } = context;
  const db = env.DB;

  if (!db) {
    return new Response(JSON.stringify({ error: '服务器未配置 D1 数据库绑定' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { username, password } = await request.json();

    // 基础校验
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return new Response(JSON.stringify({ error: '用户名长度需在 3 到 20 个字符之间' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 允许英文字母、数字和下划线
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(trimmedUsername)) {
      return new Response(JSON.stringify({ error: '用户名只能包含字母、数字和下划线' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: '密码长度不能少于 6 个字符' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 检查用户名是否已存在
    const existingUser = await db.prepare("SELECT id FROM users WHERE username = ?").bind(trimmedUsername).first();
    if (existingUser) {
      return new Response(JSON.stringify({ error: '用户名已被注册' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 生成盐并哈希密码
    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    // 注册赠送额度，默认10次
    const defaultCredits = parseInt(env.DEFAULT_CREDITS) || 10;

    // 写入数据库
    const result = await db.prepare(
      "INSERT INTO users (username, password_hash, salt, role, credits, status, created_at, updated_at) VALUES (?, ?, ?, 'User', ?, 'Pending', datetime('now', '+8 hours'), datetime('now', '+8 hours'))"
    ).bind(trimmedUsername, passwordHash, salt, defaultCredits).run();

    if (!result.success) {
      throw new Error('数据库写入失败');
    }

    // 记录额度变动日志 (获取刚插入的用户ID)
    const userRow = await db.prepare("SELECT id FROM users WHERE username = ?").bind(trimmedUsername).first();
    if (userRow) {
      await db.prepare(
        "INSERT INTO credit_logs (user_id, action, amount, description, created_at) VALUES (?, 'register', ?, '注册赠送初始额度', datetime('now', '+8 hours'))"
      ).bind(userRow.id, defaultCredits).run();
    }

    return new Response(JSON.stringify({ success: true, message: '注册成功！' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: '服务器注册异常: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
