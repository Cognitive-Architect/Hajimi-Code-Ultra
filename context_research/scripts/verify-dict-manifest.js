// DEBT-DICT-VERIFY: 仅验证基本格式，未校验字典文件有效性和兼容性，P2级别
'use strict';
const fs = require('fs');
const path = require('path');
function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const p = path.join(repoRoot, 'delivery', 'v0.9.1', 'dictionary-manifest.json');
  if (!fs.existsSync(p)) throw new Error('Missing dictionary-manifest.json');
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (m.manifest_format !== 'hajimi-dict-v1') throw new Error('manifest_format mismatch');
  if (m.version !== '0.9.1') throw new Error('version mismatch');
  if (!Array.isArray(m.dictionaries)) throw new Error('dictionaries must be array');
  const ids = new Set();
  for (const d of m.dictionaries) {
    if (typeof d.dict_id !== 'number') throw new Error('dict_id must be number');
    if (ids.has(d.dict_id)) throw new Error('duplicate dict_id=' + d.dict_id);
    ids.add(d.dict_id);
    if (d.training_date !== null && d.training_date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.training_date)) throw new Error('training_date bad format');
    }
  }
  console.log('DICT_MANIFEST_OK');
}
if (require.main === module) main();