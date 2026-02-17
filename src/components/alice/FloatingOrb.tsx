/**
 * Alice悬浮球核心组件
 * HAJIMI-ALICE-UI
 * 
 * Blue Sechi Q版画风，48px常态，拖拽吸附，ML联动
 * 
 * @module src/components/alice/FloatingOrb
 * @author 唐音 (Engineer) - B-02/09
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAlicePosition } from '../../hooks/useAlicePosition';
import { HexMenu } from './HexMenu';
import './FloatingOrb.css';

export type AliceState = 'hidden' | 'idle' | 'alert' | 'interact' | 'assist';

export interface FloatingOrbProps {
  initialState?: AliceState;
  onStateChange?: (state: AliceState) => void;
  onPersonaSelect?: (persona: string) => void;
  mlPrediction?: {
    behavior: string;
    confidence: number;
  } | null;
}

export const FloatingOrb: React.FC<FloatingOrbProps> = ({
  initialState = 'idle',
  onStateChange,
  onPersonaSelect,
  mlPrediction,
}) => {
  const [state, setState] = useState<AliceState>(initialState);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { position, displayPosition, isDragging, isDocked, dockSide, startDrag } = useAlicePosition();

  // 监听ML预测结果
  useEffect(() => {
    if (!mlPrediction) return;
    
    if (mlPrediction.confidence < 0.7) {
      setState('alert');
    } else {
      // 根据行为标签切换状态
      const behaviorMap: Record<string, AliceState> = {
        'lost_confused': 'assist',
        'rage_shake': 'alert',
        'precision_snipe': 'idle',
        'urgent_rush': 'assist',
        'casual_explore': 'idle',
      };
      setState(behaviorMap[mlPrediction.behavior] || 'idle');
    }
  }, [mlPrediction]);

  // 状态变化回调
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // 双击/长按打开菜单
  const handleActivate = useCallback(() => {
    if (isDragging) return;
    setIsMenuOpen(true);
    setState('interact');
  }, [isDragging]);

  // 处理角色选择
  const handlePersonaSelect = useCallback((persona: string) => {
    onPersonaSelect?.(persona);
    setIsMenuOpen(false);
    setState('assist');
  }, [onPersonaSelect]);

  // 计算动画类名
  const getAnimationClass = () => {
    switch (state) {
      case 'hidden':
        return 'alice-hidden';
      case 'idle':
        return 'alice-idle';
      case 'alert':
        return 'alice-alert';
      case 'interact':
        return 'alice-interact';
      case 'assist':
        return 'alice-assist';
      default:
        return 'alice-idle';
    }
  };

  // 计算尺寸
  const size = isMenuOpen ? 120 : 48;
  const scale = isDragging ? 1.1 : 1;

  return (
    <>
      {/* 悬浮球主体 */}
      <div
        className={`alice-orb ${getAnimationClass()} ${isDocked ? `docked-${dockSide}` : ''}`}
        style={{
          position: 'fixed',
          left: displayPosition.x,
          top: displayPosition.y,
          width: size,
          height: size,
          transform: `scale(${scale})`,
          zIndex: 9999,
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: isDragging ? 'none' : 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        onDoubleClick={handleActivate}
        onContextMenu={(e) => {
          e.preventDefault();
          handleActivate();
        }}
      >
        {/* Blue Sechi Q版头像 */}
        <div className="alice-avatar">
          <svg viewBox="0 0 48 48" className="alice-svg">
            {/* 身体 */}
            <circle cx="24" cy="28" r="14" fill="#4A90E2" />
            {/* 头 */}
            <circle cx="24" cy="18" r="10" fill="#FFE4E1" />
            {/* 眼睛 */}
            <circle cx="20" cy="16" r="2" fill="#333" className="alice-eye" />
            <circle cx="28" cy="16" r="2" fill="#333" className="alice-eye" />
            {/* 光环 */}
            <circle cx="24" cy="6" r="3" fill="#FFD700" className="alice-halo" />
          </svg>
        </div>

        {/* 状态指示器 */}
        <div className={`alice-indicator alice-indicator-${state}`} />

        {/* 呼吸效果层 */}
        <div className="alice-breathing" />
      </div>

      {/* 七权菜单 */}
      {isMenuOpen && (
        <HexMenu
          anchorX={position.x + size / 2}
          anchorY={position.y + size / 2}
          onSelect={handlePersonaSelect}
          onClose={() => {
            setIsMenuOpen(false);
            setState('idle');
          }}
        />
      )}
    </>
  );
};

export default FloatingOrb;
