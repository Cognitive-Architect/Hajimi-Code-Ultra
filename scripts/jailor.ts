#!/usr/bin/env tsx
/**
 * 客服小祥·典狱长 CLI
 * 
 * 用法: npx tsx scripts/jailor.ts <command> [options]
 * 
 * 命令:
 *   spawn      启动沙盒容器
 *   execute    在沙盒中执行代码
 *   destroy    销毁沙盒容器
 *   health     检查沙盒健康状态
 *   list       列出所有沙盒
 *   validate   验证 Docker Compose 配置
 * 
 * 示例:
 *   npx tsx scripts/jailor.ts spawn
 *   npx tsx scripts/jailor.ts execute --id <sandbox-id> --code "echo hello"
 *   npx tsx scripts/jailor.ts destroy --id <sandbox-id>
 *   npx tsx scripts/jailor.ts health --id <sandbox-id>
 *   npx tsx scripts/jailor.ts list
 *   npx tsx scripts/jailor.ts validate
 */

import { Jailor, SandboxConfig } from '../lib/sandbox/jailor';
import * as readline from 'readline';

// 命令行参数解析
function parseArgs(): { command: string; options: Record<string, string | boolean> } {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('-')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return { command, options };
}

// 打印帮助信息
function printHelp(): void {
  console.log(`
客服小祥·典狱长 - 沙盒容器编排 CLI

用法: npx tsx scripts/jailor.ts <command> [options]

命令:
  spawn      启动沙盒容器
  execute    在沙盒中执行代码
  destroy    销毁沙盒容器
  health     检查沙盒健康状态
  list       列出所有沙盒
  validate   验证 Docker Compose 配置
  help       显示帮助信息

选项:
  --id <id>          沙盒 ID
  --code <code>      要执行的代码
  --file <path>      从文件读取代码
  --interpreter <sh|bash|node|python3>  解释器 (默认: sh)
  --timeout <ms>     执行超时时间 (默认: 30000)
  --force            强制操作
  --debug            调试模式

示例:
  # 启动新沙盒
  npx tsx scripts/jailor.ts spawn

  # 使用指定 ID 启动
  npx tsx scripts/jailor.ts spawn --id my-sandbox

  # 执行代码
  npx tsx scripts/jailor.ts execute --id my-sandbox --code "echo hello world"

  # 执行 JavaScript
  npx tsx scripts/jailor.ts execute --id my-sandbox --code "console.log('hello')" --interpreter node

  # 从文件执行
  npx tsx scripts/jailor.ts execute --id my-sandbox --file script.sh

  # 检查健康状态
  npx tsx scripts/jailor.ts health --id my-sandbox

  # 销毁沙盒
  npx tsx scripts/jailor.ts destroy --id my-sandbox

  # 强制销毁
  npx tsx scripts/jailor.ts destroy --id my-sandbox --force

  # 列出所有沙盒
  npx tsx scripts/jailor.ts list

  # 验证配置
  npx tsx scripts/jailor.ts validate
`);
}

