/**
 * 量化参数校准器脚本
 * HAJIMI-DEBT-CLEARANCE-001-LAZY-MVP - B-05/09
 * 
 * 读取合成数据计算scale/zero-point，生成量化参数文件
 * 
 * @module scripts/calibrate-quantization
 * @author 唐音 (Engineer)
 * 
 * 使用方法:
 *   npx ts-node scripts/calibrate-quantization.ts [options]
 * 
 * 选项:
 *   --data-path <path>      合成数据路径 (默认: ./data/calibration-samples.json)
 *   --output <path>         输出参数文件路径 (默认: ./quantization-params.json)
 *   --samples <number>      校准样本数 (默认: 1000)
 *   --data-type <type>      量化类型: int8|uint8 (默认: int8)
 *   --symmetric             使用对称量化
 *   --verbose               详细输出
 * 
 * 自测项:
 *   - QUANT-IMPL-002: 校准参数持久化
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 类型定义
// ============================================================================

interface CalibrationSample {
  /** 样本ID */
  id: string;
  /** 输入特征 (12维归一化特征) */
  features: number[];
  /** 预期输出 (6类概率分布) */
  expectedOutput?: number[];
  /** 样本标签 */
  label?: string;
  /** 生成时间 */
  timestamp: string;
}

interface CalibrationConfig {
  /** 数据路径 */
  dataPath: string;
  /** 输出路径 */
  outputPath: string;
  /** 样本数 */
  sampleCount: number;
  /** 数据类型 */
  dataType: 'int8' | 'uint8';
  /** 是否对称量化 */
  symmetric: boolean;
  /** 详细输出 */
  verbose: boolean;
  /** 特征维度 */
  featureDims: number;
  /** 输出类别数 */
  numClasses: number;
}

interface TensorStatistics {
  /** 张量名称 */
  name: string;
  /** 最小值 */
  min: number;
  /** 最大值 */
  max: number;
  /** 平均值 */
  mean: number;
  /** 标准差 */
  std: number;
  /** 中位数 */
  median: number;
  /** 百分位数 */
  percentiles: {
    p1: number;
    p5: number;
    p95: number;
    p99: number;
  };
}

interface QuantizationParams {
  tensorName: string;
  scale: number;
  zeroPoint: number;
  dataType: 'int8' | 'uint8';
  minValue: number;
  maxValue: number;
  calibrationSamples: number;
  lastUpdated: string;
  statistics: TensorStatistics;
}

// ============================================================================
// 合成数据生成器
// ============================================================================

/**
 * 生成合成校准数据
 * 
 * 基于Alice特征提取器的输出分布生成合成数据
 */
function generateSyntheticData(count: number): CalibrationSample[] {
  const samples: CalibrationSample[] = [];
  const behaviorClasses = [
    'lost_confused',
    'rage_shake',
    'precision_snipe',
    'urgent_rush',
    'casual_explore',
    'uncertain'
  ];

  for (let i = 0; i < count; i++) {
    // 生成12维归一化特征 [0, 1]
    const features = generateRealisticFeatures();
    
    // 生成预期输出 (6类概率)
    const expectedOutput = generateProbabilityDistribution(features);
    
    samples.push({
      id: `sample-${Date.now()}-${i}`,
      features,
      expectedOutput,
      label: behaviorClasses[Math.floor(Math.random() * behaviorClasses.length)],
      timestamp: new Date().toISOString(),
    });
  }

  return samples;
}

/**
 * 生成逼真的特征向量
 * 
 * 基于不同行为模式的特征分布
 */
