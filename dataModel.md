# iLens 产品数据模型 PRD v0.1

## 1. 文档目的

iLens 的核心目标不是单纯记录训练，而是建立一个长期、可更新、可追溯的个人健身档案，使 AI 能够基于用户长期数据理解：

- 用户是谁
- 用户想达到什么目标
- 用户实际上进行了什么训练
- 用户当前身体状态如何
- 用户身体组成发生了什么变化
- 用户力量表现发生了什么变化
- 用户饮食和恢复情况如何
- 当前正在执行什么计划
- 哪些长期规律正在形成

本 PRD 定义 iLens 的产品级数据模型及数据之间的关系。

它描述的是产品概念，不规定具体数据库表结构。

---

# 2. 总体数据结构

iLens 的核心数据分为八个主要领域：

1. Personal Profile：个人档案
2. Body Metrics：身体数据
3. Body State：身体状态
4. Training：训练记录
5. Performance：力量表现
6. Nutrition：饮食
7. Plan：计划
8. Personal Model：AI 对用户的长期认识

同时所有领域共享一套：

**Evidence / Source / Time / Confidence / Completeness**

证据体系。

整体关系：

```text
                   Personal Profile
                         │
                         ↓
             ┌────── Personal Goal ──────┐
             │                            │
             ↓                            ↓
       Training Plan                Nutrition Plan
             │                            │
             ↓                            ↓
         Training                    Nutrition
             │
             ├──────────────┐
             ↓              ↓
      Performance       Body State
             │              │
             └──────┬───────┘
                    ↓
               Body Metrics
                    │
                    ↓
              Personal Model
                    │
                    ↓
                iLens AI
                    │
                    ↓
          新的计划 / 分析 / 提醒
```

其中实际并不是单向关系。

Personal Model 会不断读取所有历史数据，再反过来帮助用户制定下一阶段计划。

---

# 3. 数据基本原则

## 3.1 所有变化数据都保留历史

例如：

体重不能只保存：

```
当前体重 = 71kg
```

而应该保存：

```text
2026-06-03    71.6 kg
2026-07-25    69.3 kg
2026-08-12    71.0 kg
```

当前值只是历史序列中的最新有效值。

以下数据均属于时间序列：

- 体重
- 体脂
- 骨骼肌
- 围度
- 睡眠
- 精力
- 肌群疲劳
- 训练表现
- 动作表现
- 饮食
- 训练记录
- Personal Model

---

# 4. 所有数据必须包含来源

同一个指标可能来自不同来源。

例如体重：

```text
71.2 kg
来源：手动记录

69.3 kg
来源：InBody 770

70.1 kg
来源：家用体脂秤
```

因此每条数据都应关联 Source。

典型来源：

- manual：用户手动输入
- training：训练过程中产生
- imported_report：检测报告导入
- device：设备数据
- ai_extracted：AI 从资料中识别后经用户确认
- derived：系统从其他确认数据计算
- user_confirmed：用户确认的事实

来源用于：

- 判断数据是否适合直接比较
- AI 分析时解释数据质量
- 查看原始证据
- 修正错误数据

---

# 5. 时间模型

所有数据至少区分两个时间：

### occurredAt

数据实际发生的时间。

例如：

> 7 月 25 日 09:43 做 InBody。

### recordedAt

数据进入 iLens 的时间。

例如：

> 8 月 12 日才上传报告。

因此用户即使后补数据，也可以恢复正确的历史时间线。

---

# 6. 数据完整度 Completeness

部分记录可能并不完整。

例如用户忘记记录昨天训练，只记得：

> 昨天练了背，大概一个小时。

这仍然是一条有效训练事实，但不能当作完整训练记录。

建议统一支持：

- complete：完整
- partial：部分信息
- minimal：只确认事件发生
- unknown：尚未确认

例如：

```text
训练发生：是
训练区域：背部
训练时长：约 60 分钟
动作：Unknown
组数：Unknown

Completeness = minimal
```

后续 AI 可以知道：

> 发生了训练，但无法计算准确训练量。

---

# 7. Personal Profile — 个人档案

## 7.1 定位

记录变化较慢、长期有效的个人基础信息。

回答：

> “这个人是谁？”

## 7.2 基础信息

包括：

- 性别
- 出生日期 / 年龄
- 身高
- 单位制
- 时区

其中身高仍允许修改并保留历史，但通常变化频率较低。

## 7.3 训练背景

包括：

- 训练经验
- 当前训练阶段
- 可训练天数
- 单次可训练时间
- 健身房器械条件
- 常见训练时间

