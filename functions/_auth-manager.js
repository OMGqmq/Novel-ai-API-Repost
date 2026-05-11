/**
 * Auth Manager for NovelAI Proxy
 * Handles authentication, VIP card verification, and rate limiting.
 */

export async function authenticate(request, env) {
  const SERVER_API_KEY = env.NOVELAI_API_KEY;
  const kv = env.NAI_LIMIT;

  // 1. Get identifiers from headers
  const customApiKey = (request.headers.get('x-custom-api-key') || "").trim();
  const adminToken = (request.headers.get('x-admin-token') || "").trim();
  const userKey = (request.headers.get('x-user-key') || "").trim();
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

  // C. VIP Card User
  if (userKey && kv) {
    const creditsStr = await kv.get(`card:${userKey}`);
    if (creditsStr === null) {
      throw new AuthError("无效的卡密，请检查输入或联系卖家。", 403);
    }

    remainingCredits = parseInt(creditsStr);
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

  // D. Free Guest
  if (kv) {
    const today = new Date().toISOString().split('T')[0];
    const globalKey = `global:${today}`;
    const ipKey = `limit:${today}:${clientIP}`;

    const [globalCount, ipCount] = await Promise.all([
      kv.get(globalKey).then(v => parseInt(v || "0")),
      kv.get(ipKey).then(v => parseInt(v || "0"))
    ]);

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
        waitUntil(Promise.all([
          kv.put(globalKey, (globalCount + 1).toString(), { expirationTtl: 86400 }),
          kv.put(ipKey, (ipCount + 1).toString(), { expirationTtl: 86400 })
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
