/**
 * 全局错误边界 - Next.js Error Boundary
 * B-03/09 彩蛋工程师任务
 * 
 * 捕获所有未处理的错误，以MyGO!!!!!角色风格展示
 * 让每个错误都成为一次彩蛋体验
 */

'use client';

import React, { useEffect } from 'react';
import { ErrorPersona } from '@/app/components/ui/ErrorPersona';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * 从错误对象中提取状态码
 * 优先使用错误消息中的状态码，默认为500
 */
function extractStatusCode(error: Error): number {
  // 尝试从错误消息中提取HTTP状态码
  const statusMatch = error.message.match(/\b(\d{3})\b/);
  if (statusMatch) {
    const code = parseInt(statusMatch[1], 10);
    // 验证是否是有效的HTTP错误码
    if (code >= 400 && code < 600) {
      return code;
    }
  }
  
  // 检查错误名称
  const errorName = error.name.toLowerCase();
  if (errorName.includes('notfound') || errorName.includes('not_found')) {
    return 404;
  }
  if (errorName.includes('unauthorized')) {
    return 401;
  }
  if (errorName.includes('forbidden')) {
    return 403;
  }
  if (errorName.includes('timeout')) {
    return 504;
  }
  
  // 默认为500
  return 500;
}

/**
 * 全局错误边界组件
 * 
 * 这是Next.js的error.tsx约定文件
 * 会自动包裹所有页面，捕获渲染错误
 */
export default function GlobalErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // 在控制台记录错误
    console.error('🎸 MyGO!!!!! Error Boundary caught an error:', error);
    
    // 可以在这里添加错误上报逻辑
    // 例如：Sentry, LogRocket等
    if (typeof window !== 'undefined' && 'gtag' in window) {
      // @ts-expect-error gtag is loaded via script
      window.gtag?.('event', 'exception', {
        description: error.message,
        fatal: true,
      });
    }
  }, [error]);
  
  const statusCode = extractStatusCode(error);
  
  return (
    <ErrorPersona
      statusCode={statusCode}
      error={error}
      reset={reset}
      showDetails={process.env.NODE_ENV === 'development'}
      homeHref="/"
      animated={true}
    />
  );
}

/**
 * 404页面专用错误边界
 * 可以单独创建一个not-found.tsx使用相同的风格
 */
export function NotFoundError() {
  return (
    <ErrorPersona
      statusCode={404}
      homeHref="/"
      animated={true}
    />
  );
}

/**
 * 通用错误展示函数
 * 用于在组件内部手动展示错误
 */
export function showErrorPersona(
  statusCode: number, 
  options?: {
    error?: Error;
    reset?: () => void;
    showDetails?: boolean;
  }
): React.ReactElement {
  return (
    <ErrorPersona
      statusCode={statusCode}
      error={options?.error}
      reset={options?.reset}
      showDetails={options?.showDetails ?? false}
    />
  );
}
