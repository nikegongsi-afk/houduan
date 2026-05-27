# 后端 Cloudflare 部署指南

本项目后端已支持部署到 **Cloudflare Workers**（Express + Supabase）。

目标地址：
- 测试域名：`https://jack-ablin-api.<你的账号>.workers.dev`
- 正式域名：`https://api.jack-ablin.com`

---

## 一、部署前准备

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/login)
2. 确认域名 `jack-ablin.com` 已在 Cloudflare 账号中
3. 在本机后端目录安装依赖：

```bash
cd api--wangye/stock-webapi-2025-12-29
npm install
```

4. 复制环境变量模板（本地开发用）：

```bash
cp .env.example .env
```

---

## 二、在 Cloudflare Dashboard 创建 Worker

### 方式 A：命令行部署（推荐）

1. 登录 Wrangler：

```bash
npx wrangler login
```

2. 设置 Secrets（敏感信息，不要写进 wrangler.toml）：

```bash
npx wrangler secret put SUPABASE_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put SESSION_SECRET
```

按提示分别粘贴 `.env` 里对应的值。

3. 本地测试 Worker：

```bash
npm run worker:dev
```

浏览器访问：`http://127.0.0.1:8787/health`

4. 部署到 Cloudflare：

```bash
npm run worker:deploy
```

### 方式 B：Dashboard 手动部署

1. 打开 [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages)
2. 点击 **Create** → **Create Worker**
3. Worker 名称填写：`jack-ablin-api`
4. 在 **Settings → Variables** 中添加：

| 类型 | 名称 | 值 |
|------|------|-----|
| Plain text | NODE_ENV | production |
| Plain text | SUPABASE_URL | 你的 Supabase URL |
| Plain text | Web_Trader_UUID | 39968c24-67bd-4f12-a5e4-ff959ce03c50 |
| Plain text | DISABLE_SCHEDULER | true |
| Plain text | DISABLE_LOCAL_FS | true |
| Secret | SUPABASE_KEY | Supabase Key |
| Secret | OPENAI_API_KEY | OpenAI Key |
| Secret | SESSION_SECRET | 随机长字符串 |

5. 使用 CLI 上传代码（Dashboard 直接编辑不适合整个 Express 项目）：

```bash
npm run worker:deploy
```

---

## 三、绑定自定义域名 api.jack-ablin.com

部署成功后：

1. 进入 Worker：`jack-ablin-api`
2. 打开 **Settings → Domains & Routes**
3. 点击 **Add** → **Custom Domain**
4. 输入：`api.jack-ablin.com`
5. Cloudflare 会自动创建 DNS 记录并启用 HTTPS

或在 `wrangler.toml` 中已配置：

```toml
[[routes]]
pattern = "api.jack-ablin.com/*"
zone_name = "jack-ablin.com"
```

重新执行 `npm run worker:deploy` 即可。

---

## 四、部署验证

```bash
curl https://api.jack-ablin.com/health
curl https://api.jack-ablin.com/
```

期望返回：

```json
{"success":true,"status":"ok"}
```

查看实时日志：

```bash
npm run worker:tail
```

---

## 五、与前端联调

后端上线后，把前端 Worker 的 API 地址改为新域名。

修改 `web--wangye/stock-web-2025-12-29/wrangler.toml`：

```toml
VITE_API_URL = "https://api.jack-ablin.com"
```

然后重新部署前端 Worker。

---

## 六、注意事项

1. **定时任务**：Workers 环境默认 `DISABLE_SCHEDULER=true`，如需 Cron 请在 Cloudflare 配置 **Triggers → Cron Triggers**。
2. **文件上传**：上传走 Supabase Storage（内存 buffer），不依赖本地磁盘。
3. **本地开发**：仍使用 `npm run dev`，端口默认 8888。
4. **旧 Render 地址**：`https://apistock-1hgl.onrender.com` 可在验证新 API 正常后停用。

---

## 七、常见问题

### 1. 部署报未登录

```bash
npx wrangler login
```

### 2. API 返回 500

检查 Secrets 是否都已设置：

```bash
npx wrangler secret list
```

### 3. 域名无法访问

确认 `jack-ablin.com` 的 DNS 在 Cloudflare 托管，且 Worker 路由已绑定 `api.jack-ablin.com/*`。

### 4. CORS 问题

后端已设置 `cors({ origin: '*' })`，一般无需额外配置。
