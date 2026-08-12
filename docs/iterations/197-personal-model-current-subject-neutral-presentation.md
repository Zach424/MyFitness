# 第 197 轮：Personal Model 当前主题中性展示

日期：2026-08-12

分类：F（Feature）

状态：已完成

## 1. 范围与验收标准

本轮只实现当前主题纯展示模型与 props-only 最小卡片。三个 claim 必须转换为中性中文，严格区分本人提交安排与系统整理的已记录行为；空主题、资料不足、用户不同意和终态不能被显示为零、成功、表现评价或可用计划依据。证据计数必须与观察窗口、截止时间和限制一起显示，不生成完成率、依从率、能力评级、效果判断或行动建议。

本轮不接 API、页面、路由、React hook、自动读取、持久缓存、轮询、反馈操作、lineage、证据分页、Weekly Cognitive Review、模型导出、LLM 或云资源。组件未被页面导入，双端产物不得增长。

## 2. 项目结构、设计、技术与实现功能

- `apps/client/src/lib/personal-model-current-subject-presentation.ts`
  - 新增三个主题、空态、五种 item 状态、五种本人核对、四档资料覆盖、六种限制、证据计数和声明时区的纯展示模型。
- `apps/client/src/lib/personal-model-current-subject-presentation.test.ts`
  - 使用共享严格 Schema 解析夹具，覆盖三个 claim、空态、异议、终态、时区和禁用措辞。
- `apps/client/src/components/personal-model-current-subject-card/index.tsx`
  - 新增只消费展示 props 的无交互 Taro 卡片，使用 group/status 与证据/限制具名分组。
- `apps/client/src/components/personal-model-current-subject-card/index.scss`
  - 复用现有设计令牌；四格证据刻度是唯一标志性结构，窄屏转为 2×2。
- `apps/client/src/components/personal-model-current-subject-card/index.test.ts`
  - 保护无 API/副作用/按钮、无障碍分组、共享令牌与移动端网格。
- ADR-0191、Personal Model、架构、接口参考、已实现 PRD、路线图、风险和项目状态同步更新。

## 3. 实现方法

1. 展示模型接收严格 `PersonalModelCurrentSubjectView`，不重复网络解析。判别联合保证三个 claim 的字段访问与共享契约一致。
2. 空主题返回独立 empty 类型，不创建默认零值、占位证据或伪时间，并直说当前结果不代表零或系统已了解。
3. 可训练安排使用本人提交来源，星期按共享 `mon…sun` 枚举转换为中文；摘要明确不代表完成训练。
4. 已记录频次显示完整周、中位数、最小/最大和纳入课次数；不把没有记录解释为没有训练。
5. 已记录时长显示样本、中位数和中间一半区间；使用描述性统计，不评价效果、能力、强度或质量。
6. 系统 status 与本人 feedbackState 使用两套映射。异议同时在状态、本人核对和限制中可见；终态显示结束时间，不冒充当前建议依据。
7. confidence 只转换为资料覆盖语言和限制列表，不暴露概率或分数。证据刻度保留四个整数，绝不归一化成百分比。
8. 观察窗口、asOf 和有效期使用 evidence 声明的 IANA 时区格式化，避免浏览设备时区静默改写来源语境。
9. 组件不导入 API 或读取状态，也不提供尚不可用的反馈按钮；它只是未来页面可组合的展示叶节点。
10. 视觉自审删去无作用的动画规则，提高辅助文字字号；窄屏把四格刻度转为 2×2，信息顺序不变。

## 4. 验证证据

- 定向展示模型与组件结构：2 个文件、11 项通过。
- 完整单元测试：112 个文件、672 项通过。
- 完整 PostgreSQL 集成测试：29 个文件、174 项通过。
- 客户端与全工作区 typecheck 通过；生产 H5、API、admin 和 WeApp 构建通过。
- 生产依赖审计保持 0 个 critical/high，9 个已登记 moderate。
- H5 总量/入口/最大异步块为 1,206,969/315,262/149,734 字节；WeApp 总量/vendor/最大页面为 1,105,112/19,338/56,943 字节，均通过预算且与第 196 轮逐字节相同，证明未接线组件没有进入页面产物。
- 本轮不改变 API、数据库或浏览器页面；沿用 44 个迁移、29/174 集成和 95 项浏览器基线，不据此声称存在用户可见 Personal Model 页面。
- 中文文档、迁移索引、格式、Git 差异和 Obsidian 校验在提交前完成。

## 5. 发现的问题与经验

- 共享 weekday 枚举是 `mon…sun`，不能凭自然语言猜测为全名；严格类型检查及时阻止展示映射漂移。
- 置信等级不是概率。离散覆盖等级应配限制与证据时域，不应用环形图、百分比或进度条制造精度。
- 系统状态和本人反馈不是同一轴。用户 confirmed 不会消除证据限制，disagreed 也不能只藏在一个小标签里。
- 空主题需要主动解释。如果只显示“暂无数据”，用户仍可能理解为零训练或资料缺失失败。
- 中位数和四分位数可以描述记录分布，但必须与“已记录”和“不评价效果”同屏，避免统计描述滑向能力判断。
- 组件先保持 props-only，使文案与结构可以在没有 Taro 运行时和网络副作用的情况下完成安全审查。
- 设计上的大胆应集中在一个有语义的结构。证据刻度编码真实分类计数，其余视觉保持安静，比装饰性渐变或评分仪表更符合产品信任边界。

## 6. 全局状态、项目反思与下一步

当前主题已经形成从数据库选择、最小投影、认证 no-store HTTP、客户端严格解析、页面内存读取权限到中性展示叶节点的完整技术链，但用户仍无法进入这个链路。把展示组件暂时留在产物之外，避免在加载/失败/刷新/卸载状态尚未接通时暴露半成品。

下一轮只实现一个固定主题的独立页面读取闭环：进入时读取、刷新和失败重试复用既有读取权限，ready/refreshing/stale 复用本轮卡片，空主题独立呈现，卸载时使在途回调失效。先不批量读取三个主题，不开放反馈或历史。

lineage/证据分页、Weekly Cognitive Review、Personal Model 便携导出、自动调度、Pattern/Hypothesis、LLM 与 Contextual Decision 继续后置。

## 7. 参考

- [第 196 轮档案](196-personal-model-client-current-subject-read-authority.md)
- [项目状态](../PROJECT_STATUS.md)
- [个人认知模型](../architecture/PERSONAL_MODEL.md)
- [架构基线](../architecture/ARCHITECTURE.md)
- [接口参考](../api/API_REFERENCE.md)
- [已实现产品需求文档](../product/IMPLEMENTED_PRD.md)
- [产品风险登记册](../product/RISK_REGISTER.md)
- [ADR-0191](../architecture/decisions/0191-personal-model-current-subject-neutral-presentation.md)
