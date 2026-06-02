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
    const { userId, status, credits, action } = await request.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: '用户 ID 不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 查库获取该用户当前状态，用于对比记录日志
    const user = await db.prepare("SELECT username, status, credits FROM users WHERE id = ?").bind(userId).first();
    if (!user) {
      return new Response(JSON.stringify({ error: '找不到指定的用户' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 处理彻底删除用户操作
    if (action === 'delete') {
      const batchStmts = [
        db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
        db.prepare("DELETE FROM credit_logs WHERE user_id = ?").bind(userId)
      ];
      await db.batch(batchStmts);
      return new Response(JSON.stringify({
        success: true,
        message: '用户已被成功删除'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const batchStmts = [];

    // 1. 如果传了 status 则更新状态
    if (status !== undefined) {
      const allowedStatus = ['Pending', 'Approved', 'Banned'];
      if (!allowedStatus.includes(status)) {
        return new Response(JSON.stringify({ error: '非法的用户状态' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      batchStmts.push(
        db.prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, userId)
      );
      
      // 记录日志
      if (user.status !== status) {
        batchStmts.push(
          db.prepare("INSERT INTO credit_logs (user_id, action, amount, description) VALUES (?, 'admin_status', 0, ?)")
            .bind(userId, `管理员将状态从 '${user.status}' 变更为 '${status}'`)
        );
      }
    }

    // 2. 如果传了 credits 则覆盖更新额度
    if (credits !== undefined) {
      const newCredits = parseInt(credits);
      if (isNaN(newCredits) || newCredits < 0) {
        return new Response(JSON.stringify({ error: '点数必须是大于或等于 0 的整数' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      batchStmts.push(
        db.prepare("UPDATE users SET credits = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(newCredits, userId)
      );

      // 记录日志
      const diff = newCredits - user.credits;
      if (diff !== 0) {
        batchStmts.push(
          db.prepare("INSERT INTO credit_logs (user_id, action, amount, description) VALUES (?, 'admin_adjust', ?, ?)")
            .bind(userId, diff, `管理员调整点数：从 ${user.credits} 调整为 ${newCredits}`)
        );
      }
    }

    if (batchStmts.length > 0) {
      await db.batch(batchStmts);
    }

    return new Response(JSON.stringify({
      success: true,
      message: '用户信息已成功更新'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: '更改用户信息失败: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
