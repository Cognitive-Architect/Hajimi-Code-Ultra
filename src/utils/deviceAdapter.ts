/**
 * 跨平台设备适配器
 * HAJIMI-ALICE-UI
 * 
 * 桌面/移动/平板/PWA适配
 * 
 * @module src/utils/deviceAdapter
 * @author 黄瓜睦 (Architect) - B-08/09
 */

export type DeviceType = 'desktop' | 'mobile' | 'tablet';
export type InputMode = 'mouse' | 'touch' | 'pen';

export interface DeviceCapabilities {
  type: DeviceType;
  inputMode: InputMode;
  supportsHover: boolean;
  supportsPressure: boolean;
  isPWA: boolean;
  isOffline: boolean;
}

export function detectDevice(): DeviceCapabilities {
  const ua = navigator.userAgent;
  const width = window.innerWidth;
  
  // 设备类型
  let type: DeviceType = 'desktop';
  if (/iPad|Android(?!.*Mobile)/.test(ua) || (width >= 768 && width < 1024)) {
    type = 'tablet';
  } else if (/Mobile|Android|iPhone/.test(ua) || width < 768) {
    type = 'mobile';
  }

  // 输入模式
  let inputMode: InputMode = 'mouse';
  if ('maxTouchPoints' in navigator && navigator.maxTouchPoints > 0) {
    inputMode = 'touch';
  }
  if (ua.includes('Pen')) {
    inputMode = 'pen';
  }

  return {
    type,
    inputMode,
    supportsHover: window.matchMedia('(hover: hover)').matches,
    supportsPressure: 'PointerEvent' in window && inputMode === 'pen',
    isPWA: window.matchMedia('(display-mode: standalone)').matches,
    isOffline: !navigator.onLine,
  };
}

// 响应式断点
export const BREAKPOINTS = {
  mobile: 375,
  tablet: 768,
  desktop: 1024,
} as const;

export function getResponsiveSize(baseSize: number): number {
  const width = window.innerWidth;
  if (width < BREAKPOINTS.mobile) return baseSize * 0.8;
  if (width < BREAKPOINTS.tablet) return baseSize * 0.9;
  return baseSize;
}
