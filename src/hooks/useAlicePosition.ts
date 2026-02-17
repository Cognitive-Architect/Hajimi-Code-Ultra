/**
 * Alice悬浮球位置管理Hook
 * HAJIMI-ALICE-UI
 * 
 * 拖拽、吸附、边缘隐藏、位置持久化
 * 
 * @module src/hooks/useAlicePosition
 * @author 唐音 (Engineer) - B-02/09
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface Position {
  x: number;
  y: number;
}

export interface AlicePositionState {
  position: Position;
  isDragging: boolean;
  isDocked: boolean;
  dockSide: 'left' | 'right' | 'top' | 'bottom' | null;
}

const STORAGE_KEY = 'alice_position';
const ORB_SIZE = 48;
const DOCK_THRESHOLD = 20;
const EDGE_HIDE_OFFSET = 40;

export function useAlicePosition() {
  const [state, setState] = useState<AlicePositionState>(() => {
    // 从localStorage恢复位置
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            position: parsed.position || { x: window.innerWidth - 80, y: 100 },
            isDragging: false,
            isDocked: parsed.isDocked || false,
            dockSide: parsed.dockSide || 'right',
          };
        } catch {}
      }
    }
    return {
      position: { x: typeof window !== 'undefined' ? window.innerWidth - 80 : 100, y: 100 },
      isDragging: false,
      isDocked: true,
      dockSide: 'right',
    };
  });

  const dragStartRef = useRef<Position | null>(null);
  const mouseStartRef = useRef<Position | null>(null);

  // 保存位置到localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && !state.isDragging) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        position: state.position,
        isDocked: state.isDocked,
        dockSide: state.dockSide,
      }));
    }
  }, [state.position, state.isDocked, state.dockSide, state.isDragging]);

  // 开始拖拽
  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    dragStartRef.current = { ...state.position };
    mouseStartRef.current = { x: clientX, y: clientY };
    
    setState(prev => ({ ...prev, isDragging: true, isDocked: false }));
  }, [state.position]);

  // 拖拽中
  const onDrag = useCallback((e: MouseEvent | TouchEvent) => {
    if (!state.isDragging || !dragStartRef.current || !mouseStartRef.current) return;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - mouseStartRef.current.x;
    const dy = clientY - mouseStartRef.current.y;
    
    const newX = Math.max(0, Math.min(window.innerWidth - ORB_SIZE, dragStartRef.current.x + dx));
    const newY = Math.max(0, Math.min(window.innerHeight - ORB_SIZE, dragStartRef.current.y + dy));
    
    setState(prev => ({
      ...prev,
      position: { x: newX, y: newY },
    }));
  }, [state.isDragging]);

  // 结束拖拽
  const endDrag = useCallback(() => {
    if (!state.isDragging) return;
    
    // 智能吸附
    const { x, y } = state.position;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    
    let dockSide: AlicePositionState['dockSide'] = null;
    let finalX = x;
    let finalY = y;
    
    // 判断最近边缘
    const distLeft = x;
    const distRight = screenW - x - ORB_SIZE;
    const distTop = y;
    const distBottom = screenH - y - ORB_SIZE;
    
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);
    
    if (minDist < DOCK_THRESHOLD) {
      if (minDist === distLeft) {
        dockSide = 'left';
        finalX = 0;
      } else if (minDist === distRight) {
        dockSide = 'right';
        finalX = screenW - ORB_SIZE;
      } else if (minDist === distTop) {
        dockSide = 'top';
        finalY = 0;
      } else {
        dockSide = 'bottom';
        finalY = screenH - ORB_SIZE;
      }
    }
    
    setState(prev => ({
      ...prev,
      isDragging: false,
      isDocked: dockSide !== null,
      dockSide,
      position: { x: finalX, y: finalY },
    }));
    
    dragStartRef.current = null;
    mouseStartRef.current = null;
  }, [state.isDragging, state.position]);

  // 全局事件监听
  useEffect(() => {
    if (state.isDragging) {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', endDrag);
      window.addEventListener('touchmove', onDrag);
      window.addEventListener('touchend', endDrag);
      
      return () => {
        window.removeEventListener('mousemove', onDrag);
        window.removeEventListener('mouseup', endDrag);
        window.removeEventListener('touchmove', onDrag);
        window.removeEventListener('touchend', endDrag);
      };
    }
  }, [state.isDragging, onDrag, endDrag]);

  // 计算边缘隐藏偏移
  const getDisplayPosition = useCallback((): Position => {
    if (!state.isDocked) return state.position;
    
    const offset = state.isDragging ? 0 : EDGE_HIDE_OFFSET;
    
    switch (state.dockSide) {
      case 'left':
        return { x: state.position.x - offset, y: state.position.y };
      case 'right':
        return { x: state.position.x + offset, y: state.position.y };
      case 'top':
        return { x: state.position.x, y: state.position.y - offset };
      case 'bottom':
        return { x: state.position.x, y: state.position.y + offset };
      default:
        return state.position;
    }
  }, [state.position, state.isDocked, state.dockSide, state.isDragging]);

  return {
    position: state.position,
    displayPosition: getDisplayPosition(),
    isDragging: state.isDragging,
    isDocked: state.isDocked,
    dockSide: state.dockSide,
    startDrag,
    setPosition: (pos: Position) => setState(prev => ({ ...prev, position: pos })),
  };
}

export default useAlicePosition;
