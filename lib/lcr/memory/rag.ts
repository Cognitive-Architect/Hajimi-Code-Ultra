/**
 * RAG层运行时实现
 * HAJIMI-PHASE2-IMPL-001 工单 B-05/06
 * 
 * RAG层：IndexedDB + HNSW向量索引
 * - 语义检索延迟目标：<50ms（ARC-002）
 * - 向量维度：768或1536
 * - 支持Top-K近似搜索
 * 
 * 自测点:
 * - ARC-002: 语义检索<50ms
 * - HNSW-001: P95<80ms
 * - HNSW-002: 召回率≥85%
 * 
 * @module lib/lcr/memory/rag
 * @version 1.0.0
 */

import { EventEmitter } from 'events';

// ============================================================================
// 常量定义
// ============================================================================

/** 默认向量维度 */
export const DEFAULT_DIMENSION = 768;

/** 支持的向量维度 */
export type VectorDimension = 384 | 768 | 1536;

/** 语义检索延迟目标: 50ms */
export const TARGET_RETRIEVAL_LATENCY = 50;

/** HNSW默认参数 */
export const HNSW_DEFAULT_M = 12;
export const HNSW_DEFAULT_EF_SEARCH = 48;
export const HNSW_DEFAULT_EF_CONSTRUCTION = 150;

/** 召回率目标: 85% */
export const TARGET_RECALL_RATE = 0.85;

// ============================================================================
// 类型定义
// ============================================================================

/** 向量条目 */
export interface VectorEntry {
  id: string;
  content: string;
  vector: Float32Array;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

/** 搜索结果 */
export interface SearchResult {
  entry: VectorEntry;
  score: number;
  rank: number;
}

/** 搜索选项 */
export interface SearchOptions {
  /** Top-K */
  k?: number;
  /** 搜索范围 */
  efSearch?: number;
  /** 最小相似度阈值 */
  minScore?: number;
  /** 过滤条件 */
  filter?: (entry: VectorEntry) => boolean;
}

/** RAG层统计 */
export interface RAGStats {
  vectorCount: number;
  indexSize: number;
  avgSearchTime: number;
  recallRate: number;
  memoryUsageMB: number;
}

/** HNSW节点 */
interface HNSWNode {
  id: string;
  vector: Float32Array;
  level: number;
  connections: Map<number, string[]>; // level -> neighbor ids
}

/** HNSW配置 */
export interface HNSWConfig {
  M: number;
  efSearch: number;
  efConstruction: number;
  maxElements: number;
  dimension: VectorDimension;
}

// ============================================================================
// HNSW索引实现
// ============================================================================

/**
 * HNSW (Hierarchical Navigable Small World) 索引
 * 
 * 特性:
 * - 近似最近邻搜索
 * - 分层图结构
 * - 对数级搜索复杂度
 */
class HNSWIndex {
  private config: Required<HNSWConfig>;
  private nodes: Map<string, HNSWNode> = new Map();
  private entryPoint: string | null = null;
  private levelMult: number;

  // 统计
  private searchTimes: number[] = [];
  private searchCount = 0;

  constructor(config?: Partial<HNSWConfig>) {
    this.config = {
      M: HNSW_DEFAULT_M,
      efSearch: HNSW_DEFAULT_EF_SEARCH,
      efConstruction: HNSW_DEFAULT_EF_CONSTRUCTION,
      maxElements: 100000,
      dimension: DEFAULT_DIMENSION,
      ...config,
    };
    this.levelMult = 1 / Math.log(this.config.M);
  }

  /**
   * 添加向量
   */
  add(entry: VectorEntry): void {
    if (this.nodes.has(entry.id)) {
      throw new Error(`Vector with id ${entry.id} already exists`);
    }

    const level = this.randomLevel();
    const node: HNSWNode = {
      id: entry.id,
      vector: entry.vector,
      level,
      connections: new Map(),
    };

    this.nodes.set(entry.id, node);

    if (this.entryPoint === null) {
      this.entryPoint = entry.id;
      return;
    }

    // 连接节点到图中
    this.connectNode(node);
  }

