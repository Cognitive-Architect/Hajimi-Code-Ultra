# B-05 Alice组件集成测试报告

## 组件清单

| 组件 | 来源 | 渲染模式 | 冲突风险 |
|------|------|----------|----------|
| ContextNebula | LCR (HAJIMI-LCR-LUXURY-005) | Canvas 2D (3D投影降级) | 低 |
| FloatingOrb | ALICE-UI (B-02/09) | DOM/CSS动画 | 低 |
| HexMenu | ALICE-UI (B-06/09) | Portal渲染/DOM | 低 |
| useAlicePosition | ALICE-UI Hook | 全局事件监听 | 中(可控) |

---

## 验证点

### MERGE-013: Canvas上下文分离

- **状态**: ✅ 通过
- **证据**:
  - ContextNebula 组件 (`src/components/alice/ContextNebula.tsx` 第52行) 仅使用 `canvas.getContext('2d')` 获取2D渲染上下文
  - 3D效果通过软件投影算法实现（第128-158行 `render3D` 函数），非WebGL
  - 组件内置LOD降级机制：当节点数超过 `maxNodes` (默认1000) 时自动降级为2D模式（第41行、56-59行）
  - 渲染循环独立管理，`requestAnimationFrame` 在组件卸载时正确清理（第91-95行）
  - 画布尺寸固定 800x600（第203-204行），与其他Canvas组件无重叠冲突

- **分析**: ContextNebula 使用独立的2D Canvas，没有WebGL上下文冲突风险。Alice悬浮球组件使用纯DOM/CSS渲染，两者渲染层完全分离。

---

### MERGE-014: 事件冒泡

- **状态**: ✅ 通过
- **证据**:
  - **HexMenu事件隔离**: `HexMenu.tsx` 第56行使用 `e.stopPropagation()` 阻止菜单点击事件冒泡到遮罩层
  - **Portal渲染隔离**: HexMenu 使用 `createPortal` 渲染到 `document.body`（第48、104行），层级独立
  - **拖拽事件管理**: `useAlicePosition.ts` 仅在 `isDragging` 为true时注册全局事件（第150-164行），避免持续监听
  - **事件清理**: Hook在组件卸载或拖拽结束时移除事件监听（第157-162行）
  - **悬浮球事件**: FloatingOrb 使用标准React合成事件（第114-120行），无全局事件覆盖

- **mouse-tracker 单例检查**:
  ```typescript
  // useAlicePosition.ts - 条件化全局监听
  useEffect(() => {
    if (state.isDragging) {  // 仅在拖拽时注册
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', endDrag);
      // ...
    }
  }, [state.isDragging, onDrag, endDrag]);
  ```
  未发现多个 mouse-tracker 实例冲突风险。

---

### MERGE-015: CSS变量

- **状态**: ✅ 通过
- **证据**:
  - **Alice命名空间隔离**: `FloatingOrb.css` 第9-17行定义的所有CSS变量均使用 `--alice-*` 前缀：
    ```css
    :root {
      --alice-primary: #4A90E2;
      --alice-primary-light: #7AB8FF;
      --alice-primary-dark: #2E5C8A;
      --alice-size: 48px;
      --alice-size-active: 120px;
      --alice-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    ```
  - **七权角色色值**: 在 `HexMenu.tsx` 第23-31行以内联样式定义，未使用CSS变量：
    ```typescript
    { id: 'xiaoxiang', name: '祥', color: '#8B5CF6', role: 'Orchestrator', icon: '◆' },
    { id: 'cucumber', name: '睦', color: '#22C55E', role: 'Architect', icon: '◎' },
    // ... 其他角色
    ```
  - **组件级样式隔离**: 所有样式类名使用 `.alice-*` 和 `.hex-*` 前缀
  - **无全局覆盖**: 未发现覆盖系统级CSS变量（如 `--primary`, `--background` 等）

- **主题一致性**: Alice组件使用独立的Blue Sechi配色方案，与系统主题变量完全隔离，不会相互覆盖。

---

## 共存架构

```
┌─────────────────────────────────────────────────────────────┐
│                       Document Body                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HexMenu (Portal)                                   │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  z-index: 10000                             │   │   │
│  │  │  • 七权角色按钮 (内联样式色值)                │   │   │
│  │  │  • SVG连接线                                  │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FloatingOrb (Fixed Position)                       │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  z-index: 9999                              │   │   │
│  │  │  • CSS动画 (transform/opacity)              │   │   │
│  │  │  • --alice-* CSS变量                        │   │   │
│  │  │  • 拖拽事件 (条件化全局监听)                  │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ContextNebula (Component Canvas)                   │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  <canvas> 800x600                            │   │   │
│  │  │  • 2D Context (software 3D projection)      │   │   │
│  │  │  • LOD: 3D → 2D 降级                        │   │   │
│  │  │  • 独立 RAF 渲染循环                         │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 架构说明

1. **渲染层分离**: 
   - ContextNebula: Canvas 2D 渲染层
   - FloatingOrb/HexMenu: DOM/CSS 渲染层
   - 两者无画布/上下文冲突

2. **事件层分离**:
   - FloatingOrb: 组件级合成事件
   - HexMenu: Portal + stopPropagation 隔离
   - useAlicePosition: 条件化全局事件（仅拖拽时）

3. **样式层分离**:
   - Alice组件: `--alice-*` 命名空间
   - 七权角色色值: 内联样式，无CSS变量污染
   - 系统主题: 独立维护，无覆盖风险

---

## 结论

| 验证项 | 状态 | 备注 |
|--------|------|------|
| MERGE-013 Canvas上下文分离 | ✅ | 2D Canvas独立，3D为软件投影，无WebGL冲突 |
| MERGE-014 事件冒泡 | ✅ | 事件隔离良好，无重复监听 |
| MERGE-015 CSS变量 | ✅ | 命名空间隔离，无主题覆盖风险 |

**综合评估**: Alice Vision 3D (ContextNebula) 与 LCR 组件 (FloatingOrb/HexMenu) **可以安全共存**。建议在生产环境监控 Canvas FPS 和内存占用。

---

*报告生成时间: 2026-02-17*  
*工单: HAJIMI-MERGE-V140-VALIDATION B-05/09*
