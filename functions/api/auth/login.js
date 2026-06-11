import { hashPassword, signJwt } from '../../_crypto-helper.js';

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

    if (!username || !password) {
      return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const trimmedUsername = username.trim();

    // 查找用户
    const user = await db.prepare("SELECT * FROM users WHERE username = ?").bind(trimmedUsername).first();
    if (!user) {
      return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 验证密码哈希 (支持 600,000 次和 100,000 次兼容)
    let passwordHash = await hashPassword(password, user.salt, 600000);
    if (passwordHash !== user.password_hash) {
      const legacyHash = await hashPassword(password, user.salt, 100000);
      if (legacyHash === user.password_hash) {
        passwordHash = legacyHash;
        // 静默升级哈希为 600,000 次
        const newHash = await hashPassword(password, user.salt, 600000);
        try {
          await db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
            .bind(newHash, user.id)
            .run();
        } catch (dbErr) {
          console.error("静默升级用户哈希失败:", dbErr.message);
        }
      } else {
        return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 检查账户激活状态
    if (user.status === 'Pending') {
      return new Response(JSON.stringify({ error: '您的账号正在审核中，请联系管理员启用。' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (user.status === 'Banned') {
      return new Response(JSON.stringify({ error: '您的账号已被禁用，请联系管理员。' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 签发 JWT
    const jwtSecret = env.JWT_SECRET || "novelai-default-jwt-secret-key-987654";
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    const token = await signJwt(payload, jwtSecret);

    return new Response(JSON.stringify({
      success: true,
      message: '登录成功！',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        credits: user.credits
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("Login Exception:", err);
    return new Response(JSON.stringify({ error: "服务器内部错误，请稍后再试" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
