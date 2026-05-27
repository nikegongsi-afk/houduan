# 后端 Render 部署指南

仓库：https://github.com/nikegongsi-afk/houduan

部署完成后 API 地址示例：`https://houduan-api.onrender.com`

---

## 一、Render 创建服务

1. 打开 https://dashboard.render.com
2. 点击 **New +** → **Web Service**
3. 连接 GitHub 账号，选择仓库 **nikegongsi-afk/houduan**
4. 按下面填写：

| 配置项 | 填写内容 |
|--------|----------|
| Name | `houduan-api` |
| Region | 选离用户近的（如 Singapore / Oregon） |
| Branch | `main` |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | Free（测试）或 Paid（生产） |

5. 展开 **Environment**，添加变量：

| Key | Value |
|-----|-------|
| NODE_ENV | production |
| SUPABASE_URL | 本地 .env 里的值 |
| SUPABASE_KEY | 本地 .env 里的值 |
| OPENAI_API_KEY | 本地 .env 里的值 |
| SESSION_SECRET | 本地 .env 里的值或随机长字符串 |
| Web_Trader_UUID | 39968c24-67bd-4f12-a5e4-ff959ce03c50 |

6. 点击 **Create Web Service**，等待部署完成（约 3–5 分钟）

---

## 二、验证

部署成功后 Render 会给你一个地址，例如：

`https://houduan-api.onrender.com`

浏览器访问：

- `https://你的地址/health` → 应返回 `{"success":true,"status":"ok"}`
- `https://你的地址/` → 应返回 API 运行信息

---

## 三、绑定自定义域名（可选）

若要用 `api.jack-ablin.com`：

1. Render 服务页 → **Settings** → **Custom Domains**
2. 添加 `api.jack-ablin.com`
3. 按 Render 提示在 Cloudflare DNS 添加 CNAME 记录
4. 前端 `VITE_API_URL` 改为 `https://api.jack-ablin.com`

---

## 四、与前端联调

修改前端 `wrangler.toml`：

```toml
VITE_API_URL = "https://houduan-api.onrender.com"
```

（或你的自定义域名）

---

## 注意

- Render 免费版冷启动约 30–60 秒，首次请求可能较慢
- 不要把 `.env` 提交到 GitHub，只在 Render Dashboard 填环境变量
- 定时任务在 Render 上可正常运行（无需 DISABLE_SCHEDULER）
