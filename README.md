# MyFitness / 衡迹

面向普通健身人群的多端记录与 AI 规划产品。产品把身体、训练、饮食和恢复数据整理为可解释、可调整、可持续执行的个人计划。

> 当前阶段：API foundation / 第 2 轮已完成。仓库已提供 Taro 今日页、NestJS API、共享健康记录契约、PostgreSQL 迁移与本地 Compose 环境；客户端仍使用夹具数据，账号与建档流程将在下一轮接入。

## 产品边界

- 首批用户：18 岁以上，以减脂、增肌、提升体能和习惯养成为目标的普通训练者。
- 第一发布面：微信小程序与 H5；验证留存后再扩展原生 App 和健康设备接入。
- AI 定位：解释记录、生成生活方式建议并协助调整计划，不诊断疾病，不替代医生、营养师或持证教练。
- 隐私默认：健康记录和身体照片按敏感数据保护，AI 估计值必须经用户确认后才能写入正式记录。

## 当前仓库结构

```text
apps/
  client/          Taro + React：微信小程序与 H5
  api/             NestJS：健康记录 API、OpenAPI 与迁移入口
packages/
  contracts/       Zod：跨端请求、响应和来源契约
  domain/          单位归一化、指标范围和确定性规则
  design-tokens/   颜色、字体、间距、动效和图表变量
docs/              产品、设计、架构和每轮迭代档案
infra/             PostgreSQL 迁移与本地 Docker Compose
output/playwright/ 浏览器视觉验收证据
```

后续迭代会按路线图逐步增加 `services/ai`、管理后台和发布基础设施，避免在没有实现的情况下制造空壳。

## 本地运行

需要 Node.js、pnpm 和微信开发者工具。安装依赖后可执行：

```bash
pnpm install
pnpm dev:h5
pnpm build:h5
pnpm build:weapp
pnpm test
pnpm typecheck
```

H5 和微信小程序产物分别生成到 `apps/client/dist-h5` 与 `apps/client/dist-weapp`，两次构建不会互相清理。

启动本地 API 与 PostgreSQL：

```bash
pnpm db:up
pnpm db:migrate
pnpm test:integration
pnpm dev:api
```

随后可访问 `http://127.0.0.1:3100/v1/health` 与 `http://127.0.0.1:3100/docs`。`x-demo-user-id` 仅用于本地开发边界，不代表已完成生产认证；`pnpm db:down` 会停止本地容器并保留数据卷。

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
- [设计系统](docs/design/DESIGN_SYSTEM.md)
- [技术架构](docs/architecture/ARCHITECTURE.md)
- [架构决策 0001](docs/architecture/decisions/0001-platform-architecture.md)
- [架构决策 0002](docs/architecture/decisions/0002-health-record-contract.md)
- [健康记录数据模型](docs/architecture/HEALTH_RECORD_MODEL.md)
- [API 契约与 OpenAPI](docs/api/README.md)
- [第 0 轮档案](docs/iterations/000-foundation.md)
- [第 1 轮档案](docs/iterations/001-client-foundation.md)
- [第 2 轮档案](docs/iterations/002-api-foundation.md)
- [移动端视觉证据](output/playwright/iteration-001-mobile.png)
- [宽屏视觉证据](output/playwright/iteration-001-wide.png)

## 仓库同步说明

2026-07-18 初始化时，当前执行环境无法通过 GitHub HTTPS Git 协议或未授权 SSH 拉取，但可以访问官方源码归档。仓库基线因此从 GitHub 官方 `main` 归档恢复，并配置原始 `origin`。本地提交会持续保留；获得 GitHub 凭据后，需要先获取远端原始提交，再把本地提交重放到 `origin/main` 后推送，禁止未经确认强制覆盖远端。
