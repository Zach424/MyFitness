# 衡迹接口参考文档

状态：内部 Alpha 当前实现

基线日期：2026-08-10

接口版本：`/v1`

## 1. 范围与契约来源

本文覆盖当前 OpenAPI 中全部 67 个路径、87 个 HTTP 操作，并补充共享 Zod 契约、控制器和客户端恢复语义。机器可读的精确 Schema 以同目录的 `openapi.json` 为准；本文用于产品、前端、后端、测试和运维共同阅读。

当前接口分为普通用户 API、管理员 API、内部运维 API 和公开系统/签名媒体 API。除明确标为公开或内部令牌的接口外，均要求普通用户 Bearer 会话。

## 2. 通用约定

### 2.1 地址、格式与时间

- 本地默认地址：`http://127.0.0.1:3110/v1`。
- 普通请求和响应使用 `application/json; charset=utf-8`。
- 上传接口使用 `multipart/form-data`，字段名固定为 `file`。
- 时间戳使用 RFC 3339/ISO 8601 且必须带 `Z` 或明确偏移，例如 `2026-08-10T09:30:00+08:00`。
- 本地日期使用 `YYYY-MM-DD`；时区使用有效 IANA 名称，例如 `Asia/Shanghai`。
- ID 使用 UUID；稳定业务键通常匹配 `^[a-z0-9_]{2,80}$`。

### 2.2 身份头

| 场景     | 头                                         | 说明                                         |
| -------- | ------------------------------------------ | -------------------------------------------- |
| 普通用户 | `Authorization: Bearer <token>`            | 登录后得到的不透明访问令牌；数据库仅存哈希   |
| 管理员   | `Authorization: Bearer <admin-token>`      | 与普通用户会话完全分离                       |
| 内部运维 | `x-operations-token: <secret>`             | 只用于 `/v1/internal/*`                      |
| 删除回执 | `X-Erasure-Receipt-Token: <43-char token>` | 销户后恢复最小删除进度                       |
| 签名预览 | 查询参数中的短期签名令牌                   | 只允许读取一份私有净化媒体，不接受对象键直读 |

### 2.3 幂等与并发

- 创建类操作通过 `x-idempotency-key` 绑定“当前用户 + 操作 + 请求体”。建议使用随机 UUID 或至少 8 个字符的不可预测值。
- 同一键、同一内容返回原结果或原请求状态；同一键、不同内容返回 409。
- 修改请求体携带 `expectedRevision`；删除通过 `x-expected-revision`，两者必须为当前正整数 revision。
- 409 后调用方必须重新 GET 当前实体并让用户确认，不得自动覆盖。

### 2.4 游标分页

通用列表查询为 `limit` 与可选 `cursor`。普通当前列表上限通常为 50 或 100，授权历史上限 20，管理员审计上限 100。响应统一返回 `items` 或领域命名数组，以及 `nextCursor: string | null`。游标是不透明值，不应解码、拼接或跨用户复用。

### 2.5 缓存与敏感数据

- 身份、健康、计划、隐私和运维响应使用 `Cache-Control: no-store`。
- 响应不返回访问令牌哈希、对象存储键、身份提供方 secret 或内部用户哈希。
- 导出接口以附件 JSON 返回；客户端还要校验 `myfitness-portable-export-v4` 和 50 MiB 上限。

### 2.6 错误码

| 状态            | 统一含义                                 | 调用方动作                             |
| --------------- | ---------------------------------------- | -------------------------------------- |
| 400             | 请求体、路径、游标、时间、单位或结构非法 | 修正输入，不复用已被不同内容占用的键   |
| 401             | 会话、管理员令牌、运维令牌或回执秘密无效 | 重新认证或提供正确秘密                 |
| 403             | 角色、环境或授权不允许                   | 不重试；展示权限边界                   |
| 404             | 当前用户拥有范围内不存在                 | 结束旧意图或回到列表；不能枚举他人资源 |
| 409             | revision 冲突、幂等冲突或请求仍处理中    | 精确读取并协调，不盲重放               |
| 413             | 上传字节超限                             | 重新选择或压缩图片                     |
| 415             | 媒体类型不支持                           | 使用 JPEG、PNG 或静态 WebP             |
| 422             | 风险资格、授权或业务状态阻断             | 完成资料/授权或选择允许操作            |
| 429             | 速率限制                                 | 遵循重试时间；保持同一安全幂等语义     |
| 500/502/503/504 | 服务端或依赖不可用                       | 结果可能未知；先协调再决定重试         |

