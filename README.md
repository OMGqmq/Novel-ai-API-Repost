# NovelAI API Proxy & Client

这是一个部署在 Cloudflare Pages 上的 NovelAI API 代理与前端客户端项目。它不仅提供美观的高级出图界面，更搭载了**无限扩图（Outpainting）**、**局部重绘（Inpainting）**、**氛围/角色参考（Vibe/Char Ref）**以及**高性能 D1 数据库计费限流系统**。
<img width="1272" height="2194" alt="Image" src="https://github.com/user-attachments/assets/1e29ca5a-86f0-4223-9622-08c51189d327" />
---

## 🌟 核心功能一览

### 🎨 1. 无限扩图 (Infinite Outpainting)
本项目配备了功能极其强大的**画布级扩图编辑器**。无论您的初始画幅有多小，都可以通过简单的画布拖拽和智能生成，向任意方向进行无限的画卷延展。
* **自由视口画布**：支持使用鼠标滚轮（或触控板缩放）以及中键拖拽，实现对画布进行任意角度和尺寸的平移与缩放。
* **选区精准定位与吸附 (Edge Snap)**：外扩框可任意移动、缩放。开启“边缘吸附”功能后，选区会自动贴合已有图像的边缘，确保拼接处的物理衔接完全无缝。
* **内置蒙版画笔**：可在画布上涂抹自定义遮罩，手动微调需要重绘过渡的区域，提供更为精准的生成控制。
* **无缝纹理融合**：调用 NovelAI 的 `infill` 算法进行重塑，自动识别已有画面的主体风格、光源、透视，实现宛如一体的向外拓展。
* **多步历史撤销 (Undo/Redo)**：支持最高 10 步的历史画布状态记录，任何一步不满意都可以随时撤销重来。

### 🖌️ 2. 局部重绘 (Inpainting)
* 配合高灵敏度的涂抹笔刷，可直接对画面局部（如面部微调、服装更换、消除多余元素）进行遮罩重绘，支持独立设置重绘强度（Denoising Strength）等高级参数。

### 👥 3. 氛围与角色一致性参考 (Vibe & Char Ref)
* **Vibe Transfer (风格氛围迁移)**：支持上传参考图，并可针对每张参考图设置独立的强度（Strength）与信息提取权重（Information Extracted），精准借鉴参考图的配色与氛围。
* **Character Reference (角色参考)**：配合 V4.5 等新模型，实现极高的角色面部及装扮一致性保留。

### 📚 4. 搜词与笔记助手 (Prompt Helper & Notebook)
* **双语搜词库**：内置数万个 NovelAI 常用中英文 Prompt 标签，支持拼音首字母/中文/英文模糊搜索与Debounce即时检索。
* **个人云笔记/本地备份**：支持一键收藏当前所有生成参数和提示词到笔记本中，并可导出为 JSON 文件进行本地备份与多端迁移。

### 🛡️ 5. 多 Key 并发轮询与容灾 (Multi-Key Failover)
* 前端支持同时配置多个自定义 API Key。系统在发起请求时会自动检测 Key 的健康状态。当某个 Key 意外失效或耗尽额度时，会自动、无感知地切换至下一个 Key 进行重试，保证高并发下的服务稳定性。

### 💾 6. 高性能 D1 数据库计费与限流 (D1 Billing)
* 相比于普通 KV 存储，本项目全面升级为 **Cloudflare D1 边缘 SQL 数据库**：
  * **高并发扣费一致性**：使用 SQL 事务处理，彻底杜绝高频快速出图时发生的“扣费漏单（双花）”漏洞。
  * **巨量免费额度**：每日支持高达 **10 万次** 的写入（卡密扣点）和 **500 万次** 的读取，可免费支撑数千日活用户的商用变现。

---

## ⚙️ 部署与配置指南

### 1. 配置 NovelAI 官方 Key
1. 登录 [NovelAI 官网](https://novelai.net/)，进入账户设置 (Settings)，在 Account -> **Get Persistent API Token** 生成 Key。
   > [!WARNING]
   > 请确保你订阅了 **Opus** 级别，否则在画图时会消耗你的 Anlas 点数。
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) -> **Workers & Pages** -> 进入 Pages 项目。
3. 点击 **Settings (设置)** -> **Environment Variables (环境变量)** -> 添加变量：
   * **Variable name**: `NOVELAI_API_KEY`
   * **Value**: 你的 NovelAI Persistent Key (例如：`pst-*****...`)

### 2. 配置 D1 数据库 (卡密计费及限流)
1. 在 Cloudflare Dashboard 左侧菜单中点击 **Workers & Pages** -> **D1**。
2. 点击 **Create database** -> **Dashboard** -> 命名为 `nai_db` 并创建。
3. 回到您的 Pages 项目 -> **Settings** -> **Functions**。
4. 找到 **D1 database bindings (D1 数据库绑定)** 区域，点击 **Add binding**：
   * **Variable name (变量名)**: `DB` (必须完全大写)
   * **D1 database**: 选择刚才创建的 `nai_db`。
   * 点击 **Save (保存)**。

### 3. 初始化数据表
在您创建的 D1 数据库详情页中，点击顶部的 **Console (控制台)**，复制粘贴并执行以下 SQL 语句：

```sql
-- 1. 创建卡密余额表
CREATE TABLE IF NOT EXISTS cards (
    card_key TEXT PRIMARY KEY,
    credits INTEGER NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- 2. 创建免费用户/IP每日限流表
CREATE TABLE IF NOT EXISTS free_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);
```

### 4. 配置管理员密码
1. 进入 Pages 项目 -> **Settings** -> **Environment Variables**，添加变量：
   * **Variable name**: `ADMIN_TOKEN`
   * **Value**: 你的专属管理员密码 (例如：`mypassword123`)
2. 点击 **Save** 并重新部署。在网页端输入此密码即可无限制免费使用您的官方 Key。
