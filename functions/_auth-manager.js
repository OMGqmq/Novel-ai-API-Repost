/**
 * Auth Manager for NovelAI Proxy
 * Handles authentication, JWT users, VIP card verification, and rate limiting.
 */

import { verifyJwt } from './_crypto-helper.js';
import { GUEST_DAILY_IP_LIMIT, GUEST_DAILY_GLOBAL_LIMIT, USER_DAILY_FREE_LIMIT } from './_config.js';

export async function authenticate(request, env) {
  const SERVER_API_KEY = env.NOVELAI_API_KEY;
  const db = env.DB;

  // 1. Get identifiers from headers
  const customApiKey = (request.headers.get('x-custom-api-key') || "").trim();
  const adminToken = (request.headers.get('x-admin-token') || "").trim();
  const userKey = (request.headers.get('x-user-key') || "").trim();
  const authHeader = (request.headers.get('Authorization') || "").trim();
  const clientIP = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Real-IP') || 
                   request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 
                   'unknown';
  const serverAdminToken = (env.ADMIN_TOKEN || "").trim();

  let isVip = false;
  let remainingCredits = -1;
  let userRole = "Free";
  let apiKey = customApiKey || SERVER_API_KEY;

  if (!apiKey) {
    throw new Error('服务器未配置 NOVELAI_API_KEY');
  }

  // A. Custom API Key (Highest priority, acts as admin)
  if (customApiKey) {
    return { apiKey, isVip: true, userRole: "CustomAPI", remainingCredits: -1 };
  }

  // B. Admin Token
  if (serverAdminToken && adminToken === serverAdminToken) {
    return { apiKey, isVip: true, userRole: "Admin", remainingCredits: -1 };
  }

  // C. Registered JWT User
  if (authHeader.startsWith('Bearer ') && db) {
    const token = authHeader.substring(7);
    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AuthError("服务器未配置 JWT_SECRET", 500);
    }
    const payload = await verifyJwt(token, jwtSecret);
    
    if (payload) {
      const user = await db.prepare("SELECT id, username, role, credits FROM users WHERE id = ?").bind(payload.id).first();
      if (!user) {
        throw new AuthError("用户不存在，请重新登录。", 403);
      }

      // 获取当前北京时间日期并计算用户的每日免费已用额度
      const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
      const userLimitKey = `user_limit:${today}:${user.id}`;
      const userLimitRow = await db.prepare("SELECT count FROM free_limits WHERE key = ?").bind(userLimitKey).first();
      const userLimitCount = userLimitRow ? userLimitRow.count : 0;

      const dailyFreeLimit = USER_DAILY_FREE_LIMIT;
      const hasFreeDaily = userLimitCount < dailyFreeLimit;

      remainingCredits = user.credits;
      if (!hasFreeDaily && (isNaN(remainingCredits) || remainingCredits <= 0)) {
        throw new AuthError("您的每日免费额度和长期余额已用尽，请充值后使用。", 402);
      }

      return {
        apiKey,
        isVip: true,
        userRole: hasFreeDaily 
          ? `用户:${user.username} (日免:${dailyFreeLimit - userLimitCount})` 
          : `用户:${user.username} (余:${remainingCredits - 1})`,
        remainingCredits,
        userId: user.id,
        authType: 'JWT',
        useDailyLimit: hasFreeDaily,
        userLimitKey
      };
    } else {
      throw new AuthError("登录状态已过期，请重新登录。", 401);
    }
  }

  // D. Legacy VIP Card User
  if (userKey && db) {
    const card = await db.prepare("SELECT credits FROM cards WHERE card_key = ?").bind(userKey).first();
    if (card === null) {
      throw new AuthError("无效的卡密，请检查输入或联系卖家。", 403);
    }

    remainingCredits = card.credits;
    if (isNaN(remainingCredits) || remainingCredits <= 0) {
      throw new AuthError("您的卡密余额已耗尽，请购买新卡密。", 402);
    }

    return { 
      apiKey, 
      isVip: true, 
      userRole: `VIP (余:${remainingCredits - 1})`, 
      remainingCredits,
      userKey // Needed for post-generation deduction
    };
  }

  // E. Free Guest
  if (db) {
    // 使用北京时间 (UTC+8) 避免在 00:00 - 08:00 期间因 UTC 时区差被判定为前一天
    const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
    const globalKey = `global:${today}`;
    const ipKey = `limit:${today}:${clientIP}`;

    const [globalRow, ipRow] = await Promise.all([
      db.prepare("SELECT count FROM free_limits WHERE key = ?").bind(globalKey).first(),
      db.prepare("SELECT count FROM free_limits WHERE key = ?").bind(ipKey).first()
    ]);

    const globalCount = globalRow ? globalRow.count : 0;
    const ipCount = ipRow ? ipRow.count : 0;

    if (globalCount >= GUEST_DAILY_GLOBAL_LIMIT) {
      throw new AuthError("今日全站免费算力已耗尽，请使用卡密或明天再来。", 429);
    }
    if (ipCount >= GUEST_DAILY_IP_LIMIT) {
      throw new AuthError(`今日免费额度已用完 (${GUEST_DAILY_IP_LIMIT}/${GUEST_DAILY_IP_LIMIT})。购买卡密可解锁更多次数。`, 429);
    }

    // Increment counters (not blocking)
    return {
      apiKey,
      isVip: false,
      userRole: "Free",
      remainingCredits: 0,
      globalKey,
      ipKey,
      async recordUsage(waitUntil) {
        const sql = `
          INSERT INTO free_limits (key, count, updated_at) 
          VALUES (?, 1, datetime('now', '+8 hours'))
          ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = datetime('now', '+8 hours')
        `;
        waitUntil(Promise.all([
          db.prepare(sql).bind(globalKey).run(),
          db.prepare(sql).bind(ipKey).run()
        ]));
      }
    };
  }

  // 若无数据库绑定，且未通过自定义 Key 或 Admin Token 校验，则禁止访问以保障官方 Key 额度安全
  throw new AuthError("系统未配置或无法连接数据库，暂不支持免费体验", 503);
}

