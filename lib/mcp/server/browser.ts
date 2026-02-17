/**
 * MCP浏览器控制服务器
 * 
 * 功能：
 * - navigate: 导航到指定URL
 * - click: 点击页面元素
 * - type: 在输入框输入文本
 * - screenshot: 截取页面截图
 * 
 * 兼容接口：Playwright / CDP
 */

import { EventEmitter } from 'events';

// 工具定义
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// 工具调用结果
interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// 浏览器页面接口（抽象层，兼容Playwright/CDP）
interface BrowserPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  click(selector: string, options?: { button?: string }): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  screenshot(options?: { type?: string; encoding?: string; fullPage?: boolean }): Promise<Buffer | string>;
  evaluate<T>(fn: () => T): Promise<T>;
  url(): Promise<string>;
  title(): Promise<string>;
}

// 浏览器上下文接口
interface BrowserContext {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
}

// 浏览器配置
interface BrowserConfig {
  // 允许访问的域名白名单（空表示允许所有）
  allowedDomains: string[];
  // 禁止访问的域名黑名单
  blockedDomains: string[];
  // 默认超时时间
  defaultTimeout: number;
  // 截图质量
  screenshotQuality: number;
  // 是否允许下载
  allowDownloads: boolean;
  // 是否允许弹窗
  allowPopups: boolean;
}

// 默认配置
const DEFAULT_CONFIG: BrowserConfig = {
  allowedDomains: [],
  blockedDomains: ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'],
  defaultTimeout: 30000,
  screenshotQuality: 80,
  allowDownloads: false,
  allowPopups: false
};

/**
 * URL安全检查错误
 */
class URLSecurityError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'URLSecurityError';
  }
}

/**
 * MCP浏览器服务器
 */
export class MCPBrowserServer extends EventEmitter {
  private config: BrowserConfig;
  private browserContext: BrowserContext | null = null;
  private currentPage: BrowserPage | null = null;
  private pageHistory: Array<{ url: string; title: string; timestamp: Date }> = [];

