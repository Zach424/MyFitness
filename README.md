# MyFitness / 衡迹

面向普通健身人群的多端记录与 AI 规划产品。产品把身体、训练、饮食和恢复数据整理为可解释、可调整、可持续执行的个人计划。

> 当前阶段：durable data operations / 第 15 轮已完成。本地已实现私有 S3 兼容对象存储、PostgreSQL 持久删除任务、可查询异步删除回执与备份恢复删除日志，并通过故障注入和真实 `pg_dump → pg_restore → ledger replay` 演练。云对象存储/KMS/IAM、自动备份、集中告警、生产用户身份与共享部署仍是上线门槛，下一轮进入生产身份和共享测试环境。

## 产品边界

- 首批用户：18 岁以上，以减脂、增肌、提升体能和习惯养成为目标的普通训练者。
- 第一发布面：微信小程序与 H5；验证留存后再扩展原生 App 和健康设备接入。
- AI 定位：解释记录、生成生活方式建议并协助调整计划，不诊断疾病，不替代医生、营养师或持证教练。
- 隐私默认：健康记录和身体照片按敏感数据保护，AI 估计值必须经用户确认后才能写入正式记录。

## 当前仓库结构

```text
apps/
  client/          Taro + React：微信小程序与 H5、记录/计划/隐私所有权流程
  api/             NestJS：身份、记录、计划、AI/隐私编排、运营入口、OpenAPI 与迁移
  admin/           Next.js：OIDC BFF、只读支持证据查询与不可变访问轨
services/
  ai/              FastAPI：本地 fixture、OpenAI 适配、严格结构化输出与提供方失败处理
packages/
  contracts/       Zod：跨端请求、响应、来源与版本契约
  domain/          单位归一化、记录汇总、周计划与确定性安全规则
  design-tokens/   颜色、字体、间距、动效和图表变量
docs/              产品、设计、架构、运营手册和每轮迭代档案
infra/             PostgreSQL 迁移与 PostgreSQL/Redis/MinIO/AI 本地 Compose
output/evals/      可重复的 AI 离线安全评测报告
output/playwright/ 浏览器视觉验收证据
```

后续迭代会按路线图补齐持久数据运营、生产身份、集中可观测性和发布基础设施，避免把本地实现误写成已上线能力。

## 本地运行

需要 Node.js、pnpm 和微信开发者工具。安装依赖后可执行：

```bash
pnpm install
pnpm dev:h5
pnpm dev:admin
pnpm build:h5
pnpm build:weapp
pnpm build:admin
pnpm test
pnpm test:ai
pnpm eval:ai
pnpm eval:food-photo
pnpm typecheck
pnpm audit:prod
```

H5 和微信小程序产物分别生成到 `apps/client/dist-h5` 与 `apps/client/dist-weapp`，两次构建不会互相清理。

Taro 4.2.1 当前通过父级限定的 pnpm override 使用已验证的 Swiper、lodash-es、Vite 与 webpack 安全下限；Vitest 保留独立 Vite 8 工具链。`pnpm audit:prod` 只把严重/高危作为阻断门槛，原始审计中的 6 个中危项仍在风险登记中；升级与 override 退出规则见 [ADR-0013](docs/architecture/decisions/0013-auditable-transitive-security-floors.md)。

Next.js 16.2.10 的管理员构建路径通过父级限定 override 使用 PostCSS 8.5.19，消除了新增的中危字符串化路径；任何 Next/Taro 升级都必须重新检查是否可以删除对应 override，而不是长期无条件保留。

启动本地 API、PostgreSQL、Redis、MinIO 与 AI worker：

```bash
pnpm db:up
pnpm db:migrate
pnpm test:integration
pnpm ops:verify-backup-restore
pnpm dev:api
```

随后可访问 liveness `http://127.0.0.1:3100/v1/health/live`、PostgreSQL+Redis+对象存储 readiness `http://127.0.0.1:3100/v1/health` 与 `http://127.0.0.1:3100/docs`。开发身份通过 `POST /v1/auth/dev/session` 获取不透明 Bearer 令牌；该签发器在生产环境关闭。微信小程序发布构建设置 `TARO_APP_AUTH_MODE=wechat` 和 HTTPS API 地址，客户端以 `Taro.login` code 调用 `POST /v1/auth/wechat/session`，API 服务端完成 `code2Session` 校验且不保存 `session_key`。真实 AppID、域名白名单与设备联调仍是共享测试环境门禁，详见 [用户身份运行手册](docs/operations/USER_IDENTITY_RUNBOOK.md)。

管理员支持台默认运行在 `http://127.0.0.1:3101`。它通过 Next.js BFF 把管理员 API 令牌保存在 `HttpOnly`、`SameSite=Strict` Cookie 中，浏览器不能读取该令牌。生产登录使用 Authorization Code + PKCE + state + nonce，API 再独立验证 ID Token 的签名、issuer、audience、时效与 nonce，并只允许预配操作员换取一次性管理员会话。本地演示需要显式设置 `ADMIN_ENABLE_LOCAL_LOGIN=true`；即使管理端误开该开关，生产 API 仍会把本地签发入口返回为 `404` 并记录拒绝。配置和人员开通步骤见 [管理员访问手册](docs/operations/ADMIN_ACCESS_RUNBOOK.md)。

