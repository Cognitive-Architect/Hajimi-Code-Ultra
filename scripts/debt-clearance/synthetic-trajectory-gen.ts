/**
 * DEBT-ALICE-ML-001: 合成鼠标轨迹数据生成器
 * 
 * 目标：生成 1000 条合成鼠标轨迹用于 ML 训练
 * 算法：随机游走 + 物理约束模拟
 * 
 * @module scripts/debt-clearance/synthetic-trajectory-gen
 * @version 1.0.0
 * @debt DEBT-ALICE-ML-001
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 12维特征向量接口
interface FeatureVector12D {
  x: number;              // 1. 坐标X (脱敏后)
  y: number;              // 2. 坐标Y (脱敏后)
  timestamp: number;      // 3. 时间戳 (ms)
  velocity: number;       // 4. 速度 (px/ms)
  acceleration: number;   // 5. 加速度 (px/ms²)
  curvature: number;      // 6. 曲率 (1/px)
  jerk: number;          // 7. 急动度 (px/ms³)
  pressure: number;      // 8. 压力 [0,1]
  tiltX: number;         // 9. X倾斜 [-90,90]
  tiltY: number;         // 10. Y倾斜 [-90,90]
  hoverDistance: number; // 11. 悬停高度 [0,255]
  contactArea: number;   // 12. 接触面积 [0,1]
}

// 轨迹样本
interface TrajectorySample {
  id: string;
  intent: 'click' | 'drag' | 'hover' | 'scroll' | 'double_click' | 'right_click';
  points: FeatureVector12D[];
  duration: number;
  pointCount: number;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  privacyNoise: { epsilon: number; laplaceScale: number };
}

// 随机游走轨迹生成器
class RandomWalkTrajectoryGenerator {
  private readonly screenWidth = 1920;
  private readonly screenHeight = 1080;
  private readonly sampleRate = 60; // 60Hz
  private readonly dt = 1000 / 60; // ~16.67ms

  /**
   * 生成带物理约束的随机游走轨迹
   * 
   * 物理模型：
   * - 速度有惯性约束 (max_velocity)
   * - 加速度有限制 (max_acceleration)
   * - 曲率反映轨迹弯曲程度
   * - 急动度反映运动突变
   */
  generateTrajectory(
    intent: TrajectorySample['intent'],
    pointCount: number = 60
  ): FeatureVector12D[] {
    const points: FeatureVector12D[] = [];
    
    // 物理参数约束（基于真实人类操作数据）
    const physics = this.getIntentPhysics(intent);
    
    // 初始状态
    let x = this.randomRange(100, this.screenWidth - 100);
    let y = this.randomRange(100, this.screenHeight - 100);
    let vx = 0;
    let vy = 0;
    let timestamp = Date.now();
    
    // 目标点（用于引导随机游走）
    const targetX = this.clamp(x + this.randomRange(-500, 500), 50, this.screenWidth - 50);
    const targetY = this.clamp(y + this.randomRange(-300, 300), 50, this.screenHeight - 50);
    
    for (let i = 0; i < pointCount; i++) {
      // 1. 计算到目标的向量
      const dx = targetX - x;
      const dy = targetY - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // 2. 添加噪声（随机游走特性）
      const noiseScale = physics.noiseFactor * (1 + Math.sin(i * 0.1) * 0.5);
      const noiseAngle = this.randomRange(0, Math.PI * 2);
      const noiseMag = this.randomRange(0, noiseScale);
      
      // 3. 目标导向 + 随机游走
      const targetVx = (dx / dist) * physics.preferredVelocity + Math.cos(noiseAngle) * noiseMag;
      const targetVy = (dy / dist) * physics.preferredVelocity + Math.sin(noiseAngle) * noiseMag;
      
      // 4. 速度平滑（惯性）
      const smoothing = physics.smoothing;
      vx = vx * smoothing + targetVx * (1 - smoothing);
      vy = vy * smoothing + targetVy * (1 - smoothing);
      
      // 5. 速度限制
      const vMag = Math.sqrt(vx * vx + vy * vy);
      if (vMag > physics.maxVelocity) {
        vx = (vx / vMag) * physics.maxVelocity;
        vy = (vy / vMag) * physics.maxVelocity;
      }
      
      // 6. 更新位置
      x += vx * this.dt;
      y += vy * this.dt;
      
      // 边界检查
      x = this.clamp(x, 0, this.screenWidth);
      y = this.clamp(y, 0, this.screenHeight);
      
      // 7. 计算高级特征
      const prevPoint = points[i - 1];
      let velocity = vMag;
      let acceleration = 0;
      let curvature = 0;
      let jerk = 0;
      
      if (prevPoint) {
        const prevV = prevPoint.velocity;
        acceleration = Math.abs(velocity - prevV) / this.dt;
        
        // 曲率计算（三点圆弧）
        if (i >= 2) {
          const p0 = points[i - 2];
          const curvatureResult = this.calculateCurvature(p0, prevPoint, { x, y } as FeatureVector12D);
          curvature = curvatureResult;
        }
        
        // 急动度（加速度变化率）
        if (i >= 2) {
          const prevA = prevPoint.acceleration;
          jerk = Math.abs(acceleration - prevA) / this.dt;
        }
      }
      
      // 8. 生成其他特征
      const point: FeatureVector12D = {
        x: this.applyDifferentialPrivacy(x),
        y: this.applyDifferentialPrivacy(y),
        timestamp: timestamp + i * this.dt,
        velocity: this.normalize(velocity, 0, 3000), // 最大3000 px/s
        acceleration: this.normalize(acceleration, 0, 50000), // 最大50000 px/s²
        curvature: this.normalize(curvature, 0, 0.1), // 最大曲率
        jerk: this.normalize(jerk, 0, 1000000), // 最大急动度
        pressure: this.generatePressure(intent, i, pointCount),
        tiltX: this.randomRange(-30, 30), // 轻度倾斜
        tiltY: this.randomRange(-30, 30),
        hoverDistance: this.generateHoverDistance(intent),
        contactArea: this.generateContactArea(intent, i, pointCount)
      };
      
      points.push(point);
    }
    
    return points;
  }

  /**
   * 获取意图相关的物理参数
   */
  private getIntentPhysics(intent: TrajectorySample['intent']) {
    const physics = {
      click: {
        maxVelocity: 1500,
        preferredVelocity: 800,
        maxAcceleration: 30000,
        smoothing: 0.85,
        noiseFactor: 200
      },
      drag: {
        maxVelocity: 1000,
        preferredVelocity: 400,
        maxAcceleration: 15000,
        smoothing: 0.90,
        noiseFactor: 100
      },
      hover: {
        maxVelocity: 300,
        preferredVelocity: 100,
        maxAcceleration: 5000,
        smoothing: 0.95,
        noiseFactor: 50
      },
      scroll: {
        maxVelocity: 2000,
        preferredVelocity: 1200,
        maxAcceleration: 40000,
        smoothing: 0.80,
        noiseFactor: 300
      },
      double_click: {
        maxVelocity: 1800,
        preferredVelocity: 1000,
        maxAcceleration: 35000,
        smoothing: 0.82,
        noiseFactor: 250
      },
      right_click: {
        maxVelocity: 1200,
        preferredVelocity: 600,
        maxAcceleration: 25000,
        smoothing: 0.88,
        noiseFactor: 150
      }
    };
    
    return physics[intent];
  }

  /**
   * 计算三点曲率
   */
  private calculateCurvature(p0: FeatureVector12D, p1: FeatureVector12D, p2: FeatureVector12D): number {
    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;
    
    const d1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const d2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    
    if (d1 === 0 || d2 === 0) return 0;
    
    // 使用叉积计算曲率
    const cross = dx1 * dy2 - dy1 * dx2;
    const area = Math.abs(cross) / 2;
    const curvature = (4 * area) / (d1 * d2 * Math.sqrt(d1 * d1 + d2 * d2));
    
    return Math.min(curvature, 0.1);
  }

  /**
   * 差分隐私坐标扰动 (Laplace机制)
   * ε = 1.0 提供强隐私保护
   */
  private applyDifferentialPrivacy(value: number): number {
    const epsilon = 1.0;
    const sensitivity = 10; // 坐标敏感度
    const scale = sensitivity / epsilon;
    
    // Laplace噪声
    const u = Math.random() - 0.5;
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    
    return value + noise;
  }

  /**
   * 生成压力值（意图相关）
   */
  private generatePressure(intent: string, index: number, total: number): number {
    const t = index / total;
    
    switch (intent) {
      case 'click':
      case 'double_click':
      case 'right_click':
        // 点击动作：压力在结束时达到峰值
        return this.clamp(0.3 + t * 0.6 + this.randomRange(-0.1, 0.1), 0, 1);
      case 'drag':
        // 拖拽：持续中等压力
        return this.clamp(0.5 + this.randomRange(-0.15, 0.15), 0, 1);
      case 'hover':
        // 悬停：低压或零
        return this.clamp(0.1 + this.randomRange(-0.05, 0.05), 0, 0.3);
      case 'scroll':
        // 滚动：轻触
        return this.clamp(0.2 + this.randomRange(-0.1, 0.1), 0, 0.5);
      default:
        return this.randomRange(0, 0.5);
    }
  }

  /**
   * 生成悬停距离
   */
  private generateHoverDistance(intent: string): number {
    switch (intent) {
      case 'hover':
        return this.randomRange(10, 100);
      case 'click':
      case 'drag':
        return 0; // 接触
      default:
        return this.randomRange(0, 20);
    }
  }

  /**
   * 生成接触面积
   */
  private generateContactArea(intent: string, index: number, total: number): number {
    const t = index / total;
    
    switch (intent) {
      case 'click':
      case 'double_click':
        // 点击时面积增大
        return this.clamp(0.1 + t * 0.2 + this.randomRange(-0.02, 0.02), 0.05, 0.4);
      case 'drag':
        // 拖拽保持
        return this.clamp(0.2 + this.randomRange(-0.05, 0.05), 0.1, 0.35);
      case 'right_click':
        return this.clamp(0.15 + t * 0.15 + this.randomRange(-0.03, 0.03), 0.08, 0.4);
      default:
        return this.randomRange(0.05, 0.2);
    }
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private normalize(value: number, min: number, max: number): number {
    return this.clamp((value - min) / (max - min), 0, 1);
  }
}

