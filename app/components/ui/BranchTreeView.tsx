/**
 * YGGDRASIL P1 - 分支树形可视化组件
 * HAJIMI-YGGDRASIL-P1-03
 * 
 * 使用React Flow实现分支DAG可视化
 * 特性:
 * - 分支数≤5时树形布局，>5时DAG力导向布局 (VIS-001)
 * - 节点颜色对应七权人格 (VIS-002)
 * - 点击显示详情面板 (VIS-003)
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Panel,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GitBranch, GitMerge, GitCommit, X, Clock, User, AlertCircle } from 'lucide-react';
import { Branch } from '@/lib/yggdrasil/types';
import { AgentRole } from '@/lib/types/state';

// 七权人格主题色 (VIS-002)
const AGENT_COLORS: Record<AgentRole, { bg: string; border: string; text: string }> = {
  pm: { bg: '#884499', border: '#662277', text: '#FFFFFF' },       // 客服小祥
  architect: { bg: '#669966', border: '#447744', text: '#FFFFFF' }, // 🥒
  qa: { bg: '#77BBDD', border: '#5599BB', text: '#FFFFFF' },       // 🦆
  engineer: { bg: '#FF9999', border: '#DD7777', text: '#FFFFFF' }, // 🎀
  audit: { bg: '#7777AA', border: '#555588', text: '#FFFFFF' },    // 压力怪
  orchestrator: { bg: '#EE6677', border: '#CC4455', text: '#FFFFFF' }, // ⚡
  system: { bg: '#888888', border: '#666666', text: '#FFFFFF' },
  user: { bg: '#FFDD88', border: '#DDBB66', text: '#333333' },     // 奶龙娘
};

const STATUS_COLORS = {
  active: { bg: '#10B981', text: '#FFFFFF' },
  merged: { bg: '#3B82F6', text: '#FFFFFF' },
  abandoned: { bg: '#EF4444', text: '#FFFFFF' },
};

interface BranchTreeViewProps {
  branches: Branch[];
  edges: Array<{ from: string; to: string }>;
  onBranchClick?: (branch: Branch) => void;
  selectedBranchId?: string;
}

// 分支节点组件
function BranchNode({ data, selected }: NodeProps<Branch>) {
  const color = AGENT_COLORS[data.agentId as AgentRole] || AGENT_COLORS.system;
  const statusColor = STATUS_COLORS[data.status];

  return (
    <div
      className={`rounded-lg shadow-lg border-2 transition-all duration-200 ${
        selected ? 'ring-2 ring-offset-2 ring-yellow-400 scale-110' : ''
      }`}
      style={{
        backgroundColor: color.bg,
        borderColor: color.border,
        minWidth: 140,
      }}
    >
      {/* 头部 */}
      <div className="px-3 py-2 border-b border-white/20">
        <div className="flex items-center gap-2">
          {data.status === 'merged' ? (
            <GitMerge className="w-4 h-4" style={{ color: color.text }} />
          ) : (
            <GitBranch className="w-4 h-4" style={{ color: color.text }} />
          )}
          <span 
            className="font-semibold text-sm truncate"
            style={{ color: color.text }}
          >
            {data.name}
          </span>
        </div>
      </div>

      {/* 状态标签 */}
      <div className="px-3 py-1">
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: statusColor.bg,
            color: statusColor.text,
          }}
        >
          {data.status}
        </span>
      </div>

      {/* Agent标识 */}
      <div className="px-3 pb-2">
        <span className="text-xs opacity-80" style={{ color: color.text }}>
          @{data.agentId}
        </span>
      </div>
    </div>
  );
}

const nodeTypes = {
  branch: BranchNode,
};

