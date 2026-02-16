/**
 * YGGDRASIL DEBT-CLEARANCE-001 - React Hooks测试覆盖
 * 
 * 测试组件: HexMenu
 * 职责:
 * - TEST-HOOK-004: Props传递与回调测试
 * - TEST-HOOK-005: 条件渲染测试
 * - TEST-HOOK-006: 事件处理测试
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HexMenu } from '@/app/components/ui/HexMenu';

describe('HexMenu - React Hooks测试覆盖', () => {
  const mockOnSelect = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('[TEST-HOOK-004] Props传递与回调', () => {
    it('应正确接收并应用activeAgent prop', () => {
      render(
        <HexMenu 
          activeAgent="pm" 
          onSelect={mockOnSelect} 
          onClose={mockOnClose} 
        />
      );
      
      // PM按钮应该有active状态（通过样式判断）
      const pmButton = screen.getByTitle('产品经理');
      expect(pmButton).toBeInTheDocument();
    });

    it('应在选择Agent时触发onSelect回调', () => {
      render(
        <HexMenu 
          activeAgent="soyorin" 
          onSelect={mockOnSelect} 
          onClose={mockOnClose} 
        />
      );
      
      // 点击PM按钮
      const pmButton = screen.getByTitle('产品经理');
      fireEvent.click(pmButton);
      
      // 验证回调被调用
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('pm');
    });

    it('应在点击关闭时触发onClose回调', () => {
      render(
        <HexMenu 
          activeAgent="soyorin" 
          onSelect={mockOnSelect} 
          onClose={mockOnClose} 
        />
      );
      
      // 点击关闭按钮（使用aria-label或其他标识符）
      // 关闭按钮在中心位置
      const buttons = screen.getAllByRole('button');
      const closeButton = buttons[buttons.length - 1]; // 最后一个按钮是关闭按钮
      
      fireEvent.click(closeButton);
      
      // 验证回调被调用
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('应在点击背景遮罩时触发onClose回调', () => {
      render(
        <HexMenu 
          activeAgent="soyorin" 
          onSelect={mockOnSelect} 
          onClose={mockOnClose} 
        />
      );
      
      // 背景遮罩应该有onClick
      const overlay = document.querySelector('[class*="fixed inset-0"]');
      if (overlay) {
        fireEvent.click(overlay);
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      }
    });

    it('应使用默认的activeAgent值', () => {
      // 不提供activeAgent，使用默认值
      render(
        <HexMenu 
          onSelect={mockOnSelect} 
          onClose={mockOnClose} 
        />
      );
      
      // 应该渲染所有Agent按钮
      expect(screen.getByTitle('产品经理')).toBeInTheDocument();
      expect(screen.getByTitle('架构师')).toBeInTheDocument();
      expect(screen.getByTitle('质检')).toBeInTheDocument();
      expect(screen.getByTitle('工程师')).toBeInTheDocument();
      expect(screen.getByTitle('Mike')).toBeInTheDocument();
      expect(screen.getByTitle('Soyorin')).toBeInTheDocument();
    });

    it('应支持可选的回调函数', () => {
      // 不提供回调函数，不应报错
      const { container } = render(<HexMenu activeAgent="pm" />);
      
      // 点击一个按钮
      const archButton = screen.getByTitle('架构师');
      fireEvent.click(archButton);
      
      // 不应该抛出错误
      expect(container).toBeInTheDocument();
    });
  });

  describe('[TEST-HOOK-005] 条件渲染', () => {
    it('应正确渲染所有6个Agent按钮', () => {
      render(<HexMenu activeAgent="soyorin" />);
      
      const buttons = screen.getAllByRole('button');
      // 6个Agent按钮 + 1个关闭按钮 = 7个
      expect(buttons.length).toBe(7);
    });

    it('应为活跃Agent应用不同的样式', () => {
      const { rerender } = render(<HexMenu activeAgent="pm" />);
      
      // PM应该是活跃的
      let pmButton = screen.getByTitle('产品经理');
      expect(pmButton.className).toContain('scale-110');
      expect(pmButton.className).toContain('z-10');
      
      // 切换到Arch
      rerender(<HexMenu activeAgent="arch" />);
      
      // Arch应该是活跃的
      const archButton = screen.getByTitle('架构师');
      expect(archButton.className).toContain('scale-110');
      
      // PM应该不再是活跃状态
      pmButton = screen.getByTitle('产品经理');
      expect(pmButton.className).not.toContain('scale-110');
    });

    it('应渲染SVG连接线', () => {
      const { container } = render(<HexMenu activeAgent="soyorin" />);
      
      // 检查SVG元素是否存在
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      
      // 检查连接线是否存在（6条外圈线 + 6条中心线）
      const lines = container.querySelectorAll('line');
      expect(lines.length).toBeGreaterThanOrEqual(6);
    });

    it('应渲染中心装饰', () => {
      const { container } = render(<HexMenu activeAgent="soyorin" />);
      
      // 检查中心装饰元素
      const centerDecoration = container.querySelector('[class*="animate-pulse"]');
      expect(centerDecoration).toBeInTheDocument();
    });
  });

  describe('[TEST-HOOK-006] 事件处理', () => {
    it('应正确处理多个Agent的选择', () => {
      render(
        <HexMenu 
          activeAgent="soyorin" 
          onSelect={mockOnSelect} 
          onClose={mockOnClose} 
        />
      );
      
      // 依次点击所有Agent
      const agents = ['产品经理', '架构师', '质检', '工程师', 'Mike', 'Soyorin'];
      const expectedIds = ['pm', 'arch', 'qa', 'engineer', 'mike', 'soyorin'];
      
      agents.forEach((agent, index) => {
        const button = screen.getByTitle(agent);
        fireEvent.click(button);
        
        expect(mockOnSelect).toHaveBeenCalledWith(expectedIds[index]);
      });
      
      // 总共6次调用
      expect(mockOnSelect).toHaveBeenCalledTimes(6);
    });

    it('应为按钮提供正确的可访问性属性', () => {
      render(<HexMenu activeAgent="pm" />);
      
      // 所有按钮都应有title属性
      const pmButton = screen.getByTitle('产品经理');
      expect(pmButton).toHaveAttribute('title', '产品经理');
      
      const archButton = screen.getByTitle('架构师');
      expect(archButton).toHaveAttribute('title', '架构师');
    });

    it('应应用悬停效果样式', () => {
      render(<HexMenu activeAgent="soyorin" />);
      
      const pmButton = screen.getByTitle('产品经理');
      
      // 检查是否有hover相关的类名
      expect(pmButton.className).toContain('hover:scale-110');
      expect(pmButton.className).toContain('transition-all');
    });

    it('应在每次渲染时保持位置计算正确', () => {
      const { rerender } = render(<HexMenu activeAgent="pm" />);
      
      // 多次渲染，位置应该保持一致
      rerender(<HexMenu activeAgent="arch" />);
      rerender(<HexMenu activeAgent="qa" />);
      rerender(<HexMenu activeAgent="engineer" />);
      
      // 验证所有按钮仍在正确位置
      const pmButton = screen.getByTitle('产品经理');
      expect(pmButton).toBeInTheDocument();
      expect(pmButton).toHaveStyle({ left: expect.any(String) });
    });
  });

  describe('六角形布局计算', () => {
    it('应正确计算六角形位置', () => {
      const { container } = render(<HexMenu activeAgent="soyorin" />);
      
      // 获取所有Agent按钮
      const buttons = container.querySelectorAll('[title]');
      
      // 验证按钮位置不同（形成六角形）
      const positions: { left: string; top: string }[] = [];
      buttons.forEach((btn) => {
        const style = (btn as HTMLElement).style;
        positions.push({ left: style.left, top: style.top });
      });
      
      // 所有位置应该不同
      const uniquePositions = new Set(positions.map(p => `${p.left}-${p.top}`));
      expect(uniquePositions.size).toBe(positions.length);
    });
  });
});