## 3. 核心请求与响应模型

### 3.1 会话模型

`UserSession`：`accessToken`、`userId`、`provider(dev|wechat|oidc|phone)`、`isNewUser`、`expiresAt`。开发会话响应不要求 provider/isNewUser，但仍返回 token、userId 和过期时间。

`AdminSession`：`accessToken`、`expiresAt`、`operator{operatorId,displayName,roles[],identityProvider}`；角色仅为 `support_reader`、`audit_reader`。

### 3.2 建档模型

`OnboardingWrite` 严格对象：

- `adultConfirmed: true`。
- `profile`：`displayName(1..40)`、`ageBand(18_24|25_34|35_44|45_54|55_64|65_plus)`、`sexForCalculations(female|male|unspecified)`、身高对象、`unitSystem(metric|imperial)`、`timezone(1..64)`。
- `goal`：`primaryGoal(fat_loss|muscle_gain|fitness|habit)`、`experience(beginner|intermediate|advanced)`、`availableDays(1..7)`、`sessionMinutes(15..180)`、非空器械与饮食偏好数组。
- `risk`：`flags[]` 与 `acknowledged:true`。
- `consents`：`terms:true`、`privacy:true`、`healthData:true`。
- 更新时可带 `expectedRevision`。

响应包含资料、目标、同意回执、当前 revision 和 `eligibility`；高风险时资格阻断，但资料仍可保存。

### 3.3 健康记录模型

`HealthRecordWrite`：

- `metric`：`body.weight`、`body.waist`、`body.body_fat`、`body.resting_heart_rate`、`recovery.sleep_duration`、`recovery.sleep_quality`、`recovery.soreness`、`recovery.energy`、`recovery.stress`。
- `value:number`；`unit` 为 `kg|lb|cm|in|percent|bpm|minute|hour|score_1_5`，且必须与 metric 匹配。
- `source{kind:manual|device|imported|ai_estimate,metadata?}`；`confidence?:0..1`；`status:candidate|confirmed`。
- `occurredAt`、`timezone`；更新增加 `expectedRevision`。

响应同时返回 display value/unit 与 canonical value/unit、source、status、revision 和审计时间。当前列表排除软删除行；历史项增加 `action(created|updated|deleted)` 与 `changedAt`。

### 3.4 训练模型

`WorkoutWrite`：`title(1..100)`、`source{kind:manual|imported,metadata?}`、`exercises(1..30)`、`startedAt`、`endedAt`、`timezone`、`painLevel(0..10)`、`fatigue(1..5)`、可选 `note(<=500)`。

每个动作：`position(1..50)`、`exerciseKey`、`name(1..80)`、`category(strength|cardio|mobility)`、可选 `trackingMode(reps_load|duration|duration_distance)`、最多 6 项 `equipment`、可选器械说明/备注、`sets(1..50)`。

每组：`position(1..100)`、`kind(warmup|working|cooldown)`、按记录方式提供 `reps(1..1000)`、`load(0..1000)`、`loadUnit(kg|lb)`、`durationSeconds(1..86400)`、`distanceMeters(1..500000)`、`rpe(1..10)`，并显式 `completed:boolean`。服务端派生 completed/partial 与汇总，不信任废弃的客户端 status。

### 3.5 动作目录模型

`ExerciseCatalogWrite`：`name(1..80)`、`aliases(<=8)`、`category`、`trackingMode`、`equipment(1..6)`、可选 `equipmentNotes(1..120)`；更新增加 `expectedRevision`。响应包含稳定 key、revision、创建/更新时间；归档后离开当前列表，历史仍保留。

### 3.6 食物、餐食与收藏模型

`FoodSnapshot`：`foodKey`、`name(1..100)`、`category(staple|protein|vegetable|fruit|dairy|snack|custom)`、每 100g 营养 `energyKcal(0..1000)`、蛋白/碳水/脂肪 `0..100`、可选纤维、`reference(2..200)`。

