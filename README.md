# MyFitness / 衡迹

面向普通健身人群的多端记录与 AI 规划产品。产品把身体、训练、饮食和恢复数据整理为可解释、可调整、可持续执行的个人计划。

> 当前阶段：首个服务候选 `v0.1.0-rc.1` 已发布验证；本地产品已完成身体/训练/饮食观察、用户自建动作与食物目录、隐私优先进度照、计划到实际训练的显式关联，以及三类记录编辑器的 24 小时账号隔离草稿恢复。新建与修改草稿均可恢复；修改草稿绑定聚合 ID 和基础修订号，只在服务器仍是同一版本时恢复，旧版本或已删除目标会被安全拒绝。用户还可用本地时间 + IANA 时区回填/纠正记录；无效、夏令时缺口、未选择的重复时刻和未来时间会被拒绝，未改动的历史时间保留原始秒/毫秒。H5 OIDC 已完成本地/provider-double 验收，H5 与 WeApp 均有来源绑定、实际字节校验的 `candidate` 确定性 TAR 契约。现有 `v0.1.0-rc.1` 仍是“仅服务”历史记录；托管账号、真实微信/OIDC 凭据、精确回调域名/TLS/CORS、集中遥测、数据托管和责任人仍是上线门槛，当前没有声称已经承载公网流量。

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
infra/             PostgreSQL 迁移、本地依赖/部署拓扑与 CI action 锁
scripts/           评测、发布源资格、部署黑盒验证与不可变发布清单工具
output/evals/      可重复的 AI 离线安全评测报告
output/playwright/ 浏览器视觉验收证据
```

后续迭代会按路线图部署托管数据服务、真实身份、集中可观测性和发布边界，避免把可发布镜像误写成已经承载公网流量。

## 项目状态与 Obsidian

仓库内的 [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) 是项目状态的唯一权威来源。已配置 Obsidian 的开发机器可以在每轮归档完成后执行：

```bash
pnpm docs:sync-obsidian
pnpm docs:verify-obsidian
```

命令会读取 Obsidian 的本机 vault 配置，优先选择最近打开的 vault，并把状态精确镜像到 `10_Projects/MyFitness/PROJECT_STATUS.md`。`OBSIDIAN_VAULT_PATH` 可以显式选择 vault，`MYFITNESS_OBSIDIAN_STATUS_TARGET` 可以覆盖 vault 内相对路径；目标路径不能逃逸 vault，验证命令会拒绝缺失或过期的镜像。Obsidian 副本属于本机知识库，不进入本仓库提交。

## 本地运行

需要 Node.js、pnpm 和微信开发者工具。安装依赖后可执行：

```bash
pnpm install
pnpm dev:h5
pnpm dev:admin
pnpm build:h5
pnpm build:h5:oidc
pnpm build:weapp
pnpm client:verify
pnpm build:admin
pnpm test
pnpm test:ai
pnpm eval:ai
pnpm eval:food-photo
pnpm typecheck
pnpm audit:prod
pnpm deploy:smoke
pnpm test:e2e:oidc
```

H5 和微信小程序产物分别生成到 `apps/client/dist-h5` 与 `apps/client/dist-weapp`，两次构建不会互相清理。完成双端构建后，`pnpm client:verify` 会检查 H5 入口/异步页面与小程序 vendor/页面/总量预算，并拒绝完整验证运行时重新进入客户端包；CI 与客户端发布组装均执行同一门槛。

Taro 4.2.1 当前通过父级限定的 pnpm override 使用已验证的 Swiper、lodash-es、Vite、webpack、解析器与 glob 安全下限；Vitest 保留独立 Vite 8 工具链。`pnpm audit:prod` 把严重/高危作为阻断门槛，当前生产树为 0 critical / 0 high，原始审计中的 9 个中危 Taro 构建链项仍在风险登记中；升级与 override 退出规则见 [ADR-0013](docs/architecture/decisions/0013-auditable-transitive-security-floors.md)。

Next.js 16.2.11 的管理员构建路径通过父级限定 override 使用 PostCSS 8.5.19，并移除管理员未使用的旧版可选 Sharp；图片处理 API 独立保留 Sharp 0.35.3。任何 Next/Taro 升级都必须重新检查是否可以删除对应 override，而不是长期无条件保留。

启动本地 API、PostgreSQL、Redis、MinIO 与 AI worker：

```bash
pnpm db:up
pnpm db:migrate
pnpm test:integration
pnpm ops:verify-backup-restore
pnpm dev:api
```

随后可访问 liveness `http://127.0.0.1:3100/v1/health/live`、PostgreSQL+Redis+对象存储 readiness `http://127.0.0.1:3100/v1/health` 与 `http://127.0.0.1:3100/docs`。开发身份通过 `POST /v1/auth/dev/session` 获取不透明 Bearer 令牌；该签发器在生产环境关闭。微信小程序发布构建设置 `TARO_APP_AUTH_MODE=wechat` 和 HTTPS API 地址，客户端以 `Taro.login` code 调用 `POST /v1/auth/wechat/session`，API 服务端完成 `code2Session` 校验且不保存 `session_key`。H5 从 `GET /v1/auth/oidc/config` 读取浏览器安全配置，在当前标签页创建 state、nonce 与 PKCE S256 事务，通过精确 `/auth/callback` 清理返回参数，并把授权码、原 verifier、nonce 与精确回调交给 `POST /v1/auth/oidc/session`；事务在交换前一次性消费，不会自动重放，API 完成换码、JWKS/issuer/audience/age/nonce 验证且只保存不可逆身份摘要。真实身份租户与托管回调仍是上线门禁，详见[用户身份运行手册](docs/operations/USER_IDENTITY_RUNBOOK.md)。