function generateRealisticFeatures(): number[] {
  // 12维特征: [v_avg, v_max, v_std, a_avg, a_max, c_avg, c_max, jerk, angle, entropy, straight, fft_freq]
  const features = new Array(12).fill(0);
  
  // 随机选择一种行为模式
  const patterns = ['normal', 'fast', 'slow', 'erratic', 'precise'] as const;
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  
  switch (pattern) {
    case 'fast': // urgent_rush 模式: 高速度，低曲率
      features[0] = randomRange(0.6, 1.0); // v_avg
      features[1] = randomRange(0.8, 1.0); // v_max
      features[2] = randomRange(0.1, 0.3); // v_std
      features[3] = randomRange(0.3, 0.6); // a_avg
      features[4] = randomRange(0.5, 0.9); // a_max
      features[5] = randomRange(0.0, 0.2); // c_avg
      features[6] = randomRange(0.0, 0.3); // c_max
      features[7] = randomRange(0.2, 0.5); // jerk
      features[8] = randomRange(0.1, 0.4); // angle
      features[9] = randomRange(0.1, 0.3); // entropy
      features[10] = randomRange(0.8, 1.0); // straight
      features[11] = randomRange(0.2, 0.5); // fft_freq
      break;
      
    case 'slow': // precision_snipe 模式: 低速度，高直线度
      features[0] = randomRange(0.0, 0.3); // v_avg
      features[1] = randomRange(0.1, 0.4); // v_max
      features[2] = randomRange(0.05, 0.2); // v_std
      features[3] = randomRange(0.0, 0.2); // a_avg
      features[4] = randomRange(0.0, 0.3); // a_max
      features[5] = randomRange(0.0, 0.2); // c_avg
      features[6] = randomRange(0.0, 0.3); // c_max
      features[7] = randomRange(0.0, 0.2); // jerk
      features[8] = randomRange(0.0, 0.2); // angle
      features[9] = randomRange(0.0, 0.2); // entropy
      features[10] = randomRange(0.9, 1.0); // straight
      features[11] = randomRange(0.0, 0.2); // fft_freq
      break;
      
    case 'erratic': // rage_shake/lost_confused 模式: 高速度，高曲率
      features[0] = randomRange(0.5, 0.9); // v_avg
      features[1] = randomRange(0.7, 1.0); // v_max
      features[2] = randomRange(0.3, 0.6); // v_std
      features[3] = randomRange(0.3, 0.7); // a_avg
      features[4] = randomRange(0.5, 1.0); // a_max
      features[5] = randomRange(0.4, 0.9); // c_avg
      features[6] = randomRange(0.6, 1.0); // c_max
      features[7] = randomRange(0.4, 0.9); // jerk
      features[8] = randomRange(0.4, 0.9); // angle
      features[9] = randomRange(0.5, 0.9); // entropy
      features[10] = randomRange(0.0, 0.4); // straight
      features[11] = randomRange(0.4, 0.9); // fft_freq
      break;
      
    case 'precise': // casual_explore 模式: 中等速度
      features[0] = randomRange(0.2, 0.5); // v_avg
      features[1] = randomRange(0.3, 0.6); // v_max
      features[2] = randomRange(0.1, 0.3); // v_std
      features[3] = randomRange(0.1, 0.3); // a_avg
      features[4] = randomRange(0.2, 0.5); // a_max
      features[5] = randomRange(0.1, 0.4); // c_avg
      features[6] = randomRange(0.2, 0.5); // c_max
      features[7] = randomRange(0.1, 0.4); // jerk
      features[8] = randomRange(0.1, 0.4); // angle
      features[9] = randomRange(0.2, 0.5); // entropy
      features[10] = randomRange(0.5, 0.8); // straight
      features[11] = randomRange(0.2, 0.5); // fft_freq
      break;
      
    case 'normal':
    default:
      // 均匀分布
      for (let i = 0; i < 12; i++) {
        features[i] = Math.random();
      }
  }
  
  return features;
}

/**
 * 根据特征生成合理的概率分布
 */
function generateProbabilityDistribution(features: number[]): number[] {
  const probs = [0.1, 0.1, 0.2, 0.2, 0.2, 0.2]; // 基础概率
  
  const [v_avg, , , , , c_avg, , , , entropy, straight] = features;
  
  // urgent_rush: 高速度，低曲率，直线运动
  if (v_avg > 0.6 && c_avg < 0.2 && straight > 0.8) {
    probs[3] += 0.4;
  }
  
  // rage_shake: 高速度，高曲率
  if (v_avg > 0.5 && c_avg > 0.5) {
    probs[1] += 0.4;
  }
  
  // precision_snipe: 低速度，高直线度
  if (v_avg < 0.3 && straight > 0.9) {
    probs[2] += 0.4;
  }
  
  // lost_confused: 高熵，低直线度
  if (entropy > 0.6 && straight < 0.4) {
    probs[0] += 0.4;
  }
  
  // casual_explore: 中等速度
  if (v_avg > 0.2 && v_avg < 0.5 && c_avg < 0.4) {
    probs[4] += 0.3;
  }
  
  // Softmax 归一化
  const expSum = probs.reduce((sum, p) => sum + Math.exp(p), 0);
  return probs.map(p => Math.exp(p) / expSum);
}

/**
 * 生成范围内的随机数
 */
function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ============================================================================
// 统计计算
// ============================================================================

/**
 * 计算张量统计信息
 */
function calculateStatistics(name: string, values: number[]): TensorStatistics {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  const percentile = (p: number) => {
    const idx = Math.ceil((p / 100) * n) - 1;
    return sorted[Math.max(0, Math.min(n - 1, idx))];
  };
  
  return {
    name,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    std,
    median: percentile(50),
    percentiles: {
      p1: percentile(1),
      p5: percentile(5),
      p95: percentile(95),
      p99: percentile(99),
    },
  };
}