`FoodCatalogWrite` 在快照定义上增加最多 8 个别名和 `defaultServing{amount>0,unit:g|ml|piece|serving,grams>0}`；更新增加 expectedRevision。

`MealWrite`：`mealType(breakfast|lunch|dinner|snack)`、`title(1..80)`、`source(manual|imported)`、`items(1..30)`、`occurredAt`、`timezone`、可选 `note(<=500)`。每项含 `position(1..100)`、食物快照及 serving。更新增加 expectedRevision。

`FavoriteWrite`：食物完整快照与默认 serving，以 path 中的 `foodKey` 为主键，PUT 为建立/替换，DELETE 为移除。

### 3.7 计划模型

`GenerateWeeklyPlan`：`{weekStart:YYYY-MM-DD}`，该日期必须真实且为周一。

`PlanDecision`：`decision(accepted|modified|skipped)`、`expectedRevision`、`selections[{activityId,optionId}]<=24`、可选 `note(1..300)`。modified 至少一个 selection；其他决定不得带 selection；activityId 不得重复。

`WeeklyPlan` 关键字段：`id,userId,weekStart,timezone,engineVersion:deterministic-v1,status,revision,days[7],nutritionFocuses[3..4],reasons[1..8],evidence,createdAt,updatedAt`。每个 session 含 kind、标题、10–90 分钟、easy/moderate、1–8 个活动及替代项。

`PlanWorkoutLinkWrite`：`expectedPlanRevision`、`sessionDate`、`workoutId`、`expectedWorkoutRevision`。返回关联会同时暴露锁定 revision 和当前 workout revision。

`ReflectionWrite`：`experience(easier_than_expected|about_right|not_right_for_me|not_sure_yet)`、`expectedRevision>=0`；0 表示尚未创建。

### 3.8 AI 解释模型

请求：`expectedPlanRevision` 与 `consent{purpose:'ai_plan_explanation',version:'ai-plan-explanation-2026-07-19.v1',accepted:true}`。

响应：`id,planId,planRevision,source(model|fixture|fallback),provider(fixture|openai|unavailable),model,promptVersion,validatorVersion,failureCode?,content,safetyNote,createdAt`。`content` 为 headline、overview、2–4 个 highlights 和 nextStep；highlight 的 evidenceKeys 来自计划日程、本人体验、恢复、近期活动/训练/餐食和营养关注。

### 3.9 照片模型

餐食照片预约请求只含单次授权 `granted:true`、版本 `food-photo-analysis-2026-07-19.v1`。确认请求为 `items(1..5)[{catalogKey,grams integer 5..2000}]`。

进度照预约包含 `view(front|side|back)`、`capturedAt`、`timezone`、分析授权和 retention 联合类型：`analysis_only`，或 `retained` 加独立保留授权。上传返回净化媒体元数据与仅描述拍摄条件的 quality。

### 3.10 隐私模型

- 撤权：`{confirmed:true}`，purpose 只能是 `ai_plan_explanation|food_photo_analysis|progress_photo_analysis|progress_photo_retention`。
- 删除意图响应：`intentId,intentToken(43 chars),expiresAt`。
- 删除请求：`intentId`、`confirmationPhrase:'删除我的衡迹账户'`、`exportChoice(downloaded|skip)`、`understandsPermanent:true`；intent token 作为受控请求凭据提交。
- 删除回执：`status(queued|running|completed|dead_letter)`、`deleted`、`scopeVersion:durable-erasure-v2`、主库/媒体/提供方/备份状态、时间与可选 errorCode。

## 4. 用户身份与建档接口

