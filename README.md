# MyFitness / 衡迹

面向普通健身人群的多端记录与 AI 规划产品。产品把身体、训练、饮食和恢复数据整理为可解释、可调整、可持续执行的个人计划。

> 当前阶段：Revocable food-photo candidates / 第 10 轮已完成。用户逐次同意后可上传餐食照片，服务端去元数据并生成可撤销候选；确认只带入未保存草稿，照片立即删除，AI 不会直接创建餐次。下一轮进入隐私导出、删除、撤回同意与运营治理。

## 产品边界

- 首批用户：18 岁以上，以减脂、增肌、提升体能和习惯养成为目标的普通训练者。
- 第一发布面：微信小程序与 H5；验证留存后再扩展原生 App 和健康设备接入。
- AI 定位：解释记录、生成生活方式建议并协助调整计划，不诊断疾病，不替代医生、营养师或持证教练。
- 隐私默认：健康记录和身体照片按敏感数据保护，AI 估计值必须经用户确认后才能写入正式记录。

## 当前仓库结构

```text
apps/
  client/          Taro + React：微信小程序与 H5
  api/             NestJS：身份、记录、洞察、计划、AI 编排 API、OpenAPI 与迁移入口
services/
  ai/              FastAPI：本地 fixture、OpenAI 适配、严格结构化输出与提供方失败处理
packages/
  contracts/       Zod：跨端请求、响应、来源与版本契约
  domain/          单位归一化、记录汇总、周计划与确定性安全规则
  design-tokens/   颜色、字体、间距、动效和图表变量
docs/              产品、设计、架构和每轮迭代档案
infra/             PostgreSQL 迁移与本地 Docker Compose
output/evals/      可重复的 AI 离线安全评测报告
output/playwright/ 浏览器视觉验收证据
```

后续迭代会按路线图逐步增加隐私所有权流程、管理后台和发布基础设施，避免在没有实现的情况下制造空壳。

## 本地运行

需要 Node.js、pnpm 和微信开发者工具。安装依赖后可执行：

```bash
pnpm install
pnpm dev:h5
pnpm build:h5
pnpm build:weapp
pnpm test
pnpm test:ai
pnpm eval:ai
pnpm eval:food-photo
pnpm typecheck
```

H5 和微信小程序产物分别生成到 `apps/client/dist-h5` 与 `apps/client/dist-weapp`，两次构建不会互相清理。

启动本地 API、PostgreSQL 与 AI worker：

```bash
pnpm db:up
pnpm db:migrate
pnpm test:integration
pnpm dev:api
```

随后可访问 `http://127.0.0.1:3100/v1/health` 与 `http://127.0.0.1:3100/docs`。开发身份通过 `POST /v1/auth/dev/session` 获取不透明 Bearer 令牌；该签发器在 `NODE_ENV=production` 时关闭，数据库只保存 SHA-256 哈希。生产身份提供商仍需在发布前接入。

AI worker 健康地址是 `http://127.0.0.1:8001/health`。本地默认使用无费用的 `fixture`，不会读取 `OPENAI_API_KEY`；切换 `AI_PROVIDER=openai` 前必须完成隐私、地域、费用、限额和质量审批。计划解释只使用精简计划摘要。照片路径只向 worker 提供服务端重编码 JPEG 和食物目录允许清单；`store:false` 不等于零留存协议。

本地照片存储默认是仓库忽略的 `uploads/private`。生产环境必须配置 `PHOTO_STORAGE_ROOT` 和至少 32 字符的 `PHOTO_UPLOAD_SIGNING_SECRET`，并在共享部署前把本地磁盘适配器替换为加密私有对象存储与生命周期规则。真实照片模型仍默认关闭。

生产构建的浏览器端到端验收需要数据库已迁移，执行：

```bash
pnpm build:api
pnpm build:h5
pnpm test:e2e
```

Playwright 会复用或启动 API 与 H5 预览服务。`pnpm db:down` 会停止本地容器并保留数据卷。

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
- [健康记录数据模型](docs/architecture/HEALTH_RECORD_MODEL.md)
- [训练记录数据模型](docs/architecture/WORKOUT_MODEL.md)
- [饮食记录数据模型](docs/architecture/NUTRITION_MODEL.md)
- [身份与建档数据模型](docs/architecture/IDENTITY_PROFILE_MODEL.md)
- [周计划数据模型](docs/architecture/PLAN_MODEL.md)
- [AI 计划解释模型](docs/architecture/AI_EXPLANATION_MODEL.md)
- [餐食照片候选模型](docs/architecture/FOOD_PHOTO_MODEL.md)
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

## 仓库同步说明

2026-07-18 初始化时，当前执行环境无法通过 GitHub HTTPS Git 协议或未授权 SSH 拉取，但可以访问官方源码归档。仓库基线因此从 GitHub 官方 `main` 归档恢复，并配置原始 `origin`。本地提交会持续保留；获得 GitHub 凭据后，需要先获取远端原始提交，再把本地提交重放到 `origin/main` 后推送，禁止未经确认强制覆盖远端。
