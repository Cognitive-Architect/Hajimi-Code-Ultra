# 覆盖率缺口分析报告

> 生成时间: 2026/2/14 18:15:36

## 📊 总体概览

| 指标 | 数值 |
|------|------|
| 总体行覆盖率 | 51.67% |
| 总体分支覆盖率 | 43.53% |
| 总体函数覆盖率 | 46.6% |
| 未完全覆盖文件数 | 39 |

## 🎯 优先级分类

### P0-最高 (6 文件)

#### 核心文件 (Core)

| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |
|------|--------|----------|----------|------------|
| lib/api/auth.ts | 92.7% | 78.72% | 100% | 10 |
| lib/api/error-handler.ts | 100% | 71.42% | 100% | 0 |
| lib/core/state/machine.ts | 84.53% | 63.63% | 86.36% | 27 |
| lib/core/state/rules.ts | 82.14% | 66.66% | 75% | 5 |
| lib/tsa/index.ts | 66.5% | 57.69% | 27.27% | 109 |
| lib/tsa/orchestrator-v2.ts | 68.46% | 16% | 63.63% | 100 |

### P1-高 (7 文件)

#### 生命周期 (Lifecycle)

| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |
|------|--------|----------|----------|------------|
| lib/tsa/lifecycle/HookManager.ts | 89.01% | 72% | 95.65% | 11 |
| lib/tsa/lifecycle/LRUManager.ts | 94.44% | 78.04% | 95.83% | 6 |
| lib/tsa/lifecycle/LifecycleManager.ts | 74.38% | 42.59% | 78.43% | 104 |
| lib/tsa/lifecycle/TTLManager.ts | 91.02% | 83.87% | 93.33% | 7 |

#### 弹性恢复 (Resilience)

| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |
|------|--------|----------|----------|------------|
| lib/tsa/resilience/fallback.ts | 61.8% | 33.33% | 57.44% | 122 |
| lib/tsa/resilience/index.ts | 80.26% | 60% | 75.67% | 24 |
| lib/tsa/resilience/repair.ts | 84.56% | 64.15% | 78.43% | 39 |

### P2-中 (5 文件)

#### 持久化 (Persistence)

| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |
|------|--------|----------|----------|------------|
| lib/tsa/persistence/IndexedDBStore.ts | 2.88% | 3.38% | 1.56% | 343 |
| lib/tsa/persistence/RedisStore.ts | 73.31% | 60.86% | 75% | 133 |
| lib/tsa/persistence/TieredFallback.ts | 40.72% | 28.57% | 36.61% | 233 |
| lib/tsa/persistence/indexeddb-store-v2.ts | 9.74% | 14.28% | 8.47% | 694 |
| lib/tsa/persistence/redis-store-v2.ts | 64.91% | 56.35% | 68.31% | 233 |

### P3-低 (21 文件)

#### React Hooks

| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |
|------|--------|----------|----------|------------|
| app/hooks/index.ts | 0% | 100% | 0% | 4 |
| app/hooks/useAgent.ts | 0% | 0% | 0% | 145 |
| app/hooks/useGovernance.ts | 0% | 0% | 0% | 182 |
| app/hooks/useSandbox.ts | 0% | 0% | 0% | 340 |
| app/hooks/useTSA.ts | 0% | 0% | 0% | 201 |

#### 其他 (Other)

| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |
|------|--------|----------|----------|------------|
| lib/core/agents/a2a-service.ts | 76.08% | 70% | 78.26% | 26 |
| lib/core/agents/index.ts | 0% | 100% | 0% | 7 |
| lib/core/governance/index.ts | 100% | 100% | 66.66% | 0 |
| lib/core/governance/proposal-service.ts | 93.33% | 73.68% | 82.6% | 9 |
| lib/core/governance/types.ts | 82.6% | 33.33% | 75% | 4 |
| lib/core/governance/vote-service.ts | 86.5% | 80.39% | 84.84% | 36 |
| lib/core/state/index.ts | 0% | 100% | 0% | 2 |
| lib/tsa/lifecycle/index.ts | 100% | 100% | 55.55% | 0 |
| lib/tsa/migration/TierMigration.ts | 27.14% | 27.45% | 29.41% | 106 |
| lib/tsa/monitor/TSAMonitor.ts | 57.14% | 35.71% | 58.33% | 53 |
| lib/tsa/persistence/index.ts | 0% | 100% | 0% | 9 |
| lib/tsa/tests/self-test.ts | 0% | 0% | 0% | 261 |

