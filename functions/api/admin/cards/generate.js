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
    const { count, credits } = await request.json();

    const generateCount = Math.min(Math.max(parseInt(count) || 1, 1), 100);
    const cardCredits = Math.max(parseInt(credits) || 100, 1);

    const generatedCards = [];
    const batchStmts = [];

    for (let i = 0; i < generateCount; i++) {
      // 生成 16 位随机 16 进制字符做后缀
      const arr = new Uint8Array(8);
      crypto.getRandomValues(arr);
      const suffix = Array.prototype.map.call(arr, x => ('00' + x.toString(16)).slice(-2)).join('');
      
      const cardKey = `vip_${cardCredits}x_${suffix}`;
      generatedCards.push(cardKey);

      batchStmts.push(
        db.prepare("INSERT INTO cards (card_key, credits, is_used) VALUES (?, ?, 0)").bind(cardKey, cardCredits)
      );
    }

    await db.batch(batchStmts);

    return new Response(JSON.stringify({
      success: true,
      message: `成功批量生成了 ${generateCount} 张面额为 ${cardCredits} 点的 VIP 卡密！`,
      cards: generatedCards
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: '批量生成卡密失败: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