每个业务请求会收到 `X-Request-ID` 和限流头。生产环境还必须配置 `REDIS_URL`、`RATE_LIMIT_HASH_SECRET`、`OPERATIONS_TOKEN` 与准确的 `TRUST_PROXY_HOPS`。受独立令牌保护的 `GET /v1/internal/metrics` 只用于私网 Prometheus 抓取，令牌不得进入客户端代码。Redis 故障时业务流量按设计返回可关联的 `503`，不会退化为单进程或 fail-open 限流；具体见 [API 运营手册](docs/operations/API_OPERATIONS_RUNBOOK.md)。

AI worker 健康地址是 `http://127.0.0.1:8001/health`。本地默认使用无费用的 `fixture`，不会读取 `OPENAI_API_KEY`；切换 `AI_PROVIDER=openai` 前必须完成隐私、地域、费用、限额和质量审批。计划解释只使用精简计划摘要。照片路径只向 worker 提供服务端重编码 JPEG 和食物目录允许清单；`store:false` 不等于零留存协议，外部提供方回执只会标记为受审批政策约束。

本地照片和恢复删除日志存放在私有 MinIO bucket；照片逻辑键为 `<user UUID>/<photo UUID>.jpg`，对象前缀与 ledger 前缀可独立配置。API 使用 AWS SDK v3 写入 SHA-256 校验和，新照片条件写入避免覆盖；所有删除路径先落 PostgreSQL 持久任务。生产环境必须配置 HTTPS 对象端点、最小权限凭据、SSE/KMS、生命周期/版本/复制、独立 ledger 留存以及至少 32 字符的照片签名和 ledger HMAC 密钥。真实照片模型仍默认关闭；本地 MinIO 不是生产对象存储证明。

账户删除返回 `202`、删除回执 ID 和一次性状态密钥。账户访问先关闭，后台再删除私有对象、发布恢复删除日志并清除主数据库。备份恢复必须在开放流量前重放 ledger；本地真实演练命令是 `pnpm ops:verify-backup-restore`。任务状态、故障处理和生产门槛见 [数据托管运维手册](docs/operations/DATA_CUSTODY_RUNBOOK.md)。

生产构建的浏览器端到端验收需要数据库已迁移，执行：

```bash
pnpm build:api
pnpm build:admin
pnpm build:h5
pnpm test:e2e
```

Playwright 会复用或启动 API、H5 与管理员预览服务。`pnpm db:down` 会停止本地容器并保留数据卷。`apps/admin` 的 `start` 命令面向 Linux standalone 产物；Windows 本地验收使用 `start:preview`，避免 standalone 符号链接权限差异。

## 开发方式

项目按受控迭代推进，每一轮只选择一个关键范围，并严格执行：

1. 重新确认产品目标与本轮成功标准。
2. 实现最小、可回滚的改动。
3. 运行模块测试和相关集成验证。
4. 更新全局状态、设计/架构决策、风险与经验。
5. 在 `docs/iterations/` 写入本轮档案。
6. 使用 Conventional Commits 创建一个本地提交。

当前状态、路线和下一步见 [PROJECT_STATUS.md](docs/PROJECT_STATUS.md)。

## 文档入口

