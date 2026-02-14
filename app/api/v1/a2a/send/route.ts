/**
 * A2A Send Message API Route
 * 
 * POST /api/v1/a2a/send
 * 发送A2A消息
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { a2aService } from '@/lib/core/agents/a2a-service';
import { handleAPIError } from '@/lib/api/error-handler';
import { A2AMessageType } from '@/lib/types/a2a';

/**
 * 请求体验证Schema
 */
const SendMessageSchema = z.object({
  sender: z.string().min(1, '发送者不能为空'),
  receiver: z.string().min(1, '接收者不能为空'),
  content: z.string().min(1, '消息内容不能为空'),
  type: z.enum(['chat', 'proposal', 'vote', 'system'] as const).optional(),
  sessionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  stream: z.boolean().optional(),
});

type SendMessageBody = z.infer<typeof SendMessageSchema>;

/**
 * POST /api/v1/a2a/send
 * 发送A2A消息
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. 解析请求体
    const body = await request.json();

    // 2. 验证请求体
    const validation = SendMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { stream = false, ...messageData } = validation.data;

    // 3. 确保服务已初始化
    await a2aService.init();

    // 4. 发送消息
    if (stream) {
      // 流式响应
      return handleStreamResponse(messageData);
    } else {
      // 普通响应
      const message = await a2aService.sendMessage(messageData);

      return NextResponse.json(
        {
          success: true,
          data: message,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('[API] 发送A2A消息失败:', error);
    return handleAPIError(error);
  }
}

/**
 * 处理流式响应
 */
async function handleStreamResponse(
  messageData: Omit<SendMessageBody, 'stream'>
): Promise<NextResponse> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chunks: string[] = [];

        await a2aService.sendMessageStream(
          messageData,
          (chunk) => {
            const data = JSON.stringify({
              type: 'chunk',
              data: chunk,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));

            if (chunk.content) {
              chunks.push(chunk.content);
            }

            if (chunk.done) {
              const completeData = JSON.stringify({
                type: 'complete',
                data: {
                  content: chunks.join(''),
                  messageId: chunk.messageId,
                },
              });
              controller.enqueue(encoder.encode(`data: ${completeData}\n\n`));
              controller.close();
            }
          }
        );
      } catch (error) {
        const errorData = JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : '流式处理失败',
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
