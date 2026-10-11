# Voidream 互动圈：Cloudflare 免费部署

公开入口为 `https://voidream-web.pages.dev/circle/`。生成、统计查询、透明 PNG 下载和自定义图片背景均无需登录。图片背景只在浏览器处理，不上传服务器。后台管理沿用独立管理员保护。

两个仓库继续独立维护。Next.js 15 使用官方维护的 OpenNext Cloudflare 适配器，D1 保存圈子、生成日志、公告、反馈及设置。算法、评分和图片渲染复用原项目。部署未启用 R2、付费 Images、Durable Objects、收费缓存或付费套餐。

## 环境

- 测试：`voidream-nekocircle-staging` Worker，`voidream-nekocircle-test` D1。
- 正式：`voidream-nekocircle` Worker，`voidream-nekocircle-production` D1。
- 本地 SQLite：`runtime/data/circle.db`，与两个 D1 环境分离。
- 主站的数据库不属于本项目，部署脚本拒绝不符合互动圈命名的数据库及额外存储绑定。

首次迁移之后，本地 SQLite 与正式 D1 独立运行，线上新圈子不会自动回写本地文件。未来迁回 Node/SQLite 时应先导出最新正式 D1，再导入新的 SQLite；不要用本地旧数据库覆盖线上数据。

## 初始化及密钥

```powershell
npm ci
node scripts/local-runtime.mjs init
npx tsx scripts/cloudflare-secrets.ts staging
npx wrangler secret bulk runtime/cloudflare-staging.secrets.json --config wrangler.staging.jsonc
```

正式环境将 `staging` 换成 `production`。管理员密码存放于被 Git 忽略的 `runtime/administrator.secrets.txt`，请在本机读取并妥善保管，不要发到聊天或提交到 GitHub。JWT_SECRET、ADMIN_JWT_SECRET、ADMIN_PASSWORD_HASH、ADMIN_PASSWORD_PEPPER 均通过 Cloudflare Secrets 管理。两个环境分别生成随机密钥。

Cloudflare 管理密码采用带独立 pepper 的 PBKDF2-SHA256（100,000 次；workerd 的原生上限），本地 SQLite 继续支持 bcrypt。数据库记录优先于初始密码哈希 Secret，后台改密后不会恢复旧密码。公开首次设置管理员已关闭。

## 本地启动和停止

SQLite 方式：

```powershell
node scripts/local-runtime.mjs build
node scripts/local-runtime.mjs start
node scripts/local-runtime.mjs status
node scripts/local-runtime.mjs stop
```

地址 `http://127.0.0.1:3001/zh`，只监听回环地址。

Cloudflare 本地 D1 方式：

```powershell
node scripts/cloudflare-runtime.mjs migrate-local staging
node scripts/cloudflare-runtime.mjs build staging
node scripts/cloudflare-runtime.mjs dev staging
```

地址 `http://127.0.0.1:3002/zh`，终端 Ctrl+C 停止。若需要本地后台登录，将对应私密 JSON 中的值设置于被忽略的 `.dev.vars`，并将本地 SITE_URL 配为 `http://127.0.0.1:3002`。`.dev.vars`、数据库、日志和编译产物均不可提交。两种构建共用 `.next`，切换回 SQLite 时必须重新执行本地 build；托管脚本会防止误启动 Cloudflare 产物。

## 更新、验证、发布

```powershell
git pull --ff-only
npm ci
npm test
node scripts/cloudflare-runtime.mjs build staging
node scripts/cloudflare-runtime.mjs migrate staging
node scripts/cloudflare-runtime.mjs deploy staging
node scripts/cloudflare-runtime.mjs verify staging
```

在测试站验证匿名生成、圈子 ID 持久化、统计、PNG 透明度及背景调整后，将命令参数换为 production。主站只需更新 NEKOCIRCLE_URL 和部署 `/circle/` 入口；不要改主站数据库、登录配置或域名。生产更新前记录 `wrangler deployments list` 的版本，必要时使用 `wrangler rollback <version-id> --config wrangler.production.jsonc` 回退代码。

## 备份和恢复

首次迁移旧 SQLite 时，先停止本地服务并备份，再运行 `npx tsx scripts/export-sqlite-migration.ts`。只读导出保留圈子 ID、生成日志、公告与反馈；排除密码、密钥、本机代理和 GitHub 备份配置。`node scripts/import-sqlite-migration.mjs --new-production-db` 仅接受空的互动圈正式 D1，已有任何数据就拒绝执行，导入后核对各表数量。SQL 文件保存在被忽略的 runtime 目录，不提交 GitHub。此命令只用于首次迁移，更新部署时不要重复运行。

```powershell
npx wrangler d1 export NEKOCIRCLE_DB --remote --config wrangler.production.jsonc --output runtime/nekocircle-backup.sql
npx wrangler d1 time-travel info NEKOCIRCLE_DB --config wrangler.production.jsonc
```

备份文件包含圈子和反馈等信息，必须保存在私密目录。免费 D1 Time Travel 保留 7 天。恢复会覆盖数据，先保存当前导出，再由维护者选择明确时间点执行恢复。不要操作主站 D1。

后台在线导出限制 1 MB 和每表 5,000 行；在线导入限制 1 MB、40 条 SQL 操作。较大的数据库用 Wrangler 导出/导入。覆盖导入先在同一 D1 原子 batch 内保存 JSON 快照，再删除和写入；任一步失败整体回滚。最多保留 3 个覆盖前快照，位于 `import_snapshots` 表，含认证信息，应按私密数据管理。默认导出不包含密钥和密码哈希。GitHub 数据备份默认关闭，没有配置访问令牌，不自动上传个人数据到代码仓库。

## 免费限制及数据源

原动态社交分享缩略图需要服务端 WASM 光栅化，实际测试会触发免费 Worker 的 CPU 限制。Cloudflare 版的 `/api/og/circle` 提供由仓库 SVG 离线生成的静态品牌 PNG（1200 × 1200），不再在请求中运行图像渲染；原动态分享图接口在本地 SQLite / Node 部署仍保留。用户下载的真实互动圈 PNG 继续在浏览器生成，透明、自定义背景及高清导出不受影响。

Wrangler 构建输出需保持 gzip 小于 3 MiB，不允许升级付费套餐来绕过限制。公共抓取限制 Yahoo 每方向最多 8 页，Bing 最多 2 页，避免一次生成超过免费 Worker 的子请求预算。D1 复用窗口和原有刷新节流继续生效；达到 Cloudflare 免费配额时由平台停止服务，不启用超额计费。

Yahoo、FxTwitter、Bing 属于第三方公开数据源，可能限流或不可用；这与本项目 Worker/D1 是否健康需分别判断。`/api/health/ready` 检查数据库；生成返回 502 而就绪正常时，应查看数据源失败信息，不要立即重建数据库。实际手机设备验收由维护者另行执行，桌面浏览器移动尺寸测试不能替代真机。

参考：[OpenNext 绑定](https://opennext.js.org/cloudflare/bindings)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)、[workerd PBKDF2 上限](https://github.com/cloudflare/workerd/issues/1346)。