## 7.4 偏好

例如：

- 喜欢自由重量
- 不喜欢某些动作
- 可接受动作
- 训练分化偏好

## 7.5 目标 Goal

目标独立于当前身体状态。

例如：

```text
目标类型：增肌

目标体重：80kg
力量目标：
卧推 120kg
深蹲 160kg
硬拉 180kg

重点部位：
背 > 腿 > 肩
```

Goal 可以具有：

- 开始时间
- 目标时间
- 当前状态
- 完成状态
- 历史版本

---

# 8. Body Metrics — 身体数据

## 8.1 定位

记录：

> “我的身体客观测量结果正在如何变化？”

属于中长期数据。

---

# 9. Body Metrics 分类

## 9.1 基础身体指标

包括：

- 体重
- 身高
- BMI
- 腰围
- 胸围
- 臂围
- 大腿围
- 其他自定义围度

---

## 9.2 身体组成

包括：

- 体脂率
- 体脂肪量
- 骨骼肌量
- 肌肉量
- 去脂体重
- 身体总水分
- 蛋白质
- 无机盐

---

## 9.3 进阶身体组成

例如 InBody 报告：

- SMI
- 基础代谢率
- 腰臀比
- 内脏脂肪面积
- 细胞外水分比
- 身体细胞量
- 相位角

这些可以归为 Advanced Metrics。

首页不需要展示，但个人身体档案应保留。

---

# 10. Segment Metrics — 节段身体组成

支持人体不同区域的身体组成信息。

例如：

### 肌肉

- 左上肢
- 右上肢
- 躯干
- 左下肢
- 右下肢

### 脂肪

- 左上肢
- 右上肢
- 躯干
- 左下肢
- 右下肢

可以用于：

- 左右平衡
- 上下肢平衡
- 长期身体组成变化

这类数据主要来自 InBody 等专业检测。

---

# 11. Body Assessment — 身体检测事件

一次 InBody 不应该拆成几十条孤立数字。

产品层应该存在：

**Body Assessment**

例如：

```text
2026-07-25 09:43

检测类型：
Body Composition

设备：
InBody 770

来源：
上传报告

包含：
体重
体脂
骨骼肌
节段肌肉
节段脂肪
水分
BMR
SMI
...
```

每个指标同时写入对应 Body Metrics 时间序列。

Body Assessment 本身则保留：

- 检测时间
- 检测类型
- 设备
- 原始报告
- 识别结果
- 用户确认结果

---

# 12. AI 上传检测报告

这是 Body Metrics 的重要数据入口。

用户：

```
添加身体数据
```

可选择：

- 手动记录
- 上传检测报告

上传图片/PDF后：

```text
原始报告
      ↓
AI 识别
      ↓
候选结构化数据
      ↓
用户确认
      ↓
写入 Body Assessment
      ↓
同步 Body Metrics
```

确认页需要展示：

```text
2026-07-25

InBody 770

体重             69.3 kg
体脂率           10.1 %
骨骼肌           36.0 kg
体脂肪            7.0 kg
BMI              21.6
SMI               8.2
基础代谢率        1715 kcal
...
```

用户确认后才正式同步。

---

# 13. Body State — 身体状态

## 13.1 定位

Body Metrics 描述身体长期变化。

Body State 描述：

> “我现在感觉怎么样？”

属于短期状态。

---

# 14. 全身状态

包括：

- 睡眠时长
- 睡眠质量
- 精力
- 压力
- 整体疲劳

---

# 15. Muscle State — 肌群状态

针对具体肌群记录：

- 疲劳
- 酸痛
- 疼痛

例如：

```text
股四头肌

疲劳    4/5
酸痛    3/5
疼痛    0/10
```

这些数据直接驱动首页人体 SVG。

---

# 16. Muscle Model — 肌群模型

全产品使用统一肌群体系。

一级区域：

- 胸
- 背
- 腿 / 臀
- 肩 / 手臂
- 腹 / 核心

二级肌群例如：

### 胸

- 上胸
- 中胸
- 下胸

### 背

- 背阔肌
- 斜方肌
- 菱形肌
- 大圆肌
- 小圆肌
- 竖脊肌

### 肩 / 手臂

- 三角肌前束
- 三角肌中束
- 三角肌后束
- 肱二头肌
- 肱三头肌
- 肱肌
- 前臂

### 腿 / 臀

- 臀大肌
- 臀中肌
- 股四头肌
- 腘绳肌
- 内收肌
- 腓肠肌
- 比目鱼肌

