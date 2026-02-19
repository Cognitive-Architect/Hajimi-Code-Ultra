// Hajimi Diff Core Library v0.9.1-rc
'use strict';

const { blake3_256 } = require('./hash/blake3_256');
const { xxh64 } = require('./hash/xxh64');

module.exports = {
  // Hash algorithms
  blake3_256,
  xxh64,
  
  // Version
  version: '0.9.1-rc',
  
  // Placeholder for future CDC + zstd implementation
  // diff: (oldData, newData) => { ... },
  // apply: (patch, baseData) => { ... },
};