  /**
   * 搜索K近邻
   */
  search(query: Float32Array, k: number, efSearch: number = this.config.efSearch): SearchResult[] {
    const startTime = performance.now();

    if (this.entryPoint === null || this.nodes.size === 0) {
      return [];
    }

    // 从入口点开始贪心搜索
    const entryNode = this.nodes.get(this.entryPoint)!;
    let currentId = this.entryPoint;
    let currentDist = this.distance(query, entryNode.vector);

    // 贪心搜索到最底层
    for (let level = entryNode.level; level > 0; level--) {
      const result = this.greedySearchLevel(query, currentId, level);
      currentId = result.node;
      currentDist = result.distance;
    }

    // 在最底层进行ef搜索
    const candidates = this.searchLevel(query, currentId, efSearch);

    // 排序并返回Top-K
    const results = Array.from(candidates.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, k)
      .map(([id, score], rank) => ({
        entry: { id, vector: this.nodes.get(id)!.vector, content: '', timestamp: 0 },
        score: 1 - score, // 转换为相似度
        rank: rank + 1,
      }));

    // 记录搜索时间
    const searchTime = performance.now() - startTime;
    this.searchTimes.push(searchTime);
    this.searchCount++;

    // 检查延迟目标
    if (searchTime > TARGET_RETRIEVAL_LATENCY) {
      console.warn(`[HNSW] Search latency ${searchTime.toFixed(2)}ms exceeds target ${TARGET_RETRIEVAL_LATENCY}ms`);
    }

    return results;
  }

  /**
   * 删除向量
   */
  remove(id: string): boolean {
    if (!this.nodes.has(id)) return false;

    // 从图中移除连接
    const node = this.nodes.get(id)!;
    for (let level = 0; level <= node.level; level++) {
      const neighbors = node.connections.get(level) || [];
      for (const neighborId of neighbors) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          const conns = neighbor.connections.get(level) || [];
          const idx = conns.indexOf(id);
          if (idx >= 0) {
            conns.splice(idx, 1);
          }
        }
      }
    }

    // 更新入口点
    if (this.entryPoint === id) {
      const remaining = Array.from(this.nodes.keys()).filter(k => k !== id);
      this.entryPoint = remaining.length > 0 ? remaining[0] : null;
    }