### 核心

- 腹直肌
- 腹斜肌
- 核心整体

---

# 17. Exercise 与 Muscle 的关系

每个训练动作关联：

### Primary Muscles

主要训练肌群。

### Secondary Muscles

辅助训练肌群。

例如：

```text
杠铃卧推

Primary
中胸

Secondary
上胸
三角肌前束
肱三头肌
```

这个关系同时用于：

- 训练计划
- 人体高亮
- 肌群训练量统计
- 训练分析
- AI 分析

---

# 18. Training — 训练记录

## 18.1 定位

回答：

> “我实际上做了什么？”

一条训练 Session 包含：

- 时间
- 训练主题
- 时长
- 动作
- 组
- 重量
- 次数
- RPE
- 完成状态
- 疲劳
- 疼痛
- 备注

当前系统已经具备这套训练记录基础。

---

# 19. Training 与 Plan

训练存在两种来源：

### Planned Training

来自计划。

### Ad-hoc Training

用户临时训练。

因此训练记录可以：

- 关联 Plan Day
- 或独立存在

计划和实际训练必须分别保存。

例如：

```text
计划：

卧推 4×8–10

实际：

80×10
80×9
80×8
75×10
```

---

# 20. Performance — 力量表现

## 20.1 定位

回答：

> “我现在变得多强？”

Performance 不等于训练量。

主要来自训练记录自动计算。

---

# 21. 第一阶段 Performance 范围

因为 iLens 当前聚焦健身房力量训练，第一版只支持：

### 动作最佳表现

- 最大重量
- 最大次数
- 最佳训练组

### e1RM

例如：

```text
卧推

当前 e1RM
103 kg

历史最好
107 kg
```

### PR

包括：

- Weight PR
- Rep PR
- Estimated 1RM PR

---

# 22. Performance 与 Exercise

Performance 基于具体 Exercise。

例如：

```text
bench_press

历史训练点
      ↓
最好训练组
      ↓
e1RM 时间序列
      ↓
Performance
```

因此训练分析可以回答：

> 卧推最近是否有进步？

---

# 23. Nutrition — 饮食数据

## 23.1 定位

回答：

> “我吃了什么？”

主要数据：

- 餐次
- 食物
- 重量
- 热量
- 蛋白质
- 碳水
- 脂肪
- 纤维

现有系统已经具备这一数据结构。

---

# 24. Nutrition Summary

每日形成汇总：

```text
2026-08-12

热量      2450 kcal
蛋白质    150 g
碳水      310 g
脂肪       72 g
```

长期形成：

- 7 天
- 30 天
- 90 天

趋势。

---

# 25. Plan — 计划系统

计划分为：

### Training Plan

训练计划。

### Nutrition Plan

饮食计划。

第一阶段重点完成 Training Plan。

---

# 26. Training Plan 数据

计划包含：

- 名称
- 目标
- 周期
- 开始日期
- 结束日期
- 每周训练次数
- 每个训练日
- 训练部位
- 动作
- 组数
- 次数范围
- 替代动作

---

# 27. Plan 生命周期

计划具有：

```text
Draft
    ↓
Active
    ↓
Paused / Replaced
    ↓
Completed / Archived
```

因此用户可以同时拥有：

- 当前计划
- 草稿计划
- 历史计划

---

# 28. AI Plan

AI 创建的计划首先是：

```
Plan Draft
```

例如：

```text
AI 训练计划 v2

状态：
Draft
```

用户审阅、修改后：

```
应用计划
```

才成为：

```
Active Plan
```

---

# 29. Evidence — 统一证据模型

以上所有数据都必须可以追踪来源。

每条 Evidence 至少包含：

- 数据是什么
- 数据何时发生
- 何时记录
- 来源
- 是否用户确认
- 完整度
- 原始证据引用

例如：

```text
体脂率：10.1%

occurredAt:
2026-07-25

source:
InBody 770

evidence:
2026-07-25 InBody report

confirmed:
true
```

---

# 30. Personal Model — AI 长期认识

Personal Model 不保存普通训练记录。

它保存的是：

> 系统目前对用户形成的长期认识。

例如：

### Goal

> 用户当前主要目标是增肌。

### Preference

> 用户偏好自由重量动作。

### Behavior

> 最近 8 周训练频率稳定在每周 3–4 次。

### Baseline

> 卧推训练工作重量通常位于 75–85kg。

### Pattern

> 最近训练周期背部训练量持续增加。

### Hypothesis