管理员支持台默认运行在 `http://127.0.0.1:3101`。它通过 Next.js BFF 把管理员 API 令牌保存在 `HttpOnly`、`SameSite=Strict` Cookie 中，浏览器不能读取该令牌。生产登录使用 Authorization Code + PKCE + state + nonce，API 再独立验证 ID Token 的签名、issuer、audience、时效与 nonce，并只允许预配操作员换取一次性管理员会话。本地演示需要显式设置 `ADMIN_ENABLE_LOCAL_LOGIN=true`；即使管理端误开该开关，生产 API 仍会把本地签发入口返回为 `404` 并记录拒绝。配置和人员开通步骤见 [管理员访问手册](docs/operations/ADMIN_ACCESS_RUNBOOK.md)。

每个业务请求会收到 `X-Request-ID` 和限流头。生产环境还必须配置 `REDIS_URL`、`RATE_LIMIT_HASH_SECRET`、`OPERATIONS_TOKEN` 与准确的 `TRUST_PROXY_HOPS`。受独立令牌保护的 `GET /v1/internal/metrics` 只用于私网 Prometheus 抓取，令牌不得进入客户端代码。Redis 故障时业务流量按设计返回可关联的 `503`，不会退化为单进程或 fail-open 限流；具体见 [API 运营手册](docs/operations/API_OPERATIONS_RUNBOOK.md)。

AI worker 健康地址是 `http://127.0.0.1:8001/health`。本地默认使用无费用的 `fixture`，不会读取 `OPENAI_API_KEY`；切换 `AI_PROVIDER=openai` 前必须完成隐私、地域、费用、限额和质量审批。计划解释只使用精简计划摘要；每个待处理请求都带有晚于 worker 超时的数据库截止时间和预验证恢复结果，API 启动/定时任务会把过期请求原子收敛为可见的确定性 fallback。v2 验证器会在不改写展示文本的前提下识别常见全角、零宽、分隔混淆和中英文指令泄漏。照片路径只向 worker 提供服务端重编码 JPEG 和食物目录允许清单，图片内文字被视为不可信数据；`store:false` 不等于零留存协议，外部提供方回执只会标记为受审批政策约束。

本地照片和恢复删除日志存放在私有 MinIO bucket；新照片逻辑键按用途分为 `<user UUID>/food/<photo UUID>.jpg` 与 `<user UUID>/progress/<photo UUID>.jpg`，用途撤回不会交叉删除，账户删除仍清理完整用户前缀。API 使用 AWS SDK v3 写入 SHA-256 校验和，新照片条件写入避免覆盖；所有删除路径先落 PostgreSQL 持久任务。进度照只做画幅、清晰度、亮度与对比度检查以及用户控制的同视角叠片，不诊断体态或估算精确体脂。生产环境必须配置 HTTPS 对象端点、最小权限凭据、SSE/KMS、生命周期/版本/复制、独立 ledger 留存以及至少 32 字符的照片签名和 ledger HMAC 密钥。真实照片模型仍默认关闭；本地 MinIO 不是生产对象存储证明。

