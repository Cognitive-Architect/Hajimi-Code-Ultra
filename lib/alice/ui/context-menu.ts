/**
 * Alice悬浮球右键菜单MCP集成
 * 
 * 功能：
 * - 右键菜单MCP集成
 * - 悬浮球快捷操作
 * - 工具调用UI
 * - 结果展示
 */

import { EventEmitter } from 'events';

// MCP工具定义
interface MCPTool {
  name: string;
  description: string;
  category: string;
  icon?: string;
  shortcut?: string;
}

// 菜单项
interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  children?: MenuItem[];
  action?: string;
  tool?: string;
  enabled?: boolean;
  separator?: boolean;
}

// 工具调用参数
interface ToolCallParams {
  tool: string;
  args: Record<string, unknown>;
  context?: {
    selection?: string;
    cursorPosition?: { x: number; y: number };
    currentFile?: string;
    currentDirectory?: string;
  };
}

// 工具调用结果
interface ToolCallResult {
  success: boolean;
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  durationMs: number;
  error?: string;
}

// 悬浮球配置
interface AliceOrbConfig {
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size: number;
  opacity: number;
  alwaysOnTop: boolean;
  showNotifications: boolean;
  theme: 'light' | 'dark' | 'auto';
}

// 默认配置
const DEFAULT_CONFIG: AliceOrbConfig = {
  position: 'bottom-right',
  size: 48,
  opacity: 0.9,
  alwaysOnTop: true,
  showNotifications: true,
  theme: 'auto'
};

/**
 * Alice悬浮球右键菜单管理器
 */
export class AliceContextMenu extends EventEmitter {
  private config: AliceOrbConfig;
  private tools: Map<string, MCPTool> = new Map();
  private customMenuItems: MenuItem[] = [];
  private recentTools: Array<{ tool: string; timestamp: Date }> = [];
  private pinnedTools: Set<string> = new Set();
  private isMenuOpen: boolean = false;

  // MCP Host引用（由外部注入）
  private mcpHost: {
    callTool: (toolName: string, args: Record<string, unknown>) => Promise<ToolCallResult>;
    getAvailableTools: () => Array<{ name: string; description: string }>;
  } | null = null;

  constructor(config: Partial<AliceOrbConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupDefaultMenu();
  }

  /**
   * 设置MCP Host
   */
  setMCPHost(host: typeof this.mcpHost): void {
    this.mcpHost = host;
    this.emit('mcp:connected');
  }

  /**
   * 设置默认菜单结构
   */
  private setupDefaultMenu(): void {
    // 默认菜单将在getMenuItems中动态生成
  }

  /**
   * 注册MCP工具到菜单
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
    this.emit('tool:registered', tool);
  }

  /**
   * 注销工具
   */
  unregisterTool(toolName: string): void {
    this.tools.delete(toolName);
    this.pinnedTools.delete(toolName);
    this.emit('tool:unregistered', { toolName });
  }

  /**
   * 添加自定义菜单项
   */
  addMenuItem(item: MenuItem, parentId?: string): void {
    if (parentId) {
      // 添加到指定父项
      const parent = this.findMenuItem(this.customMenuItems, parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(item);
      }
    } else {
      this.customMenuItems.push(item);
    }
    this.emit('menu:updated');
  }

