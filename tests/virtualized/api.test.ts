/**
 * HAJIMI VIRTUALIZED - API路由测试
 */

import { SHORTCUTS, FloatingBall } from '@/app/api/v1/virtualized/ui/floating-ball';

describe('Virtualized API', () => {
  describe('[API-004] 快捷键绑定', () => {
    it('应定义Ctrl+R快捷键', () => {
      expect(SHORTCUTS.SPAWN.key).toBe('Ctrl+R');
      expect(SHORTCUTS.SPAWN.action).toBe('spawn');
    });

    it('应定义Ctrl+M快捷键', () => {
      expect(SHORTCUTS.REMIX.key).toBe('Ctrl+M');
      expect(SHORTCUTS.REMIX.action).toBe('remix');
    });

    it('应定义Ctrl+Z快捷键', () => {
      expect(SHORTCUTS.ROLLBACK.key).toBe('Ctrl+Z');
      expect(SHORTCUTS.ROLLBACK.action).toBe('rollback');
    });

    it('悬浮球应处理快捷键', () => {
      const ball = new FloatingBall();
      
      const result = ball.handleShortcut('Ctrl+R');
      
      expect(result.handled).toBe(true);
      expect(result.action).toBe('spawn');
    });
  });

  describe('[YGG-001] 四象限功能完整性', () => {
    it('悬浮球应提供完整状态', () => {
      const ball = new FloatingBall();
      
      ball.updateState(0.01, 5);
      const state = ball.getState();
      
      expect(state.virtualizationMode).toBeDefined();
      expect(state.indicator).toMatch(/[🟢🟡🔴]/);
      expect(state.activeAgents).toBe(5);
    });

    it('应生成HTML渲染', () => {
      const ball = new FloatingBall();
      
      const html = ball.renderHTML();
      
      expect(html).toContain('hajimi-floating-ball');
      expect(html).toContain('Ctrl+R');
    });
  });
});