export async function preDeductQuota(auth, env) {
  if (!auth || !env || !env.DB) {
    return { type: 'none' };
  }

  const { isVip, userRole, authType, userId, useDailyLimit, userLimitKey, userKey, globalKey, ipKey } = auth;

  // 1. 自定义 API Key 或管理员无需扣费
  if (userRole === 'CustomAPI' || userRole === 'Admin') {
    return { type: 'none' };
  }

  // 2. JWT 注册用户
  if (authType === 'JWT' && userId) {
    // 优先尝试原子自增每日免费额度
    if (useDailyLimit && userLimitKey) {
      const dailyFreeLimit = USER_DAILY_FREE_LIMIT;
      const sql = `
        INSERT INTO free_limits (key, count, updated_at) 
        VALUES (?, 1, datetime('now', '+8 hours'))
        ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = datetime('now', '+8 hours')
        WHERE free_limits.count < ?
      `;
      const res = await env.DB.prepare(sql).bind(userLimitKey, dailyFreeLimit).run();
      if (res && res.meta && res.meta.changes > 0) {
        return { type: 'user_daily', key: userLimitKey };
      }
      // 如果免费额度已在并发中用尽，则降级尝试扣减账户长期余额
    }

    // 原子扣减用户长期余额
    const updateStmt = env.DB.prepare(
      "UPDATE users SET credits = credits - 1, updated_at = datetime('now', '+8 hours') WHERE id = ? AND credits > 0"
    );
    const res = await updateStmt.bind(userId).run();
    if (!res || !res.meta || res.meta.changes === 0) {
      throw new AuthError("您的每日免费额度和长期余额已用尽，请充值后使用。", 402);
    }
    return { type: 'user_credits', userId };
  }

  // 3. VIP 卡密用户
  if (userKey && userRole && userRole.startsWith("VIP")) {
    const updateStmt = env.DB.prepare(
      "UPDATE cards SET credits = credits - 1, updated_at = datetime('now', '+8 hours') WHERE card_key = ? AND credits > 0"
    );
    const res = await updateStmt.bind(userKey).run();
    if (!res || !res.meta || res.meta.changes === 0) {
      throw new AuthError("您的卡密余额已耗尽，请购买新卡密。", 402);
    }
    return { type: 'card_credits', userKey };
  }

  // 4. 免费访客 (记录全局与 IP 限制预增)
  if (!isVip && globalKey && ipKey) {
    const sql = `
      INSERT INTO free_limits (key, count, updated_at) 
      VALUES (?, 1, datetime('now', '+8 hours'))
      ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = datetime('now', '+8 hours')
    `;
    await Promise.all([
      env.DB.prepare(sql).bind(globalKey).run(),
      env.DB.prepare(sql).bind(ipKey).run()
    ]);
    return { type: 'guest_limit', globalKey, ipKey };
  }

  return { type: 'none' };
}

export async function rollbackQuota(receipt, env) {
  if (!receipt || !receipt.type || receipt.type === 'none' || !env || !env.DB) {
    return;
  }

  try {
    if (receipt.type === 'user_credits' && receipt.userId) {
      await env.DB.prepare(
        "UPDATE users SET credits = credits + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?"
      ).bind(receipt.userId).run();
    } else if (receipt.type === 'user_daily' && receipt.key) {
      await env.DB.prepare(
        "UPDATE free_limits SET count = MAX(0, count - 1), updated_at = datetime('now', '+8 hours') WHERE key = ?"
      ).bind(receipt.key).run();
    } else if (receipt.type === 'card_credits' && receipt.userKey) {
      await env.DB.prepare(
        "UPDATE cards SET credits = credits + 1, updated_at = datetime('now', '+8 hours') WHERE card_key = ?"
      ).bind(receipt.userKey).run();
    } else if (receipt.type === 'guest_limit' && receipt.globalKey && receipt.ipKey) {
      const sql = "UPDATE free_limits SET count = MAX(0, count - 1), updated_at = datetime('now', '+8 hours') WHERE key = ?";
      await Promise.all([
        env.DB.prepare(sql).bind(receipt.globalKey).run(),
        env.DB.prepare(sql).bind(receipt.ipKey).run()
      ]);
    }
  } catch (err) {
    console.error("Rollback quota failed:", err);
  }
}

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