#### 模式 (Patterns)

| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |
|------|--------|----------|----------|------------|
| patterns/index.ts | 0% | 0% | 0% | 70 |
| patterns/loader.ts | 95.12% | 73.52% | 100% | 18 |
| patterns/registry.ts | 40.77% | 41.66% | 27.27% | 96 |
| patterns/system/base-system.ts | 0% | 100% | 0% | 146 |

## 🔍 详细缺口列表

### 1. lib/api/auth.ts

- **分类**: 核心文件 (Core)
- **优先级**: P0-最高
- **行覆盖率**: 92.7% (89/96)
- **分支覆盖率**: 78.72%
- **函数覆盖率**: 100%

**未覆盖行号**: 107, 119, 302, 303, 304, 305, 306, 307, 308, 357

**未覆盖分支**:
- if at line 106
- if at line 118
- binary-expr at line 189
- binary-expr at line 190
- if at line 301
- cond-expr at line 303
- if at line 304
- binary-expr at line 306

### 2. lib/api/error-handler.ts

- **分类**: 核心文件 (Core)
- **优先级**: P0-最高
- **行覆盖率**: 100% (59/59)
- **分支覆盖率**: 71.42%
- **函数覆盖率**: 100%

**未覆盖分支**:
- default-arg at line 79
- default-arg at line 128
- default-arg at line 137
- default-arg at line 155

### 3. lib/core/state/machine.ts

- **分类**: 核心文件 (Core)
- **优先级**: P0-最高
- **行覆盖率**: 84.53% (82/97)
- **分支覆盖率**: 63.63%
- **函数覆盖率**: 86.36%

**未覆盖行号**: 69, 95, 96, 148, 149, 150, 151, 152, 153, 191, 193, 194, 195, 196, 197, 198, 199, 200, 257, 258, 259, 260, 305, 306, 314, 347, 357

**未覆盖分支**:
- if at line 69
- default-arg at line 109
- binary-expr at line 141
- if at line 147
- cond-expr at line 199
- binary-expr at line 248
- if at line 356

**未调用函数**:
- (anonymous_9)() at line 256
- (anonymous_10)() at line 258
- (anonymous_15)() at line 313

### 4. lib/core/state/rules.ts

- **分类**: 核心文件 (Core)
- **优先级**: P0-最高
- **行覆盖率**: 82.14% (23/28)
- **分支覆盖率**: 66.66%
- **函数覆盖率**: 75%

**未覆盖行号**: 34, 47, 79, 86, 87

**未覆盖分支**:
- if at line 33
- if at line 46
- binary-expr at line 72

**未调用函数**:
- (anonymous_3)() at line 78
- (anonymous_4)() at line 85

### 5. lib/tsa/index.ts

- **分类**: 核心文件 (Core)
- **优先级**: P0-最高
- **行覆盖率**: 66.5% (135/203)
- **分支覆盖率**: 57.69%
- **函数覆盖率**: 27.27%

**未覆盖行号**: 200, 216, 219, 220, 221, 222, 223, 224, 225, 236, 240, 244, 254, 263, 272, 276, 280, 298, 299, 300, 301, 302, 303, 304, 311, 312, 313, 314, 348, 349 ...

**未覆盖分支**:
- binary-expr at line 145
- if at line 198
- binary-expr at line 204
- binary-expr at line 205
- if at line 214
- if at line 217
- if at line 253
- if at line 262
- if at line 298
- if at line 311

