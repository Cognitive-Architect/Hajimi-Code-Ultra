/**
 * YGGDRASIL P1 - 六权星图与Branching集成
 * HAJIMI-YGGDRASIL-P1-03
 * 
 * 将分支树形图集成到六权星图界面
 */

'use client';

import { useState, useEffect } from 'react';
import { GitBranch, GitMerge, Plus, RefreshCw } from 'lucide-react';
import BranchTreeView from './BranchTreeView';
import { Branch } from '@/lib/yggdrasil/types';

interface StarMapIntegrationProps {
  sessionId: string;
}

export default function StarMapIntegration({ sessionId }: StarMapIntegrationProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [edges, setEdges] = useState<Array<{ from: string; to: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  // 加载分支数据
  const loadBranches = async () => {
    try {
      const response = await fetch(`/api/v1/yggdrasil/branches?sessionId=${sessionId}`);
      const data = await response.json();
      
      if (data.success) {
        setBranches(data.branches);
        setEdges(data.tree.edges);
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, [sessionId]);

  // 创建新分支
  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    try {
      const response = await fetch('/api/v1/yggdrasil/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          name: newBranchName,
          fromBranchId: branches[0]?.id || 'main',
          agentId: 'engineer',
        }),
      });

      if (response.ok) {
        setNewBranchName('');
        setShowCreateModal(false);
        loadBranches();
      }
    } catch (error) {
      console.error('Failed to create branch:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-purple-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-purple-600" />
          <div>
            <h3 className="font-semibold text-gray-800">分支管理</h3>
            <p className="text-sm text-gray-500">{branches.length} 个分支</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建分支
          </button>
          <button
            onClick={loadBranches}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 分支树视图 */}
      <BranchTreeView
        branches={branches}
        edges={edges}
        onBranchClick={(branch) => console.log('Selected:', branch)}
      />

      {/* 创建分支弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">创建新分支</h3>
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="分支名称"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
