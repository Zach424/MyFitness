# ADR-0150：便携归档 v4 JSON 的可组合异步数组

日期：2026-08-11

状态：已采纳

## 背景

第 155 轮已经能在一个只读 repeatable-read 事务中分批读取 `healthRecords`，但第 153 轮 JSON 编码器只接受完整 `PrivacyExport`，数组字段必须已经是 JavaScript 数组。若在调用编码器前把行源重新收集，数据库分页只改变查询形状，不减少集合对象图驻留，也无法把下游取消传播回事务。

本轮需要让现有 v4 编码器直接消费异步数组，同时保持公开文件的字段顺序、两空格缩进、字符串转义、末尾换行、UTF-8 块和完成摘要完全不变。能力必须是显式内部节点，不能把任意带 `Symbol.asyncIterator` 的业务对象误判为数组。

## 决策

1. 新增 `portableExportJsonAsyncArray()`，用模块私有 `unique symbol` 标记一个只读 wrapper。节点只保存同步或异步 iterable；该 Symbol 不会进入 `Object.entries()` 或 JSON 输出。
2. `PortableExportJsonSource` 保持 v4 根字段和非数组字段类型不变，只允许 `data` 下的数组字段在既有数组与相应懒数组节点之间选择。现有 `PrivacyExport` 仍可直接传入，公共 Schema 和文件版本不变。
3. JSON token 遍历和 UTF-8 聚合器升级为异步生成器。普通数组和懒数组共用同一个数组 token 方法：空数组输出 `[]`，非空元素使用相同换行、缩进、逗号和递归值编码。
4. 编码器按对象字段顺序推进，只有到达懒数组字段时才调用其下一元素；不得预读或收集整个 iterable。每个元素仍沿用字符串分片、循环检测、最大块和全文件 `maximumBytes` 门禁。
5. 懒源抛出的错误保持原错误对象并同时拒绝字节迭代与 JSON 完成收据。调用方提前停止最外层 JSON 迭代时，`for await` 必须逐层调用内部 iterable 的 `return()`；与数据库快照组合时，这会触发回滚并使两份完成收据拒绝。
6. 真实组合测试只把 `healthRecords` 替换为第 155 轮行源，其余 v4 字段使用静态合法值；输出必须与包含相同 eager 行的既有 `serializePortableExport()` 逐字节相同。该证明不等于完整数据库导出服务已经迁移。
7. 本轮不修改同步 HTTP 导出，不迁移其他数据库集合、嵌套聚合或媒体，不新增单元素字节上限、KMS、worker、归档状态转换、公开路由、下载授权或 UI。

## 影响

- 一个真实高基数集合第一次可以从 PostgreSQL 批次直接进入 v4 字节流，不再先形成该集合数组。
- 同一递归 token 方法避免 eager/lazy 两套格式实现漂移；现有 v4 消费者、校验器和摘要语义不变。
- 最外层取消可以沿 JSON → lazy array → database snapshot 传播，避免已停止对象上传后仍持有只读事务。
- 每批行数与 JSON 输出块都有上界，但单个数据库 payload 在进入编码器前仍可很大；逐元素字节门禁继续是下一项正确性工作。
- 其余十二个顶层数组集合仍是 eager，训练/餐食/计划还包含单行嵌套数组；当前不能声称完整对象图驻留已经有界或同步下载内存下降。

## 备选方案

### 在编码前收集 `Array.fromAsync()`

拒绝。它恢复了完整集合数组，并且外层取消发生时数据库读取可能已经结束，失去背压和事务回滚链。

### 自动把任意 AsyncIterable 当作 JSON 数组

拒绝。业务对象可能实现迭代协议但仍应作为对象或被拒绝；私有 Symbol 节点让意图显式，避免扩大序列化攻击面。

### 让数据库直接输出整段 JSON 文本

暂缓。这样可以减少对象转换，却会另建一套缩进、转义、上限和摘要边界，且嵌套媒体仍需应用层组合。当前共享 token 算法更容易证明字节兼容。

### 一次把所有 v4 数组改为懒源

暂缓。各集合的排序键、嵌套结构和媒体责任不同；先用平坦健康记录证明组合与取消，再逐集合迁移并补元素字节门禁。

## 验证

- 单元测试必须证明编码器在输出根前缀时尚未请求健康行，并在完整消费后与 eager v4 字节、大小和 SHA-256 相同。
- 懒数组在一个已输出元素后抛错时，字节迭代和完成收据必须拒绝同一根错误。
- 真实 PostgreSQL 三条健康记录、每批两行必须形成字段完整 v4；37 字节输出块不得超限，数据库收据必须为两批/三行，JSON 收据与 eager 产物对账。
- JSON 在已经拉取首行后提前停止时，数据库快照与 JSON 收据必须同时拒绝，不能提交部分成功。
- 完整格式、类型、单元、集成、构建、生产依赖、中文文档、迁移索引和 Obsidian 门禁通过后才允许提交。

## 关联

- [ADR-0147：便携归档的增量 JSON 字节源](0147-portable-export-incremental-json-byte-source.md)
- [ADR-0149：便携归档的只读快照事务与首个 keyset 行源](0149-portable-export-repeatable-read-keyset-source.md)
- [ECMAScript JSON.stringify 规范](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.stringify)
- [架构基线](../ARCHITECTURE.md)
- [数据库设计](../DATABASE_DESIGN.md)
- [隐私所有权模型](../PRIVACY_OWNERSHIP_MODEL.md)
- [产品风险登记册](../../product/RISK_REGISTER.md)
- [第 156 轮档案](../../iterations/156-portable-export-composable-async-json-arrays.md)