**未调用函数**:
- (anonymous_0)() at line 80
- (anonymous_1)() at line 81
- (anonymous_2)() at line 76
- (anonymous_3)() at line 77
- (anonymous_4)() at line 78
- (anonymous_5)() at line 79
- (anonymous_6)() at line 90
- (anonymous_7)() at line 91
- (anonymous_8)() at line 92
- (anonymous_9)() at line 93

### 6. lib/tsa/orchestrator-v2.ts

- **分类**: 核心文件 (Core)
- **优先级**: P0-最高
- **行覆盖率**: 68.46% (89/130)
- **分支覆盖率**: 16%
- **函数覆盖率**: 63.63%

**未覆盖行号**: 89, 94, 100, 101, 107, 113, 114, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 155, 156, 157, 158, 159, 160, 166, 167, 168 ...

**未覆盖分支**:
- if at line 89
- if at line 93
- if at line 99
- if at line 106
- default-arg at line 127
- if at line 135
- if at line 154
- binary-expr at line 159
- if at line 165
- if at line 195

**未调用函数**:
- (anonymous_6)() at line 251
- (anonymous_7)() at line 262
- (anonymous_8)() at line 269
- (anonymous_9)() at line 281
- (anonymous_10)() at line 283
- (anonymous_12)() at line 291
- (anonymous_13)() at line 299
- (anonymous_20)() at line 395
- (anonymous_25)() at line 434
- (anonymous_26)() at line 442

### 7. lib/tsa/lifecycle/HookManager.ts

- **分类**: 生命周期 (Lifecycle)
- **优先级**: P1-高
- **行覆盖率**: 89.01% (81/91)
- **分支覆盖率**: 72%
- **函数覆盖率**: 95.65%

**未覆盖行号**: 131, 172, 211, 223, 247, 257, 268, 269, 270, 271, 281

**未覆盖分支**:
- if at line 130
- binary-expr at line 130
- binary-expr at line 153
- if at line 256
- if at line 268
- if at line 280
- cond-expr at line 320

**未调用函数**:
- (anonymous_18)() at line 267

### 8. lib/tsa/lifecycle/LRUManager.ts

- **分类**: 生命周期 (Lifecycle)
- **优先级**: P1-高
- **行覆盖率**: 94.44% (102/108)
- **分支覆盖率**: 78.04%
- **函数覆盖率**: 95.83%

**未覆盖行号**: 115, 116, 266, 287, 288, 405

**未覆盖分支**:
- cond-expr at line 116
- binary-expr at line 130
- cond-expr at line 139
- if at line 265
- cond-expr at line 287
- binary-expr at line 306
- cond-expr at line 345

**未调用函数**:
- (anonymous_6)() at line 114

### 9. lib/tsa/lifecycle/LifecycleManager.ts

- **分类**: 生命周期 (Lifecycle)
- **优先级**: P1-高
- **行覆盖率**: 74.38% (151/203)
- **分支覆盖率**: 42.59%
- **函数覆盖率**: 78.43%

**未覆盖行号**: 230, 248, 253, 279, 359, 405, 412, 419, 426, 433, 440, 469, 470, 471, 472, 473, 519, 528, 529, 530, 531, 532, 533, 534, 535, 536, 537, 538, 539, 540 ...

**未覆盖分支**:
- if at line 229
- if at line 247
- if at line 252
- if at line 518
- if at line 527
- cond-expr at line 541
- cond-expr at line 549
- if at line 571
- if at line 587
- cond-expr at line 618

**未调用函数**:
- (anonymous_9)() at line 278
- (anonymous_18)() at line 358
- (anonymous_24)() at line 404
- (anonymous_25)() at line 411
- (anonymous_26)() at line 418
- (anonymous_27)() at line 425
- (anonymous_28)() at line 432
- (anonymous_29)() at line 439
- (anonymous_43)() at line 730
- (anonymous_45)() at line 747

### 10. lib/tsa/lifecycle/TTLManager.ts

- **分类**: 生命周期 (Lifecycle)
- **优先级**: P1-高
- **行覆盖率**: 91.02% (71/78)
- **分支覆盖率**: 83.87%
- **函数覆盖率**: 93.33%

