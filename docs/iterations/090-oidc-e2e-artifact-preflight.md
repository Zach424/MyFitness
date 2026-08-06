# 第 090 轮：OIDC 浏览器验证产物预检

日期：2026-08-05

状态：已完成

## 1. 范围与验收标准

本轮修复 OIDC 浏览器验证可以复用错误 H5 身份产物的问题。验收要求：标准命令必须自动构建 OIDC H5；浏览器断言前必须证明当前完整文件树、身份模式、测试 API 基址和静态回调桥与本次构建收据一致；普通开发身份构建、缺失/过期收据或被修改的产物必须明确失败；测试收据不得进入发布候选；现有 OIDC 3 个浏览器场景、客户端发布和部署准入契约保持通过。

本轮只修改构建/测试脚本、Playwright 配置、CI 顺序、身份运行手册和相关架构记录。不修改 API、身份协议、客户端运行时代码、数据库、健康功能或真实云配置。

## 2. 项目结构、技术与设计状态

- `scripts/oidc-e2e-artifact.mjs`：无第三方依赖的完整 H5 树摘要、严格收据写入与验证模块。
- `scripts/oidc-e2e-artifact.test.ts`：覆盖正确收据、缺失收据、构建树漂移和回调桥缺失。
- `scripts/build-h5-oidc.mjs`：构建前删除旧收据，成功后才写入新摘要。
- `scripts/verify-oidc-e2e-artifact.mjs`：Playwright 全局预检入口，输出已验证的模式、API 基址和树摘要。
- `playwright.oidc.config.ts`：在浏览器用例前启用全局预检；4173 服务器仍可复用，但服务器内容必须与收据一致。
- `package.json`：`test:e2e:oidc` 自行执行 OIDC 构建；CI 删除重复构建。
- `.taro/oidc-e2e-artifact.json`：本机忽略文件，位于 `dist-h5` 外，不进入 Git、质量预算或候选 TAR。

## 3. 实现方法

### 用完整文件树绑定测试输入

摘要按相对路径排序，对每个文件写入路径、字节数和原始字节，再生成版本化 SHA-256。这样不只验证入口文件，也能发现任一异步块、样式或静态回调文件被另一轮构建替换。目录中的符号链接直接失败，避免摘要与实际读取目标分离。

### 把身份模式证明与发布元数据分开

测试收据严格只有 `schemaVersion`、`authMode`、`apiBaseUrl` 和 `treeSha256`。它固定声明 `oidc`，但没有版本、仓库、提交或候选交付级别，因此不能被误当成 `myfitness-client-build/v1`。收据放在 `.taro` 而非 `dist-h5`，从结构上阻止候选打包。

### 在页面断言前失败关闭

Playwright 全局预检重新读取回调桥、严格解析收据并计算当前树摘要。直接运行 runner 且没有收据时会报告应先执行 OIDC 构建；在有效收据之后执行普通 `build:h5`，会因 `auth/callback/index.html` 缺失而立即失败，而不是进入首页后等待登录按钮超时。

### 让标准命令只有一种正确顺序

`pnpm test:e2e:oidc` 现在先构建、写收据，再运行预检和浏览器场景。CI 只保留该命令，避免先构建一次、测试命令再重复构建。手工排障仍可直接调用 Playwright runner，但必须面对同一预检。

## 4. 验证证据

- 新测试首次因 `oidc-e2e-artifact.mjs` 不存在而按预期失败；实现后收据单测 4/4 通过。
- 收据/客户端发布/部署准入定点集合通过 3 个文件、25/25。
- 无收据直接运行 OIDC runner 在页面断言前明确失败；写入有效收据后再执行普通 `build:h5`，runner 因缺少 `auth/callback/index.html` 明确失败。
- 标准 `pnpm test:e2e:oidc` 自动构建，输出完全一致的 `written`/`verified` SHA-256，三个 OIDC 浏览器场景通过 3/3。
- 完整单元测试通过 81 个文件、419/419；严格工作区 TypeScript 通过。
- 客户端质量门禁通过，H5/WeApp 仍为 2,813,023/1,069,025 字节；入口、最大异步块、vendor 和最大页面预算均未变化，说明测试收据未进入产物。
- 生产依赖审计仍为 0 个 critical/high、9 个已登记 moderate。
- API/管理员、PostgreSQL 集成、AI 和主浏览器 94 项未重跑，因为本轮不修改产品运行时；沿用第 89 轮证据。
- 项目状态和本轮知识档案在提交前同步到 Obsidian 并做逐字节校验。

## 5. 发现的问题与经验

- “测试服务器可访问”不等于“测试产物身份模式正确”。复用端口时必须额外绑定被服务的文件树。
- 只检查静态回调文件仍不足以证明整个应用没有被另一轮构建替换；完整树摘要把收据与实际测试输入绑定在一起。
- 测试证明不能借用发布证明的名字或字段。测试收据不含发布来源和交付级别，避免把本地成功扩大成候选或上线声明。
- 旧收据必须在构建前删除，而不是在构建后覆盖；中途失败时留下旧证明会削弱失败关闭。
- 自包含命令比依赖人工记忆的两条命令更可靠，CI 也应删除因此产生的重复步骤。
- 第 89 轮先手工执行 OIDC 构建再运行测试才成功，正是本轮需要固化成工具契约的经验。

## 6. 全局状态、剩余风险与下一步

本地 OIDC 浏览器证明现在可复现地绑定到同一完整 H5 文件树；错误身份构建在浏览器断言前失败。它仍只使用本地 provider double 和 HTTP loopback，不能证明真实租户、域名、TLS、CORS、JWKS 轮换、账号恢复策略或托管回调行为。

根据用户新增要求，第 091 轮应独立执行权威文档中文化：先把 `docs/PROJECT_STATUS.md`、路线图和当前架构/运行手册的活跃状态段落迁移为中文，建立术语表与检查脚本，保证链接、代码字面量和历史语义不变。既有英文历史档案保留为历史证据，再按受控批次翻译，避免在功能轮中做不可审计的大范围改写。

云账号/预算、域名/TLS、真实微信/OIDC、生产对象存储/KMS、数据责任人、集中遥测、政策/备案、真实 WeApp 文件系统和付费模型 canary 仍是强制外部输入，但继续停放，等待用户最终接入。

本文件同时作为同步到 Obsidian 的第 090 轮知识档案；仓库内 `docs/PROJECT_STATUS.md` 仍是全局状态唯一权威来源。

## 7. 参考

- [第 089 轮档案](089-bounded-deferred-focus-reliability.md)
- [项目状态](../PROJECT_STATUS.md)
- [交付路线图](../product/ROADMAP.md)
- [ADR-0021](../architecture/decisions/0021-immutable-client-delivery-artifacts.md)
- [ADR-0027](../architecture/decisions/0027-h5-oidc-authorization-code-boundary.md)
- [ADR-0028](../architecture/decisions/0028-h5-oidc-browser-transaction-and-candidate.md)
- [ADR-0085](../architecture/decisions/0085-oidc-e2e-artifact-preflight.md)
- [用户身份运行手册](../operations/USER_IDENTITY_RUNBOOK.md)
- [架构基线](../architecture/ARCHITECTURE.md)
