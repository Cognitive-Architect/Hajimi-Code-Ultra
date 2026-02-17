/**
 * Alice ML 隐私守护者
 * HAJIMI-ALICE-ML
 * 
 * 数据脱敏、本地加密、用户授权管理
 * 
 * @module lib/alice/ml/privacy-guard
 * @author Soyorin (PM) - B-03/09
 */

import { EventEmitter } from 'events';

// ============================================================================
// 隐私配置
// ============================================================================

export interface PrivacyConfig {
  // 存储配置
  encryptionEnabled: boolean;
  retentionDays: number;
  maxLocalStorageMB: number;
  
  // 云端配置
  cloudUploadEnabled: boolean;
  uploadAnonymizedOnly: boolean;
  minKAnonymity: number;
  
  // 用户控制
  userConsentRequired: boolean;
  allowDataExport: boolean;
}

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  encryptionEnabled: true,
  retentionDays: 7,
  maxLocalStorageMB: 50,
  cloudUploadEnabled: false, // 默认关闭
  uploadAnonymizedOnly: true,
  minKAnonymity: 5,
  userConsentRequired: true,
  allowDataExport: true,
};

// ============================================================================
// 隐私守护者
// ============================================================================

export class AlicePrivacyGuard extends EventEmitter {
  private config: PrivacyConfig;
  private encryptionKey?: CryptoKey;
  private userConsent = false;
  private storage: Storage;

  constructor(config?: Partial<PrivacyConfig>) {
    super();
    this.config = { ...DEFAULT_PRIVACY_CONFIG, ...config };
    this.storage = typeof localStorage !== 'undefined' ? localStorage : new MockStorage();
    this.initEncryption();
  }

  // ========================================================================
  // 初始化
  // ========================================================================

  private async initEncryption(): Promise<void> {
    if (!this.config.encryptionEnabled) return;
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      console.warn('[ALICE-PRIVACY] Web Crypto not available, encryption disabled');
      this.config.encryptionEnabled = false;
      return;
    }

