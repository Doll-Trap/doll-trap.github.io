# Cloudflare Workers 部署指南

## 前置条件

1. 注册 [Cloudflare 账号](https://cloudflare.com)
2. 开通 **Workers Paid 计划（$5/月）** — bcrypt 需要更高 CPU 时间上限
3. 从 Neon 控制台获取 `DATABASE_URL`（格式：`postgresql://user:pass@host/db?sslmode=require`）

---

## 第一步：安装依赖

```bash
cd worker
npm install
```

---

## 第二步：登录 Cloudflare

```bash
npx wrangler login
```

---

## 第三步：设置环境变量（Secrets）

逐条运行以下命令，每次命令会提示你输入值：

```bash
# Neon 数据库连接字符串（从 Neon 控制台 → Connection string 复制）
npx wrangler secret put DATABASE_URL

# JWT 密钥（和现在 Render 上的 JWT_SECRET 一样）
npx wrangler secret put JWT_SECRET

# Supabase 项目 URL
npx wrangler secret put SUPABASE_URL

# Supabase Service Role Key
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

---

## 第四步：本地测试

```bash
npm run dev
```

Worker 会运行在 http://localhost:8787，测试 health check：

```bash
curl http://localhost:8787/api/health
# → {"status":"Backend is running"}
```

---

## 第五步：部署

```bash
npm run deploy
```

部署成功后会输出 Worker URL，格式类似：

```
https://dolltrap-worker.YOUR_SUBDOMAIN.workers.dev
```

---

## 第六步：更新前端 API URL

把 Worker URL 中的账号子域名复制，然后在项目根目录执行：

```bash
# 把 WORKERS_SUBDOMAIN 替换成你的实际子域名（例如 abc123）
find docs/ -type f \( -name "*.html" -o -name "*.js" \) \
  -exec sed -i '' 's/WORKERS_SUBDOMAIN/你的子域名/g' {} +
```

然后提交并推送到 GitHub，前端（GitHub Pages）就会自动更新。

---

## 第七步（可选）：绑定自定义域名

在 Cloudflare 控制台 → Workers → 你的 Worker → Settings → Domains & Routes，
添加自定义路由，例如 `api.yourdomain.com/*`。

绑定后更新 `docs/` 里的 `WORKERS_SUBDOMAIN.workers.dev` 为自定义域名。

---

## 关于 Cloudflare Pages（前端）

如果你也想把前端迁到 Cloudflare Pages（替换 GitHub Pages）：

1. Cloudflare 控制台 → Pages → Create a project → Connect to Git
2. 选择你的 GitHub repo
3. Build settings：
   - Framework preset: None
   - Build command: （空）
   - Build output directory: `docs`
4. 部署完成后在 Pages 设置里绑定自定义域名

---

## 文件结构总览

```
worker/
  src/
    index.ts              # 主入口，CORS + 路由挂载
    types.ts              # Env 类型定义
    db.ts                 # Neon Pool 工厂（复用连接）
    middleware/
      auth.ts             # Admin JWT 验证
      memberAuth.ts       # Member JWT 验证
    routes/
      auth.ts             # POST /api/auth/login|register|verify|change-password
      events.ts           # GET|POST|PUT|DELETE /api/events + poster 上传
      photos.ts           # GET|POST|PUT|DELETE /api/photos + 文件上传
      videos.ts           # GET|POST|PUT|DELETE /api/videos
      members.ts          # 注册/登录/收藏/打卡/留言/应援 全套
  wrangler.toml           # Worker 配置
  package.json
  tsconfig.json
```

## 关键变更说明

| 原来 | 现在 |
|------|------|
| Express + Node.js | Hono + Cloudflare Workers |
| `pg` Pool (TCP) | `@neondatabase/serverless` Pool (WebSocket/HTTP) |
| `jsonwebtoken` | `hono/jwt`（Web Crypto API，Workers 原生支持） |
| `multer` | `c.req.formData()`（Workers 原生 File API） |
| `process.env.X` | `c.env.X`（Wrangler Secrets） |
| Render 冷启动 30-60s | Workers 零冷启动 |
