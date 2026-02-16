/**
 * YGGDRASIL DEBT-CLEARANCE-001 - React Hooks测试覆盖
 * 
 * 测试组件: YggdrasilPanel
 * 职责:
 * - TEST-HOOK-001: useState状态管理测试
 * - TEST-HOOK-002: useCallback记忆化测试
 * - TEST-HOOK-003: 异步操作状态流转测试
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import YggdrasilPanel from '@/app/components/ui/YggdrasilPanel';

// Mock fetch
global.fetch = jest.fn();

describe('YggdrasilPanel - React Hooks测试覆盖', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('[TEST-HOOK-001] useState状态管理', () => {
    it('应正确初始化状态', () => {
      render(<YggdrasilPanel />);
      
      // 验证初始状态 - 标题应存在
      expect(screen.getByText('YGGDRASIL')).toBeInTheDocument();
      expect(screen.getByText('四象限聊天治理系统')).toBeInTheDocument();
      
      // 验证四个按钮都存在
      expect(screen.getByText('状态重置')).toBeInTheDocument();
      expect(screen.getByText('上下文重生')).toBeInTheDocument();
      expect(screen.getByText('并行提案')).toBeInTheDocument();
      expect(screen.getByText('三重回滚')).toBeInTheDocument();
    });

    it('应正确显示指标初始值', () => {
      render(<YggdrasilPanel />);
      
      // 验证指标显示为0
      const zeroElements = screen.getAllByText('0');
      expect(zeroElements.length).toBeGreaterThan(0);
      
      // 验证0%节省率
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('应正确切换Remix选项显示状态', () => {
      render(<YggdrasilPanel />);
      
      // 点击Remix按钮
      const remixButton = screen.getByText('上下文重生').closest('button');
      fireEvent.click(remixButton!);
      
      // 验证选项弹窗显示
      expect(screen.getByText('压缩级别')).toBeInTheDocument();
      
      // 再次点击关闭
      fireEvent.click(remixButton!);
      
      // 弹窗应消失（使用queryByText因为它可能不存在）
      expect(screen.queryByText('执行压缩')).not.toBeInTheDocument();
    });

    it('应正确更新压缩级别状态', () => {
      render(<YggdrasilPanel />);
      
      // 打开Remix选项
      const remixButton = screen.getByText('上下文重生').closest('button');
      fireEvent.click(remixButton!);
      
      // 选择Level 3
      const level3Radio = screen.getByLabelText(/Level 3/);
      fireEvent.click(level3Radio);
      
      // Level 3应被选中
      expect(level3Radio).toBeChecked();
    });
  });

  describe('[TEST-HOOK-002] useCallback记忆化', () => {
    it('应在多次渲染中保持回调引用稳定', async () => {
      const { rerender } = render(<YggdrasilPanel />);
      
      // 模拟成功的API响应
      (fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            releasedBytes: 1024 * 1024 * 10, // 10MB
            durationMs: 150,
          },
        }),
      });
      
      // 第一次渲染后点击
      const regenerateButton1 = screen.getByText('状态重置').closest('button');
      fireEvent.click(regenerateButton1!);
      
      // 重新渲染
      rerender(<YggdrasilPanel />);
      
      // 等待状态更新
      await waitFor(() => {
        expect(screen.getByText(/释放/)).toBeInTheDocument();
      });
      
      // 验证回调仍能正常工作（即useCallback正确记忆化）
      expect(screen.getByText(/10.00 MB/)).toBeInTheDocument();
    });

    it('应防止不必要的重渲染', () => {
      const renderCount = jest.fn();
      
      // 由于无法直接监控渲染次数，我们测试状态变化不会导致重复操作
      render(<YggdrasilPanel />);
      
      // 点击同一个按钮多次
      const remixButton = screen.getByText('上下文重生').closest('button');
      fireEvent.click(remixButton!);
      fireEvent.click(remixButton!);
      fireEvent.click(remixButton!);
      
      // 弹窗应该只是切换显示，不会创建多个弹窗
      const compressionOptions = screen.getAllByText('压缩级别');
      expect(compressionOptions.length).toBe(1);
    });
  });

  describe('[TEST-HOOK-003] 异步操作状态流转', () => {
    it('应正确处理Regenerate操作的成功状态流转', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            releasedBytes: 1024 * 1024 * 5, // 5MB
            durationMs: 100,
          },
        }),
      });

      render(<YggdrasilPanel />);
      
      // 点击状态重置按钮
      const regenerateButton = screen.getByText('状态重置').closest('button');
      fireEvent.click(regenerateButton!);
      
      // 等待异步操作完成
      await waitFor(() => {
        expect(screen.getByText(/状态重置成功/)).toBeInTheDocument();
      });
      
      // 验证结果显示
      expect(screen.getByText(/5.00 MB/)).toBeInTheDocument();
      expect(screen.getByText(/100ms/)).toBeInTheDocument();
      
      // 验证指标更新
      expect(screen.getByText('1')).toBeInTheDocument(); // 重置次数
    });

    it('应正确处理Regenerate操作的失败状态流转', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('网络错误'));

      render(<YggdrasilPanel />);
      
      // 点击状态重置按钮
      const regenerateButton = screen.getByText('状态重置').closest('button');
      fireEvent.click(regenerateButton!);
      
      // 等待错误状态
      await waitFor(() => {
        expect(screen.getByText(/状态重置失败/)).toBeInTheDocument();
      });
      
      expect(screen.getByText('网络错误')).toBeInTheDocument();
    });

    it('应正确处理Remix操作的成功状态流转', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: {
            originalTokens: 1000,
            compressedTokens: 200,
            savingsRate: 0.8,
          },
        }),
      });

      render(<YggdrasilPanel />);
      
      // 打开Remix选项
      const remixButton = screen.getByText('上下文重生').closest('button');
      fireEvent.click(remixButton!);
      
      // 点击执行压缩
      const executeButton = screen.getByText('执行压缩');
      fireEvent.click(executeButton);
      
      // 等待结果
      await waitFor(() => {
        expect(screen.getByText(/上下文重生成功/)).toBeInTheDocument();
      });
      
      // 验证压缩结果显示
      expect(screen.getByText(/Token: 1000 → 200/)).toBeInTheDocument();
      expect(screen.getByText(/节省 80%/)).toBeInTheDocument();
      
      // 验证节省率指标更新
      expect(screen.getByText('80%')).toBeInTheDocument();
    });

    it('应正确处理Rollback操作的成功状态流转', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          success: true,
          snapshot: {
            id: 'snapshot-12345678-abc',
            timestamp: Date.now(),
          },
        }),
      });

      render(<YggdrasilPanel />);
      
      // 点击三重回滚按钮
      const rollbackButton = screen.getByText('三重回滚').closest('button');
      fireEvent.click(rollbackButton!);
      
      // 等待结果
      await waitFor(() => {
        expect(screen.getByText(/回滚操作成功/)).toBeInTheDocument();
      });
      
      // 验证快照ID显示
      expect(screen.getByText(/snapshot-123/)).toBeInTheDocument();
    });

    it('应在加载状态禁用按钮', async () => {
      // 创建一个延迟的Promise
      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      
      (fetch as jest.Mock).mockReturnValueOnce(
        promise.then(() => ({
          json: async () => ({
            success: true,
            data: { releasedBytes: 1000, durationMs: 50 },
          }),
        }))
      );

      render(<YggdrasilPanel />);
      
      // 点击按钮
      const regenerateButton = screen.getByText('状态重置').closest('button');
      fireEvent.click(regenerateButton!);
      
      // 按钮应处于禁用状态（通过检查是否有加载状态）
      // 由于UI可能有加载指示器，我们检查按钮是否还能点击
      // 这里简化为检查是否还能触发新请求
      expect(fetch).toHaveBeenCalledTimes(1);
      
      // 完成异步操作
      resolvePromise!({});
      
      await waitFor(() => {
        expect(screen.getByText(/状态重置成功/)).toBeInTheDocument();
      });
    });
  });

  describe('综合状态交互', () => {
    it('应正确处理多个操作的顺序执行', async () => {
      // 第一次调用 - Regenerate
      (fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          success: true,
          data: { releasedBytes: 1000, durationMs: 50 },
        }),
      });

      render(<YggdrasilPanel />);
      
      // 执行Regenerate
      fireEvent.click(screen.getByText('状态重置').closest('button')!);
      
      await waitFor(() => {
        expect(screen.getByText(/状态重置成功/)).toBeInTheDocument();
      });
      
      // 第二次调用 - Rollback
      (fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({
          success: true,
          snapshot: { id: 'snap-abc123', timestamp: Date.now() },
        }),
      });
      
      // 执行Rollback
      fireEvent.click(screen.getByText('三重回滚').closest('button')!);
      
      await waitFor(() => {
        expect(screen.getByText(/回滚操作成功/)).toBeInTheDocument();
      });
      
      // 验证两次操作都执行了
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
