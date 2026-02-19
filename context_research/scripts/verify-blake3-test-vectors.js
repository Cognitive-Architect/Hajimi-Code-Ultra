// DEBT-B07-003: 测试向量覆盖有限（当前 3 组），后续需扩充更多边界/分块/树节点用例
'use strict';

const fs = require('fs');
const path = require('path');

const { blake3_256 } = require('../src/hash/blake3_256');

function hex(buf) {
  return Buffer.from(buf).toString('hex');
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function main() {
  const vectors = [
    {
      id: 'BLAKE-001',
      desc: 'empty input',
      input: Buffer.alloc(0),
      // Known-good vector (b3sum / multiple libraries)
      expected: 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
    },
    {
      id: 'BLAKE-002',
      desc: '"abc"',
      input: Buffer.from('abc', 'utf8'),
      expected: '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85',
    },
    {
      id: 'BLAKE-003',
      desc: 'long string (RFC-style): abcdbcdecdef...nopq',
      input: Buffer.from('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'utf8'),
      expected: 'c19012cc2aaf0dc3d8e5c45a1b79114d2df42abb2a410bf54be09e891af06ff8',
    },
  ];

  const results = [];
  let passCount = 0;

  for (const v of vectors) {
    const actual = hex(blake3_256(v.input));
    const pass = actual === v.expected;
    if (pass) passCount++;

    results.push({
      id: v.id,
      desc: v.desc,
      input_len: v.input.length,
      expected: v.expected,
      actual,
      pass,
    });
  }

  const report = {
    version: 'v0.9.1',
    algo: 'blake3-256',
    ts_utc: new Date().toISOString(),
    pass: passCount === vectors.length,
    all_green: passCount === vectors.length,
    pass_count: passCount,
    total: vectors.length,
    tests: results,
  };

  const reportPath = path.join(__dirname, '..', 'delivery', 'v0.9.1', 'blake3-conformance-report.json');
  writeJson(reportPath, report);

  // Console output should be machine-readable-ish.
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.desc} expected=${r.expected} actual=${r.actual}`);
  }
  console.log(`SUMMARY blake3-256 ${passCount}/${vectors.length} passed; report=${reportPath}`);

  process.exit(report.pass ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('FATAL', err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}
