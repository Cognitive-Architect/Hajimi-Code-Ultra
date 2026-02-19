# HAJIMI v0.9.1-RC (FIX-ALL/01) Acceptance Report

## Gates
- FIX-A: all_green field present and true
- FIX-B: DEBT-B07-001/002/003 split; no 敏感词A/B
- FIX-C: hajimi metric uses status=not_implemented
- FIX-D: corruption suite outputs '100 passed'; magicflip => E1001 + recoverable_pct=0
- FIX-E: docs removed fallback/降级 semantics

## Receipts
See: delivery/v0.9.1/receipts/fix-all-01/*.log

## SHA256
(authoritative list in SHA256SUMS.txt)

```
a6ef04ca2c22244ed521553eaa0e125ac0436ea315cbda9f2134c6fbb438830c  src/hash/blake3_256.js
5049400301368a040f8a2481b4c424f7e887807688229b18783a181c62704e6d  scripts/verify-blake3-test-vectors.js
00d9cd8b3071e327bac9a1a01377930ffd2af67dfb869fcbed69c7032d894613  delivery/v0.9.1/blake3-conformance-report.json
79e8b006d52f73a437dbe6aa0ac5a28ce3ffaa133c1716e08d5b0387232a84d7  scripts/run-benchmark.js
39b20a07d04af25ef56d16b06d532441ebb2fdb5cf7c540b92448a72f1c322ad  bench/schema/metrics.schema.json
1d59082c8af374a9d58bd8175fe8b2e571b4217e590f09a030a26a362d8ecb59  bench/results/baseline.json
369048b3115c3e1e10de8f5847228f0c9e79bb543835341d10f18d61de43c3e5  scripts/run-corruption-suite.js
7140dd9880cf76f221c30ca346068764a1e5741e02f83820eff838550553d6c9  package.json
f16ee7fd135e1ad7b072ee7c38014e0f8fe217eb01c7794c4ce1051cfd5e8bb8  tools/recover/scanner.js
e1ace401ba1f5098250172281565bdf78dc01acc2dba1056febccfef2ddeb96f  delivery/v0.9.1/traceability-matrix.md
55c45ad1d0dde2cd3ca7da9e45fcf0acc3a1d70f5c402c41c58a51d919d50418  delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md
e9f7b1a9b42cd0f1128759ab480a0cb031aca387d1c7ce4ab717fcd059040460  delivery/v0.9.1/minimal.hdiff
2dfd7d31955a7a8036d06599146894716c4e954ec1bc2cd82ebcccd0c35a3a5c  delivery/v0.9.1/golden-vector.json
```