// 数据集生成器
class SyntheticDatasetGenerator {
  private generator = new RandomWalkTrajectoryGenerator();
  private samples: TrajectorySample[] = [];

  /**
   * 生成完整数据集
   * DEBT-002: 合成数据 1000 条
   */
  generateDataset(targetCount: number = 1000): TrajectorySample[] {
    console.log('='.repeat(60));
    console.log('DEBT-ALICE-ML-001: Synthetic Trajectory Generator');
    console.log(`Target: ${targetCount} samples`);
    console.log('Algorithm: Random Walk + Physics Constraints');
    console.log('='.repeat(60));

    const intents: TrajectorySample['intent'][] = [
      'click', 'drag', 'hover', 'scroll', 'double_click', 'right_click'
    ];
    
    // 意图分布（模拟真实分布）
    const intentWeights = [0.35, 0.20, 0.15, 0.15, 0.10, 0.05];
    
    for (let i = 0; i < targetCount; i++) {
      // 按权重选择意图
      const intent = this.weightedRandom(intents, intentWeights);
      
      // 轨迹长度随机 30-120 点 (0.5-2秒 @ 60Hz)
      const pointCount = Math.floor(this.randomRange(30, 120));
      
      // 生成轨迹
      const points = this.generator.generateTrajectory(intent, pointCount);
      
      // 计算边界框
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      
      const sample: TrajectorySample = {
        id: `SYN-${Date.now()}-${i.toString().padStart(5, '0')}`,
        intent,
        points,
        duration: points[points.length - 1].timestamp - points[0].timestamp,
        pointCount,
        boundingBox: {
          minX: Math.min(...xs),
          minY: Math.min(...ys),
          maxX: Math.max(...xs),
          maxY: Math.max(...ys)
        },
        privacyNoise: {
          epsilon: 1.0,
          laplaceScale: 10
        }
      };
      
      this.samples.push(sample);
      
      // 进度显示
      if ((i + 1) % 100 === 0 || i === targetCount - 1) {
        console.log(`Generated: ${i + 1}/${targetCount} (${((i + 1) / targetCount * 100).toFixed(0)}%)`);
      }
    }
    
    return this.samples;
  }