  /**
   * 查找菜单项
   */
  private findMenuItem(items: MenuItem[], id: string): MenuItem | null {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = this.findMenuItem(item.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 固定/取消固定工具
   */
  togglePinTool(toolName: string): boolean {
    if (this.pinnedTools.has(toolName)) {
      this.pinnedTools.delete(toolName);
      this.emit('tool:unpinned', { toolName });
      return false;
    } else {
      this.pinnedTools.add(toolName);
      this.emit('tool:pinned', { toolName });
      return true;
    }
  }

  /**
   * 获取菜单项
   */
  getMenuItems(context?: ToolCallParams['context']): MenuItem[] {
    const items: MenuItem[] = [];

    // 1. 快捷操作区
    items.push({
      id: 'quick-actions',
      label: 'Quick Actions',
      icon: '⚡',
      children: [
        {
          id: 'quick-screenshot',
          label: 'Screenshot',
          icon: '📷',
          tool: 'browser_screenshot',
          shortcut: 'Ctrl+Shift+S'
        },
        {
          id: 'quick-read-file',
          label: 'Read Current File',
          icon: '📄',
          tool: 'read_file',
          shortcut: 'Ctrl+Shift+R'
        },
        {
          id: 'quick-query-db',
          label: 'Quick Query',
          icon: '🗄️',
          tool: 'db_query',
          shortcut: 'Ctrl+Shift+Q'
        }
      ]
    });

    // 2. MCP工具分类
    const categorizedTools = this.categorizeTools();
    
    if (categorizedTools.filesystem.length > 0) {
      items.push({
        id: 'mcp-filesystem',
        label: 'Filesystem',
        icon: '📁',
        children: categorizedTools.filesystem.map(tool => ({
          id: `tool-${tool.name}`,
          label: this.formatToolName(tool.name),
          tool: tool.name,
          icon: tool.icon || '📄'
        }))
      });
    }

    if (categorizedTools.browser.length > 0) {
      items.push({
        id: 'mcp-browser',
        label: 'Browser',
        icon: '🌐',
        children: categorizedTools.browser.map(tool => ({
          id: `tool-${tool.name}`,
          label: this.formatToolName(tool.name),
          tool: tool.name,
          icon: tool.icon || '🔍'
        }))
      });
    }

    if (categorizedTools.database.length > 0) {
      items.push({
        id: 'mcp-database',
        label: 'Database',
        icon: '🗃️',
        children: categorizedTools.database.map(tool => ({
          id: `tool-${tool.name}`,
          label: this.formatToolName(tool.name),
          tool: tool.name,
          icon: tool.icon || '📊'
        }))
      });
    }

    if (categorizedTools.shell.length > 0) {
      items.push({
        id: 'mcp-shell',
        label: 'Shell',
        icon: '💻',
        children: categorizedTools.shell.map(tool => ({
          id: `tool-${tool.name}`,
          label: this.formatToolName(tool.name),
          tool: tool.name,
          icon: tool.icon || '⚙️'
        }))
      });
    }

    // 3. 最近使用
    const recentItems = this.getRecentTools();
    if (recentItems.length > 0) {
      items.push({ id: 'sep-recent', label: '', separator: true });
      items.push({
        id: 'recent-tools',
        label: 'Recent',
        icon: '🕐',
        children: recentItems.map(tool => ({
          id: `recent-${tool.name}`,
          label: this.formatToolName(tool.name),
          tool: tool.name,
          icon: tool.icon || '🔧'
        }))
      });
    }

    // 4. 固定工具
    if (this.pinnedTools.size > 0) {
      items.push({ id: 'sep-pinned', label: '', separator: true });
      const pinnedItems: MenuItem[] = [];
      this.pinnedTools.forEach(toolName => {
        const tool = this.tools.get(toolName);
        pinnedItems.push({
          id: `pinned-${toolName}`,
          label: this.formatToolName(toolName),
          tool: toolName,
          icon: tool?.icon || '📌'
        });
      });
      items.push({
        id: 'pinned-tools',
        label: 'Pinned',
        icon: '📌',
        children: pinnedItems
      });
    }

    // 5. 自定义菜单项
    if (this.customMenuItems.length > 0) {
      items.push({ id: 'sep-custom', label: '', separator: true });
      items.push(...this.customMenuItems);
    }

    // 6. 系统菜单
    items.push({ id: 'sep-system', label: '', separator: true });
    items.push({
      id: 'system',
      label: 'Alice',
      icon: '🤖',
      children: [
        {
          id: 'sys-settings',
          label: 'Settings',
          icon: '⚙️',
          action: 'openSettings'
        },
        {
          id: 'sys-permissions',
          label: 'Permissions',
          icon: '🔐',
          action: 'openPermissions'
        },
        {
          id: 'sep-sys-1', label: '', separator: true
        },
        {
          id: 'sys-hide',
          label: 'Hide Alice',
          icon: '👁️',
          action: 'hideOrb'
        },
        {
          id: 'sys-exit',
          label: 'Exit',
          icon: '🚪',
          action: 'exit'
        }
      ]
    });

    return items;
  }

  /**
   * 工具分类
   */
  private categorizeTools(): {
    filesystem: MCPTool[];
    browser: MCPTool[];
    database: MCPTool[];
    shell: MCPTool[];
    other: MCPTool[];
  } {
    const result = {
      filesystem: [] as MCPTool[],
      browser: [] as MCPTool[],
      database: [] as MCPTool[],
      shell: [] as MCPTool[],
      other: [] as MCPTool[]
    };

    this.tools.forEach(tool => {
      const name = tool.name.toLowerCase();
      if (name.includes('file') || name.includes('dir') || name.includes('read') || name.includes('write')) {
        result.filesystem.push(tool);
      } else if (name.includes('browser') || name.includes('navigate') || name.includes('click')) {
        result.browser.push(tool);
      } else if (name.includes('db') || name.includes('query') || name.includes('sql')) {
        result.database.push(tool);
      } else if (name.includes('shell') || name.includes('exec')) {
        result.shell.push(tool);
      } else {
        result.other.push(tool);
      }
    });

    return result;
  }

  /**
   * 格式化工具名称
   */
  private formatToolName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * 获取最近使用的工具
   */
  private getRecentTools(): MCPTool[] {
    const sorted = this.recentTools
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);

    return sorted
      .map(r => this.tools.get(r.tool))
      .filter((t): t is MCPTool => t !== undefined);
  }

  /**
   * 调用工具
   */
  async callTool(params: ToolCallParams): Promise<ToolCallResult> {
    if (!this.mcpHost) {
      return {
        success: false,
        content: [{ type: 'text', text: 'MCP Host not connected' }],
        durationMs: 0,
        error: 'MCP_HOST_NOT_CONNECTED'
      };
    }

    const startTime = Date.now();

    try {
      // 添加上下文参数
      const args = { ...params.args };
      if (params.context) {
        if (params.context.currentFile && !args.path) {
          args.path = params.context.currentFile;
        }
        if (params.context.selection && !args.content) {
          args.content = params.context.selection;
        }
      }

      const result = await this.mcpHost.callTool(params.tool, args);
      
      // 记录到最近使用
      this.addToRecent(params.tool);

      this.emit('tool:result', { tool: params.tool, result });

      return result;
    } catch (error) {
      return {
        success: false,
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 添加到最近使用
   */
  private addToRecent(toolName: string): void {
    // 移除已存在的
    this.recentTools = this.recentTools.filter(r => r.tool !== toolName);
    // 添加到开头
    this.recentTools.unshift({ tool: toolName, timestamp: new Date() });
    // 限制数量
    if (this.recentTools.length > 10) {
      this.recentTools = this.recentTools.slice(0, 10);
    }
  }

  /**
   * 打开菜单
   */
  openMenu(position?: { x: number; y: number }): void {
    this.isMenuOpen = true;
    this.emit('menu:opened', { position });
  }

  /**
   * 关闭菜单
   */
  closeMenu(): void {
    this.isMenuOpen = false;
    this.emit('menu:closed');
  }

  /**
   * 检查菜单是否打开
   */
  isOpen(): boolean {
    return this.isMenuOpen;
  }

  /**
   * 刷新工具列表（从MCP Host同步）
   */
  async refreshTools(): Promise<void> {
    if (!this.mcpHost) return;

    const availableTools = this.mcpHost.getAvailableTools();
    
    // 同步工具列表
    for (const toolInfo of availableTools) {
      if (!this.tools.has(toolInfo.name)) {
        this.registerTool({
          name: toolInfo.name,
          description: toolInfo.description,
          category: 'mcp'
        });
      }
    }

    // 移除不再可用的工具
    const availableNames = new Set(availableTools.map(t => t.name));
    for (const [name] of this.tools) {
      if (!availableNames.has(name)) {
        this.unregisterTool(name);
      }
    }

    this.emit('tools:refreshed', { count: availableTools.length });
  }

  /**
   * 显示通知
   */
  showNotification(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    if (!this.config.showNotifications) return;

    this.emit('notification', { title, message, type });
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<AliceOrbConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * 获取配置
   */
  getConfig(): AliceOrbConfig {
    return { ...this.config };
  }
}

// 导出单例
export const aliceContextMenu = new AliceContextMenu();

// 导出类型
export type {
  MCPTool,
  MenuItem,
  ToolCallParams,
  ToolCallResult,
  AliceOrbConfig
};
