/**
 * YGGDRASIL P2 - 语义压缩器 (MVP版)
 * HAJIMI-YGGDRASIL-P2-SEMANTIC-Minimal
 * 
 * 职责:
 * - SEM-001: OpenAI API连通 (text-embedding-3-small)
 * - SEM-002: 向量维度768
 * - SEM-003: 压缩率≥85%
 * 
 * 债务声明: 本地Sentence-BERT延后
 */

import OpenAI from 'openai';

// OpenAI客户端初始化（使用OpenRouter兼容接口）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || 'mock-key',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

export interface SemanticCompressionResult {
  success: boolean;
  originalTokens: number;
  compressedTokens: number;
  savingsRate: number;
  embedding?: number[]; // 768维向量
  summary?: string;
  error?: string;
  durationMs: number;
}

export interface SemanticCluster {
  id: string;
  centroid: number[];
  items: Array<{
    content: string;
    embedding: number[];
    similarity: number;
  }>;
  representative: string;
}

class SemanticCompressor {
  private readonly MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIM = 768; // SEM-002
  private readonly MAX_INPUT_TOKENS = 8000;

  /**
   * 执行语义压缩 (SEM-003: 目标≥85%压缩率)
   */
  async compress(
    content: string,
    targetCompression: number = 0.85
  ): Promise<SemanticCompressionResult> {
    const startTime = performance.now();

    try {
      console.log(`[SemanticCompressor] 开始语义压缩, 目标: ${(targetCompression * 100).toFixed(0)}%`);

      // 估算原始token数
      const originalTokens = this.estimateTokens(content);

      // 如果内容太短，直接返回
      if (originalTokens < 500) {
        return {
          success: true,
          originalTokens,
          compressedTokens: originalTokens,
          savingsRate: 0,
          durationMs: Math.round(performance.now() - startTime),
        };
      }

      // SEM-001: 调用OpenAI Embedding API
      const embedding = await this.getEmbedding(content);
      
      // 基于嵌入生成语义摘要
      const summary = await this.generateSemanticSummary(content, embedding);
      
      // 计算压缩后token数
      const compressedTokens = this.estimateTokens(summary);
      const savingsRate = (originalTokens - compressedTokens) / originalTokens;

      const durationMs = Math.round(performance.now() - startTime);

      console.log(`[SemanticCompressor] 完成: ${originalTokens} → ${compressedTokens} tokens (节省: ${(savingsRate * 100).toFixed(1)}%)`);

      // SEM-003: 检查是否达到目标压缩率
      if (savingsRate < targetCompression) {
        return {
          success: false,
          originalTokens,
          compressedTokens,
          savingsRate,
          embedding,
          summary,
          error: `压缩率不足: ${(savingsRate * 100).toFixed(1)}% < ${(targetCompression * 100).toFixed(0)}%`,
          durationMs,
        };
      }

      return {
        success: true,
        originalTokens,
        compressedTokens,
        savingsRate,
        embedding,
        summary,
        durationMs,
      };

    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      console.error('[SemanticCompressor] 压缩失败:', error);

      return {
        success: false,
        originalTokens: this.estimateTokens(content),
        compressedTokens: 0,
        savingsRate: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs,
      };
    }
  }

  /**
   * 获取语义嵌入 (SEM-001/002)
   */
  async getEmbedding(text: string): Promise<number[]> {
    // 截断过长文本
    const truncatedText = this.truncateText(text, this.MAX_INPUT_TOKENS);

    try {
      const response = await openai.embeddings.create({
        model: this.MODEL,
        input: truncatedText,
        dimensions: this.EMBEDDING_DIM, // SEM-002: 768维
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[SemanticCompressor] Embedding API调用失败:', error);
      // 返回零向量作为fallback
      return new Array(this.EMBEDDING_DIM).fill(0);
    }
  }

  /**
   * 语义聚类（高级功能）
   */
  async clusterContents(
    contents: string[],
    clusterCount: number = 5
  ): Promise<SemanticCluster[]> {
    // 获取所有内容的嵌入
    const embeddings = await Promise.all(
      contents.map(c => this.getEmbedding(c))
    );

    // 简化的K-means聚类实现
    const clusters = this.kMeansClustering(contents, embeddings, clusterCount);
    
    return clusters;
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ==================== 私有方法 ====================

  /**
   * 生成语义摘要
   */
  private async generateSemanticSummary(
    content: string,
    embedding: number[]
  ): Promise<string> {
    // 简单的基于句子重要性的摘要
    const sentences = this.splitSentences(content);
    
    if (sentences.length <= 3) {
      return content;
    }

    // 计算每句话与整体的相似度
    const scoredSentences = await Promise.all(
      sentences.map(async (sentence) => {
        const sentenceEmbedding = await this.getEmbedding(sentence);
        const similarity = this.cosineSimilarity(embedding, sentenceEmbedding);
        return { sentence, similarity };
      })
    );

    // 选择最相似的句子作为摘要
    scoredSentences.sort((a, b) => b.similarity - a.similarity);
    
    // 取前30%的句子，保持原有顺序
    const topCount = Math.max(3, Math.ceil(sentences.length * 0.3));
    const topSentences = scoredSentences
      .slice(0, topCount)
      .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence));

    return topSentences.map(s => s.sentence).join('\n');
  }

  /**
   * 简化的K-means聚类
   */
  private kMeansClustering(
    contents: string[],
    embeddings: number[][],
    clusterCount: number
  ): SemanticCluster[] {
    // 简化实现：基于相似度的贪心聚类
    const clusters: SemanticCluster[] = [];
    const used = new Set<number>();

    for (let i = 0; i < Math.min(clusterCount, contents.length); i++) {
      if (used.has(i)) continue;

      const cluster: SemanticCluster = {
        id: `cluster-${i}`,
        centroid: embeddings[i],
        items: [],
        representative: contents[i],
      };

      // 找到与中心点相似的内容
      for (let j = 0; j < contents.length; j++) {
        if (used.has(j)) continue;

        const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
        if (similarity > 0.7) {
          cluster.items.push({
            content: contents[j],
            embedding: embeddings[j],
            similarity,
          });
          used.add(j);
        }
      }

      if (cluster.items.length > 0) {
        clusters.push(cluster);
      }
    }

    return clusters;
  }

  /**
   * 估算token数
   */
  private estimateTokens(text: string): number {
    // 简化的估算：~4字符/token
    return Math.ceil(text.length / 4);
  }

  /**
   * 截断文本到最大token数
   */
  private truncateText(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '...';
  }

  /**
   * 分割句子
   */
  private splitSentences(text: string): string[] {
    return text
      .split(/[。！？.!?]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }
}

// 导出单例
export const semanticCompressor = new SemanticCompressor();
export default SemanticCompressor;