> 当前训练频率可能比原设定的每周 5 练更符合用户实际生活节奏。

---

# 31. Personal Model Item

每条认识需要：

- 类型
- 内容
- 关联 Evidence
- 创建时间
- 更新时间
- confidence
- status
- 用户反馈

状态可以包括：

- candidate
- active
- confirmed
- rejected
- superseded

---

# 32. AI 数据访问逻辑

AI 不直接维护另一份独立用户数据。

AI 读取：

```text
Profile
Body Metrics
Body State
Training
Performance
Nutrition
Plan
Personal Model
```

然后完成：

### 记录

例如：

> “我今天体重 71.2。”

转成候选记录，用户确认后保存。

### 导入

上传 InBody 报告。

### 查询

> “我最近三个月体脂怎么变化？”

### 分析

> “最近力量涨了吗？”

### 总结

> “总结最近一个月训练情况。”

### 计划

> “按照最近情况重新做训练计划。”

---

# 33. 首页对应的数据

首页只消费部分核心数据。

## 今日训练卡

来自：

```
Active Training Plan
```

## 饮食卡

来自：

```
Today Nutrition Summary
```

## 恢复卡

来自：

```
Latest Body State
```

## 身体状态人体

来自：

```
Muscle State + Recent Training
```

## 待确认

来自：

```
Incomplete Training Evidence
```

---

# 34. 身体档案页对应的数据

身体档案主要消费：

```
Profile + Body Metrics + Body Assessment
```

核心展示：

- 当前身体
- 身体组成
- 围度
- 节段组成
- 检测报告
- 长期趋势

---

# 35. 训练分析页对应的数据

训练分析消费：

```
Training + Performance + Muscle Model
```

分为：

### 训练行为

- 次数
- 时长
- 组数
- Volume
- 肌群分布

### 动作表现

- 最大重量
- e1RM
- PR
- 动作趋势

---

# 36. 计划中心对应的数据

计划中心消费：

```
Goal + Profile + Personal Model + Plan
```

用户可以：

- 自己创建计划
- 复制计划
- 修改计划
- AI 创建计划
- AI 调整计划
- 应用计划
- 查看计划版本
- 查看历史计划

---

# 37. 数据整体闭环

最终完整的数据闭环：

```text
个人档案
    │
    ↓
目标
    │
    ↓
训练 / 饮食计划
    │
    ↓
实际训练 + 实际饮食
    │
    ├──────────────┐
    ↓              ↓
运动表现        身体状态
    │              │
    └───────┬──────┘
            ↓
        身体数据
            │
            ↓
      Personal Model
            │
            ↓
         iLens AI
            │
            ↓
      下一阶段计划
```

因此用户持续使用 iLens 后，系统积累的并不是一堆孤立记录，而是：

> **这个人从什么状态开始、做了什么、身体如何变化、力量如何变化，以及接下来准备怎么做。**

这就是 iLens 后续 AI 能够“越来越了解用户”的数据基础。

---

# 38. 第一阶段产品范围

当前只针对个人健身房力量训练使用。

第一阶段优先完善：

1. Profile
2. Body Metrics
3. Body Assessment / AI 报告导入
4. Body State
5. Muscle State
6. Training
7. Performance
8. Training Plan
9. Nutrition
10. Evidence
11. Personal Model 基础结构

其中下一阶段最值得优先补充的是：

**Body Metrics + Body Assessment + Performance + Muscle State**

因为 Training、Nutrition、Recovery 和基础 Plan 当前已经有较完整产品基础。

---

# 39. 产品数据模型最终结构

```text
USER
│
├── PROFILE
│   ├── Basic Info
│   ├── Training Background
│   ├── Preference
│   └── Goal
│
├── BODY
│   ├── Body Metrics
│   ├── Body Assessment
│   ├── Segment Metrics
│   └── Body State
│       └── Muscle State
│
├── TRAINING
│   ├── Workout
│   ├── Exercise
│   ├── Set
│   └── Performance
│
├── NUTRITION
│   ├── Meal
│   ├── Food
│   └── Daily Summary
│
├── PLAN
│   ├── Training Plan
│   └── Nutrition Plan
│
├── EVIDENCE
│   ├── Source
│   ├── Report
│   ├── Confirmation
│   └── Completeness
│
└── PERSONAL MODEL
    ├── Goal
    ├── Preference
    ├── Baseline
    ├── Behavior
    ├── Pattern
    └── Hypothesis
```

这套模型作为后续首页、身体档案、训练执行、训练分析、计划中心和 AI 系统的统一产品数据基础。
