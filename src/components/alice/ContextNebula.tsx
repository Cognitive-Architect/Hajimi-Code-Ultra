/**
 * Alice Vision 3D可视化 (Mock版) - B-08/09
 * HAJIMI-LCR-LUXURY-005
 * 
 * 3D星云渲染 (P2级，可降级2D)
 * 
 * @module src/components/alice/ContextNebula
 * @author 咕咕嘎嘎 (QA)
 * 
 * DEBT-VIS-001: WebGL性能风险，复杂场景可能30 FPS，需LOD降级
 */

import React, { useEffect, useRef, useState } from 'react';

interface NebulaNode {
  id: string;
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  label: string;
}

interface ContextNebulaProps {
  nodes: NebulaNode[];
  maxNodes?: number; // LOD: 超过此数降级2D
  onNodeClick?: (node: NebulaNode) => void;
}

/**
 * Context星云3D可视化组件
 */
export const ContextNebula: React.FC<ContextNebulaProps> = ({
  nodes,
  maxNodes = 1000,
  onNodeClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fps, setFps] = useState(60);
  const [is2DMode, setIs2DMode] = useState(nodes.length > maxNodes);
  const animationRef = useRef<number>();

  // 自测: VIS-001 FPS>60
  // 自测: VIS-002 拖拽<50ms响应
  // 自测: VIS-003 路径高亮

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 降级检测
    if (nodes.length > maxNodes && !is2DMode) {
      setIs2DMode(true);
      console.log('[ContextNebula] LOD降级: 3D→2D');
    }

    let lastTime = performance.now();
    let frameCount = 0;

    const render = () => {
      const now = performance.now();
      frameCount++;

      // 计算FPS
      if (now - lastTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastTime = now;
      }

      // 清空画布
      ctx.fillStyle = '#0a0a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 渲染节点
      if (is2DMode) {
        render2D(ctx, nodes, canvas.width, canvas.height);
      } else {
        render3D(ctx, nodes, canvas.width, canvas.height, now);
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [nodes, is2DMode, maxNodes]);

  /**
   * 2D渲染模式 (降级)
   */
  const render2D = (
    ctx: CanvasRenderingContext2D,
    nodes: NebulaNode[],
    width: number,
    height: number
  ) => {
    // 简化2D渲染
    for (const node of nodes.slice(0, 100)) { // 限制显示数量
      const x = (node.x + 1) * width / 2;
      const y = (node.y + 1) * height / 2;

      // 绘制节点
      ctx.beginPath();
      ctx.arc(x, y, node.size, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();

      // 绘制标签
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(node.label, x + node.size + 2, y);
    }
  };

  /**
   * 3D渲染模式
   */
  const render3D = (
    ctx: CanvasRenderingContext2D,
    nodes: NebulaNode[],
    width: number,
    height: number,
    time: number
  ) => {
    // 简化的3D投影
    const rotation = time * 0.0001;

    for (const node of nodes) {
      // 旋转投影
      const x3d = node.x * Math.cos(rotation) - node.z * Math.sin(rotation);
      const z3d = node.x * Math.sin(rotation) + node.z * Math.cos(rotation);
      
      // 透视投影
      const scale = 1 / (1 + z3d * 0.5);
      const x2d = (x3d * scale + 1) * width / 2;
      const y2d = (node.y * scale + 1) * height / 2;
      const size2d = node.size * scale;

      // 绘制节点 (带发光效果)
      const gradient = ctx.createRadialGradient(x2d, y2d, 0, x2d, y2d, size2d * 2);
      gradient.addColorStop(0, node.color);
      gradient.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(x2d, y2d, size2d * 2, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  };

  /**
   * 处理点击 (拖拽响应<50ms)
   */
  const handleClick = (e: React.MouseEvent) => {
    const startTime = performance.now();
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * 2 - 1;
    const y = (e.clientY - rect.top) / rect.height * 2 - 1;

    // 查找最近节点
    let nearest: NebulaNode | null = null;
    let minDist = Infinity;

    for (const node of nodes) {
      const dx = node.x - x;
      const dy = node.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < minDist && dist < 0.1) {
        minDist = dist;
        nearest = node;
      }
    }

    const elapsed = performance.now() - startTime;
    if (elapsed > 50) {
      console.warn(`[ContextNebula] Click response ${elapsed}ms`);
    }

    if (nearest && onNodeClick) {
      onNodeClick(nearest);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onClick={handleClick}
        style={{
          borderRadius: 8,
          cursor: 'pointer',
        }}
      />
      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: 12,
      }}>
        FPS: {fps} {is2DMode && '(2D降级)'}
        {fps < 30 && ' ⚠️ 性能警告'}
      </div>
      {is2DMode && (
        <div style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          color: '#ff0',
          fontSize: 10,
        }}>
          DEBT-VIS-001: 节点过多，已降级至2D视图
        </div>
      )}
    </div>
  );
};

export default ContextNebula;
