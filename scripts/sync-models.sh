#!/bin/bash
# OpenRouter 模型自动同步脚本
# DEBT-OR-001 清偿 - B-01/09
#
# 用法: ./sync-models.sh [--dry-run]

set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  OpenRouter Model Registry Sync                              ║"
echo "║  DEBT-OR-001 自动漂移检测与映射更新                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
    DRY_RUN=true
    echo "[DRY RUN MODE]"
fi

echo "[$(date)] Starting model sync..."

# 检查环境
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "⚠️  Warning: OPENROUTER_API_KEY not set"
fi

# 运行同步
node -e "
const { AutoModelRegistry } = require('./lib/quintant/adapters/model-registry-auto');
const { OpenRouterIPDirectAdapter } = require('./lib/quintant/adapters/openrouter-ip-direct');

async function sync() {
    const adapter = new OpenRouterIPDirectAdapter({
        apiKey: process.env.OPENROUTER_API_KEY || 'test-key',
    });
    
    const registry = new AutoModelRegistry(adapter, {
        syncIntervalMs: 24 * 60 * 60 * 1000
    });
    
    registry.on('drift:detected', (drift) => {
        console.log('🔍 Drift detected:');
        console.log('  Removed:', drift.removedModels.length);
        console.log('  New:', drift.newModels.length);
        console.log('  Price changes:', drift.changedPricing.length);
    });
    
    registry.on('mapping:auto-generated', (m) => {
        console.log('✨ Auto-generated mapping:', m.alias, '->', m.canonicalId);
    });
    
    const result = await registry.syncModels();
    
    if (result.hasDrift) {
        console.log('⚠️  Model drift detected!');
        process.exitCode = 1;
    } else {
        console.log('✅ All models up to date');
    }
    
    // 导出映射表
    const mappings = registry.exportMappings();
    console.log('📋 Active mappings:', Object.keys(mappings).length);
}

sync().catch(err => {
    console.error('❌ Sync failed:', err);
    process.exit(1);
});
"

if [ $? -eq 0 ]; then
    echo ""
    echo "[$(date)] ✅ Sync completed successfully"
else
    echo ""
    echo "[$(date)] ⚠️  Sync completed with warnings"
fi

echo ""
echo "Next sync scheduled in 24 hours"