| 方法与路径                     | 鉴权         | 参数                                                                       | 功能与成功响应                                              | 主要失败                |
| ------------------------------ | ------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------- |
| `POST /v1/auth/dev/session`    | 公开，仅本地 | body `subject(3..128, [A-Za-z0-9._:-])`                                    | 创建演示会话；200 UserSession                               | 400；生产环境 404       |
| `POST /v1/auth/wechat/session` | 公开         | body `code(1..128)`                                                        | 交换微信一次性码；200 UserSession                           | 400、401/503 提供方失败 |
| `GET /v1/auth/oidc/config`     | 公开         | 无                                                                         | 200 `issuer,authorizationUrl,clientId,redirectUri,scopes[]` | 404/503 未配置          |
| `POST /v1/auth/oidc/session`   | 公开         | body `code(8..2048),codeVerifier(43..128),nonce(43..128),redirectUri(uri)` | 验证 PKCE/OIDC 并创建会话；200 UserSession                  | 400、401、503           |
| `GET /v1/me/onboarding`        | 用户 Bearer  | 无                                                                         | 读取当前资料、目标、授权、资格和 revision                   | 401、404 未建档         |
| `PUT /v1/me/onboarding`        | 用户 Bearer  | body OnboardingWrite                                                       | 建立或更正资料；200 当前建档                                | 400、401、409           |

## 5. 健康记录接口

| 方法与路径                                  | 参数                                                 | 功能与成功响应     | 失败               |
| ------------------------------------------- | ---------------------------------------------------- | ------------------ | ------------------ |
| `POST /v1/health-records`                   | header `x-idempotency-key`; body HealthRecordWrite   | 201 创建当前记录   | 400、401、409      |
| `GET /v1/health-records`                    | query `limit(1..100),cursor?`                        | 200 当前记录页     | 400、401           |
| `GET /v1/health-records/{recordId}`         | path UUID                                            | 200 当前精确记录   | 401、404           |
| `PUT /v1/health-records/{recordId}`         | path UUID; body HealthRecordWrite + expectedRevision | 200 更正并创建修订 | 400、401、404、409 |
| `DELETE /v1/health-records/{recordId}`      | path UUID; header `x-expected-revision`              | 204 软删除         | 401、404、409      |
| `GET /v1/health-records/{recordId}/history` | path UUID; query `limit(1..50),cursor?`              | 200 不可变修订页   | 400、401、404      |

## 6. 训练与动作目录接口

### 6.1 训练

| 方法与路径                             | 参数                                  | 功能与成功响应            | 失败               |
| -------------------------------------- | ------------------------------------- | ------------------------- | ------------------ |
| `POST /v1/workouts`                    | idempotency header; body WorkoutWrite | 201 创建训练及嵌套动作/组 | 400、401、409      |
| `GET /v1/workouts`                     | `limit(1..50),cursor?`                | 200 当前训练页            | 400、401           |
| `GET /v1/workouts/{workoutId}`         | UUID                                  | 200 当前精确训练          | 401、404           |
| `PUT /v1/workouts/{workoutId}`         | UUID; WorkoutWrite + expectedRevision | 200 原子替换并修订        | 400、401、404、409 |
| `DELETE /v1/workouts/{workoutId}`      | UUID; `x-expected-revision`           | 204 软删除                | 401、404、409      |
| `GET /v1/workouts/{workoutId}/history` | UUID; `limit(1..50),cursor?`          | 200 嵌套快照修订页        | 400、401、404      |

### 6.2 自定义动作目录

| 方法与路径                                   | 参数                                     | 功能与成功响应         | 失败               |
| -------------------------------------------- | ---------------------------------------- | ---------------------- | ------------------ |
| `POST /v1/exercise-catalog`                  | idempotency header; ExerciseCatalogWrite | 201 新定义             | 400、401、409      |
| `GET /v1/exercise-catalog`                   | `limit,cursor?`                          | 200 当前活动定义页     | 400、401           |
| `PUT /v1/exercise-catalog/{entryId}`         | UUID; write + expectedRevision           | 200 纠正定义           | 400、401、404、409 |
| `DELETE /v1/exercise-catalog/{entryId}`      | UUID; `x-expected-revision`              | 204 归档，历史快照不变 | 401、404、409      |
| `GET /v1/exercise-catalog/{entryId}/history` | UUID; `limit,cursor?`                    | 200 修订页             | 400、401、404      |

## 7. 餐食、收藏与食物目录接口

### 7.1 餐食