账户删除先创建 15 分钟单次意图并在客户端保存一次性密钥，再用意图 ID/密钥提交删除；服务端只保存 SHA-256。账户访问先关闭，后台再删除私有对象、发布恢复删除日志并清除主数据库。即使 `202` 响应丢失或页面刷新，客户端也能用原密钥找回最小回执状态。备份恢复必须在开放流量前重放 ledger；本地真实演练命令是 `pnpm ops:verify-backup-restore`。任务状态、故障处理和生产门槛见 [数据托管运维手册](docs/operations/DATA_CUSTODY_RUNBOOK.md)。

生产构建的浏览器端到端验收需要数据库已迁移，执行：

```bash
pnpm build:api
pnpm build:admin
pnpm build:h5
pnpm test:e2e
```

Playwright 会复用或启动 API、H5 与管理员预览服务。`pnpm db:down` 会停止本地容器并保留数据卷。`apps/admin` 的 `start` 命令面向 Linux standalone 产物；Windows 本地验收使用 `start:preview`，避免 standalone 符号链接权限差异。

完整镜像验收使用 `pnpm deploy:smoke`：顺序构建三个最终镜像，运行一次性迁移，等待 API/AI/管理员端与 PostgreSQL/Redis/MinIO 健康，执行外部黑盒检查，最后自动删除容器和测试卷。该命令使用 fixture AI、开发身份和本地 MinIO，只证明部署制品，不代表共享或生产上线。两个 GitHub 工作流的外部 action 均使用 `infra/ci/github-actions.lock.json` 登记的完整提交 SHA；版本注释和每周 Dependabot 仅用于发现受审升级，不能作为执行引用。候选版本标签触发发布工作流后，`myfitness-release-qualification/v1` 会先把远端标签、当前 `main` 祖先关系和同一提交的成功 push CI 绑定到发布运行；失败时不会登录镜像仓库或构建客户端。资格通过后才进行 GHCR 多架构发布与 H5/WeApp 构建，并分别生成 `myfitness-release/v1` 服务清单和 `myfitness-client-release/v1` 客户端清单；客户端 TAR 使用排序路径、固定权限/UID/GID/时间戳并绑定完整提交、工作流、API 地址和身份模式。

