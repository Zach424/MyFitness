# 用户身份运行手册

状态：微信与完整的 H5 OIDC 浏览器/API 交换、提供方绑定会话和已擦除身份抑制均已使用本地提供方替身完成验证；真实小程序凭据、身份租户、托管回调/域名及设备/共享环境证据仍受门禁限制。

## 信任边界

两个客户端都不是身份权威来源。

- WeApp 从 `Taro.login` 获取短期 code，并且只把该 code 发送到 `POST /v1/auth/wechat/session`。API 调用微信 `code2Session`，验证 `openid`，丢弃 `session_key`，并签发不透明 `mf_user_*` 令牌。
- H5 从 `GET /v1/auth/oidc/config` 读取浏览器安全值。发起标签页创建交易特定的 state、nonce 与 PKCE verifier，使用 `code_challenge_method=S256` 重定向，在网络操作前移除回调参数，验证 state/可选 issuer/精确回调，单次消费交易，并且只把 code、原始 verifier、nonce 与精确回调发送到 `POST /v1/auth/oidc/session`。API 交换 code 并验证已签名 ID Token，之后才签发同一种不透明产品令牌。

PostgreSQL 存储应用令牌的 SHA-256 哈希与显式提供方。OIDC 身份行存储单向 issuer/subject 摘要；微信身份存储以 AppID 为命名空间的 openid。绝不接受客户端提供的 `openid`、OIDC subject、issuer、audience、用户 ID 或会话提供方。绝不把授权 code、verifier、nonce、AppSecret、OIDC 客户端秘密、提供方令牌/响应或原始 subject 放入日志、指标、追踪、支持视图或浏览器可见配置。

## 配置

微信生产要求：

```dotenv
NODE_ENV=production
AUTH_ENABLED_PROVIDERS=wechat
WECHAT_MINI_APP_ID=wx...
WECHAT_MINI_APP_SECRET=<secret-manager-reference>
```

H5 OIDC 生产要求：

```dotenv
NODE_ENV=production
AUTH_ENABLED_PROVIDERS=oidc
USER_OIDC_ISSUER=https://identity.example.com
USER_OIDC_AUTHORIZATION_URL=https://identity.example.com/oauth2/authorize
USER_OIDC_TOKEN_URL=https://identity.example.com/oauth2/token
USER_OIDC_JWKS_URL=https://identity.example.com/.well-known/jwks.json
USER_OIDC_CLIENT_ID=myfitness-h5
USER_OIDC_CLIENT_SECRET=<optional-secret-manager-reference>
USER_OIDC_REDIRECT_URI=https://h5.example.com/auth/callback
```

两个发布客户端共享 API 时，使用 `AUTH_ENABLED_PROVIDERS=wechat,oidc`。生产环境禁止 `dev`；所有用户 OIDC URL 必须使用 HTTPS，且不能包含嵌入式凭据、查询或片段。在提供方登记精确回调 URI。可选客户端秘密属于 API 工作负载秘密，绝不能作为 H5/CI 构建变量。面向浏览器的配置路由有意省略 token/JWKS URL 与秘密。

生产环境把 `WECHAT_CODE_SESSION_URL` 固定为 `https://api.weixin.qq.com/sns/jscode2session`；只有非生产环境才接受覆盖，用于确定性集成测试。

小程序发布构建：

```powershell
$env:TARO_APP_AUTH_MODE = 'wechat'
$env:TARO_APP_API_BASE_URL = 'https://api.example.com/v1'
pnpm build:weapp
```

H5 OIDC 本地构建与浏览器证明：

```powershell
pnpm test:e2e:oidc
```

`test:e2e:oidc` 会先强制执行 OIDC 模式构建，再在仓库忽略的 `.taro` 目录写入绑定完整 `dist-h5` 文件树、OIDC 身份模式和测试 API 基址的 SHA-256 收据。Playwright 全局预检会在浏览器断言前核对该收据、当前文件树和两个静态回调文件；普通开发身份构建、过期收据、被修改的产物或错误 API 基址都会直接失败。收据不位于 `dist-h5`，因此不会进入候选 TAR，也不能替代发布构建中的 `myfitness-client-build.json`。

标签工作流提供已批准的 HTTPS API 基址和不可变发布元数据，并要求 `oidc / candidate`。其规范 TAR 必须包含 `index.html`、`auth/callback/index.html`、`auth/callback/redirect.js` 与 `myfitness-client-build.json`。候选状态只允许受控预览；在下面的真实提供方、域名、回调与数据保管预检通过前，不得向公开流量开放 H5。

## 共享环境预检