| 方法与路径                                 | 参数                               | 功能与成功响应         | 失败               |
| ------------------------------------------ | ---------------------------------- | ---------------------- | ------------------ |
| `POST /v1/nutrition/meals`                 | idempotency header; MealWrite      | 201 创建餐食与项目快照 | 400、401、409      |
| `GET /v1/nutrition/meals`                  | `limit(1..50),cursor?`             | 200 当前餐食页         | 400、401           |
| `GET /v1/nutrition/meals/{mealId}`         | UUID                               | 200 当前精确餐食       | 401、404           |
| `PUT /v1/nutrition/meals/{mealId}`         | UUID; MealWrite + expectedRevision | 200 更正并修订         | 400、401、404、409 |
| `DELETE /v1/nutrition/meals/{mealId}`      | UUID; `x-expected-revision`        | 204 软删除             | 401、404、409      |
| `GET /v1/nutrition/meals/{mealId}/history` | UUID; `limit,cursor?`              | 200 修订页             | 400、401、404      |

### 7.2 收藏

| 方法与路径                                 | 参数                                               | 功能与成功响应         | 失败          |
| ------------------------------------------ | -------------------------------------------------- | ---------------------- | ------------- |
| `GET /v1/nutrition/favorites`              | 用户 Bearer                                        | 200 当前全部收藏       | 401           |
| `PUT /v1/nutrition/favorites/{foodKey}`    | stable foodKey; body FoodSnapshot + defaultServing | 200 建立或替换收藏快照 | 400、401、409 |
| `DELETE /v1/nutrition/favorites/{foodKey}` | stable foodKey                                     | 204 移除收藏           | 401、404/409  |

### 7.3 自定义食物目录

| 方法与路径                               | 参数                                 | 功能与成功响应     | 失败               |
| ---------------------------------------- | ------------------------------------ | ------------------ | ------------------ |
| `POST /v1/food-catalog`                  | idempotency header; FoodCatalogWrite | 201 新定义         | 400、401、409      |
| `GET /v1/food-catalog`                   | `limit,cursor?`                      | 200 当前活动定义页 | 400、401           |
| `PUT /v1/food-catalog/{entryId}`         | UUID; write + expectedRevision       | 200 纠正定义       | 400、401、404、409 |
| `DELETE /v1/food-catalog/{entryId}`      | UUID; `x-expected-revision`          | 204 归档           | 401、404、409      |
| `GET /v1/food-catalog/{entryId}/history` | UUID; `limit,cursor?`                | 200 修订页         | 400、401、404      |

## 8. 餐食照片候选接口

| 方法与路径                                              | 参数                                 | 功能与成功响应                      | 失败                              |
| ------------------------------------------------------- | ------------------------------------ | ----------------------------------- | --------------------------------- |
| `POST /v1/nutrition/photo-candidates`                   | idempotency header; 单次分析授权     | 201 预约临时私有工作流              | 400、401、409、422                |
| `GET /v1/nutrition/photo-candidates`                    | 用户 Bearer                          | 200 当前用户仍可审阅/追踪的候选清单 | 401                               |
| `POST /v1/nutrition/photo-candidates/{photoId}/upload`  | UUID; multipart `file`               | 200/201 净化、分析并返回候选状态    | 400、401、404、409、413、415、422 |
| `GET /v1/nutrition/photo-candidates/{photoId}/preview`  | UUID + 短期签名 token                | 返回净化图片二进制                  | 401/403、404、410                 |
| `POST /v1/nutrition/photo-candidates/{photoId}/confirm` | UUID; `{items:[{catalogKey,grams}]}` | 200 确认候选并启动媒体删除          | 400、401、404、409、422           |
| `DELETE /v1/nutrition/photo-candidates/{photoId}`       | UUID                                 | 204 关闭候选并排队删除              | 401、404、409                     |

注意：确认响应不是 `Meal`，不会调用餐食创建接口；调用方只能把确认项放入未保存草稿。

## 9. 进度照片接口

