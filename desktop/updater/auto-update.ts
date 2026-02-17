/**
 * ============================================================
 * HAJIMI Desktop v1.4.0 - 自动更新流水线
 * ============================================================
 * 文件: desktop/updater/auto-update.ts
 * 职责: GitHub Releases检查、增量下载、零中断更新
 * 目标: DSK-003 自动更新零中断
 * 
 * @version 1.4.0
 * @author Hajimi Team
 */

import { app, dialog, BrowserWindow, ipcMain } from 'electron';
import { spawn, exec } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { EventEmitter } from 'events';
import { generatePatch, applyPatch, computeFileHash } from './bsdiff';

// ============================================================
// 类型定义
// ============================================================

/** 更新状态 */
enum UpdateState {
  IDLE = 'idle',
  CHECKING = 'checking',
  AVAILABLE = 'available',
  DOWNLOADING = 'downloading',
  DOWNLOADED = 'downloaded',
  INSTALLING = 'installing',
  INSTALLED = 'installed',
  ERROR = 'error',
}

/** 更新信息 */
interface UpdateInfo {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  downloadUrl: string;
  patchUrl?: string;
  forceUpdate: boolean;
  minVersion: string;
  size: number;
  hash: string;
}

/** 下载进度 */
interface DownloadProgress {
  bytesReceived: number;
  totalBytes: number;
  percent: number;
  speed: number; // bytes/s
  eta: number; // seconds
}

/** 更新配置 */
interface AutoUpdateConfig {
  /** 更新服务器URL */
  updateUrl: string;
  /** GitHub仓库 */
  repository: string;
  /** 检查间隔(ms) */
  checkInterval: number;
  /** 是否自动下载 */
  autoDownload: boolean;
  /** 是否自动安装 */
  autoInstall: boolean;
  /** 允许降级 */
  allowDowngrade: boolean;
  /** 增量更新 */
  incrementalUpdate: boolean;
}

/** 更新事件 */
interface UpdateEvents {
  'state-change': (state: UpdateState, info?: UpdateInfo) => void;
  'download-progress': (progress: DownloadProgress) => void;
  'error': (error: Error) => void;
  'update-available': (info: UpdateInfo) => void;
  'update-downloaded': (info: UpdateInfo) => void;
  'update-installed': (version: string) => void;
}

// ============================================================
// 常量定义
// ============================================================

const DEFAULT_CONFIG: AutoUpdateConfig = {
  updateUrl: 'https://api.github.com/repos/Cognitive-Architect/Hajimi-Code-Ultra/releases',
  repository: 'Cognitive-Architect/Hajimi-Code-Ultra',
  checkInterval: 60 * 60 * 1000, // 1小时
  autoDownload: false,
  autoInstall: false,
  allowDowngrade: false,
  incrementalUpdate: true,
};

const UPDATE_CACHE_DIR = 'update-cache';
const BACKUP_DIR = 'backup';

// ============================================================
// 自动更新管理器
// ============================================================

export class AutoUpdateManager extends EventEmitter {
  private config: AutoUpdateConfig;
  private state: UpdateState = UpdateState.IDLE;
  private currentVersion: string;
  private updateInfo: UpdateInfo | null = null;
  private downloadPath: string | null = null;
  private checkTimer: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  constructor(config: Partial<AutoUpdateConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentVersion = app.getVersion();
    
    this.ensureCacheDir();
    this.setupIpcHandlers();
  }

  // ============================================================
  // 初始化
  // ============================================================

