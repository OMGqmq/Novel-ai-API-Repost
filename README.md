# NovelAI API Proxy & Client

这是一个部署在 Cloudflare Pages 上的 NovelAI API 代理与前端客户端项目。它支持出图、局部重绘、外扩、Vibe 风格参考等丰富功能，并包含基于 Cloudflare D1 数据库的卡密余额扣费与免费限流系统。

---

## 1. 如何在 Cloudflare 配置你的 NovelAI Key？

1. 登录 [NovelAI 官网](https://novelai.net/)，进入账户设置 (Settings)，生成你的 Persistent Key (在 Account -> Get Persistent API Token)。
   > [!WARNING]
   > 请确保你订阅了 **Opus** 级别，否则在画图时会消耗你的 Anlas 点数。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，进入 **Workers & Pages**。
3. 进入你部署的 Pages 项目，点击 **Settings (设置)** -> **Environment Variables (环境变量)**。
4. 添加一个环境变量：
   * **Variable name**: `NOVELAI_API_KEY`
   * **Value**: 你的 NovelAI Persistent Key (例如：`pst-*****...`)
5. 点击 **Save (保存)**。

---

## 2. 如何在 Cloudflare 配置 D1 数据库？

本项目使用 Cloudflare D1 (SQLite) 存储卡密余额和每日免费限流记录，以支持高并发与高限额。

### 第一步：创建 D1 数据库
1. 在 Cloudflare Dashboard 左侧菜单中点击 **Workers & Pages** -> **D1**。
2. 点击 **Create database** -> 选择 **Dashboard**。
3. 数据库命名为 `nai_db`（或自定义），点击 **Create**。

### 第二步：绑定数据库到 Pages 项目
1. 进入你的 Pages 项目 -> 点击 **Settings (设置)** -> **Functions (函数)**。
2. 滚动到 **D1 database bindings (D1 数据库绑定)** 区域，点击 **Add binding**：
   * **Variable name (变量名)**: `DB` (必须完全大写且为 DB)
   * **D1 database (D1 数据库)**: 选择你刚刚创建的 `nai_db`。
3. 点击 **Save (保存)**。

### 第三步：初始化数据表
1. 进入你刚刚创建的 D1 数据库页面，点击顶部的 **Console (控制台)**。
2. 复制并粘贴以下 SQL 初始化语句，然后点击 **Execute (执行)**：

```sql
-- 1. 创建卡密余额表
CREATE TABLE IF NOT EXISTS cards (
    card_key TEXT PRIMARY KEY,
    credits INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建免费用户/IP每日限流表
CREATE TABLE IF NOT EXISTS free_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. 如何配置管理员密码？

配置管理员密码后，你可以使用管理员身份直接免卡密出图。

1. 进入你的 Pages 项目 -> **Settings (设置)** -> **Environment Variables (环境变量)**。
2. 添加一个环境变量：
   * **Variable name**: `ADMIN_TOKEN`
   * **Value**: 你的专属密码 (例如：`mypassword123`)
3. 点击 **Save (保存)** 并重新部署。
