# Voidream 接入与本地运维

两个仓库保持独立。NekoCircle 使用 Next.js 和 SQLite；Voidream 的 `/circle/` 内嵌独立服务，并提供独立窗口入口。后台通过独立服务 `/admin/login` 访问，不嵌入主站。

## 本机运行

需要 Node.js 22 或 24。首次安装，在 NekoCircle 根目录逐条执行：

```powershell
npm ci
node scripts/local-runtime.mjs init
node scripts/local-runtime.mjs build
node scripts/local-runtime.mjs start
node scripts/local-runtime.mjs status
```

访问 `http://127.0.0.1:3001/zh`。程序在后台运行，仅监听 loopback，不需要 Windows 公网入站端口。日志位于 `runtime/logs/server.log`。

初始化不会覆盖已有 `.env.local`，也不会替换已有管理员密码。新配置的数据库是 `runtime/data/circle.db`，原有 `data/circle.db` 不迁移、不修改。需要使用已有数据时，先停止服务并备份，再由维护者明确选择 `DB_PATH`。

私密文件：`.env.local`、`runtime/administrator.secrets.txt`、Tunnel 凭据、SQLite 数据库与备份均不得提交。当前初始管理员密码在本机 `runtime/administrator.secrets.txt`，请本人打开，不要复制到聊天或 GitHub。Windows 的文件权限依赖当前用户目录的 ACL；将项目移到多人共享目录前，应限制这些文件的读取权限。

## 停止、重启、更新与备份

```powershell
node scripts/local-runtime.mjs stop
node scripts/local-runtime.mjs start
```

更新前先备份，再停机；保留 `.env.local` 和整个 `runtime` 目录：

```powershell
node scripts/local-runtime.mjs backup
node scripts/local-runtime.mjs stop
git pull --ff-only
npm ci
npm test
node scripts/local-runtime.mjs build
node scripts/local-runtime.mjs start
```

每条命令成功后再继续。`git pull` 若提示本地改动或分支冲突，应先处理，不能强制重置。构建失败时不要启动不完整版本；回到已确认的代码版本并重新构建。需要不停服更新时，可复用仓库已有的双版本部署工具。

备份命令使用 SQLite 在线备份接口，输出到 `runtime/backups/`。恢复时停止服务，保留当前数据库及 WAL/SHM 文件作为完整恢复副本，再将选定备份复制到新的持久化目录并修改 `DB_PATH`；验证后启动。不要在运行时直接覆盖数据库。

启动与停止通过就绪接口的随机运行 ID 核对进程。端口占用时拒绝重复启动；无法核对进程身份时拒绝自动终止。异常时先查看日志和进程命令行，不要盲目结束同号进程。

## Cloudflare Tunnel

本次检查已安装 cloudflared 2026.7.2，但账号未发现已建 Tunnel。主站 `voidream-web.pages.dev` 属于 Cloudflare 提供的域名，不能创建用户管理的下级 DNS 记录。账号里的 `voidream.eu.org` 当前为 pending，尚不能作为稳定 Tunnel 的公开主机名。

正式公开之前，需要确认独立 HTTPS 主机名及影响范围。稳定方案是：将一个本人控制的域名接入同一 Cloudflare 账号并变为 active，再创建命名 Tunnel 和对应子域名 CNAME。复用已有 Tunnel 时，先查看它的路由，避免改动其他服务。

`deploy/cloudflared.example.yml` 仅为模板，不含凭据。确认地址后，将配置和凭据放入忽略目录 `runtime`。外部 HTTPS 地址确定后，修改 `.env.local` 的 `SITE_URL` 为该地址，保留两项密钥和 `DB_PATH`，重新构建并重启。然后运行：

```powershell
& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' tunnel --config runtime/cloudflared.yml run
```

此命令保持 Tunnel 进程运行；Ctrl+C 只停止 Tunnel，Next.js 可继续本机访问。公网访问依赖这台电脑及 Tunnel 均在线，电脑关机、休眠或网络中断都会导致不可用。后续可将同一应用、持久化数据库和 Tunnel 迁移到服务器。

Quick Tunnel 的随机 `trycloudflare.com` 地址只适合短期验收，重启可能变化，不作为稳定上线方案。未经地址与公开影响确认，不启动公开隧道、不修改 DNS、不部署主站。

官方说明：[Tunnel DNS 路由](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/)。

## 主站配置

Voidream 运行时变量 `NEKOCIRCLE_URL` 设为独立 HTTPS 根地址。只允许无凭据、无路径、无参数的独立 origin；本地开发额外允许 localhost 或 127.0.0.1 的 HTTP 地址。未配置时 `/circle/` 显示接入提示，不会伪装已上线。

主站只在 `/circle/` 的 CSP 中允许这个明确的 iframe origin。NekoCircle 的管理页面和管理 API 禁止嵌入，管理写操作核对 `SITE_URL` 来源，登录限制每来源 IP 每 15 分钟 20 次。普通 JWT 和管理员 JWT 可以分别配置；密钥缺失或使用默认示例值时拒绝签名。限流状态为单进程内存，重启会重置；规模扩大时应使用共享限流。

## 数据与导出验收

公开数据生成依赖第三方来源。HTTP 502 或来源缺失应结合服务健康接口与后台日志判断，不应将第三方不可用当作 SQLite 或 Next.js 停机。正常数据源也可能缺少互动。

本地测试结果请见 `docs/voidream-test-results.md`。自定义背景只在浏览器中处理，不上传到服务端。PNG 为 2800 × 2800；透明预览的棋盘格不会导出。正式发布后仍需从公网电脑和真实手机复验生成、上传与下载。