| 方法与路径                                  | 参数                                                   | 功能与成功响应                   | 失败                              |
| ------------------------------------------- | ------------------------------------------------------ | -------------------------------- | --------------------------------- |
| `POST /v1/progress-photos`                  | idempotency header; 视角、时间、分析授权、保留联合类型 | 201 预约                         | 400、401、409、422                |
| `GET /v1/progress-photos`                   | 用户 Bearer                                            | 200 当前私有照片清单             | 401                               |
| `POST /v1/progress-photos/{photoId}/upload` | UUID; multipart `file`                                 | 200 净化媒体、质量检查与保留状态 | 400、401、404、409、413、415、422 |
| `GET /v1/progress-photos/{photoId}/preview` | UUID + 签名 token                                      | 私有净化图片二进制               | 401/403、404、410                 |
| `DELETE /v1/progress-photos/{photoId}`      | UUID                                                   | 204 从当前清单移除并排队对象删除 | 401、404、409                     |

## 10. 洞察接口

全部接口要求用户 Bearer。通用 query 为 `timezone(1..64, valid IANA)` 和可选 `at(date-time with offset)`；`at` 主要用于可复现测试或按参考时刻读取。

| 方法与路径                                 | 额外参数          | 功能与响应边界                                      | 失败     |
| ------------------------------------------ | ----------------- | --------------------------------------------------- | -------- |
| `GET /v1/insights/dashboard`               | 无                | 当前日证据、准备度、固定 7/30/90 趋势、个人状态账本 | 400、401 |
| `GET /v1/insights/history-calendar`        | 无                | 连续 28 个本地日及三类当前计数                      | 400、401 |
| `GET /v1/insights/health/{metric}`         | path HealthMetric | 固定 7/30/90 窗口、最多 180 点、hasMore             | 400、401 |
| `GET /v1/insights/exercises/{exerciseKey}` | path stable key   | 动作身份、固定窗口、完成组汇总、最多 180 点         | 400、401 |
| `GET /v1/insights/nutrition`               | 无                | 连续 90 日与由序列重算的 7/30/90 营养窗口           | 400、401 |

契约不变量：窗口必须严格按 `[7,30,90]`；动作/健康来源窗口行只能使用这三个身份且不得重复，缺失行仍生成空窗口，输入顺序不影响响应；参考时刻与来源点必须是有效时刻，点不得晚于 generatedAt；本地日期必须与 occurredAt 在响应时区中一致；动作/健康点按 occurredAt 非递增且聚合 UUID 唯一，相同时刻允许、重复身份不去重；动作顶层 `identity` 与首点快照一致，健康顶层和全部点使用首点 `canonicalUnit`，空序列时两个摘要均为 `null`；`hasMore:true` 要求恰好 180 个公开点，而 `hasMore:false + 180 点` 仍是合法的不可区分状态；空证据保持 null 而非零。

## 11. 周计划与回看接口

| 方法与路径                                                       | 参数                                   | 功能与成功响应                                | 失败                    |
| ---------------------------------------------------------------- | -------------------------------------- | --------------------------------------------- | ----------------------- |
| `POST /v1/plans/weekly`                                          | idempotency header; GenerateWeeklyPlan | 201 生成或修订当前周计划                      | 400、401、409、422      |
| `GET /v1/plans/weekly`                                           | 用户 Bearer                            | 200 当前计划列表，每项含 freshness 与活动关联 | 401                     |
| `PUT /v1/plans/weekly/{planId}/decision`                         | UUID; PlanDecision                     | 200 采用、替代或跳过并产生 revision           | 400、401、404、409、422 |
| `GET /v1/plans/weekly/{planId}/history`                          | UUID; `limit(1..50),cursor?`           | 200 计划决定历史                              | 400、401、404           |
| `POST /v1/plans/weekly/{planId}/session-links`                   | UUID; PlanWorkoutLinkWrite             | 201 锁定计划/训练版本的活动关联               | 400、401、404、409、422 |
| `DELETE /v1/plans/weekly/{planId}/session-links/{linkId}`        | 两个 UUID; `x-expected-revision`       | 204 关闭关联                                  | 401、404、409           |
| `GET /v1/plans/weekly/{planId}/history/{revision}/outcome`       | plan UUID; positive revision           | 200 精确采用版本的 7 日回看                   | 400、401、404、422      |
| `GET /v1/plans/weekly/{planId}/history/{revision}/reflection`    | 同上                                   | 200 `{planId,planRevision,reflection          | null}`                  | 400、401、404 |
| `PUT /v1/plans/weekly/{planId}/history/{revision}/reflection`    | 同上; ReflectionWrite                  | 200 建立或更正本人体验                        | 400、401、404、409、422 |
| `DELETE /v1/plans/weekly/{planId}/history/{revision}/reflection` | 同上; `x-expected-revision`            | 204 删除本人体验                              | 401、404、409           |