**未覆盖行号**: 57, 132, 151, 207, 208, 227, 277

**未覆盖分支**:
- if at line 131
- if at line 150
- cond-expr at line 201
- cond-expr at line 207

**未调用函数**:
- (anonymous_2)() at line 56

### 11. lib/tsa/resilience/fallback.ts

- **分类**: 弹性恢复 (Resilience)
- **优先级**: P1-高
- **行覆盖率**: 61.8% (123/199)
- **分支覆盖率**: 33.33%
- **函数覆盖率**: 57.44%

**未覆盖行号**: 75, 87, 138, 143, 175, 192, 206, 207, 213, 214, 274, 278, 279, 286, 288, 289, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 303, 307, 309 ...

**未覆盖分支**:
- default-arg at line 72
- if at line 205
- binary-expr at line 205
- if at line 212
- cond-expr at line 229
- if at line 273
- if at line 277
- binary-expr at line 277
- if at line 294
- binary-expr at line 294

**未调用函数**:
- (anonymous_1)() at line 74
- (anonymous_4)() at line 86
- (anonymous_5)() at line 92
- (anonymous_6)() at line 93
- (anonymous_7)() at line 94
- (anonymous_8)() at line 95
- (anonymous_12)() at line 142
- (anonymous_14)() at line 174
- (anonymous_17)() at line 191
- (anonymous_22)() at line 285

### 12. lib/tsa/resilience/index.ts

- **分类**: 弹性恢复 (Resilience)
- **优先级**: P1-高
- **行覆盖率**: 80.26% (61/76)
- **分支覆盖率**: 60%
- **函数覆盖率**: 75.67%

**未覆盖行号**: 97, 99, 102, 105, 108, 245, 246, 274, 275, 276, 277, 278, 303, 304, 305, 306, 307, 360, 361, 362, 363, 370, 377, 391

**未覆盖分支**:
- default-arg at line 97
- cond-expr at line 165
- binary-expr at line 165
- cond-expr at line 230
- if at line 244
- if at line 273
- if at line 302
- cond-expr at line 340
- if at line 361

**未调用函数**:
- (anonymous_9)() at line 54
- (anonymous_10)() at line 97
- (anonymous_11)() at line 98
- (anonymous_12)() at line 101
- (anonymous_13)() at line 104
- (anonymous_14)() at line 107
- (anonymous_31)() at line 359
- (anonymous_32)() at line 369
- (anonymous_33)() at line 376

### 13. lib/tsa/resilience/repair.ts

- **分类**: 弹性恢复 (Resilience)
- **优先级**: P1-高
- **行覆盖率**: 84.56% (137/162)
- **分支覆盖率**: 64.15%
- **函数覆盖率**: 78.43%

**未覆盖行号**: 172, 173, 203, 204, 211, 212, 235, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 331, 378, 434, 472, 516, 517, 518, 519, 549, 550 ...

**未覆盖分支**:
- default-arg at line 92
- binary-expr at line 180
- binary-expr at line 195
- if at line 234
- if at line 277
- if at line 377
- switch at line 433
- cond-expr at line 443
- cond-expr at line 476
- cond-expr at line 501

**未调用函数**:
- (anonymous_5)() at line 112
- (anonymous_6)() at line 113
- (anonymous_7)() at line 114
- (anonymous_8)() at line 115
- (anonymous_11)() at line 171
- (anonymous_16)() at line 202
- (anonymous_17)() at line 210
- (anonymous_23)() at line 330
- (anonymous_39)() at line 517
- (anonymous_43)() at line 571

### 14. lib/tsa/persistence/IndexedDBStore.ts

- **分类**: 持久化 (Persistence)
- **优先级**: P2-中
- **行覆盖率**: 2.88% (6/208)
- **分支覆盖率**: 3.38%
- **函数覆盖率**: 1.56%

**未覆盖行号**: 80, 83, 87, 91, 95, 113, 114, 115, 116, 117, 118, 134, 136, 139, 140, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 159, 163, 169, 170 ...