/**
 * 计算量化参数
 */
function calculateQuantizationParams(
  name: string,
  values: number[],
  dataType: 'int8' | 'uint8',
  symmetric: boolean
): QuantizationParams {
  const stats = calculateStatistics(name, values);
  
  let minVal = stats.min;
  let maxVal = stats.max;
  
  // 对称量化：使用绝对值最大值
  if (symmetric || dataType === 'int8') {
    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
    minVal = -absMax;
    maxVal = absMax;
  }
  
  // 添加小的epsilon防止除零
  const epsilon = 1e-8;
  
  let scale: number;
  let zeroPoint: number;
  
  if (dataType === 'uint8') {
    // uint8: [0, 255]
    const qmin = 0;
    const qmax = 255;
    scale = (maxVal - minVal) / (qmax - qmin);
    zeroPoint = Math.round(qmin - minVal / Math.max(scale, epsilon));
    zeroPoint = Math.max(0, Math.min(255, zeroPoint));
  } else {
    // int8: [-128, 127]，对称量化
    const qmax = 127;
    scale = maxVal / qmax;
    zeroPoint = 0;
  }
  
  scale = Math.max(scale, epsilon);
  
  return {
    tensorName: name,
    scale,
    zeroPoint,
    dataType,
    minValue: minVal,
    maxValue: maxVal,
    calibrationSamples: values.length,
    lastUpdated: new Date().toISOString(),
    statistics: stats,
  };
}

// ============================================================================
// 主校准流程
// ============================================================================

/**
 * 加载校准数据
 */
function loadCalibrationData(config: CalibrationConfig): CalibrationSample[] {
  if (fs.existsSync(config.dataPath)) {
    console.log(`[CALIBRATE] 从文件加载校准数据: ${config.dataPath}`);
    const data = JSON.parse(fs.readFileSync(config.dataPath, 'utf-8'));
    
    if (Array.isArray(data.samples)) {
      return data.samples.slice(0, config.sampleCount);
    }
    if (Array.isArray(data)) {
      return data.slice(0, config.sampleCount);
    }
  }
  
  console.log(`[CALIBRATE] 生成合成校准数据: ${config.sampleCount} 样本`);
  return generateSyntheticData(config.sampleCount);
}

/**
 * 保存校准数据
 */
function saveCalibrationData(data: CalibrationSample[], filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify({
    samples: data,
    generatedAt: new Date().toISOString(),
    count: data.length,
  }, null, 2));
  
  console.log(`[CALIBRATE] 校准数据已保存: ${filePath}`);
}

/**
 * 执行校准
 */
function runCalibration(config: CalibrationConfig): QuantizationParams[] {
  console.log('\n========================================');
  console.log('    ONNX 动态量化参数校准器');
  console.log('========================================\n');
  
  // 1. 加载/生成数据
  const samples = loadCalibrationData(config);
  
  if (config.verbose) {
    console.log(`[CALIBRATE] 样本数: ${samples.length}`);
    console.log(`[CALIBRATE] 数据类型: ${config.dataType}`);
    console.log(`[CALIBRATE] 对称量化: ${config.symmetric}`);
  }
  
  // 2. 收集输入特征统计
  const inputValues: number[] = [];
  samples.forEach(s => inputValues.push(...s.features));
  
  // 3. 收集输出统计
  const outputValues: number[] = [];
  samples.forEach(s => {
    if (s.expectedOutput) {
      outputValues.push(...s.expectedOutput);
    }
  });
  
  // 4. 计算量化参数
  const params: QuantizationParams[] = [];
  
  // 输入参数
  const inputParams = calculateQuantizationParams(
    'input',
    inputValues,
    config.dataType,
    config.symmetric
  );
  params.push(inputParams);
  
  // 输出参数 (如果存在输出数据)
  if (outputValues.length > 0) {
    const outputParams = calculateQuantizationParams(
      'output',
      outputValues,
      config.dataType,
      config.symmetric
    );
    params.push(outputParams);
  }
  
  // 5. 打印统计信息
  if (config.verbose) {
    console.log('\n----------------------------------------');
    console.log('           校准统计信息');
    console.log('----------------------------------------');
    
    params.forEach(p => {
      console.log(`\n[${p.tensorName}]`);
      console.log(`  范围: [${p.minValue.toFixed(6)}, ${p.maxValue.toFixed(6)}]`);
      console.log(`  Scale: ${p.scale.toExponential(6)}`);
      console.log(`  Zero Point: ${p.zeroPoint}`);
      console.log(`  数据类型: ${p.dataType}`);
      console.log(`  校准样本: ${p.calibrationSamples}`);
      console.log(`  统计:`);
      console.log(`    均值: ${p.statistics.mean.toFixed(6)}`);
      console.log(`    标准差: ${p.statistics.std.toFixed(6)}`);
      console.log(`    中位数: ${p.statistics.median.toFixed(6)}`);
      console.log(`    P99: ${p.statistics.percentiles.p99.toFixed(6)}`);
    });
  }
  
  return params;
}