  private async ensureCacheDir(): Promise<void> {
    const cacheDir = this.getCacheDir();
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.mkdir(path.join(cacheDir, BACKUP_DIR), { recursive: true });
    } catch (error) {
      console.error('[AutoUpdate] 创建缓存目录失败:', error);
    }
  }

  private getCacheDir(): string {
    return path.join(app.getPath('userData'), UPDATE_CACHE_DIR);
  }

  private setupIpcHandlers(): void {
    // 渲染进程IPC接口
    ipcMain.handle('update:check', () => this.checkForUpdates());
    ipcMain.handle('update:download', () => this.downloadUpdate());
    ipcMain.handle('update:install', () => this.installUpdate());
    ipcMain.handle('update:get-state', () => this.getState());
    ipcMain.handle('update:get-info', () => this.updateInfo);
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ============================================================
  // 状态管理
  // ============================================================

  private setState(state: UpdateState, info?: UpdateInfo): void {
    this.state = state;
    this.emit('state-change', state, info);
    this.notifyRenderer('update:state-change', { state, info });
    console.log(`[AutoUpdate] 状态变更: ${state}`);
  }

  getState(): UpdateState {
    return this.state;
  }

  // ============================================================
  // 更新检查
  // ============================================================

  /**
   * 检查更新
   * DSK-003: 零中断更新支持
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (this.state === UpdateState.CHECKING) {
      console.log('[AutoUpdate] 正在检查中...');
      return null;
    }

    this.setState(UpdateState.CHECKING);

    try {
      // 从GitHub Releases API获取最新版本
      const release = await this.fetchLatestRelease();
      
      if (!release) {
        this.setState(UpdateState.IDLE);
        return null;
      }

      const latestVersion = release.tag_name.replace(/^v/, '');
      
      // 版本比较
      if (!this.shouldUpdate(latestVersion)) {
        console.log(`[AutoUpdate] 当前版本 ${this.currentVersion} 已是最新`);
        this.setState(UpdateState.IDLE);
        return null;
      }

      // 解析更新信息
      this.updateInfo = this.parseReleaseInfo(release);
      
      this.setState(UpdateState.AVAILABLE, this.updateInfo);
      this.emit('update-available', this.updateInfo);

      // 自动下载
      if (this.config.autoDownload) {
        await this.downloadUpdate();
      }

      return this.updateInfo;
    } catch (error) {
      this.handleError(error as Error);
      return null;
    }
  }

  /**
   * 获取最新Release
   */
  private async fetchLatestRelease(): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.config.repository}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': `Hajimi-Desktop/${this.currentVersion}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const release = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(release);
            } else {
              reject(new Error(`GitHub API错误: ${release.message || res.statusCode}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
      req.end();
    });
  }

  /**
   * 解析Release信息
   */
  private parseReleaseInfo(release: any): UpdateInfo {
    const platform = process.platform;
    const arch = process.arch;
    
    // 查找对应平台的资源
    const assets = release.assets || [];
    const assetPattern = new RegExp(`hajimi.*${platform}.*${arch}\\.(exe|dmg|AppImage|zip)$`, 'i');
    const asset = assets.find((a: any) => assetPattern.test(a.name));
    
    // 查找差分包
    const patchPattern = new RegExp(`hajimi-${this.currentVersion}-to-.*\\.patch$`);
    const patchAsset = assets.find((a: any) => patchPattern.test(a.name));

    return {
      version: release.tag_name.replace(/^v/, ''),
      releaseDate: release.published_at,
      releaseNotes: release.body,
      downloadUrl: asset?.browser_download_url || '',
      patchUrl: patchAsset?.browser_download_url,
      forceUpdate: release.body?.includes('[FORCE_UPDATE]') || false,
      minVersion: this.extractMinVersion(release.body),
      size: asset?.size || 0,
      hash: this.extractHash(release.body),
    };
  }

  /**
   * 版本比较
   */
  private shouldUpdate(latestVersion: string): boolean {
    const current = this.parseVersion(this.currentVersion);
    const latest = this.parseVersion(latestVersion);

    for (let i = 0; i < 3; i++) {
      if (latest[i] > current[i]) return true;
      if (latest[i] < current[i]) return !this.config.allowDowngrade;
    }

    return false;
  }

  private parseVersion(version: string): number[] {
    return version.split('.').map(v => parseInt(v, 10) || 0);
  }

  private extractMinVersion(body: string): string {
    const match = body?.match(/\[MIN_VERSION:\s*([^\]]+)\]/);
    return match ? match[1] : '0.0.0';
  }

  private extractHash(body: string): string {
    const match = body?.match(/\[HASH:\s*([a-f0-9]{64})\]/i);
    return match ? match[1] : '';
  }

  // ============================================================
  // 下载更新
  // ============================================================

  /**
   * 下载更新
   */
  async downloadUpdate(): Promise<boolean> {
    if (!this.updateInfo) {
      console.error('[AutoUpdate] 没有可用更新');
      return false;
    }

    if (this.state === UpdateState.DOWNLOADING) {
      console.log('[AutoUpdate] 正在下载中...');
      return false;
    }

    this.setState(UpdateState.DOWNLOADING);

    try {
      // 优先尝试增量更新
      if (this.config.incrementalUpdate && this.updateInfo.patchUrl) {
        const success = await this.downloadIncrementalUpdate();
        if (success) {
          this.setState(UpdateState.DOWNLOADED, this.updateInfo);
          this.emit('update-downloaded', this.updateInfo);
          
          if (this.config.autoInstall) {
            await this.installUpdate();
          }
          return true;
        }
      }

      // 全量下载
      await this.downloadFullUpdate();
      
      this.setState(UpdateState.DOWNLOADED, this.updateInfo);
      this.emit('update-downloaded', this.updateInfo);

      if (this.config.autoInstall) {
        await this.installUpdate();
      }

      return true;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * 增量下载
   */
  private async downloadIncrementalUpdate(): Promise<boolean> {
    if (!this.updateInfo?.patchUrl) return false;

    console.log('[AutoUpdate] 尝试增量更新...');

    const patchPath = path.join(this.getCacheDir(), `patch-${Date.now()}.bin`);
    
    try {
      await this.downloadFile(this.updateInfo.patchUrl, patchPath, true);
      this.downloadPath = patchPath;
      return true;
    } catch (error) {
      console.error('[AutoUpdate] 增量下载失败:', error);
      return false;
    }
  }

  /**
   * 全量下载
   */
  private async downloadFullUpdate(): Promise<void> {
    if (!this.updateInfo?.downloadUrl) {
      throw new Error('没有可用的下载链接');
    }

    console.log('[AutoUpdate] 开始全量下载...');

    const ext = path.extname(this.updateInfo.downloadUrl) || '.zip';
    this.downloadPath = path.join(this.getCacheDir(), `update-${Date.now()}${ext}`);

    await this.downloadFile(this.updateInfo.downloadUrl, this.downloadPath, false);
  }

  /**
   * 下载文件（带进度）
   */
  private downloadFile(url: string, destPath: string, isPatch: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https:') ? https : http;
      
      const startTime = Date.now();
      let receivedBytes = 0;
      let lastReportTime = startTime;
      let lastReceivedBytes = 0;

      const req = protocol.get(url, { headers: { 'User-Agent': `Hajimi-Desktop/${this.currentVersion}` } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          // 重定向
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            this.downloadFile(redirectUrl, destPath, isPatch).then(resolve).catch(reject);
            return;
          }
        }

        if (res.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        const fileStream = createWriteStream(destPath);

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          fileStream.write(chunk);

          // 报告进度
          const now = Date.now();
          if (now - lastReportTime > 500) { // 每500ms报告一次
            const timeDiff = (now - lastReportTime) / 1000;
            const bytesDiff = receivedBytes - lastReceivedBytes;
            const speed = bytesDiff / timeDiff;
            const remaining = totalBytes - receivedBytes;
            const eta = speed > 0 ? remaining / speed : 0;

            const progress: DownloadProgress = {
              bytesReceived: receivedBytes,
              totalBytes,
              percent: totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0,
              speed,
              eta,
            };

            this.emit('download-progress', progress);
            this.notifyRenderer('update:download-progress', progress);

            lastReportTime = now;
            lastReceivedBytes = receivedBytes;
          }
        });

        res.on('end', () => {
          fileStream.end();
          resolve();
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('下载超时'));
      });
    });
  }

  // ============================================================
  // 安装更新
  // ============================================================

  /**
   * 安装更新
   * DSK-003: 零中断更新实现
   */
  async installUpdate(): Promise<boolean> {
    if (!this.downloadPath || !this.updateInfo) {
      console.error('[AutoUpdate] 没有可安装的更新');
      return false;
    }

    this.setState(UpdateState.INSTALLING);

    try {
      // 验证文件哈希
      if (this.updateInfo.hash) {
        const fileHash = await computeFileHash(this.downloadPath);
        if (fileHash !== this.updateInfo.hash) {
          throw new Error('文件哈希校验失败');
        }
      }

      // 执行平台特定的安装
      const platform = process.platform;
      
      if (platform === 'win32') {
        await this.installWindows();
      } else if (platform === 'darwin') {
        await this.installMacOS();
      } else if (platform === 'linux') {
        await this.installLinux();
      }

      this.setState(UpdateState.INSTALLED, this.updateInfo);
      this.emit('update-installed', this.updateInfo.version);

      // 清理缓存
      await this.cleanCache();

      return true;
    } catch (error) {
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Windows安装
   */
  private async installWindows(): Promise<void> {
    const isPatch = this.downloadPath?.endsWith('.patch') || this.downloadPath?.endsWith('.bin');
    
    if (isPatch && this.downloadPath) {
      // 增量更新：应用补丁
      const currentExe = process.execPath;
      const newExe = path.join(this.getCacheDir(), 'Hajimi-Code-new.exe');
      const backupExe = path.join(this.getCacheDir(), BACKUP_DIR, 'Hajimi-Code-backup.exe');

      // 应用补丁
      await applyPatch(currentExe, this.downloadPath, newExe, { 
        verifyHash: true, 
        backupOld: true 
      });

      // 创建更新脚本
      const updateScript = path.join(this.getCacheDir(), 'update.bat');
      const scriptContent = `@echo off
timeout /t 2 /nobreak >nul
copy /Y "${newExe}" "${currentExe}"
start "" "${currentExe}"
del "${updateScript}"
`;
      await fs.writeFile(updateScript, scriptContent, 'utf8');

      // 启动更新脚本并退出
      spawn('cmd', ['/c', updateScript], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();

    } else {
      // 全量更新：运行安装程序
      if (this.downloadPath) {
        spawn(this.downloadPath, ['/S', '/D=' + path.dirname(process.execPath)], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      }
    }

    // 退出当前应用
    app.quit();
  }

  /**
   * macOS安装
   */
  private async installMacOS(): Promise<void> {
    if (!this.downloadPath) return;

    const appPath = process.execPath.replace(/\/Contents\/MacOS\/[^/]+$/, '');
    const downloadPath = this.downloadPath;

    // 挂载DMG并替换应用
    const script = `
      hdiutil attach "${downloadPath}" -mountpoint /Volumes/HajimiUpdate
      cp -R "/Volumes/HajimiUpdate/Hajimi Code.app" "${path.dirname(appPath)}/"
      hdiutil detach /Volumes/HajimiUpdate
      rm "${downloadPath}"
      open "${appPath}"
    `;

    spawn('bash', ['-c', script], { detached: true });
    app.quit();
  }

  /**
   * Linux安装
   */
  private async installLinux(): Promise<void> {
    if (!this.downloadPath) return;

    if (this.downloadPath.endsWith('.AppImage')) {
      // AppImage更新
      const appImagePath = process.env.APPIMAGE || process.execPath;
      const script = `
        cp "${this.downloadPath}" "${appImagePath}.new"
        chmod +x "${appImagePath}.new"
        mv "${appImagePath}.new" "${appImagePath}"
        "${appImagePath}" &
      `;
      spawn('bash', ['-c', script], { detached: true });
    } else {
      // 解压更新
      const extractDir = path.join(this.getCacheDir(), 'extract');
      await fs.mkdir(extractDir, { recursive: true });
      
      spawn('tar', ['-xzf', this.downloadPath, '-C', extractDir], {
        stdio: 'inherit',
      }).on('close', () => {
        const installScript = path.join(extractDir, 'install.sh');
        spawn('bash', [installScript], { detached: true });
      });
    }

    app.quit();
  }

  // ============================================================
  // 定时检查
  // ============================================================

  startPeriodicCheck(): void {
    this.stopPeriodicCheck();
    
    // 立即检查一次
    this.checkForUpdates();
    
    // 定时检查
    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.config.checkInterval);
  }

  stopPeriodicCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // ============================================================
  // 工具方法
  // ============================================================

  private notifyRenderer(channel: string, data: any): void {
    this.mainWindow?.webContents.send(channel, data);
  }

  private handleError(error: Error): void {
    console.error('[AutoUpdate] 错误:', error);
    this.setState(UpdateState.ERROR);
    this.emit('error', error);
    this.notifyRenderer('update:error', { message: error.message });
  }

  private async cleanCache(): Promise<void> {
    const cacheDir = this.getCacheDir();
    try {
      const files = await fs.readdir(cacheDir);
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (file === BACKUP_DIR) continue;
        
        const filePath = path.join(cacheDir, file);
        const stat = await fs.stat(filePath);
        
        if (stat.mtime.getTime() < oneWeekAgo) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('[AutoUpdate] 清理缓存失败:', error);
    }
  }

  // ============================================================
  // 导出
  // ============================================================

  getUpdateInfo(): UpdateInfo | null {
    return this.updateInfo;
  }
}

// 导出类型
export { UpdateState, UpdateInfo, DownloadProgress, AutoUpdateConfig };
export default AutoUpdateManager;
