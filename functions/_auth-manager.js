/**
 * Auth Manager for NovelAI Proxy
 * Handles authentication, JWT users, VIP card verification, and rate limiting.
 */

import { verifyJwt } from './_crypto-helper.js';

export async function authenticate(request, env) {
  const SERVER_API_KEY = env.NOVELAI_API_KEY;
  const db = env.DB;

  // 1. Get identifiers from headers
  const customApiKey = (request.headers.get('x-custom-api-key') || "").trim();
  const adminToken = (request.headers.get('x-admin-token') || "").trim();
  const userKey = (request.headers.get('x-user-key') || "").trim();
  const authHeader = (request.headers.get('Authorization') || "").trim();
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
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
    const jwtSecret = env.JWT_SECRET || "novelai-default-jwt-secret-key-987654";
    const payload = await verifyJwt(token, jwtSecret);
    
    if (payload) {
      const user = await db.prepare("SELECT id, username, role, credits FROM users WHERE id = ?").bind(payload.id).first();
      if (!user) {
        throw new AuthError("用户不存在，请重新登录。", 403);
      }

      remainingCredits = user.credits;
      if (isNaN(remainingCredits) || remainingCredits <= 0) {
        throw new AuthError("您的账户余额已用尽，请充值后使用。", 402);
      }

      return {
        apiKey,
        isVip: true,
        userRole: `用户:${user.username} (余:${remainingCredits - 1})`,
        remainingCredits,
        userId: user.id,
        authType: 'JWT'
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
    const today = new Date().toISOString().split('T')[0];
    const globalKey = `global:${today}`;
    const ipKey = `limit:${today}:${clientIP}`;

    const [globalRow, ipRow] = await Promise.all([
      db.prepare("SELECT count FROM free_limits WHERE key = ?").bind(globalKey).first(),
      db.prepare("SELECT count FROM free_limits WHERE key = ?").bind(ipKey).first()
    ]);

    const globalCount = globalRow ? globalRow.count : 0;
    const ipCount = ipRow ? ipRow.count : 0;

    if (globalCount >= 200) {
      throw new AuthError("今日全站免费算力已耗尽，请使用卡密或明天再来。", 429);
    }
    if (ipCount >= 5) {
      throw new AuthError("今日免费额度已用完 (5/5)。购买卡密可解锁更多次数。", 429);
    }

    // Increment counters (not blocking)
    return {
      apiKey,
      isVip: false,
      userRole: "Free",
      remainingCredits: 0,
      async recordUsage(waitUntil) {
        const sql = `
          INSERT INTO free_limits (key, count, updated_at) 
          VALUES (?, 1, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = CURRENT_TIMESTAMP
        `;
        waitUntil(Promise.all([
          db.prepare(sql).bind(globalKey).run(),
          db.prepare(sql).bind(ipKey).run()
        ]));
      }
    };
  }

  return { apiKey, isVip: false, userRole: "Free", remainingCredits: 0 };
}

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

