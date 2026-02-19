# Hajimi Benchmark Report

Generated: 2026-02-19T05:43:40.684Z
Total Tests: 1

## Detailed Results

| Adapter | Dataset | Test Case | Ratio | Speed (MB/s) | Memory (MB) | Correct |
|---------|---------|-----------|-------|--------------|-------------|---------|
| hajimi-diff | ai-chat | default | -55.6% | 0.19 | -0.05 | ✅ |

## Leaderboard

| Rank | Adapter | Avg Ratio | Avg Speed (MB/s) | Score |
|------|---------|-----------|------------------|-------|
| 1 | hajimi-diff | -55.6% | 0.19 | -33.3 |

## JSON Output

```json
{
  "results": [
    {
      "adapter": "hajimi-diff",
      "dataset": "ai-chat",
      "testCase": "default",
      "compressionRatio": -0.5563816604708798,
      "speedMbps": 0.1922547958681636,
      "peakMemoryMb": -0.050140380859375,
      "correctness": true,
      "durationMs": 4.003099999999989
    }
  ],
  "leaderboard": [
    {
      "rank": 1,
      "adapter": "hajimi-diff",
      "avgCompressionRatio": -0.5563816604708798,
      "avgSpeedMbps": 0.1922547958681636,
      "totalScore": -0.3330599770990552
    }
  ]
}
```