export default function BranchTreeView({
  branches,
  edges,
  onBranchClick,
  selectedBranchId,
}: BranchTreeViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edgesState, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // 计算布局 (VIS-001)
  const layout = useMemo(() => {
    const useTreeLayout = branches.length <= 5;
    
    if (useTreeLayout) {
      // 树形布局: 根节点在顶部，子节点向下展开
      return branches.map((branch, index) => {
        const level = branch.parentBranchId ? 1 : 0;
        const siblings = branches.filter(b => b.parentBranchId === branch.parentBranchId);
        const siblingIndex = siblings.findIndex(s => s.id === branch.id);
        
        return {
          id: branch.id,
          position: {
            x: siblingIndex * 200 + (level === 0 ? 300 : 100),
            y: level * 150 + 50,
          },
          data: branch,
        };
      });
    } else {
      // DAG力导向布局: 圆形分布
      const radius = 300;
      const angleStep = (2 * Math.PI) / branches.length;
      
      return branches.map((branch, index) => ({
        id: branch.id,
        position: {
          x: 400 + radius * Math.cos(index * angleStep),
          y: 300 + radius * Math.sin(index * angleStep),
        },
        data: branch,
      }));
    }
  }, [branches]);

  // 更新节点和边
  useEffect(() => {
    const newNodes: Node<Branch>[] = layout.map(({ id, position, data }) => ({
      id,
      position,
      type: 'branch',
      data,
      selected: id === selectedBranchId,
    }));

    const newEdges: Edge[] = edges.map((edge, index) => ({
      id: `e${index}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#888888', strokeWidth: 2 },
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  }, [layout, edges, selectedBranchId, setNodes, setEdges]);

  // 节点点击处理
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<Branch>) => {
    const branch = node.data;
    setSelectedBranch(branch);
    onBranchClick?.(branch);
  }, [onBranchClick]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="relative w-full h-[600px] bg-gray-50 rounded-xl overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edgesState}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background color="#CBD5E1" gap={20} />
        <Controls />
        
        {/* 标题面板 */}
        <Panel position="top-left" className="bg-white/90 backdrop-blur p-3 rounded-lg shadow-md">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-gray-800">分支图谱</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {branches.length} 个分支
            {branches.length > 5 && ' (力导向布局)'}
          </div>
        </Panel>
      </ReactFlow>

      {/* 分支详情面板 (VIS-003) */}
      {selectedBranch && (
        <div className="absolute right-4 top-4 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-10">
          {/* 头部 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitCommit className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-gray-800">分支详情</span>
            </div>
            <button
              onClick={() => setSelectedBranch(null)}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* 信息 */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 uppercase">名称</label>
              <p className="font-medium text-gray-900">{selectedBranch.name}</p>
            </div>

            <div className="flex gap-4">
              <div>
                <label className="text-xs text-gray-500 uppercase">状态</label>
                <span
                  className="block text-xs px-2 py-1 rounded-full mt-1 w-fit"
                  style={{
                    backgroundColor: STATUS_COLORS[selectedBranch.status].bg,
                    color: STATUS_COLORS[selectedBranch.status].text,
                  }}
                >
                  {selectedBranch.status}
                </span>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase">创建者</label>
                <div className="flex items-center gap-1 mt-1">
                  <User className="w-3 h-3 text-gray-400" />
                  <span className="text-sm text-gray-700">{selectedBranch.agentId}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase">创建时间</label>
              <div className="flex items-center gap-1 mt-1">
                <Clock className="w-3 h-3 text-gray-400" />
                <span className="text-sm text-gray-700">
                  {formatTime(selectedBranch.createdAt)}
                </span>
              </div>
            </div>

            {selectedBranch.parentBranchId && (
              <div>
                <label className="text-xs text-gray-500 uppercase">父分支</label>
                <p className="text-sm text-gray-700 font-mono truncate">
                  {selectedBranch.parentBranchId.slice(0, 8)}...
                </p>
              </div>
            )}

            {selectedBranch.mergeVote && (
              <div className="pt-3 border-t border-gray-100">
                <label className="text-xs text-gray-500 uppercase">合并投票</label>
                <div className="flex items-center gap-2 mt-1">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-gray-700">
                    结果: {selectedBranch.mergeVote.result}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