**未覆盖分支**:
- default-arg at line 80
- default-arg at line 142
- binary-expr at line 144
- binary-expr at line 145
- binary-expr at line 146
- binary-expr at line 147
- binary-expr at line 148
- binary-expr at line 149
- cond-expr at line 150
- cond-expr at line 151

**未调用函数**:
- (anonymous_1)() at line 80
- (anonymous_2)() at line 82
- (anonymous_3)() at line 86
- (anonymous_4)() at line 90
- (anonymous_5)() at line 94
- (anonymous_6)() at line 100
- (anonymous_7)() at line 101
- (anonymous_8)() at line 102
- (anonymous_9)() at line 103
- (anonymous_10)() at line 112

### 15. lib/tsa/persistence/RedisStore.ts

- **分类**: 持久化 (Persistence)
- **优先级**: P2-中
- **行覆盖率**: 73.31% (283/386)
- **分支覆盖率**: 60.86%
- **函数覆盖率**: 75%

**未覆盖行号**: 109, 144, 145, 146, 147, 148, 149, 150, 166, 174, 194, 195, 211, 212, 224, 225, 226, 227, 230, 231, 234, 235, 242, 247, 255, 264, 267, 277, 285, 303 ...

**未覆盖分支**:
- binary-expr at line 96
- binary-expr at line 97
- if at line 109
- binary-expr at line 127
- binary-expr at line 131
- binary-expr at line 134
- cond-expr at line 135
- binary-expr at line 137
- if at line 144
- binary-expr at line 158

**未调用函数**:
- (anonymous_5)() at line 143
- (anonymous_8)() at line 165
- (anonymous_10)() at line 173
- (anonymous_14)() at line 230
- (anonymous_20)() at line 302
- (anonymous_21)() at line 320
- (anonymous_22)() at line 329
- (anonymous_32)() at line 457
- (anonymous_33)() at line 475
- (anonymous_34)() at line 483

### 16. lib/tsa/persistence/TieredFallback.ts

- **分类**: 持久化 (Persistence)
- **优先级**: P2-中
- **行覆盖率**: 40.72% (101/248)
- **分支覆盖率**: 28.57%
- **函数覆盖率**: 36.61%

**未覆盖行号**: 90, 94, 143, 147, 149, 151, 152, 153, 156, 157, 158, 159, 161, 165, 167, 168, 169, 170, 171, 172, 173, 175, 179, 180, 184, 186, 188, 189, 190, 192 ...

**未覆盖分支**:
- binary-expr at line 123
- if at line 151
- if at line 156
- binary-expr at line 156
- cond-expr at line 171
- binary-expr at line 172
- if at line 188
- if at line 192
- binary-expr at line 192
- if at line 209

**未调用函数**:
- (anonymous_4)() at line 89
- (anonymous_5)() at line 93
- (anonymous_6)() at line 99
- (anonymous_7)() at line 100
- (anonymous_8)() at line 101
- (anonymous_9)() at line 102
- (anonymous_14)() at line 142
- (anonymous_15)() at line 146
- (anonymous_16)() at line 164
- (anonymous_17)() at line 178

### 17. lib/tsa/persistence/indexeddb-store-v2.ts

- **分类**: 持久化 (Persistence)
- **优先级**: P2-中
- **行覆盖率**: 9.74% (45/462)
- **分支覆盖率**: 14.28%
- **函数覆盖率**: 8.47%

**未覆盖行号**: 104, 107, 111, 115, 119, 137, 138, 139, 140, 141, 142, 149, 156, 187, 188, 189, 190, 191, 192, 193, 194, 201, 202, 203, 205, 207, 208, 209, 210, 211 ...

**未覆盖分支**:
- default-arg at line 104
- if at line 201
- binary-expr at line 201
- if at line 209
- default-arg at line 265
- if at line 276
- if at line 290
- if at line 298
- binary-expr at line 298
- if at line 301

**未调用函数**:
- (anonymous_1)() at line 104
- (anonymous_2)() at line 106
- (anonymous_3)() at line 110
- (anonymous_4)() at line 114
- (anonymous_5)() at line 118
- (anonymous_6)() at line 124
- (anonymous_7)() at line 125
- (anonymous_8)() at line 126
- (anonymous_9)() at line 127
- (anonymous_10)() at line 136