  constructor(config: Partial<BrowserConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 连接到浏览器实例
   * 支持Playwright或CDP连接
   */
  async connect(browserContext: BrowserContext): Promise<void> {
    this.browserContext = browserContext;
    this.currentPage = await browserContext.newPage();
    
    console.log('[MCPBrowserServer] Browser connected');
    this.emit('connected');
  }

  /**
   * 获取工具定义
   */
  getTools(): Tool[] {
    return [
      {
        name: 'browser_navigate',
        description: 'Navigate the browser to a specified URL. Returns page title and URL after navigation.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'URL to navigate to'
            },
            waitUntil: {
              type: 'string',
              enum: ['load', 'domcontentloaded', 'networkidle'],
              description: 'When to consider navigation complete',
              default: 'load'
            },
            timeout: {
              type: 'number',
              description: 'Navigation timeout in milliseconds',
              default: 30000
            }
          },
          required: ['url']
        }
      },
      {
        name: 'browser_click',
        description: 'Click on an element identified by CSS selector.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element to click'
            },
            button: {
              type: 'string',
              enum: ['left', 'right', 'middle'],
              description: 'Mouse button to use',
              default: 'left'
            }
          },
          required: ['selector']
        }
      },
      {
        name: 'browser_type',
        description: 'Type text into an input field identified by CSS selector.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the input field'
            },
            text: {
              type: 'string',
              description: 'Text to type'
            },
            clearFirst: {
              type: 'boolean',
              description: 'Clear the field before typing',
              default: true
            }
          },
          required: ['selector', 'text']
        }
      },
      {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the current page. Returns base64-encoded image.',
        inputSchema: {
          type: 'object',
          properties: {
            fullPage: {
              type: 'boolean',
              description: 'Capture full page or just viewport',
              default: false
            },
            format: {
              type: 'string',
              enum: ['png', 'jpeg'],
              description: 'Image format',
              default: 'png'
            }
          },
          required: []
        }
      },
      {
        name: 'browser_get_info',
        description: 'Get current page information (URL, title).',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'browser_go_back',
        description: 'Navigate back in browser history.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'browser_scroll',
        description: 'Scroll the page.',
        inputSchema: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: ['up', 'down', 'left', 'right'],
              description: 'Scroll direction'
            },
            amount: {
              type: 'number',
              description: 'Pixels to scroll',
              default: 300
            }
          },
          required: ['direction']
        }
      }
    ];
  }

  /**
   * 验证URL安全性
   */
  private validateURL(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new URLSecurityError(`Invalid URL: ${url}`, 'INVALID_URL');
    }

    const hostname = parsed.hostname.toLowerCase();

    // 检查黑名单
    for (const blocked of this.config.blockedDomains) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        throw new URLSecurityError(
          `Access to ${hostname} is blocked`,
          'BLOCKED_DOMAIN'
        );
      }
    }

    // 检查白名单（如果配置了）
    if (this.config.allowedDomains.length > 0) {
      const allowed = this.config.allowedDomains.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!allowed) {
        throw new URLSecurityError(
          `Access to ${hostname} is not allowed`,
          'NOT_ALLOWED_DOMAIN'
        );
      }
    }

    // 阻止file://协议
    if (parsed.protocol === 'file:') {
      throw new URLSecurityError(
        'file:// protocol is not allowed',
        'FILE_PROTOCOL_BLOCKED'
      );
    }
  }

  /**
   * 确保页面已初始化
   */
  private async ensurePage(): Promise<BrowserPage> {
    if (!this.currentPage) {
      if (!this.browserContext) {
        throw new Error('Browser not connected');
      }
      this.currentPage = await this.browserContext.newPage();
    }
    return this.currentPage;
  }

  /**
   * 导航到URL
   */
  async navigate(url: string, waitUntil: string = 'load', timeout: number = 30000): Promise<ToolResult> {
    try {
      this.validateURL(url);
      
      const page = await this.ensurePage();
      
      await page.goto(url, {
        waitUntil: waitUntil as 'load' | 'domcontentloaded' | 'networkidle',
        timeout
      });

      const currentUrl = await page.url();
      const title = await page.title();

      // 记录历史
      this.pageHistory.push({ url: currentUrl, title, timestamp: new Date() });
      if (this.pageHistory.length > 100) {
        this.pageHistory.shift();
      }

      this.emit('navigated', { url: currentUrl, title });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ url: currentUrl, title }, null, 2)
        }]
      };
    } catch (error) {
      if (error instanceof URLSecurityError) {
        return {
          content: [{
            type: 'text',
            text: `Security violation: ${error.message}`
          }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 点击元素
   */
  async click(selector: string, button: string = 'left'): Promise<ToolResult> {
    try {
      const page = await this.ensurePage();
      
      await page.click(selector, { button: button as 'left' | 'right' | 'middle' });
      
      this.emit('clicked', { selector });

      return {
        content: [{
          type: 'text',
          text: `Clicked element: ${selector}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Click failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 输入文本
   */
  async type(selector: string, text: string, clearFirst: boolean = true): Promise<ToolResult> {
    try {
      const page = await this.ensurePage();
      
      if (clearFirst) {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLInputElement;
          if (el) el.value = '';
        }, selector);
      }
      
      await page.fill(selector, text);
      
      this.emit('typed', { selector, textLength: text.length });

      return {
        content: [{
          type: 'text',
          text: `Typed ${text.length} characters into: ${selector}`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Type failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 截取屏幕
   */
  async screenshot(fullPage: boolean = false, format: 'png' | 'jpeg' = 'png'): Promise<ToolResult> {
    try {
      const page = await this.ensurePage();
      
      const screenshot = await page.screenshot({
        type: format,
        encoding: 'base64',
        fullPage
      });

      this.emit('screenshot', { fullPage, format });

      return {
        content: [{
          type: 'image',
          data: screenshot as string,
          mimeType: format === 'png' ? 'image/png' : 'image/jpeg'
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 获取页面信息
   */
  async getInfo(): Promise<ToolResult> {
    try {
      const page = await this.ensurePage();
      
      const url = await page.url();
      const title = await page.title();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ url, title }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to get info: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 后退
   */
  async goBack(): Promise<ToolResult> {
    try {
      const page = await this.ensurePage();
      
      await page.evaluate(() => history.back());
      
      // 等待页面加载
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const url = await page.url();
      const title = await page.title();

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ url, title, action: 'went_back' }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Go back failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 滚动页面
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number = 300): Promise<ToolResult> {
    try {
      const page = await this.ensurePage();
      
      const scrollMap = {
        up: [0, -amount],
        down: [0, amount],
        left: [-amount, 0],
        right: [amount, 0]
      };
      
      const [x, y] = scrollMap[direction];
      
      await page.evaluate((scrollX, scrollY) => {
        window.scrollBy(scrollX, scrollY);
      }, x, y);

      return {
        content: [{
          type: 'text',
          text: `Scrolled ${direction} by ${amount}px`
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Scroll failed: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 处理工具调用
   */
  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'browser_navigate':
        return this.navigate(
          args.url as string,
          (args.waitUntil as string) || 'load',
          (args.timeout as number) || 30000
        );
      
      case 'browser_click':
        return this.click(
          args.selector as string,
          (args.button as string) || 'left'
        );
      
      case 'browser_type':
        return this.type(
          args.selector as string,
          args.text as string,
          (args.clearFirst as boolean) !== false
        );
      
      case 'browser_screenshot':
        return this.screenshot(
          (args.fullPage as boolean) || false,
          (args.format as 'png' | 'jpeg') || 'png'
        );
      
      case 'browser_get_info':
        return this.getInfo();
      
      case 'browser_go_back':
        return this.goBack();
      
      case 'browser_scroll':
        return this.scroll(
          args.direction as 'up' | 'down' | 'left' | 'right',
          (args.amount as number) || 300
        );
      
      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${toolName}`
          }],
          isError: true
        };
    }
  }

  /**
   * 获取浏览历史
   */
  getHistory(): Array<{ url: string; title: string; timestamp: Date }> {
    return [...this.pageHistory];
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
      this.currentPage = null;
    }
    this.emit('disconnected');
  }
}

// 导出默认实例
export const browserServer = new MCPBrowserServer();

// 导出类型
export type { BrowserConfig, BrowserPage, BrowserContext, ToolResult };