## 12. AI 解释接口

| 方法与路径                                          | 参数                                  | 功能与成功响应                                                              | 失败                    |
| --------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- | ----------------------- |
| `POST /v1/plans/weekly/{planId}/explanation`        | UUID; idempotency header; AI 请求模型 | 201 已验证解释或确定性 fallback                                             | 400、401、404、409、422 |
| `GET /v1/plans/weekly/{planId}/explanation-request` | UUID; 原 `x-idempotency-key`          | 200 `pending{requestId,planRevision,expiresAt}` 或 `completed{explanation}` | 400、401、404           |
| `GET /v1/plans/weekly/{planId}/explanations`        | UUID                                  | 200 `{planId,items<=20}` 不可变运行档案                                     | 401、404                |

## 13. 隐私接口

| 方法与路径                                      | 鉴权与参数                                         | 功能与成功响应                                       | 失败                   |
| ----------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ---------------------- |
| `GET /v1/me/privacy`                            | 用户 Bearer                                        | 200 数据库存、授权、导出和删除能力概览               | 401                    |
| `GET /v1/me/privacy/consents/history`           | Bearer; `limit(1..20),cursor?`                     | 200 授权回执历史                                     | 400、401               |
| `POST /v1/me/privacy/consents/{purpose}/revoke` | Bearer; path 可撤回 purpose; `{confirmed:true}`    | 200 revoked 状态及清理数量                           | 400、401、404/409、422 |
| `GET /v1/me/privacy/export`                     | 用户 Bearer                                        | 200 附件 JSON，Schema v4，包含历史与净化照片导出证据 | 401、413/500           |
| `POST /v1/me/privacy/account-deletion-intents`  | 用户 Bearer                                        | 201 15 分钟 intentId、intentToken、expiresAt         | 401、409               |
| `DELETE /v1/me/privacy/account`                 | Bearer + 删除意图凭据; body AccountDeletionRequest | 202/200 返回带 statusToken 的删除回执并关闭会话      | 400、401、409、422     |
| `GET /v1/privacy/erasure-receipts/{receiptId}`  | receipt UUID + `X-Erasure-Receipt-Token`           | 200 最小删除状态                                     | 401、404               |
| `POST /v1/privacy/erasure-receipts/recover`     | `X-Erasure-Receipt-Token`                          | 200 在响应丢失后恢复对应最小回执                     | 401、404               |

## 14. 管理员接口

管理员 API 使用独立 Bearer；管理端通常通过同源 BFF 的 HttpOnly Cookie 代理，不把 token 暴露给浏览器脚本。

| 方法与路径                            | 角色/参数                                                                                 | 功能与成功响应                  | 失败            |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- | --------------- |
| `POST /v1/admin/auth/dev/session`     | 本地；`subject(3..128),displayName(1..80),roles(1..2 unique)`                             | 200 AdminSession                | 400；生产 404   |
| `POST /v1/admin/auth/oidc/exchange`   | 公开交换；`idToken(80..16384),nonce(16..256)`                                             | 200 仅预配置身份的 AdminSession | 400、401/403    |
| `GET /v1/admin/auth/me`               | 管理 Bearer                                                                               | 200 当前操作员与角色            | 401、403        |
| `DELETE /v1/admin/auth/session`       | 管理 Bearer                                                                               | 204 吊销当前管理会话            | 401、403        |
| `POST /v1/admin/support/users/lookup` | `support_reader`; `accountId(UUID),ticketReference(3..40 uppercase),reason(account_access | data_export                     | account_erasure | technical_issue)` | 200 受限账户汇总与 lookupReceiptId | 400、401、403、404；所有结果审计 |
| `GET /v1/admin/audit`                 | `audit_reader`; `limit(1..100,default25),cursor?`                                         | 200 `{events,nextCursor}`       | 400、401、403   |

