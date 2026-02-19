#!/usr/bin/env node
/**
 * Hajimi CLI v1.0.0-alpha
 * 
 * DEBT-CLI-001: 仅支持文件，不支持目录递归（P1）
 * DEBT-CLI-002: CDC + zstd 完整实现待补充（当前为原型）
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { blake3_256 } from '@hajimi/diff';

const program = new Command();

program
  .name('hajimi')
  .description('Hajimi Diff Compression CLI')
  .version('1.0.0-alpha');

// Diff command
program
  .command('diff')
  .description('Create diff patch between two files')
  .argument('<oldFile>', 'Base file path')
  .argument('<newFile>', 'Target file path')
  .option('-o, --output <patch>', 'Output patch file path', 'patch.hdiff')
  .option('-a, --algorithm <algo>', 'Compression algorithm', 'cdc-zstd')
  .action((oldFile: string, newFile: string, options: { output: string; algorithm: string }) => {
    try {
      // Validate inputs
      if (!fs.existsSync(oldFile)) {
        console.error(`[ERROR] Old file not found: ${oldFile}`);
        process.exit(1);
      }
      if (!fs.existsSync(newFile)) {
        console.error(`[ERROR] New file not found: ${newFile}`);
        process.exit(1);
      }

      const oldData = fs.readFileSync(oldFile);
      const newData = fs.readFileSync(newFile);

      // DEBT-CLI-002: 原型阶段使用简化 diff
      // 实际应调用 packages/hajimi-diff CDC + zstd 实现
      console.log(`[INFO] Computing diff...`);
      console.log(`[INFO] Old file: ${oldFile} (${oldData.length} bytes)`);
      console.log(`[INFO] New file: ${newFile} (${newData.length} bytes)`);
      console.log(`[INFO] Algorithm: ${options.algorithm}`);

      // 原型：计算 BLAKE3 哈希用于一致性校验
      const oldHash = Buffer.from(blake3_256(oldData)).toString('hex');
      const newHash = Buffer.from(blake3_256(newData)).toString('hex');

      // 生成简化补丁格式（原型）
      const patch = {
        magic: 'HAJI',
        version: '0.9.1',
        algorithm: options.algorithm,
        oldHash,
        newHash,
        oldSize: oldData.length,
        newSize: newData.length,
        // 原型：存储完整新文件（实际应存储 CDC 分块 + zstd 压缩）
        data: newData.toString('base64'),
        timestamp: new Date().toISOString(),
      };

      const patchBuffer = Buffer.from(JSON.stringify(patch, null, 2));
      fs.writeFileSync(options.output, patchBuffer);

      const ratio = ((1 - patchBuffer.length / newData.length) * 100).toFixed(2);
      console.log(`[OK] Patch written: ${options.output}`);
      console.log(`[INFO] Patch size: ${patchBuffer.length} bytes`);
      console.log(`[INFO] New file size: ${newData.length} bytes`);
      console.log(`[INFO] "Compression" ratio: ${ratio}% (prototype format)`);
      console.log(`[WARN] DEBT-CLI-002: Using prototype format, not optimized CDC+zstd`);

    } catch (err) {
      console.error('[ERROR]', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Apply command
program
  .command('apply')
  .description('Apply patch to base file')
  .argument('<patch>', 'Patch file path')
  .argument('<baseFile>', 'Base file path')
  .option('-o, --output <out>', 'Output file path', 'output.txt')
  .action((patchFile: string, baseFile: string, options: { output: string }) => {
    try {
      // Validate inputs
      if (!fs.existsSync(patchFile)) {
        console.error(`[ERROR] Patch file not found: ${patchFile}`);
        process.exit(1);
      }
      if (!fs.existsSync(baseFile)) {
        console.error(`[ERROR] Base file not found: ${baseFile}`);
        process.exit(1);
      }

      const patchData = fs.readFileSync(patchFile);
      const baseData = fs.readFileSync(baseFile);

      console.log(`[INFO] Reading patch: ${patchFile}`);
      console.log(`[INFO] Base file: ${baseFile} (${baseData.length} bytes)`);

      // 解析补丁
      let patch: any;
      try {
        patch = JSON.parse(patchData.toString());
      } catch {
        console.error('[ERROR] Invalid patch file format');
        process.exit(1);
      }

      // 验证补丁头部
      if (patch.magic !== 'HAJI') {
        console.error('[ERROR] Invalid patch magic');
        process.exit(1);
      }

      // 验证 base 文件哈希
      const baseHash = Buffer.from(blake3_256(baseData)).toString('hex');
      if (baseHash !== patch.oldHash) {
        console.error('[ERROR] Base file hash mismatch!');
        console.error(`[ERROR] Expected: ${patch.oldHash}`);
        console.error(`[ERROR] Actual:   ${baseHash}`);
        process.exit(1);
      }

      // 原型：从补丁恢复数据
      const outputData = Buffer.from(patch.data, 'base64');
      fs.writeFileSync(options.output, outputData);

      // 验证输出哈希
      const outputHash = Buffer.from(blake3_256(outputData)).toString('hex');
      if (outputHash !== patch.newHash) {
        console.error('[ERROR] Output hash mismatch!');
        process.exit(1);
      }

      console.log(`[OK] Applied patch: ${options.output}`);
      console.log(`[INFO] Output size: ${outputData.length} bytes`);
      console.log(`[OK] SHA256 verification passed`);

    } catch (err) {
      console.error('[ERROR]', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Hash command (utility)
program
  .command('hash')
  .description('Compute BLAKE3-256 hash of file')
  .argument('<file>', 'File to hash')
  .action((file: string) => {
    if (!fs.existsSync(file)) {
      console.error(`[ERROR] File not found: ${file}`);
      process.exit(1);
    }
    const data = fs.readFileSync(file);
    const hash = Buffer.from(blake3_256(data)).toString('hex');
    console.log(`${hash}  ${file}`);
  });

program.parse();