### 18. lib/tsa/persistence/redis-store-v2.ts

- **分类**: 持久化 (Persistence)
- **优先级**: P2-中
- **行覆盖率**: 64.91% (333/513)
- **分支覆盖率**: 56.35%
- **函数覆盖率**: 68.31%

**未覆盖行号**: 147, 148, 149, 209, 218, 225, 259, 260, 261, 262, 263, 264, 266, 267, 268, 273, 274, 275, 276, 277, 278, 306, 311, 312, 325, 327, 328, 329, 330, 332 ...

**未覆盖分支**:
- binary-expr at line 185
- binary-expr at line 186
- binary-expr at line 187
- binary-expr at line 188
- binary-expr at line 189
- if at line 225
- binary-expr at line 238
- binary-expr at line 243
- binary-expr at line 246
- cond-expr at line 247

**未调用函数**:
- (anonymous_2)() at line 147
- (anonymous_9)() at line 217
- (anonymous_12)() at line 272
- (anonymous_13)() at line 274
- (anonymous_18)() at line 310
- (anonymous_20)() at line 324
- (anonymous_21)() at line 335
- (anonymous_22)() at line 344
- (anonymous_23)() at line 349
- (anonymous_28)() at line 433

### 19. app/hooks/index.ts

- **分类**: React Hooks
- **优先级**: P3-低
- **行覆盖率**: 0% (0/4)
- **分支覆盖率**: 100%
- **函数覆盖率**: 0%

**未覆盖行号**: 6, 10, 20, 28

**未调用函数**:
- (anonymous_0)() at line 6
- (anonymous_1)() at line 10
- (anonymous_2)() at line 20
- (anonymous_3)() at line 28
- (anonymous_4)() at line 28
- (anonymous_5)() at line 28

### 20. app/hooks/useAgent.ts

- **分类**: React Hooks
- **优先级**: P3-低
- **行覆盖率**: 0% (0/72)
- **分支覆盖率**: 0%
- **函数覆盖率**: 0%

**未覆盖行号**: 1, 46, 47, 49, 50, 51, 52, 53, 54, 56, 57, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77 ...

**未覆盖分支**:
- if at line 69
- if at line 75
- binary-expr at line 76
- if at line 79
- cond-expr at line 80
- if at line 83
- default-arg at line 89
- if at line 96
- if at line 97
- if at line 98

**未调用函数**:
- useAgent() at line 49
- (anonymous_1)() at line 59
- (anonymous_2)() at line 89
- (anonymous_3)() at line 125
- (anonymous_4)() at line 159
- (anonymous_5)() at line 175
- (anonymous_6)() at line 179
- (anonymous_7)() at line 181

## 📝 测试建议

### GAP-001: if/else 分支覆盖

- lib/api/auth.ts (分支覆盖率: 78.72%)
- lib/api/error-handler.ts (分支覆盖率: 71.42%)
- lib/core/state/machine.ts (分支覆盖率: 63.63%)
- lib/core/state/rules.ts (分支覆盖率: 66.66%)
- lib/tsa/index.ts (分支覆盖率: 57.69%)

### GAP-002: catch 块覆盖

以下文件需要添加错误处理测试:
- lib/api/error-handler.ts
- lib/tsa/resilience/fallback.ts
- lib/tsa/resilience/index.ts
- lib/tsa/resilience/repair.ts

### GAP-003: 未调用工具函数

- lib/core/state/machine.ts (函数覆盖率: 86.36%)
- lib/core/state/rules.ts (函数覆盖率: 75%)
- lib/tsa/index.ts (函数覆盖率: 27.27%)
- lib/tsa/orchestrator-v2.ts (函数覆盖率: 63.63%)
- lib/tsa/lifecycle/HookManager.ts (函数覆盖率: 95.65%)

---
*报告由 黄瓜睦·覆盖率分析师 生成*