托管环境必须先从 `infra/deploy/managed-environment.example.json` 创建一份受变更系统保护、只包含逻辑引用而没有密钥值的环境清单，再用 `pnpm deploy:admit -- ...` 同时校验环境、服务/客户端清单、两个清单校验和及两个实际客户端 TAR。模板本身故意不可准入；完整账号/预算、域名、所有者、数据托管、告警和 AI 策略引用才能生成 `myfitness-deployment-admission/v2`。当前 H5 是 `oidc / candidate`、WeApp 是 `wechat / candidate`，准入只允许把两者上传到受控私有预览；真实浏览器/设备身份、精确回调托管和数据托管证据通过前，仍禁止公网交付。生产配置、准入命令、发布顺序和回滚规则见[部署运行手册](docs/operations/DEPLOYMENT_RUNBOOK.md)。

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
- [架构决策 0016](docs/architecture/decisions/0016-verified-wechat-identity-and-erasure-suppression.md)
- [架构决策 0017](docs/architecture/decisions/0017-reproducible-oci-deployment-boundary.md)
- [架构决策 0018](docs/architecture/decisions/0018-explicit-api-startup-lifecycle.md)
- [架构决策 0019](docs/architecture/decisions/0019-immutable-release-promotion.md)
- [架构决策 0020](docs/architecture/decisions/0020-managed-environment-admission.md)
- [架构决策 0021](docs/architecture/decisions/0021-immutable-client-delivery-artifacts.md)
- [架构决策 0022](docs/architecture/decisions/0022-recoverable-account-erasure-receipts.md)
- [架构决策 0023](docs/architecture/decisions/0023-crash-safe-ai-explanation-lifecycle.md)
- [架构决策 0024](docs/architecture/decisions/0024-versioned-adversarial-ai-output-safety.md)
- [架构决策 0025](docs/architecture/decisions/0025-qualified-main-ci-release-promotion.md)
- [架构决策 0026](docs/architecture/decisions/0026-immutable-github-actions-supply-chain.md)
- [架构决策 0027](docs/architecture/decisions/0027-h5-oidc-authorization-code-boundary.md)
- [架构决策 0028](docs/architecture/decisions/0028-h5-oidc-browser-transaction-and-candidate.md)
- [架构决策 0029](docs/architecture/decisions/0029-privacy-first-progress-photo-assistance.md)
- [架构决策 0030](docs/architecture/decisions/0030-server-authoritative-workout-status.md)
- [架构决策 0031](docs/architecture/decisions/0031-server-projected-plan-freshness.md)
- [架构决策 0032](docs/architecture/decisions/0032-client-runtime-and-measured-bundle-boundary.md)
- [架构决策 0033](docs/architecture/decisions/0033-bounded-record-evidence-plan-freshness.md)
- [架构决策 0034](docs/architecture/decisions/0034-explicit-plan-workout-link.md)
- [架构决策 0035](docs/architecture/decisions/0035-user-owned-exercise-catalog.md)
- [架构决策 0036](docs/architecture/decisions/0036-stable-key-exercise-insights.md)
- [架构决策 0037](docs/architecture/decisions/0037-user-owned-food-catalog.md)
- [架构决策 0038](docs/architecture/decisions/0038-timezone-safe-nutrition-observation.md)
- [架构决策 0039](docs/architecture/decisions/0039-exact-metric-health-observation.md)
- [架构决策 0040](docs/architecture/decisions/0040-recoverable-sensitive-local-drafts.md)
- [架构决策 0041](docs/architecture/decisions/0041-explicit-occurrence-time.md)
- [架构决策 0042](docs/architecture/decisions/0042-conflict-safe-correction-drafts.md)
- [健康记录数据模型](docs/architecture/HEALTH_RECORD_MODEL.md)
- [训练记录数据模型](docs/architecture/WORKOUT_MODEL.md)
- [饮食记录数据模型](docs/architecture/NUTRITION_MODEL.md)
- [身份与建档数据模型](docs/architecture/IDENTITY_PROFILE_MODEL.md)
- [周计划数据模型](docs/architecture/PLAN_MODEL.md)
- [AI 计划解释模型](docs/architecture/AI_EXPLANATION_MODEL.md)
- [餐食照片候选模型](docs/architecture/FOOD_PHOTO_MODEL.md)
- [进度照辅助模型](docs/architecture/PROGRESS_PHOTO_MODEL.md)
- [隐私所有权模型](docs/architecture/PRIVACY_OWNERSHIP_MODEL.md)
- [API 运营边界](docs/architecture/OPERATIONS_PERIMETER.md)
- [管理员支持边界](docs/architecture/ADMIN_SUPPORT_MODEL.md)
- [API 运营手册](docs/operations/API_OPERATIONS_RUNBOOK.md)
- [管理员访问手册](docs/operations/ADMIN_ACCESS_RUNBOOK.md)
- [数据托管运维手册](docs/operations/DATA_CUSTODY_RUNBOOK.md)
- [用户身份运行手册](docs/operations/USER_IDENTITY_RUNBOOK.md)
- [部署运行手册](docs/operations/DEPLOYMENT_RUNBOOK.md)
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
- [第 16 轮档案](docs/iterations/016-verified-wechat-identity.md)
- [第 17 轮档案](docs/iterations/017-reproducible-deployment-artifacts.md)
- [第 18 轮档案](docs/iterations/018-hermetic-ci-bootstrap.md)
- [第 19 轮档案](docs/iterations/019-immutable-release-promotion.md)
- [第 20 轮档案](docs/iterations/020-managed-environment-admission.md)
- [第 21 轮档案](docs/iterations/021-immutable-client-delivery-artifacts.md)
- [第 22 轮档案](docs/iterations/022-recoverable-account-erasure-receipts.md)
- [第 23 轮档案](docs/iterations/023-crash-safe-ai-explanation-lifecycle.md)
- [第 24 轮档案](docs/iterations/024-adversarial-ai-output-safety.md)
- [第 25 轮档案](docs/iterations/025-reproducible-ai-evaluation-artifacts.md)
- [第 26 轮档案](docs/iterations/026-qualified-release-source.md)
- [第 27 轮档案](docs/iterations/027-immutable-github-actions-supply-chain.md)
- [第 28 轮档案](docs/iterations/028-h5-oidc-server-boundary.md)
- [第 29 轮档案](docs/iterations/029-h5-oidc-browser-candidate.md)
- [第 30 轮档案](docs/iterations/030-obsidian-status-mirror.md)
- [第 31 轮档案](docs/iterations/031-progress-photo-assistance.md)
- [第 32 轮档案](docs/iterations/032-server-authoritative-workout-status.md)
- [第 33 轮档案](docs/iterations/033-proactive-plan-freshness.md)
- [第 34 轮档案](docs/iterations/034-client-accessibility-and-bundle-hardening.md)
- [第 35 轮档案](docs/iterations/035-bounded-record-evidence-plan-freshness.md)
- [第 36 轮档案](docs/iterations/036-explicit-plan-workout-link.md)
- [第 37 轮档案](docs/iterations/037-user-owned-exercise-catalog.md)
- [第 38 轮档案](docs/iterations/038-exercise-level-history-and-trends.md)
- [第 39 轮档案](docs/iterations/039-user-owned-food-catalog.md)
- [第 40 轮档案](docs/iterations/040-daily-nutrition-observation.md)
- [第 41 轮档案](docs/iterations/041-health-metric-observation.md)
- [第 42 轮档案](docs/iterations/042-recoverable-sensitive-local-drafts.md)
- [第 43 轮档案](docs/iterations/043-explicit-occurrence-time.md)
- [第 44 轮档案](docs/iterations/044-conflict-safe-correction-drafts.md)
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
- [周计划证据变化移动端证据](output/playwright/iteration-035-evidence-shift-mobile.png)
- [计划/实际训练显式关联移动端证据](output/playwright/iteration-036-plan-link-mobile.png)
- [自定义动作目录移动端证据](output/playwright/iteration-037-user-exercise-catalog-mobile.png)
- [单动作趋势移动端证据](output/playwright/iteration-038-exercise-trend-mobile.png)
- [自建食物目录移动端证据](output/playwright/iteration-039-user-food-catalog-mobile.png)
- [每日营养观察移动端证据](output/playwright/iteration-040-nutrition-observation-mobile.png)
- [身体/恢复单指标观察移动端证据](output/playwright/iteration-041-health-metric-observation-mobile.png)
- [可恢复本地草稿移动端证据](output/playwright/iteration-042-recoverable-draft-mobile.png)
- [明确发生时间移动端证据](output/playwright/iteration-043-occurrence-time-mobile.png)
- [冲突安全修改草稿移动端证据](output/playwright/iteration-044-correction-draft-mobile.png)
- [周计划宽屏证据](output/playwright/iteration-008-plans-wide.png)
- [AI 边注移动端证据](output/playwright/iteration-009-ai-mobile.png)
- [AI 边注宽屏证据](output/playwright/iteration-009-ai-wide.png)
- [餐食照片候选移动端证据](output/playwright/iteration-010-food-photo-mobile.png)
- [餐食照片候选宽屏证据](output/playwright/iteration-010-food-photo-wide.png)
- [隐私台账移动端证据](output/playwright/iteration-011-privacy-mobile.png)
- [隐私台账宽屏证据](output/playwright/iteration-011-privacy-wide.png)
- [管理员支持台移动端证据](output/playwright/iteration-014-admin-mobile.png)
- [管理员支持台宽屏证据](output/playwright/iteration-014-admin-wide.png)
- [删除回执恢复移动端证据](output/playwright/iteration-022-erasure-recovery-mobile.png)
- [H5 OIDC 登录移动端证据](output/playwright/iteration-029-oidc-login-mobile.png)
- [H5 OIDC 拒绝态移动端证据](output/playwright/iteration-029-oidc-denied-mobile.png)
- [H5 OIDC 登录宽屏证据](output/playwright/iteration-029-oidc-login-wide.png)
- [进度照移动端证据](output/playwright/iteration-031-progress-photos-mobile.png)
- [进度照宽屏证据](output/playwright/iteration-031-progress-photos-wide.png)

## 仓库同步说明

2026-07-18 初始化时，执行环境无法通过 GitHub Git 协议拉取，因此仓库基线先从官方 `main` 归档恢复。2026-07-19 HTTPS 传输恢复后，已先获取远端原始提交，再把本地迭代历史重放到 `origin/main` 并正常推送；全程未强制覆盖远端。后续仍只允许常规 fast-forward/rebase 后推送，禁止未经确认的强制推送。