1. 为真实小程序与最终用户 OIDC 租户/客户端指定业务和技术责任人。记录提供方区域、保留、事件、账号恢复与可用性政策。
2. 把微信 AppSecret 与任何 OIDC 客户端秘密放入秘密管理器。将读取限制为 API 工作负载身份，并指定轮换/紧急撤销责任人。
3. 只登记以 `/auth/callback` 结尾的精确 H5 HTTPS 回调。配置静态主机直接提供该文件，不添加尾部斜杠，也不把它重写到 SPA 入口；验证回调 HTML 保留已审阅的 CSP/no-referrer 策略，并提供与 `/auth/callback/redirect.js` 完全一致的字节。把精确 H5 来源加入 API CORS，把精确 HTTPS API 来源加入微信请求域名允许列表。验证 DNS、证书链、WAF/代理路径与 `TRUST_PROXY_HOPS`。
4. 要求 Authorization Code 流程、PKCE S256、已签名 ID Token 和已批准的 RS256/PS256/ES256 密钥。为该客户端禁用 implicit/password 流程。确认 JWKS 轮换保留重叠密钥的时间足以覆盖进行中的交换。
5. 应用所有经过校验和验证的迁移，包括 0015 与 0019。确认提供方约束包含 `oidc`，并且抑制行接受该值。
6. 使用预期提供方列表启动 API。确认 `POST /v1/auth/dev/session` 返回 `404`；确认 OIDC 公开配置与已登记 issuer/client/callback 完全一致，且不包含 token 端点、JWKS URL 或秘密。
7. 在真实设备/浏览器上演练每个客户端的首次/重复登录。证明同一提供方身份解析为一个用户，跨提供方身份不会自动关联，受保护数据保持按所有者限定，无效/过期/重放 code 与 nonce/state/verifier 不匹配均会失败，并且回调参数从浏览器历史中消失。
8. 检查应用/数据库/遥测证据。确认其中没有提供方 code、verifier、nonce、秘密、原始 OIDC subject、上游 access/ID token、微信 `session_key` 或非预期 `openid`。
9. 为两个提供方演练账号删除。确认访问立即关闭、收据完成、原始身份移除、存在一个 HMAC 抑制，并且稍后返回 `403` 而不创建替代用户。
10. 针对已批准的隔离恢复路径运行 `pnpm ops:verify-backup-restore`，并把身份、擦除和部署证明一起保留。

## 事件与轮换

- 提供方不可用、JWKS 不可用或响应格式错误：返回通用 `503`，不创建用户，并且只针对聚合失败类别/比率告警。
- code 无效/过期、ID Token 错误或 nonce 不匹配：返回通用 `401`。精确回调/契约违规返回 `400`。除入口限制外，已验证会话尝试按规范化 IP 限制为每分钟 30 次。
- issuer/audience/algorithm/key 不符合预期：暂停 OIDC 签发。不得为了恢复可用性而扩大允许列表或跳过验证。
- 怀疑 AppSecret/OIDC 客户端秘密泄露：暂停该适配器，轮换提供方和秘密管理器值，重启工作负载，验证交换，并审阅聚合证据。现有不透明应用会话相互独立；只有事件范围需要时才撤销它们。
- JWKS 轮换中断：确认已配置 URL 与提供方重叠策略。恢复期间绝不临时固定公钥，也不接受未签名令牌。
- 已擦除身份：返回 `403` 符合预期。不得通过支持工具移除/绕过抑制。以新账号重新登记需要另行取得产品/法律批准和显式同意。
- `ERASURE_LEDGER_HASH_SECRET` 丢失/轮换：对恢复数据保持流量关闭。计划轮换前实现并演练版本化双读/双写。

## 回滚

提供方会话或抑制存在后，迁移 0015 与 0019 必须保持已应用。把故障适配器从 `AUTH_ENABLED_PROVIDERS` 移除，并暂停其登录/客户端流量。较旧 API 可能无法安全理解 OIDC 会话或 v2 擦除语义，因此必须保留兼容的擦除工作进程/对账器。绝不能为了让回滚看似健康而重新启用 `dev`、重新激活待删除用户、移除抑制、恢复原始 subject 或削弱令牌验证。

## 主要参考

- [Taro `login` API](https://docs.taro.zone/en/docs/apis/open-api/login/)
- [微信小程序登录流程](https://developers.weixin.qq.com/miniprogram/en/dev/framework/open-ability/login.html)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
- [RFC 7636: Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [ADR-0016](../architecture/decisions/0016-verified-wechat-identity-and-erasure-suppression.md)
- [ADR-0027](../architecture/decisions/0027-h5-oidc-authorization-code-boundary.md)
- [ADR-0028](../architecture/decisions/0028-h5-oidc-browser-transaction-and-candidate.md)
