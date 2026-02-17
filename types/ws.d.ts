declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage } from 'http';
  
  export interface ClientOptions {
    port?: number;
    server?: any;
    path?: string;
  }
  
  export class WebSocket extends EventEmitter {
    static OPEN: number;
    static CLOSED: number;
    
    constructor(url: string, options?: any);
    send(data: string | Buffer): void;
    close(): void;
    terminate(): void;
    ping(): void;
    readyState: number;
    
    // Event overloads
    on(event: 'message', listener: (data: Buffer, isBinary: boolean) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'pong', listener: () => void): this;
    on(event: 'ping', listener: () => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this;
  }
  
  export class WebSocketServer extends EventEmitter {
    constructor(options?: ClientOptions);
    on(event: 'connection', listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    close(): void;
  }
  
  export default WebSocket;
}