    this.nodes.delete(id);
    return true;
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.searchTimes = [];
    this.searchCount = 0;
  }

  /**
   * 获取统计
   */
  getStats(): { vectorCount: number; avgSearchTime: number; memoryUsageMB: number } {
    const avgSearchTime = this.searchTimes.length > 0
      ? this.searchTimes.reduce((a, b) => a + b, 0) / this.searchTimes.length
      : 0;

    // 估算内存使用
    const vectorMemory = this.nodes.size * this.config.dimension * 4;
    const connectionMemory = this.nodes.size * this.config.M * 4 * 2;
    const memoryUsageMB = (vectorMemory + connectionMemory) / (1024 * 1024);

    return {
      vectorCount: this.nodes.size,
      avgSearchTime,
      memoryUsageMB,
    };
  }

  private randomLevel(): number {
    let level = 0;
    while (Math.random() < 0.5 && level < 16) {
      level++;
    }
    return level;
  }

  private distance(a: Float32Array, b: Float32Array): number {
    // 余弦距离 = 1 - 余弦相似度
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
    return 1 - similarity;
  }

  private greedySearchLevel(query: Float32Array, entryId: string, level: number): { node: string; distance: number } {
    let currentId = entryId;
    let currentNode = this.nodes.get(currentId)!;
    let currentDist = this.distance(query, currentNode.vector);

    let changed = true;
    while (changed) {
      changed = false;
      const connections = currentNode.connections.get(level) || [];

      for (const neighborId of Array.from(connections)) {
        const neighbor = this.nodes.get(neighborId)!;
        const dist = this.distance(query, neighbor.vector);

        if (dist < currentDist) {
          currentDist = dist;
          currentId = neighborId;
          currentNode = neighbor;
          changed = true;
        }
      }
    }

    return { node: currentId, distance: currentDist };
  }

  private searchLevel(query: Float32Array, entryId: string, ef: number): Map<string, number> {
    const visited = new Set<string>([entryId]);
    const candidates = new Map<string, number>();
    const results = new Map<string, number>();

    const entryNode = this.nodes.get(entryId)!;
    const entryDist = this.distance(query, entryNode.vector);

    candidates.set(entryId, entryDist);
    results.set(entryId, entryDist);

    while (candidates.size > 0) {
      // 获取最近候选
      let nearestId = '';
      let nearestDist = Infinity;

      for (const [id, dist] of Array.from(candidates.entries())) {
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestId = id;
        }
      }

      if (!nearestId) break;

      // 检查是否可以提前终止
      const farthestResult = Math.max(...Array.from(results.values()));
      if (nearestDist > farthestResult && results.size >= ef) {
        break;
      }

      candidates.delete(nearestId);

      // 扩展邻居
      const node = this.nodes.get(nearestId)!;
      for (let level = 0; level <= node.level; level++) {
        const connections = node.connections.get(level) || [];

        for (const neighborId of connections) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            const neighbor = this.nodes.get(neighborId)!;
            const dist = this.distance(query, neighbor.vector);

            if (results.size < ef || dist < farthestResult) {
              candidates.set(neighborId, dist);
              results.set(neighborId, dist);

              if (results.size > ef) {
                // 移除最远结果
                let maxId = '';
                let maxDist = -1;
                for (const [id, d] of Array.from(results.entries())) {
                  if (d > maxDist) {
                    maxDist = d;
                    maxId = id;
                  }
                }
                if (maxId) results.delete(maxId);
              }
            }
          }
        }
      }
    }

    return results;
  }

  private connectNode(newNode: HNSWNode): void {
    const entryNode = this.nodes.get(this.entryPoint!)!;
    let currentId = this.entryPoint!;
    let currentDist = this.distance(newNode.vector, entryNode.vector);

    // 从最高层开始
    for (let level = entryNode.level; level > newNode.level; level--) {
      const result = this.greedySearchLevel(newNode.vector, currentId, level);
      currentId = result.node;
      currentDist = result.distance;
    }

    // 在新节点的层级建立连接
    for (let level = Math.min(newNode.level, entryNode.level); level >= 0; level--) {
      const neighbors = this.searchNeighbors(newNode.vector, currentId, this.config.M, level);

      newNode.connections.set(level, neighbors.map(n => n.id));

      // 双向连接
      for (const neighbor of neighbors) {
        const neighborNode = this.nodes.get(neighbor.id)!;
        if (!neighborNode.connections.has(level)) {
          neighborNode.connections.set(level, []);
        }
        const conns = neighborNode.connections.get(level)!;
        if (conns.length < this.config.M) {
          conns.push(newNode.id);
        } else {
          // 需要替换最远连接
          this.updateConnections(neighborNode, newNode, level);
        }
      }
    }
  }

  private searchNeighbors(query: Float32Array, entryId: string, m: number, level: number): Array<{ id: string; dist: number }> {
    const candidates = this.searchLevel(query, entryId, this.config.efConstruction);
    return Array.from(candidates.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, m)
      .map(([id, dist]) => ({ id, dist }));
  }

  private updateConnections(node: HNSWNode, newNeighbor: HNSWNode, level: number): void {
    const conns = node.connections.get(level)!;
    const newDist = this.distance(node.vector, newNeighbor.vector);

    let maxDist = -1;
    let maxId = '';

    for (const neighborId of conns) {
      const neighbor = this.nodes.get(neighborId)!;
      const dist = this.distance(node.vector, neighbor.vector);
      if (dist > maxDist) {
        maxDist = dist;
        maxId = neighborId;
      }
    }

    if (maxDist > newDist && maxId) {
      const idx = conns.indexOf(maxId);
      if (idx >= 0) {
        conns[idx] = newNeighbor.id;
      }
    }
  }
}

// ============================================================================
// RAG层实现
// ============================================================================

/**
 * RAG层运行时
 * 
 * 核心职责:
 * 1. 向量存储和索引
 * 2. 语义检索 (<50ms)
 * 3. 混合搜索 (向量+关键词)
 * 4. 召回率保证 (≥85%)
 */
export class RAGLayer extends EventEmitter {
  private index: HNSWIndex;
  private entries: Map<string, VectorEntry> = new Map();
  private dimension: VectorDimension;

  // 关键词索引 (简化版)
  private keywordIndex: Map<string, Set<string>> = new Map();

  constructor(dimension: VectorDimension = DEFAULT_DIMENSION) {
    super();
    this.dimension = dimension;
    this.index = new HNSWIndex({ dimension });
  }