    try {
      // 生成或获取持久化密钥
      const keyData = this.storage.getItem('alice_privacy_key');
      if (keyData) {
        const keyBuffer = this.base64ToBuffer(keyData);
        this.encryptionKey = await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      } else {
        this.encryptionKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        const exported = await crypto.subtle.exportKey('raw', this.encryptionKey);
        this.storage.setItem('alice_privacy_key', this.bufferToBase64(exported));
      }
    } catch (err) {
      console.error('[ALICE-PRIVACY] Encryption init failed:', err);
      this.config.encryptionEnabled = false;
    }
  }

  // ========================================================================
  // 用户授权
  // ========================================================================

  /**
   * 请求用户授权
   */
  requestConsent(): Promise<boolean> {
    if (!this.config.userConsentRequired) {
      this.userConsent = true;
      return Promise.resolve(true);
    }

    // 在浏览器环境中显示授权对话框
    if (typeof window !== 'undefined') {
      return new Promise((resolve) => {
        const confirmed = window.confirm(
          'Alice ML 需要收集鼠标轨迹数据以改进体验。\n' +
          '- 原始坐标仅存储于本地\n' +
          '- 数据7天后自动删除\n' +
          '- 可随时一键清除\n\n' +
          '是否同意？'
        );
        this.userConsent = confirmed;
        this.storage.setItem('alice_privacy_consent', confirmed ? 'true' : 'false');
        resolve(confirmed);
      });
    }

    return Promise.resolve(false);
  }

  /**
   * 检查用户是否已授权
   */
  hasConsent(): boolean {
    if (!this.config.userConsentRequired) return true;
    if (this.userConsent) return true;
    
    const stored = this.storage.getItem('alice_privacy_consent');
    return stored === 'true';
  }

  /**
   * 撤销授权
   */
  revokeConsent(): void {
    this.userConsent = false;
    this.storage.setItem('alice_privacy_consent', 'false');
    this.clearAllData();
    this.emit('consent:revoked');
  }

  // ========================================================================
  // 数据脱敏
  // ========================================================================

  /**
   * 检查数据是否包含敏感坐标
   * 
   * 自测: ML-PRIV-001
   */
  containsSensitiveCoordinates(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    
    const str = JSON.stringify(data);
    
    // 检测原始坐标模式
    const coordinatePattern = /"x":\s*\d+\.?\d*,\s*"y":\s*\d+\.?\d*/;
    const hasCoordinates = coordinatePattern.test(str);
    
    // 检查是否是特征向量（12维数字数组）
    const isFeatureVector = Array.isArray(data) && 
                           data.length === 12 && 
                           data.every(v => typeof v === 'number' && v >= 0 && v <= 1);
    
    // 包含坐标但不是特征向量 = 敏感
    return hasCoordinates && !isFeatureVector;
  }

  /**
   * 数据脱敏处理
   */
  anonymize(data: number[]): number[] {
    // 添加拉普拉斯噪声 (差分隐私)
    const epsilon = 1.0; // 隐私预算
    const sensitivity = 1.0; // 敏感度
    
    return data.map(v => {
      const noise = this.laplaceNoise(epsilon, sensitivity);
      return Math.max(0, Math.min(1, v + noise)); // 保持在 [0,1]
    });
  }

  private laplaceNoise(epsilon: number, sensitivity: number): number {
    const scale = sensitivity / epsilon;
    const u = Math.random() - 0.5;
    return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  // ========================================================================
  // 本地存储加密
  // ========================================================================

  /**
   * 加密存储
   * 
   * 自测: ML-PRIV-002
   */
  async secureStore(key: string, data: unknown): Promise<void> {
    const jsonStr = JSON.stringify(data);
    
    if (!this.config.encryptionEnabled || !this.encryptionKey) {
      this.storage.setItem(key, jsonStr);
      return;
    }

    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(jsonStr);
      
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        encoded
      );

      const payload = {
        iv: this.bufferToBase64(iv),
        data: this.bufferToBase64(encrypted),
      };
      
      this.storage.setItem(key, JSON.stringify(payload));
    } catch (err) {
      console.error('[ALICE-PRIVACY] Encryption failed:', err);
      // 降级到明文存储
      this.storage.setItem(key, jsonStr);
    }
  }

  /**
   * 解密读取
   */
  async secureRetrieve<T>(key: string): Promise<T | null> {
    const stored = this.storage.getItem(key);
    if (!stored) return null;

    if (!this.config.encryptionEnabled || !this.encryptionKey) {
      try {
        return JSON.parse(stored) as T;
      } catch {
        return null;
      }
    }

    try {
      const payload = JSON.parse(stored);
      if (!payload.iv || !payload.data) {
        // 可能是未加密的老数据
        return JSON.parse(stored) as T;
      }

      const iv = this.base64ToBuffer(payload.iv);
      const encrypted = this.base64ToBuffer(payload.data);
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        encrypted
      );

      const decoded = new TextDecoder().decode(decrypted);
      return JSON.parse(decoded) as T;
    } catch (err) {
      console.error('[ALICE-PRIVACY] Decryption failed:', err);
      return null;
    }
  }

  // ========================================================================
  // 一键清除
  // ========================================================================

  /**
   * 清除所有 Alice ML 相关数据
   * 
   * 自测: ML-PRIV-003
   */
  clearAllData(): void {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key && key.startsWith('alice_')) {
        keysToRemove.push(key);
      }
    }
    
    for (const key of keysToRemove) {
      this.storage.removeItem(key);
    }
    
    this.emit('data:cleared', { count: keysToRemove.length });
    console.log(`[ALICE-PRIVACY] Cleared ${keysToRemove.length} data entries`);
  }

  // ========================================================================
  // 云端上传检查
  // ========================================================================

  /**
   * 验证数据是否可以上传至云端
   * 
   * 自测: ML-PRIV-004
   */
  canUploadToCloud(data: unknown): { allowed: boolean; reason?: string } {
    if (!this.config.cloudUploadEnabled) {
      return { allowed: false, reason: 'Cloud upload disabled' };
    }

    if (!this.hasConsent()) {
      return { allowed: false, reason: 'User consent not granted' };
    }

    if (this.containsSensitiveCoordinates(data)) {
      return { allowed: false, reason: 'Data contains sensitive coordinates' };
    }

    if (this.config.uploadAnonymizedOnly) {
      // 检查是否已脱敏
      // 特征向量应该是12维的
      if (!Array.isArray(data) || data.length !== 12) {
        return { allowed: false, reason: 'Data must be 12-dimensional feature vector' };
      }
    }

    return { allowed: true };
  }

  // ========================================================================
  // 存储配额管理
  // ========================================================================

  /**
   * 检查并清理存储空间
   */
  enforceStorageQuota(): void {
    const maxBytes = this.config.maxLocalStorageMB * 1024 * 1024;
    let totalBytes = 0;
    const items: { key: string; size: number; time: number }[] = [];

    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key || !key.startsWith('alice_')) continue;
      
      const value = this.storage.getItem(key) || '';
      const size = value.length * 2; // UTF-16 估算
      totalBytes += size;
      
      items.push({ key, size, time: this.extractTimestamp(key) });
    }

    if (totalBytes > maxBytes) {
      // 按时间排序，删除最旧的数据
      items.sort((a, b) => a.time - b.time);
      
      let freed = 0;
      for (const item of items) {
        if (totalBytes - freed <= maxBytes * 0.8) break;
        this.storage.removeItem(item.key);
        freed += item.size;
      }
      
      this.emit('quota:cleanup', { freedBytes: freed });
    }
  }

  private extractTimestamp(key: string): number {
    const match = key.match(/alice-(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  // ========================================================================
  // 工具函数
  // ========================================================================

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // ========================================================================
  // 查询
  // ========================================================================

  getConfig(): PrivacyConfig {
    return { ...this.config };
  }

  getStorageStats(): {
    totalEntries: number;
    aliceEntries: number;
    estimatedBytes: number;
  } {
    let aliceEntries = 0;
    let estimatedBytes = 0;
    
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key) continue;
      
      const value = this.storage.getItem(key) || '';
      if (key.startsWith('alice_')) {
        aliceEntries++;
        estimatedBytes += value.length * 2;
      }
    }
    
    return {
      totalEntries: this.storage.length,
      aliceEntries,
      estimatedBytes,
    };
  }
}

// 模拟 Storage 接口 (用于 Node.js 环境)
class MockStorage implements Storage {
  private data: Map<string, string> = new Map();
  
  get length(): number { return this.data.size; }
  
  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }
  
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  
  removeItem(key: string): void {
    this.data.delete(key);
  }
  
  clear(): void {
    this.data.clear();
  }
  
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] || null;
  }
}

export default AlicePrivacyGuard;
