/**
 * Alice天童爱丽丝 - 鼠标轨迹识别器
 * 
 * 基于ID-64需求文档实现
 * Blue Sechi画风Q版帧动画配套组件
 * 
 * @version 1.3.0
 * @module alice/mouse-tracker
 */

/**
 * 轨迹点接口
 */
export interface TrajectoryPoint {
  /** X坐标 */
  x: number;
  /** Y坐标 */
  y: number;
  /** 时间戳(ms) */
  t: number;
}

/**
 * 轨迹模式类型
 */
export type TrajectoryPattern =
  | 'lost_confused'      // 迷失困惑: 随机游走，高曲率
  | 'rage_shake'         // 愤怒摇晃: 高频往复，低位移
  | 'precision_snipe'    // 精确狙击: 直线加速，目标明确
  | 'casual_explore'     // 随意探索: 低速曲线，大范围
  | 'urgent_rush';       // 紧急冲刺: 高速直线，短停留

/**
 * 特征提取结果接口
 */
interface ExtractedFeatures {
  totalDistance: number;
  directionChanges: number;
  oscillations: number;
  maxVelocity: number;
  displacement: number;
  straightness: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  duration: number;
}

/**
 * 启发式阈值配置
 * 硬编码阈值，基于Wave1实验数据调优
 */
export const THRESHOLDS = {
  /** 迷失困惑检测阈值 */
  lost_confused: {
    minEntropy: 2.5,           // 方向熵阈值
    minDirectionChanges: 8,    // 方向变化次数
    maxVelocity: 300,          // 最大速度(px/s)
  },
  /** 愤怒摇晃检测阈值 */
  rage_shake: {
    minOscillations: 3,        // 最小往复次数
    maxDisplacement: 50,       // 最大位移(px)
    minFrequency: 5,           // 最小频率(Hz)
  },
  /** 精确狙击检测阈值 */
  precision_snipe: {
    minStraightness: 0.95,     // 直线度阈值
    minAcceleration: 1000,     // 最小加速度(px/s²)
    maxDeviation: 5,           // 最大偏离(px)
  },
  /** 紧急冲刺检测阈值 */
  urgent_rush: {
    minVelocity: 800,          // 最小速度(px/s)
    minDistance: 200,          // 最小距离(px)
    maxCurvature: 0.1,         // 最大曲率
  },
} as const;

/**
 * Alice鼠标轨迹追踪器
 * 
 * 启发式规则版本 (P0 MVP)
 * 准确率目标: >80%
 * 响应延迟: <200ms (recognize方法<10ms)
 */
export class AliceMouseTracker {
  private buffer: TrajectoryPoint[] = [];
  private readonly BUFFER_SIZE = 50;      // 最近50个点
  private readonly SAMPLE_RATE = 16;      // 采样率16ms (~60fps)

  /**
   * 获取当前缓冲区大小
   */
  get bufferSize(): number {
    return this.buffer.length;
  }

  /**
   * 获取缓冲区内容（只读副本）
   */
  getBuffer(): readonly TrajectoryPoint[] {
    return [...this.buffer];
  }

  /**
   * 采集轨迹点
   * 
   * @param x - X坐标
   * @param y - Y坐标
   */
  record(x: number, y: number): void {
    this.buffer.push({ x, y, t: performance.now() });
    if (this.buffer.length > this.BUFFER_SIZE) {
      this.buffer.shift();
    }
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * 轨迹识别主入口
   * 
   * 执行时间: <10ms (确保总延迟<200ms)
   * 
   * @returns 识别的轨迹模式，或null（缓冲区不足）
   */
  recognize(): TrajectoryPattern | null {
    const startTime = performance.now();
    
    if (this.buffer.length < 20) {
      return null;
    }

    const features = this.extractFeatures();

    // 启发式规则匹配 (优先级顺序)
    let result: TrajectoryPattern = 'casual_explore'; // 默认模式

    if (this.isRageShake(features)) {
      result = 'rage_shake';
    } else if (this.isPrecisionSnipe(features)) {
      result = 'precision_snipe';
    } else if (this.isUrgentRush(features)) {
      result = 'urgent_rush';
    } else if (this.isLostConfused(features)) {
      result = 'lost_confused';
    }

    const elapsed = performance.now() - startTime;
    if (elapsed > 10) {
      console.warn(`[AliceMouseTracker] recognize() took ${elapsed.toFixed(2)}ms, exceeding 10ms budget`);
    }

    return result;
  }

