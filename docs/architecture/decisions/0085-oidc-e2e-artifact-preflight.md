# ADR-0085：OIDC 浏览器验证产物必须先完成树摘要预检

日期：2026-08-05

状态：已接受

## 背景

H5 OIDC 浏览器测试依赖 `TARO_APP_AUTH_MODE=oidc` 构建和精确的静态回调桥，但原来的 `test:e2e:oidc` 只启动 Playwright。测试服务器允许复用已经运行的 4173 端口，因此普通 `dev` 身份产物也能通过服务器可达性检查，随后才以“登录按钮不存在”等三个页面断言失败。该错误既不能清楚指出产物身份模式不符，也无法证明浏览器测试面对的是刚构建的 OIDC 文件树。

发布候选已经有 `myfitness-client-build.json` 和不可变 TAR 契约，但本地 OIDC 测试不能伪造发布元数据，也不能把测试收据放进 `dist-h5` 后意外打包。

## 决策

- `pnpm test:e2e:oidc` 成为自包含命令：先执行 `build:h5:oidc`，成功后再启动 OIDC Playwright 配置。CI 删除重复的单独 OIDC 构建步骤。
- OIDC 构建开始前删除旧测试收据；构建失败时不生成新收据。
- 成功构建后，对 `dist-h5` 中按相对路径排序的所有普通文件计算版本化 SHA-256 树摘要。符号链接直接失败。
- 写入 `apps/client/.taro/oidc-e2e-artifact.json`，严格记录模式版本、固定 `oidc` 身份模式、测试 API 基址和树摘要。`.taro` 已被 Git 忽略且位于 `dist-h5` 外，因此收据不会进入客户端质量统计或候选 TAR。
- 写入和验证都要求 `index.html`、`auth/callback/index.html`、`auth/callback/redirect.js` 存在且非空。
- Playwright `globalSetup` 在页面断言前重新计算完整树摘要，并要求收据 API 基址与当前 `OIDC_E2E_API_BASE_URL` 完全一致。收据缺失、JSON/字段错误、身份模式错误、树变更、回调桥缺失或 API 基址漂移都失败关闭。
- 该收据只证明本地浏览器测试的输入产物一致，不替代发布候选元数据、真实 OIDC 提供方、域名/TLS/CORS、托管回调或部署准入。

## 影响

普通开发身份构建不再表现为三个模糊 UI 失败，而会在浏览器用例前明确报告缺失回调桥或过期/缺失收据。修改构建树后沿用旧收据同样会被拒绝。正常命令会输出相同的 `written` 与 `verified` 树摘要后再运行三个 OIDC 场景。

新增四个单元用例验证完整写入/核对、缺失收据、树变更和回调桥缺失；客户端发布与部署准入定点集合共 25/25 通过。完整单元测试为 81 个文件、419 项，OIDC 浏览器测试为 3/3。该变更不进入产品运行时代码，H5/WeApp 字节数与第 89 轮相同。

## 参考

- [ADR-0021：不可变客户端交付产物](0021-immutable-client-delivery-artifacts.md)
- [ADR-0027：H5 OIDC 授权码边界](0027-h5-oidc-authorization-code-boundary.md)
- [ADR-0028：H5 OIDC 浏览器事务与候选产物](0028-h5-oidc-browser-transaction-and-candidate.md)
- [用户身份运行手册](../../operations/USER_IDENTITY_RUNBOOK.md)
- [架构基线](../ARCHITECTURE.md)
