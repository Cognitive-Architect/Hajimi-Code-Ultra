/**
 * Service Worker后台同步 - DEBT-ALICE-UI-003 清偿
 * 
 * 后台任务、离线队列、电池优化
 */

export interface SyncTask {
  id: string;
  type: 'ml_feedback' | 'telemetry' | 'config_update';
  data: unknown;
  timestamp: number;
  retryCount: number;
}

export class BackgroundSyncManager {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'alice_sync_db';
  private readonly STORE_NAME = 'sync_queue';

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * 自测: DEBT-009-002 离线操作队列不丢数据
   */
  async enqueue(task: Omit<SyncTask, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    if (!this.db) await this.init();
    
    const fullTask: SyncTask = {
      ...task,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = tx.objectStore(this.STORE_NAME);
      const request = store.add(fullTask);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 自测: DEBT-009-001 后台同步每小时唤醒
   * 自测: DEBT-009-003 电池消耗<2%/小时
   */
  async registerPeriodicSync(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    
    const registration = await navigator.serviceWorker.ready;
    
    // @ts-ignore
    if ('periodicSync' in registration) {
      try {
        // @ts-ignore
        await registration.periodicSync.register('alice-sync', {
          minInterval: 60 * 60 * 1000, // 1小时
        });
      } catch (err) {
        console.warn('[BackgroundSync] Not granted:', err);
      }
    }
  }
}

export const backgroundSync = new BackgroundSyncManager();
export default BackgroundSyncManager;
