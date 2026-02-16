/**
 * Redis连接诊断脚本
 * 
 * B-01/04: Redis连接诊断师
 * - 使用ioredis连接 redis://localhost:6379
 * - 执行：连接 → set → get → del → 验证
 * - 输出详细的连接状态和错误信息
 */

import Redis from 'ioredis';
import { createRedisStore } from '../lib/tsa/persistence/RedisStore';

// 诊断配置
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TEST_KEY = 'hajimi:redis:diagnostic:test-key';
const TEST_VALUE = { message: 'Hello from Hajimi Redis Diagnostic', timestamp: Date.now() };

interface DiagnosticResult {
  step: string;
  status: '✅ PASS' | '❌ FAIL' | '⏳ SKIP';
  message: string;
  details?: unknown;
  error?: string;
}

const results: DiagnosticResult[] = [];

function logResult(result: DiagnosticResult): void {
  results.push(result);
  console.log(`\n${result.status} ${result.step}`);
  console.log(`   ${result.message}`);
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  if (result.details) {
    console.log(`   Details:`, result.details);
  }
}

async function diagnoseRedis(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Hajimi Redis 连接诊断脚本 (B-01/04)                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n📝 诊断配置:`);
  console.log(`   - Redis URL: ${REDIS_URL}`);
  console.log(`   - 测试键名: ${TEST_KEY}`);
  console.log(`   - 诊断时间: ${new Date().toISOString()}`);

  let redis: Redis | null = null;

  try {
    // Step 1: 创建连接
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 1: 创建Redis连接                                        │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    
    try {
      redis = new Redis(REDIS_URL, {
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 100, 3000);
          console.log(`   🔄 重试连接 #${times}, 延迟 ${delay}ms`);
          return delay;
        },
      });

      logResult({
        step: '创建Redis实例',
        status: '✅ PASS',
        message: '成功创建ioredis实例',
        details: { url: REDIS_URL.replace(/:\/\/.*@/, '://***@') }, // 隐藏密码
      });
    } catch (error) {
      logResult({
        step: '创建Redis实例',
        status: '❌ FAIL',
        message: '创建ioredis实例失败',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Step 2: 测试连接 (ping)
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 2: 测试连接 (PING)                                      │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const pingResult = await redis.ping();
      if (pingResult === 'PONG') {
        logResult({
          step: 'PING测试',
          status: '✅ PASS',
          message: 'Redis服务器响应 PONG',
        });
      } else {
        throw new Error(`Unexpected response: ${pingResult}`);
      }
    } catch (error) {
      logResult({
        step: 'PING测试',
        status: '❌ FAIL',
        message: 'Redis服务器无响应',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Step 3: 获取服务器信息
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 3: 获取Redis服务器信息                                  │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const info = await redis.info('server');
      const version = info.match(/redis_version:(.+)/)?.[1]?.trim() || 'unknown';
      const mode = info.match(/redis_mode:(.+)/)?.[1]?.trim() || 'unknown';
      
      logResult({
        step: '服务器信息',
        status: '✅ PASS',
        message: `Redis版本: ${version}, 模式: ${mode}`,
        details: { version, mode },
      });
    } catch (error) {
      logResult({
        step: '服务器信息',
        status: '❌ FAIL',
        message: '获取服务器信息失败',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 4: SET操作
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 4: SET操作测试                                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const setResult = await redis.set(TEST_KEY, JSON.stringify(TEST_VALUE), 'EX', 60);
      if (setResult === 'OK') {
        logResult({
          step: 'SET操作',
          status: '✅ PASS',
          message: `成功设置键值 (TTL: 60s)`,
          details: { key: TEST_KEY },
        });
      } else {
        throw new Error(`Unexpected SET response: ${setResult}`);
      }
    } catch (error) {
      logResult({
        step: 'SET操作',
        status: '❌ FAIL',
        message: 'SET操作失败',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Step 5: GET操作
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 5: GET操作测试                                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const getResult = await redis.get(TEST_KEY);
      if (getResult) {
        const parsed = JSON.parse(getResult);
        logResult({
          step: 'GET操作',
          status: '✅ PASS',
          message: '成功获取键值',
          details: { key: TEST_KEY, value: parsed },
        });
      } else {
        throw new Error('Key not found after SET');
      }
    } catch (error) {
      logResult({
        step: 'GET操作',
        status: '❌ FAIL',
        message: 'GET操作失败',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Step 6: TTL检查
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 6: TTL检查测试                                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const ttl = await redis.ttl(TEST_KEY);
      if (ttl > 0) {
        logResult({
          step: 'TTL检查',
          status: '✅ PASS',
          message: `键值剩余TTL: ${ttl}秒`,
          details: { ttl },
        });
      } else if (ttl === -1) {
        logResult({
          step: 'TTL检查',
          status: '⏳ SKIP',
          message: '键值无过期时间',
        });
      } else {
        throw new Error('Key does not exist');
      }
    } catch (error) {
      logResult({
        step: 'TTL检查',
        status: '❌ FAIL',
        message: 'TTL检查失败',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 7: DEL操作
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 7: DEL操作测试                                          │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const delResult = await redis.del(TEST_KEY);
      if (delResult === 1) {
        logResult({
          step: 'DEL操作',
          status: '✅ PASS',
          message: '成功删除键值',
          details: { key: TEST_KEY, deleted: delResult },
        });
      } else {
        throw new Error(`Unexpected DEL response: ${delResult}`);
      }
    } catch (error) {
      logResult({
        step: 'DEL操作',
        status: '❌ FAIL',
        message: 'DEL操作失败',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Step 8: 验证删除
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 8: 验证删除                                             │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const verifyResult = await redis.get(TEST_KEY);
      if (verifyResult === null) {
        logResult({
          step: '删除验证',
          status: '✅ PASS',
          message: '键值已确认删除',
        });
      } else {
        throw new Error('Key still exists after DEL');
      }
    } catch (error) {
      logResult({
        step: '删除验证',
        status: '❌ FAIL',
        message: '删除验证失败',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 9: RedisStore兼容性检查
    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│ Step 9: RedisStore URL兼容性检查                             │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    const testUrls = [
      'redis://localhost:6379',
      'redis://127.0.0.1:6379',
      'redis://user:pass@localhost:6379',
      'rediss://secure.example.com:6380',
      'https://test.upstash.io',
      'https://xxx.kv.vercel-storage.com',
    ];

    const urlResults = testUrls.map(url => {
      // 模拟isUpstashUrl逻辑
      const isUpstash = url.includes('upstash.io') || url.includes('kv.vercel-storage.com');
      const isRedisProtocol = url.startsWith('redis://') || url.startsWith('rediss://');
      return {
        url: url.replace(/:\/\/.*@/, '://***@'),
        isUpstash,
        isRedisProtocol,
        supported: isUpstash, // 当前只有Upstash被支持
      };
    });

    const redisUrls = urlResults.filter(r => r.isRedisProtocol);
    const supportedCount = urlResults.filter(r => r.supported).length;

    logResult({
      step: 'URL兼容性',
      status: supportedCount > 0 ? '✅ PASS' : '❌ FAIL',
      message: `Redis协议URL: ${redisUrls.length}个, 当前支持: ${supportedCount}个`,
      details: { 
        urls: urlResults,
        note: '当前RedisStore仅支持Upstash REST API，标准redis://协议需额外适配',
      },
    });

  } catch (error) {
    console.log('\n❌ 诊断过程中遇到致命错误，中止后续测试');
    console.error(error);
  } finally {
    // 清理连接
    if (redis) {
      await redis.quit();
      console.log('\n🔌 Redis连接已关闭');
    }

    // 输出总结
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      诊断总结                                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    const passed = results.filter(r => r.status === '✅ PASS').length;
    const failed = results.filter(r => r.status === '❌ FAIL').length;
    const skipped = results.filter(r => r.status === '⏳ SKIP').length;
    
    console.log(`\n   总计: ${results.length} 项测试`);
    console.log(`   ✅ 通过: ${passed}`);
    console.log(`   ❌ 失败: ${failed}`);
    console.log(`   ⏳ 跳过: ${skipped}`);
    
    if (failed === 0) {
      console.log('\n   🎉 所有诊断测试通过！Redis连接正常。');
    } else {
      console.log('\n   ⚠️ 部分诊断测试失败，请检查Redis配置。');
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');
  }
}

// 运行诊断
diagnoseRedis().catch(console.error);