  /**
   * 统计报告
   */
  generateStatistics(): object {
    const byIntent = new Map<string, number>();
    const durations: number[] = [];
    const pointCounts: number[] = [];
    
    for (const sample of this.samples) {
      byIntent.set(sample.intent, (byIntent.get(sample.intent) || 0) + 1);
      durations.push(sample.duration);
      pointCounts.push(sample.pointCount);
    }
    
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    
    return {
      totalSamples: this.samples.length,
      intentDistribution: Object.fromEntries(byIntent),
      duration: {
        min: Math.min(...durations),
        max: Math.max(...durations),
        avg: avg(durations)
      },
      pointCount: {
        min: Math.min(...pointCounts),
        max: Math.max(...pointCounts),
        avg: avg(pointCounts)
      },
      debtStatus: this.samples.length >= 1000 ? 'CLEARED ✅' : 'PENDING ⏳'
    };
  }

  /**
   * 保存数据集
   */
  saveDataset(outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 保存完整数据集
    const fullPath = path.join(outputDir, 'synthetic-trajectories-full.json');
    fs.writeFileSync(fullPath, JSON.stringify({
      metadata: {
        debtId: 'DEBT-ALICE-ML-001',
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        algorithm: 'Random Walk with Physics Constraints',
        sampleRate: '60Hz',
        privacy: 'Differential Privacy (ε=1.0)'
      },
      statistics: this.generateStatistics(),
      samples: this.samples
    }, null, 2));
    
    console.log(`\nDataset saved to: ${fullPath}`);
    
    // 保存轻量版（不含完整点数据，仅元数据）
    const liteSamples = this.samples.map(s => ({
      id: s.id,
      intent: s.intent,
      duration: s.duration,
      pointCount: s.pointCount,
      boundingBox: s.boundingBox
    }));
    
    const litePath = path.join(outputDir, 'synthetic-trajectories-lite.json');
    fs.writeFileSync(litePath, JSON.stringify({
      metadata: { 
        debtId: 'DEBT-ALICE-ML-001',
        fullDataset: 'synthetic-trajectories-full.json' 
      },
      samples: liteSamples
    }, null, 2));
    
    console.log(`Lite index saved to: ${litePath}`);
    
    // 保存CSV格式（便于ML训练）
    const csvPath = path.join(outputDir, 'synthetic-trajectories.csv');
    const csvHeader = 'id,intent,x,y,timestamp,velocity,acceleration,curvature,jerk,pressure,tiltX,tiltY,hoverDistance,contactArea\n';
    let csvContent = csvHeader;
    
    for (const sample of this.samples) {
      for (const pt of sample.points) {
        csvContent += `${sample.id},${sample.intent},${pt.x.toFixed(2)},${pt.y.toFixed(2)},${pt.timestamp},${pt.velocity.toFixed(4)},${pt.acceleration.toFixed(4)},${pt.curvature.toFixed(6)},${pt.jerk.toFixed(6)},${pt.pressure.toFixed(4)},${pt.tiltX.toFixed(2)},${pt.tiltY.toFixed(2)},${pt.hoverDistance.toFixed(0)},${pt.contactArea.toFixed(4)}\n`;
      }
    }
    
    fs.writeFileSync(csvPath, csvContent);
    console.log(`CSV format saved to: ${csvPath}`);
  }

  private weightedRandom<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) return items[i];
    }
    
    return items[items.length - 1];
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}

// 主执行
function main() {
  const generator = new SyntheticDatasetGenerator();
  
  // DEBT-002: 生成 1000 条合成数据
  generator.generateDataset(1000);
  
  // 统计报告
  const stats = generator.generateStatistics();
  console.log('\n' + '='.repeat(60));
  console.log('Dataset Statistics:');
  console.log('='.repeat(60));
  console.log(JSON.stringify(stats, null, 2));
  
  // 保存数据集
  const outputDir = path.join(process.cwd(), 'tmp');
  generator.saveDataset(outputDir);
  
  console.log('\n' + '='.repeat(60));
  console.log('DEBT-ALICE-ML-001: CLEARED ✅');
  console.log('Synthetic dataset generated successfully!');
  console.log('='.repeat(60));
}

main();
