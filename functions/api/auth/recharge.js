import { verifyJwt } from '../../_crypto-helper.js';

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

  // 1. 验证用户 JWT
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: '未提供合法的登录凭证' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.substring(7);
  const jwtSecret = env.JWT_SECRET || "novelai-default-jwt-secret-key-987654";
  const payload = await verifyJwt(token, jwtSecret);

  if (!payload) {
    return new Response(JSON.stringify({ error: '登录会话已过期，请重新登录。' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { cardKey } = await request.json();
    if (!cardKey || typeof cardKey !== 'string') {
      return new Response(JSON.stringify({ error: '请输入卡密' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const trimmedCardKey = cardKey.trim();

    // 2. 检查卡密有效性
    const card = await db.prepare("SELECT * FROM cards WHERE card_key = ?").bind(trimmedCardKey).first();
    if (!card) {
      return new Response(JSON.stringify({ error: '无效的卡密，请检查输入或联系卖家。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (card.is_used === 1) {
      return new Response(JSON.stringify({ error: '该卡密已被使用，请勿重复充值。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. 校验用户是否存在
    const user = await db.prepare("SELECT credits FROM users WHERE id = ?").bind(payload.id).first();
    if (!user) {
      return new Response(JSON.stringify({ error: '用户不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const currentCredits = user.credits;
    const addedCredits = card.credits;
    const newCredits = currentCredits + addedCredits;

    // 4. 原子性操作：使用 D1 batch 执行事务
    const updateCard = db.prepare(
      "UPDATE cards SET is_used = 1, used_by_id = ?, used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE card_key = ? AND is_used = 0"
    ).bind(payload.id, trimmedCardKey);

    const updateUser = db.prepare(
      "UPDATE users SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(addedCredits, payload.id);

    const writeLog = db.prepare(
      "INSERT INTO credit_logs (user_id, action, amount, description) VALUES (?, 'recharge', ?, ?)"
    ).bind(payload.id, addedCredits, `充值卡密: ${trimmedCardKey}`);

    // D1 batch 会原子性地运行这三条 SQL
    const results = await db.batch([updateCard, updateUser, writeLog]);
    
    // 检查更新行数确保卡密没有被并发抢充
    const cardUpdateResult = results[0];
    if (cardUpdateResult.meta.changes === 0) {
      return new Response(JSON.stringify({ error: '卡密已被充值，请刷新后重试。' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `充值成功！已成功为您的账户充值 ${addedCredits} 点额度。`,
      credits: newCredits
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: '充值处理异常: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