审计 event：`eventId,operatorId?,action,outcome,targetType?,targetRef?(SHA-256 hex),requestId,details(<=8 bounded fields),occurredAt`。数据库禁止修改和删除审计行。

## 15. 内部运维接口

| 方法与路径                                    | 参数                 | 功能与响应                              | 失败 |
| --------------------------------------------- | -------------------- | --------------------------------------- | ---- |
| `GET /v1/internal/metrics`                    | `x-operations-token` | 200 Prometheus 文本，进程本地聚合指标   | 401  |
| `GET /v1/internal/data-operations`            | 同上                 | 200 持久任务按状态/类型聚合的队列健康   | 401  |
| `POST /v1/internal/data-operations/drain`     | 同上，无 body        | 200 一次有界 claim/success/failure 计数 | 401  |
| `GET /v1/internal/ai-explanations`            | 同上                 | 200 AI 运行 pending/完成/降级聚合       | 401  |
| `POST /v1/internal/ai-explanations/reconcile` | 同上，无 body        | 200 本轮转为确定性 fallback 的数量      | 401  |

内部响应不得包含用户 ID、健康内容、对象键或模型原始敏感提示。

## 16. 系统接口

| 方法与路径            | 鉴权 | 功能与响应                                                 |
| --------------------- | ---- | ---------------------------------------------------------- |
| `GET /v1/health/live` | 公开 | 200 进程存活；不检查外部依赖                               |
| `GET /v1/health`      | 公开 | 200 ready 或 503 not ready；检查数据库、对象存储等必要依赖 |

## 17. 调用示例

### 17.1 创建一条体重记录

```http
POST /v1/health-records HTTP/1.1
Authorization: Bearer <token>
x-idempotency-key: 5e40507d-3d43-4ac0-a7b9-8e46a4b6d8b0
Content-Type: application/json

{
  "metric": "body.weight",
  "value": 70.4,
  "unit": "kg",
  "source": { "kind": "manual" },
  "status": "confirmed",
  "occurredAt": "2026-08-10T07:30:00+08:00",
  "timezone": "Asia/Shanghai"
}
```

### 17.2 更正与冲突处理

```http
PUT /v1/health-records/2d52b41a-92fe-47f1-a57e-2d2c8df3d668 HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "metric": "body.weight",
  "value": 70.2,
  "unit": "kg",
  "source": { "kind": "manual" },
  "status": "confirmed",
  "occurredAt": "2026-08-10T07:30:00+08:00",
  "timezone": "Asia/Shanghai",
  "expectedRevision": 1
}
```

返回 409 时先调用精确 GET，比较当前 revision 和内容；不得把 expectedRevision 改成最新值后自动覆盖。

### 17.3 生成 AI 解释

```http
POST /v1/plans/weekly/49f63852-948b-4bd6-aefa-fbc9a3b15df1/explanation HTTP/1.1
Authorization: Bearer <token>
x-idempotency-key: eec361cf-180c-402d-9d1f-24c706ef53d3
Content-Type: application/json

{
  "expectedPlanRevision": 3,
  "consent": {
    "purpose": "ai_plan_explanation",
    "version": "ai-plan-explanation-2026-07-19.v1",
    "accepted": true
  }
}
```

若连接在响应前断开，应使用相同 idempotency key 调用 `GET .../explanation-request`，而不是再次 POST。

## 18. 版本管理与兼容边界

- 当前外部前缀固定为 `/v1`，但内部 Schema 仍可能在 Alpha 阶段通过迁移演进。
- 响应对象为严格 Schema；客户端应拒绝错误类型和不满足跨字段不变量的响应。
- revision、source、timezone、occurredAt 和历史快照是健康数据可追责性的组成部分，不得在未来兼容层中静默丢弃。
- OpenAPI 当前以内联 Schema 为主，没有复用 components；生成 SDK 前应以契约测试验证 nullable、联合类型和自定义跨字段约束。

## 19. 参考

- [OpenAPI 机器契约](openapi.json)
- [现有英文 API 说明](README.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [数据库设计文档](../architecture/DATABASE_DESIGN.md)
- [架构基线](../architecture/ARCHITECTURE.md)