/**
 * 保存量化参数
 */
function saveParams(params: QuantizationParams[], filePath: string, config: CalibrationConfig): void {
  const output = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    config: {
      dataType: config.dataType,
      symmetric: config.symmetric,
      sampleCount: config.sampleCount,
    },
    params,
  };
  
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
  console.log(`\n[CALIBRATE] ✅ 量化参数已保存: ${filePath}`);
}

/**
 * 验证量化效果
 */
function validateQuantization(params: QuantizationParams[], config: CalibrationConfig): void {
  console.log('\n----------------------------------------');
  console.log('           量化效果验证');
  console.log('----------------------------------------');
  
  params.forEach(p => {
    // 模拟量化和反量化
    const testValues = [p.minValue, 0, p.maxValue, p.statistics.mean];
    
    console.log(`\n[${p.tensorName}] 精度验证:`);
    
    testValues.forEach(val => {
      // 量化
      const quantized = Math.round(val / p.scale) + p.zeroPoint;
      const clamped = p.dataType === 'int8'
        ? Math.max(-128, Math.min(127, quantized))
        : Math.max(0, Math.min(255, quantized));
      
      // 反量化
      const dequantized = (clamped - p.zeroPoint) * p.scale;
      
      // 计算误差
      const error = Math.abs(val - dequantized);
      const relativeError = val !== 0 ? (error / Math.abs(val)) * 100 : 0;
      
      console.log(`  ${val.toFixed(6)} -> ${clamped} -> ${dequantized.toFixed(6)} ` +
                  `(误差: ${error.toExponential(2)}, ${relativeError.toFixed(2)}%)`);
    });
  });
}

// ============================================================================
// 命令行解析
// ============================================================================

function parseArgs(): CalibrationConfig {
  const args = process.argv.slice(2);
  const config: CalibrationConfig = {
    dataPath: './data/calibration-samples.json',
    outputPath: './quantization-params.json',
    sampleCount: 1000,
    dataType: 'int8',
    symmetric: true,
    verbose: false,
    featureDims: 12,
    numClasses: 6,
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--data-path':
        config.dataPath = args[++i];
        break;
      case '--output':
        config.outputPath = args[++i];
        break;
      case '--samples':
        config.sampleCount = parseInt(args[++i], 10);
        break;
      case '--data-type':
        config.dataType = args[++i] as 'int8' | 'uint8';
        break;
      case '--symmetric':
        config.symmetric = true;
        break;
      case '--asymmetric':
        config.symmetric = false;
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }
  
  return config;
}

function printHelp(): void {
  console.log(`
ONNX 动态量化参数校准器

用法: npx ts-node scripts/calibrate-quantization.ts [选项]

选项:
  --data-path <path>      合成数据路径 (默认: ./data/calibration-samples.json)
  --output <path>         输出参数文件路径 (默认: ./quantization-params.json)
  --samples <number>      校准样本数 (默认: 1000)
  --data-type <type>      量化类型: int8|uint8 (默认: int8)
  --symmetric             使用对称量化 (默认)
  --asymmetric            使用非对称量化
  --verbose               详细输出
  --help, -h              显示帮助

示例:
  npx ts-node scripts/calibrate-quantization.ts --samples 2000 --verbose
  npx ts-node scripts/calibrate-quantization.ts --data-type uint8 --output ./params.json
`);
}

// ============================================================================
// 主入口
// ============================================================================

function main(): void {
  const config = parseArgs();
  
  try {
    // 执行校准
    const params = runCalibration(config);
    
    // 验证量化效果
    validateQuantization(params, config);
    
    // 保存参数
    saveParams(params, config.outputPath, config);
    
    console.log('\n========================================');
    console.log('    校准完成 ✅');
    console.log('========================================\n');
    
    // 自测检查
    console.log('自测项检查:');
    console.log(`  [QUANT-IMPL-002] 参数持久化: ${fs.existsSync(config.outputPath) ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('\n[CALIBRATE] ❌ 校准失败:', error);
    process.exit(1);
  }
}

// 运行主程序
if (require.main === module) {
  main();
}

// 导出供测试使用
export {
  generateSyntheticData,
  calculateQuantizationParams,
  calculateStatistics,
  validateQuantization,
};