// 启动沙盒
async function spawn(options: Record<string, string | boolean>): Promise<void> {
  const jailor = new Jailor({ debug: options.debug === true });
  
  const config: SandboxConfig = {};
  
  if (typeof options.id === 'string') {
    config.id = options.id;
  }
  
  if (typeof options.image === 'string') {
    config.image = options.image;
  }
  
  if (typeof options.memory === 'string') {
    config.memoryLimit = parseInt(options.memory, 10);
  }
  
  if (typeof options.cpu === 'string') {
    config.cpuLimit = parseFloat(options.cpu);
  }

  console.log('🚀 启动沙盒容器...');
  
  try {
    const info = await jailor.spawn(config);
    
    console.log('\n✅ 沙盒启动成功!');
    console.log(`   ID:           ${info.id}`);
    console.log(`   容器名:       ${info.containerName}`);
    console.log(`   状态:         ${info.status}`);
    console.log(`   创建时间:     ${info.createdAt.toISOString()}`);
    
    // 验证 rootless
    const health = await jailor.healthCheck(info.id);
    if (health.healthy) {
      console.log('   Rootless:     ✓ (UID 1000)');
    } else {
      console.log(`   Rootless:     ✗ (${health.error})`);
    }
    
    console.log(`\n   使用: npx tsx scripts/jailor.ts execute --id ${info.id} --code "echo hello"`);
    
  } catch (error) {
    console.error('\n❌ 启动失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// 执行代码
async function execute(options: Record<string, string | boolean>): Promise<void> {
  if (!options.id) {
    console.error('❌ 错误: 缺少 --id 参数');
    process.exit(1);
  }

  const jailor = new Jailor({ debug: options.debug === true });
  const id = String(options.id);

  let code: string;
  
  if (options.file) {
    // 从文件读取
    const fs = await import('fs/promises');
    try {
      code = await fs.readFile(String(options.file), 'utf-8');
    } catch (error) {
      console.error(`❌ 无法读取文件: ${options.file}`);
      process.exit(1);
    }
  } else if (options.code) {
    code = String(options.code);
  } else {
    // 交互式输入
    code = await new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('请输入要执行的代码 (Ctrl+D 结束):');
      
      let input = '';
      rl.on('line', (line) => {
        input += line + '\n';
      });
      
      rl.on('close', () => {
        resolve(input.trim());
      });
    });
  }

  const interpreter = (options.interpreter as 'sh' | 'bash' | 'node' | 'python3') || 'sh';
  const timeout = typeof options.timeout === 'string' ? parseInt(options.timeout, 10) : 30000;

  console.log(`📝 在沙盒 ${id} 中执行代码...`);
  console.log(`   解释器: ${interpreter}`);
  console.log(`   超时: ${timeout}ms`);
  console.log(`   代码长度: ${code.length} 字符\n`);

  try {
    const result = await jailor.execute(id, code, { 
      interpreter, 
      timeout 
    });

    console.log('--- 执行结果 ---');
    console.log(`退出码: ${result.exitCode}`);
    console.log(`耗时: ${result.duration}ms`);
    
    if (result.timedOut) {
      console.log('状态: ⏱️ 超时');
    }
    
    if (result.stdout) {
      console.log('\n标准输出:');
      console.log(result.stdout);
    }
    
    if (result.stderr) {
      console.log('\n标准错误:');
      console.log(result.stderr);
    }
    
    process.exit(result.exitCode);
    
  } catch (error) {
    console.error('\n❌ 执行失败:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// 销毁沙盒
async function destroy(options: Record<string, string | boolean>): Promise<void> {
  const jailor = new Jailor({ debug: options.debug === true });
  const force = options.force === true;

  if (options.id) {
    // 销毁指定沙盒
    const id = String(options.id);
    console.log(`🗑️  销毁沙盒: ${id} ${force ? '(强制)' : ''}`);
    
    const success = await jailor.destroy(id, force);
    
    if (success) {
      console.log('✅ 沙盒已销毁');
    } else {
      console.log('⚠️  沙盒不存在或销毁失败');
      process.exit(1);
    }
  } else {
    // 销毁所有沙盒
    console.log(`🗑️  销毁所有沙盒 ${force ? '(强制)' : ''}...`);
    
    const destroyed = await jailor.destroyAll(force);
    console.log(`✅ 已销毁 ${destroyed} 个沙盒`);
  }
}

// 健康检查
async function health(options: Record<string, string | boolean>): Promise<void> {
  if (!options.id) {
    console.error('❌ 错误: 缺少 --id 参数');
    process.exit(1);
  }

  const jailor = new Jailor({ debug: options.debug === true });
  const id = String(options.id);

  console.log(`🏥 检查沙盒健康状态: ${id}`);
  
  const status = await jailor.healthCheck(id);
  
  console.log('\n--- 健康报告 ---');
  console.log(`健康: ${status.healthy ? '✅ 健康' : '❌ 异常'}`);
  console.log(`状态: ${status.status}`);
  
  if (status.containerStatus) {
    console.log(`容器状态: ${status.containerStatus}`);
  }
  
  console.log(`检查时间: ${status.checkedAt.toISOString()}`);
  
  if (status.error) {
    console.log(`错误: ${status.error}`);
  }
  
  process.exit(status.healthy ? 0 : 1);
}

// 列出沙盒
async function list(options: Record<string, string | boolean>): Promise<void> {
  const jailor = new Jailor({ debug: options.debug === true });
  
  console.log('📋 沙盒列表\n');
  
  const sandboxes = jailor.getAllSandboxes();
  
  if (sandboxes.length === 0) {
    console.log('暂无沙盒');
    return;
  }
  
  console.log('ID                  | 容器名              | 状态    | 创建时间');
  console.log('--------------------|---------------------|---------|---------------------------');
  
  for (const sb of sandboxes) {
    const id = sb.id.padEnd(19);
    const name = sb.containerName.padEnd(19);
    const status = sb.status.padEnd(7);
    const time = sb.createdAt.toISOString();
    console.log(`${id}| ${name}| ${status}| ${time}`);
  }
  
  console.log(`\n共 ${sandboxes.length} 个沙盒`);
}

// 验证配置
async function validate(options: Record<string, string | boolean>): Promise<void> {
  const jailor = new Jailor({ debug: options.debug === true });
  
  console.log('🔍 验证 Docker Compose 配置...\n');
  
  const result = await jailor.validateConfig();
  
  if (result.valid) {
    console.log('✅ 配置验证通过');
    console.log(`   配置文件: docker-compose.sandbox.yml`);
    process.exit(0);
  } else {
    console.log('❌ 配置验证失败');
    console.log(`   错误: ${result.error}`);
    process.exit(1);
  }
}

// 运行自测
async function selfTest(options: Record<string, string | boolean>): Promise<void> {
  const jailor = new Jailor({ debug: options.debug === true });
  
  console.log('🧪 运行自测...\n');
  
  let passed = 0;
  let failed = 0;

  // JAIL-001: 容器启动测试
  console.log('测试 JAIL-001: 容器启动...');
  try {
    const info = await jailor.spawn({ id: 'test-jail-001' });
    console.log('✅ 容器启动成功');
    passed++;
    
    // 清理
    await jailor.destroy('test-jail-001', true);
  } catch (error) {
    console.log(`❌ 失败: ${error instanceof Error ? error.message : error}`);
    failed++;
  }

  // JAIL-002: Rootless 验证
  console.log('\n测试 JAIL-002: Rootless 验证...');
  try {
    const info = await jailor.spawn({ id: 'test-jail-002' });
    
    const result = await jailor.execute(info.id, 'id -u');
    const uid = result.stdout.trim();
    
    if (uid === '1000') {
      console.log('✅ Rootless 验证通过 (UID 1000)');
      passed++;
    } else {
      console.log(`❌ UID 为 ${uid}, 期望 1000`);
      failed++;
    }
    
    // 清理
    await jailor.destroy('test-jail-002', true);
  } catch (error) {
    console.log(`❌ 失败: ${error instanceof Error ? error.message : error}`);
    failed++;
  }

  // JAIL-003: 代码执行
  console.log('\n测试 JAIL-003: 代码执行...');
  try {
    const info = await jailor.spawn({ id: 'test-jail-003' });
    
    const result = await jailor.execute(info.id, 'echo "hello from sandbox"');
    
    if (result.exitCode === 0 && result.stdout.includes('hello from sandbox')) {
      console.log('✅ 代码执行成功');
      passed++;
    } else {
      console.log(`❌ 执行失败: exitCode=${result.exitCode}`);
      failed++;
    }
    
    // 清理
    await jailor.destroy('test-jail-003', true);
  } catch (error) {
    console.log(`❌ 失败: ${error instanceof Error ? error.message : error}`);
    failed++;
  }

  // 汇总
  console.log('\n--- 测试结果 ---');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

// 主函数
async function main(): Promise<void> {
  const { command, options } = parseArgs();

  switch (command) {
    case 'spawn':
      await spawn(options);
      break;
      
    case 'execute':
      await execute(options);
      break;
      
    case 'destroy':
      await destroy(options);
      break;
      
    case 'health':
      await health(options);
      break;
      
    case 'list':
      await list(options);
      break;
      
    case 'validate':
      await validate(options);
      break;
      
    case 'self-test':
      await selfTest(options);
      break;
      
    case 'help':
    default:
      printHelp();
      break;
  }
}

// 运行
main().catch(error => {
  console.error('错误:', error);
  process.exit(1);
});
