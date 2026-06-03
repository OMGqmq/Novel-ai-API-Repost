-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT DEFAULT 'User', -- 'User' | 'Admin'
    credits INTEGER DEFAULT 10, -- 注册默认赠送10次
    status TEXT DEFAULT 'Pending', -- 'Pending' | 'Approved' | 'Banned'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 卡密表 (新增使用状态及关联字段)
CREATE TABLE IF NOT EXISTS cards (
    card_key TEXT PRIMARY KEY,
    credits INTEGER NOT NULL,
    is_used INTEGER DEFAULT 0, -- 0: 未使用, 1: 已使用
    used_by_id INTEGER, -- 关联 users.id
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 免费用户/IP每日限流表 (保留原限流系统)
CREATE TABLE IF NOT EXISTS free_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 额度变动日志表 (可选，记录充值和生成扣点)
CREATE TABLE IF NOT EXISTS credit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL, -- 'register' | 'recharge' | 'generate'
    amount INTEGER NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. 索引优化 (用于加速关联查询与状态过滤)
CREATE INDEX IF NOT EXISTS idx_credit_logs_user_id ON credit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_cards_used_by_id ON cards (used_by_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