- [产品定义](docs/product/PRODUCT_BRIEF.md)
- [交付路线图](docs/product/ROADMAP.md)
- [产品风险登记](docs/product/RISK_REGISTER.md)
- [设计系统](docs/design/DESIGN_SYSTEM.md)
- [技术架构](docs/architecture/ARCHITECTURE.md)
- [架构决策 0001](docs/architecture/decisions/0001-platform-architecture.md)
- [架构决策 0002](docs/architecture/decisions/0002-health-record-contract.md)
- [架构决策 0003](docs/architecture/decisions/0003-identity-onboarding-boundary.md)
- [架构决策 0004](docs/architecture/decisions/0004-health-record-revision-lifecycle.md)
- [架构决策 0005](docs/architecture/decisions/0005-structured-workout-aggregate.md)
- [架构决策 0006](docs/architecture/decisions/0006-nutrition-snapshot-aggregate.md)
- [架构决策 0007](docs/architecture/decisions/0007-server-dashboard-aggregation.md)
- [架构决策 0008](docs/architecture/decisions/0008-deterministic-plan-before-ai.md)
- [架构决策 0009](docs/architecture/decisions/0009-review-only-ai-explanations.md)
- [架构决策 0010](docs/architecture/decisions/0010-revocable-food-photo-candidates.md)
- [架构决策 0011](docs/architecture/decisions/0011-user-owned-export-and-erasure.md)
- [架构决策 0012](docs/architecture/decisions/0012-shared-api-operational-perimeter.md)
- [架构决策 0013](docs/architecture/decisions/0013-auditable-transitive-security-floors.md)
- [架构决策 0014](docs/architecture/decisions/0014-independent-operator-trust-boundary.md)
- [架构决策 0015](docs/architecture/decisions/0015-durable-data-erasure-and-restore-ledger.md)
- [健康记录数据模型](docs/architecture/HEALTH_RECORD_MODEL.md)
- [训练记录数据模型](docs/architecture/WORKOUT_MODEL.md)
- [饮食记录数据模型](docs/architecture/NUTRITION_MODEL.md)
- [身份与建档数据模型](docs/architecture/IDENTITY_PROFILE_MODEL.md)
- [周计划数据模型](docs/architecture/PLAN_MODEL.md)
- [AI 计划解释模型](docs/architecture/AI_EXPLANATION_MODEL.md)
- [餐食照片候选模型](docs/architecture/FOOD_PHOTO_MODEL.md)
- [隐私所有权模型](docs/architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [API 运营边界](docs/architecture/OPERATIONS_PERIMETER.md)
- [管理员支持边界](docs/architecture/ADMIN_SUPPORT_MODEL.md)
- [API 运营手册](docs/operations/API_OPERATIONS_RUNBOOK.md)
- [管理员访问手册](docs/operations/ADMIN_ACCESS_RUNBOOK.md)
- [数据托管运维手册](docs/operations/DATA_CUSTODY_RUNBOOK.md)
- [API 契约与 OpenAPI](docs/api/README.md)
- [第 0 轮档案](docs/iterations/000-foundation.md)
- [第 1 轮档案](docs/iterations/001-client-foundation.md)
- [第 2 轮档案](docs/iterations/002-api-foundation.md)
- [第 3 轮档案](docs/iterations/003-onboarding.md)
- [第 4 轮档案](docs/iterations/004-body-recovery-records.md)
- [第 5 轮档案](docs/iterations/005-workout-recording.md)
- [第 6 轮档案](docs/iterations/006-nutrition-recording.md)
- [第 7 轮档案](docs/iterations/007-real-today-trends.md)
- [第 8 轮档案](docs/iterations/008-deterministic-weekly-plans.md)
- [第 9 轮档案](docs/iterations/009-ai-explanation-orchestration.md)
- [第 10 轮档案](docs/iterations/010-food-photo-candidates.md)
- [第 11 轮档案](docs/iterations/011-privacy-ownership.md)
- [第 12 轮档案](docs/iterations/012-api-operational-perimeter.md)
- [第 13 轮档案](docs/iterations/013-production-dependency-remediation.md)
- [第 14 轮档案](docs/iterations/014-administrator-access-support.md)
- [第 15 轮档案](docs/iterations/015-durable-data-operations.md)
- [移动端视觉证据](output/playwright/iteration-001-mobile.png)
- [宽屏视觉证据](output/playwright/iteration-001-wide.png)
- [建档移动端证据](output/playwright/iteration-003-onboarding-mobile.png)
- [建档宽屏证据](output/playwright/iteration-003-onboarding-wide.png)
- [记录移动端证据](output/playwright/iteration-004-records-mobile.png)
- [记录宽屏证据](output/playwright/iteration-004-records-wide.png)
- [训练移动端证据](output/playwright/iteration-005-workouts-mobile.png)
- [训练宽屏证据](output/playwright/iteration-005-workouts-wide.png)
- [饮食移动端证据](output/playwright/iteration-006-nutrition-mobile.png)
- [饮食宽屏证据](output/playwright/iteration-006-nutrition-wide.png)
- [真实 Today 移动端证据](output/playwright/iteration-007-today-mobile.png)
- [真实 Today 宽屏证据](output/playwright/iteration-007-today-wide.png)
- [周计划移动端证据](output/playwright/iteration-008-plans-mobile.png)
- [周计划宽屏证据](output/playwright/iteration-008-plans-wide.png)
- [AI 边注移动端证据](output/playwright/iteration-009-ai-mobile.png)
- [AI 边注宽屏证据](output/playwright/iteration-009-ai-wide.png)
- [餐食照片候选移动端证据](output/playwright/iteration-010-food-photo-mobile.png)
- [餐食照片候选宽屏证据](output/playwright/iteration-010-food-photo-wide.png)
- [隐私台账移动端证据](output/playwright/iteration-011-privacy-mobile.png)
- [隐私台账宽屏证据](output/playwright/iteration-011-privacy-wide.png)
- [管理员支持台移动端证据](output/playwright/iteration-014-admin-mobile.png)
- [管理员支持台宽屏证据](output/playwright/iteration-014-admin-wide.png)

## 仓库同步说明

2026-07-18 初始化时，当前执行环境无法通过 GitHub HTTPS Git 协议或未授权 SSH 拉取，但可以访问官方源码归档。仓库基线因此从 GitHub 官方 `main` 归档恢复，并配置原始 `origin`。本地提交会持续保留；获得 GitHub 凭据后，需要先获取远端原始提交，再把本地提交重放到 `origin/main` 后推送，禁止未经确认强制覆盖远端。