  /**
   * 特征提取
   * 
   * 提取轨迹的统计特征用于模式识别
   */
  private extractFeatures(): ExtractedFeatures {
    const points = this.buffer;
    const n = points.length;

    // 基础统计
    let totalDistance = 0;
    let directionChanges = 0;
    let oscillations = 0;
    let maxVelocity = 0;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let prevDirection = 0;

    // 计算轨迹统计
    for (let i = 1; i < n; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const dt = p1.t - p0.t;
      if (dt === 0) continue;

      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const velocity = dist / dt * 1000; // px/s

      totalDistance += dist;
      maxVelocity = Math.max(maxVelocity, velocity);

      // 方向变化检测
      const direction = Math.atan2(dy, dx);
      if (i > 1) {
        const dirChange = Math.abs(this.normalizeAngle(direction - prevDirection));
        if (dirChange > Math.PI / 4) { // >45度视为方向变化
          directionChanges++;
        }
        // 往复检测 (方向反转)
        if (Math.abs(dirChange - Math.PI) < Math.PI / 6) {
          oscillations++;
        }
      }
      prevDirection = direction;

      // 边界框
      minX = Math.min(minX, p1.x);
      maxX = Math.max(maxX, p1.x);
      minY = Math.min(minY, p1.y);
      maxY = Math.max(maxY, p1.y);
    }

    // 直线度计算 (端点连线距离 / 实际路径距离)
    const start = points[0];
    const end = points[n - 1];
    const straightDist = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    );
    const straightness = totalDistance > 0 ? straightDist / totalDistance : 0;

    return {
      totalDistance,
      directionChanges,
      oscillations,
      maxVelocity,
      displacement: straightDist,
      straightness,
      bounds: { minX, maxX, minY, maxY },
      duration: points[n - 1].t - points[0].t,
    };
  }

  /**
   * 归一化角度到 [-PI, PI]
   */
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  /**
   * 愤怒摇晃检测
   * 
   * 特征: 高频往复 + 低位移
   */
  private isRageShake(f: ExtractedFeatures): boolean {
    const t = THRESHOLDS.rage_shake;
    const frequency = f.duration > 0 ? f.oscillations / (f.duration / 1000) : 0;
    
    return (
      f.oscillations >= t.minOscillations &&
      f.displacement <= t.maxDisplacement &&
      frequency >= t.minFrequency
    );
  }

  /**
   * 精确狙击检测
   * 
   * 特征: 高直线度 + 加速度
   */
  private isPrecisionSnipe(f: ExtractedFeatures): boolean {
    const t = THRESHOLDS.precision_snipe;
    return (
      f.straightness >= t.minStraightness &&
      f.maxVelocity >= Math.sqrt(t.minAcceleration) &&
      f.displacement > t.maxDeviation
    );
  }

  /**
   * 紧急冲刺检测
   * 
   * 特征: 高速 + 直线
   */
  private isUrgentRush(f: ExtractedFeatures): boolean {
    const t = THRESHOLDS.urgent_rush;
    return (
      f.maxVelocity >= t.minVelocity &&
      f.displacement >= t.minDistance &&
      (1 - f.straightness) <= t.maxCurvature
    );
  }

  /**
   * 迷失困惑检测
   * 
   * 特征: 随机游走 + 高熵
   * 简化熵计算: 方向变化率作为熵的代理
   */
  private isLostConfused(f: ExtractedFeatures): boolean {
    const t = THRESHOLDS.lost_confused;
    const entropy = f.duration > 0 ? f.directionChanges / (f.duration / 1000) : 0;
    
    return (
      entropy >= t.minEntropy &&
      f.directionChanges >= t.minDirectionChanges &&
      f.maxVelocity <= t.maxVelocity
    );
  }
}

/**
 * 创建默认追踪器实例
 */
export const defaultTracker = new AliceMouseTracker();

/**
 * 检测单个轨迹点（便捷函数）
 * 
 * @param x - X坐标
 * @param y - Y坐标
 * @returns 当前识别的模式，或null
 */
export function detect(x: number, y: number): TrajectoryPattern | null {
  defaultTracker.record(x, y);
  return defaultTracker.recognize();
}

/**
 * 批量检测轨迹（便捷函数）
 * 
 * @param points - 轨迹点数组
 * @returns 识别的模式，或null
 */
export function detectBatch(points: Array<{ x: number; y: number }>): TrajectoryPattern | null {
  defaultTracker.clear();
  const now = performance.now();
  points.forEach((p, i) => {
    defaultTracker.record(p.x, p.y);
  });
  return defaultTracker.recognize();
}

// 导出所有检测函数供外部调用
export {
  THRESHOLDS,
};

// 默认导出
export default AliceMouseTracker;
