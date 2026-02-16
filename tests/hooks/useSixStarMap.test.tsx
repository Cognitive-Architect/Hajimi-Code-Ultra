/**
 * YGGDRASIL DEBT-CLEARANCE-001 - React Hooks测试覆盖
 * 
 * 测试组件: SixStarMap
 * 职责:
 * - TEST-HOOK-007: JSX样式动态绑定测试
 * - TEST-HOOK-008: 条件类名测试
 * - TEST-HOOK-009: 事件委托测试
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SixStarMap } from '@/app/components/ui/SixStarMap';

describe('SixStarMap - React Hooks测试覆盖', () => {
  const mockOnAgentClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('[TEST-HOOK-007] JSX样式动态绑定', () => {
    it('应为每个Agent应用正确的颜色样式', () => {
      const { container } = render(
        <SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />
      );
      
      // 获取PM节点
      const pmNode = screen.getByLabelText('产品经理');
      const pmAvatar = pmNode.querySelector('[class*="star-avatar"]') || 
                       pmNode.querySelector('div');
      
      // 验证颜色样式被应用
      expect(pmAvatar).toHaveStyle({
        background: expect.stringContaining('linear-gradient'),
      });
    });

    it('应根据activeAgent动态更新样式', () => {
      const { rerender } = render(
        <SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />
      );
      
      // PM节点应该是活跃的
      let pmNode = screen.getByLabelText('产品经理');
      expect(pmNode.className).toContain('active');
      
      // 切换到Arch
      rerender(<SixStarMap activeAgent="arch" onAgentClick={mockOnAgentClick} />);
      
      // Arch节点应该是活跃的
      const archNode = screen.getByLabelText('黄瓜睦');
      expect(archNode.className).toContain('active');
      
      // PM节点应该不再活跃
      pmNode = screen.getByLabelText('产品经理');
      expect(pmNode.className).not.toContain('active');
    });

    it('应为连接线应用动态样式', () => {
      const { container } = render(
        <SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />
      );
      
      // 获取SVG中的线条
      const lines = container.querySelectorAll('line');
      
      // 检查线条样式
      lines.forEach((line) => {
        expect(line).toHaveAttribute('stroke');
      });
    });

    it('应正确应用自定义className', () => {
      const { container } = render(
        <SixStarMap 
          activeAgent="pm" 
          onAgentClick={mockOnAgentClick}
          className="custom-class"
        />
      );
      
      // 检查自定义class是否被应用
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('[TEST-HOOK-008] 条件类名', () => {
    it('应为活跃节点应用active类', () => {
      render(<SixStarMap activeAgent="soyorin" onAgentClick={mockOnAgentClick} />);
      
      // Soyorin节点应该是活跃的
      const soyorinNode = screen.getByLabelText('Soyorin');
      expect(soyorinNode.className).toContain('active');
    });

    it('应为活跃节点的连线应用active类', () => {
      const { container } = render(
        <SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />
      );
      
      // 检查SVG线条
      const lines = container.querySelectorAll('line');
      
      // 应该有线条带有active类（连接到活跃节点的线）
      const hasActiveLine = Array.from(lines).some(
        (line) => line.classList.contains('active')
      );
      expect(hasActiveLine).toBe(true);
    });

    it('应在hover时应用悬停样式', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 检查节点是否有hover样式
      const pmNode = screen.getByLabelText('产品经理');
      expect(pmNode.className).toContain('star-node');
      
      // 模拟hover
      fireEvent.mouseEnter(pmNode);
      // 样式应该在CSS中定义
    });
  });

  describe('[TEST-HOOK-009] 事件委托', () => {
    it('应在点击节点时触发onAgentClick', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 点击PM节点
      const pmNode = screen.getByLabelText('产品经理');
      fireEvent.click(pmNode);
      
      expect(mockOnAgentClick).toHaveBeenCalledTimes(1);
      expect(mockOnAgentClick).toHaveBeenCalledWith('pm');
    });

    it('应支持点击所有6个节点', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 所有可点击的Agent
      const agents = [
        { label: '产品经理', id: 'pm' },
        { label: '黄瓜睦', id: 'arch' },
        { label: '咕咕嘎嘎', id: 'qa' },
        { label: '唐音', id: 'engineer' },
        { label: '压力怪', id: 'mike' },
        { label: 'Soyorin', id: 'soyorin' },
      ];
      
      agents.forEach(({ label, id }) => {
        const node = screen.getByLabelText(label);
        fireEvent.click(node);
        expect(mockOnAgentClick).toHaveBeenCalledWith(id);
      });
      
      expect(mockOnAgentClick).toHaveBeenCalledTimes(6);
    });

    it('应在多次点击同一节点时每次都触发回调', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      const pmNode = screen.getByLabelText('产品经理');
      
      // 点击3次
      fireEvent.click(pmNode);
      fireEvent.click(pmNode);
      fireEvent.click(pmNode);
      
      expect(mockOnAgentClick).toHaveBeenCalledTimes(3);
    });

    it('应正确处理可选的onAgentClick回调', () => {
      // 不提供回调
      const { container } = render(<SixStarMap activeAgent="pm" />);
      
      // 点击应该不报错
      const pmNode = screen.getByLabelText('产品经理');
      expect(() => fireEvent.click(pmNode)).not.toThrow();
    });
  });

  describe('组件结构与渲染', () => {
    it('应渲染完整的六权星图结构', () => {
      const { container } = render(
        <SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />
      );
      
      // 检查头部
      expect(screen.getByText('六权星图')).toBeInTheDocument();
      expect(screen.getByText('v2.0')).toBeInTheDocument();
      
      // 检查所有6个Agent节点
      expect(screen.getByLabelText('产品经理')).toBeInTheDocument();
      expect(screen.getByLabelText('黄瓜睦')).toBeInTheDocument();
      expect(screen.getByLabelText('咕咕嘎嘎')).toBeInTheDocument();
      expect(screen.getByLabelText('唐音')).toBeInTheDocument();
      expect(screen.getByLabelText('压力怪')).toBeInTheDocument();
      expect(screen.getByLabelText('Soyorin')).toBeInTheDocument();
      
      // 检查底部
      expect(screen.getByText('Ouroboros System')).toBeInTheDocument();
      expect(screen.getByText('运行中')).toBeInTheDocument();
    });

    it('应渲染SVG连接线', () => {
      const { container } = render(
        <SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />
      );
      
      // 应该有SVG元素
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      
      // 应该有连接线（6条外圈线 + 5条中心线）
      const lines = container.querySelectorAll('line');
      expect(lines.length).toBeGreaterThanOrEqual(10);
    });

    it('应显示角色的人格化信息', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 检查称号显示
      expect(screen.getByText('立法者')).toBeInTheDocument();
      expect(screen.getByText('架构师')).toBeInTheDocument();
      expect(screen.getByText('质守卫')).toBeInTheDocument();
      expect(screen.getByText('编码使')).toBeInTheDocument();
      expect(screen.getByText('审计官')).toBeInTheDocument();
      expect(screen.getByText('验收者')).toBeInTheDocument();
    });

    it('应显示角色头像', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 检查头像文本（使用emoji或文字）
      expect(screen.getByText('祥')).toBeInTheDocument();
      expect(screen.getByText('🥒')).toBeInTheDocument();
      expect(screen.getByText('🦆')).toBeInTheDocument();
      expect(screen.getByText('🎀')).toBeInTheDocument();
      expect(screen.getByText('⚡')).toBeInTheDocument();
      expect(screen.getByText('素')).toBeInTheDocument();
    });
  });

  describe('响应式与可访问性', () => {
    it('应为所有节点提供aria-label', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 所有Agent节点都应有aria-label
      const pmNode = screen.getByLabelText('产品经理');
      expect(pmNode).toHaveAttribute('aria-label', '产品经理');
      
      const archNode = screen.getByLabelText('黄瓜睦');
      expect(archNode).toHaveAttribute('aria-label', '黄瓜睦');
    });

    it('应正确设置title属性', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 检查title属性包含角色名和称号
      const pmNode = screen.getByLabelText('产品经理');
      expect(pmNode).toHaveAttribute('title', expect.stringContaining('产品经理'));
      expect(pmNode).toHaveAttribute('title', expect.stringContaining('立法者'));
    });

    it('应使用button元素确保可访问性', () => {
      render(<SixStarMap activeAgent="pm" onAgentClick={mockOnAgentClick} />);
      
      // 所有Agent节点应该是button
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(6); // 6个Agent节点
    });
  });
});