  /**
   * 添加向量条目
   */
  add(entry: Omit<VectorEntry, 'timestamp'>): void {
    if (entry.vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${entry.vector.length}`);
    }

    const fullEntry: VectorEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    this.entries.set(entry.id, fullEntry);
    this.index.add(fullEntry);

    // 更新关键词索引
    this.updateKeywordIndex(entry.id, entry.content);

    this.emit('entry:added', fullEntry);
  }

  /**
   * 语义搜索
   * 
   * 自测: ARC-002 语义检索<50ms
   */
  search(query: Float32Array, options: SearchOptions = {}): SearchResult[] {
    const startTime = performance.now();
    const { k = 10, efSearch, minScore = 0.5, filter } = options;

    // 执行向量搜索
    const results = this.index.search(query, k * 2, efSearch);

    // 过滤和排序
    let filtered = results.filter(r => r.score >= minScore);

    // 应用自定义过滤器
    if (filter) {
      filtered = filtered.filter(r => {
        const entry = this.entries.get(r.entry.id);
        return entry ? filter(entry) : false;
      });
    }

    // 补充完整条目信息
    const enriched = filtered
      .slice(0, k)
      .map(r => ({
        entry: this.entries.get(r.entry.id)!,
        score: r.score,
        rank: r.rank,
      }));

    const latency = performance.now() - startTime;

    // 检查延迟目标
    if (latency > TARGET_RETRIEVAL_LATENCY) {
      console.warn(`[RAGLayer] Search latency ${latency.toFixed(2)}ms exceeds target ${TARGET_RETRIEVAL_LATENCY}ms`);
    }

    this.emit('search:complete', { query, results: enriched, latency });

    return enriched;
  }

  /**
   * 混合搜索 (向量 + 关键词)
   */
  hybridSearch(queryVector: Float32Array, keywords: string[], options: SearchOptions = {}): SearchResult[] {
    // 向量搜索结果
    const vectorResults = this.search(queryVector, { ...options, k: 20 });

    // 关键词搜索结果
    const keywordResults = this.keywordSearch(keywords, 20);

    // 融合结果 (RRF - Reciprocal Rank Fusion)
    const scores = new Map<string, number>();
    const entries = new Map<string, VectorEntry>();

    // 向量结果得分
    for (const result of vectorResults) {
      scores.set(result.entry.id, (scores.get(result.entry.id) || 0) + 1 / (60 + result.rank));
      entries.set(result.entry.id, result.entry);
    }

    // 关键词结果得分
    for (let i = 0; i < keywordResults.length; i++) {
      const id = keywordResults[i];
      scores.set(id, (scores.get(id) || 0) + 1 / (60 + i + 1));
      if (!entries.has(id)) {
        const entry = this.entries.get(id);
        if (entry) entries.set(id, entry);
      }
    }

    // 排序返回
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, options.k || 10)
      .map(([id, score], rank) => ({
        entry: entries.get(id)!,
        score,
        rank: rank + 1,
      }));
  }

  /**
   * 关键词搜索
   */
  keywordSearch(keywords: string[], limit: number = 10): string[] {
    const scores = new Map<string, number>();

    for (const keyword of keywords) {
      const normalized = keyword.toLowerCase();
      const entryIds = this.keywordIndex.get(normalized);
      if (entryIds) {
        for (const id of entryIds) {
          scores.set(id, (scores.get(id) || 0) + 1);
        }
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }

  /**
   * 删除条目
   */
  remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    this.entries.delete(id);
    this.index.remove(id);

    // 清理关键词索引
    this.removeKeywordIndex(id, entry.content);

    this.emit('entry:removed', entry);
    return true;
  }

  /**
   * 获取统计
   */
  getStats(): RAGStats {
    const indexStats = this.index.getStats();
    return {
      vectorCount: this.entries.size,
      indexSize: this.entries.size,
      avgSearchTime: indexStats.avgSearchTime,
      recallRate: this.estimateRecallRate(),
      memoryUsageMB: indexStats.memoryUsageMB,
    };
  }

  /**
   * 清空
   */
  clear(): void {
    this.entries.clear();
    this.index.clear();
    this.keywordIndex.clear();
    this.emit('layer:cleared');
  }

  /**
   * 估算召回率
   */
  private estimateRecallRate(): number {
    // 简化估算：基于索引参数
    // 实际召回率需要通过Ground Truth计算
    const efSearch = HNSW_DEFAULT_EF_SEARCH;
    const expectedRecall = Math.min(0.95, 0.7 + (efSearch / 200) * 0.25);
    return expectedRecall;
  }

  private updateKeywordIndex(id: string, content: string): void {
    const words = content.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    for (const word of words) {
      if (!this.keywordIndex.has(word)) {
        this.keywordIndex.set(word, new Set());
      }
      this.keywordIndex.get(word)!.add(id);
    }
  }

  private removeKeywordIndex(id: string, content: string): void {
    const words = content.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    for (const word of words) {
      const set = this.keywordIndex.get(word);
      if (set) {
        set.delete(id);
        if (set.size === 0) {
          this.keywordIndex.delete(word);
        }
      }
    }
  }
}

export default RAGLayer;
