# MyFitness / 衡迹

面向普通健身人群的多端记录与 AI 规划产品。产品把身体、训练、饮食和恢复数据整理为可解释、可调整、可持续执行的个人计划。

> 当前阶段：Foundation / 第 0 轮。仓库正在建立产品边界、设计系统、技术架构和可审计的迭代流程，尚未发布可运行版本。

## 产品边界

- 首批用户：18 岁以上，以减脂、增肌、提升体能和习惯养成为目标的普通训练者。
- 第一发布面：微信小程序与 H5；验证留存后再扩展原生 App 和健康设备接入。
- AI 定位：解释记录、生成生活方式建议并协助调整计划，不诊断疾病，不替代医生、营养师或持证教练。
- 隐私默认：健康记录和身体照片按敏感数据保护，AI 估计值必须经用户确认后才能写入正式记录。

## 计划中的仓库结构

```text
apps/
  client/          Taro + React：微信小程序与 H5
  admin/           Next.js：运营与内容管理后台
  api/             NestJS：业务 API 与异步任务入口
  mobile/          React Native：第二阶段原生 App
services/
  ai/              FastAPI：模型编排、视觉分析与评估
packages/
  contracts/       跨端 API 类型与数据校验
  domain/          指标、单位、计划和安全规则
  design-tokens/   颜色、字体、间距、动效和图表变量
docs/              产品、设计、架构和每轮迭代档案
infra/             本地环境、CI/CD 与部署清单
```

目录会随对应模块开始开发时创建，避免在没有实现的情况下制造空壳。

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
- [第 0 轮档案](docs/iterations/000-foundation.md)

## 仓库同步说明

2026-07-18 初始化时，当前执行环境无法通过 GitHub HTTPS Git 协议或未授权 SSH 拉取，但可以访问官方源码归档。仓库基线因此从 GitHub 官方 `main` 归档恢复，并配置原始 `origin`。本地提交会持续保留；获得 GitHub 凭据后，需要先获取远端原始提交，再把本地提交重放到 `origin/main` 后推送，禁止未经确认强制覆盖远端。
