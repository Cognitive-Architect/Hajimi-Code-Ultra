// DEBT-B03-001: DictID上限4096，多租户场景可能溢出，需分片或扩展ID空间
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
function parseDictId(file) {
  // 规则：dict-<name>-id0001-v0.9.1.zst
  const m = file.match(/-id(\d{1,4})-v0\.9\.1\.zst$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}
function mustYYYYMMDD(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('training_date must be YYYY-MM-DD');
  return s;
}
function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const dictDir = path.join(repoRoot, 'dicts');
  const outDir = path.join(repoRoot, 'delivery', 'v0.9.1');
  fs.mkdirSync(outDir, { recursive: true });
  const trainingDate = process.env.DICT_TRAINING_DATE ? mustYYYYMMDD(process.env.DICT_TRAINING_DATE) : null;
  const dictionaries = [];
  if (fs.existsSync(dictDir)) {
    const files = fs.readdirSync(dictDir).filter(f => f.endsWith('.zst'));
    for (const file of files) {
      const dictId = parseDictId(file);
      if (dictId === null) continue;
      const filePath = path.join(dictDir, file);
      const buf = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      dictionaries.push({
        dict_id: dictId,
        name: file.replace(/-v0\.9\.1\.zst$/, ''),
        format: 'zstd',
        sha256,
        size_bytes: buf.length,
        compatible_versions: ['0.9.1'],
        distribution_path: path.join('./dicts', file).replace(/\\/g, '/'),
        source_corpus: 'UNKNOWN',
        training_date: trainingDate
      });
    }
  }
  // 确定性：按 dict_id 排序
  dictionaries.sort((a, b) => a.dict_id - b.dict_id);
  // 确定性：dict_id 不得重复
  const seen = new Set();
  for (const d of dictionaries) {
    if (seen.has(d.dict_id)) throw new Error('duplicate dict_id=' + d.dict_id);
    seen.add(d.dict_id);
  }
  const manifest = {
    version: '0.9.1',
    manifest_format: 'hajimi-dict-v1',
    dictionaries
  };
  fs.writeFileSync(path.join(outDir, 'dictionary-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('[OK] Wrote: delivery/v0.9.1/dictionary-manifest.json');
}
if (require.main === module) main();