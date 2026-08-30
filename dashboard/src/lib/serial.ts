export interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

export interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
}

declare global {
  interface Navigator {
    serial?: SerialLike;
  }
}

export const BAUD_RATE = 38400;

export class ReflexSerial {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer = "";
  private running = false;
  private onLine: ((line: string) => void) | null = null;

  setLineHandler(handler: (line: string) => void): void {
    this.onLine = handler;
  }

  get connected(): boolean {
    return this.port !== null && this.running;
  }

  async connect(): Promise<void> {
    if (!navigator.serial) {
      throw new Error("Web Serial is not supported in this browser");
    }

    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: BAUD_RATE });

    if (!this.port.readable || !this.port.writable) {
      throw new Error("Port is not readable/writable");
    }

    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.buffer = "";
    this.running = true;
    void this.readLoop();
  }

  async disconnect(): Promise<void> {
    this.running = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* noop */
    }
    this.reader = null;

    try {
      await this.writer?.close();
    } catch {
      /* noop */
    }
    this.writer = null;

    try {
      await this.port?.close();
    } catch {
      /* noop */
    }
    this.port = null;
  }

  async write(text: string): Promise<void> {
    if (!this.writer) {
      return;
    }
    const data = new TextEncoder().encode(text);
    await this.writer.write(data);
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    while (this.running && this.reader) {
      let value: Uint8Array | undefined;
      let done: boolean;
      try {
        const result = await this.reader.read();
        value = result.value;
        done = result.done;
      } catch {
        break;
      }
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      this.buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, idx).replace(/\r$/, "");
        this.buffer = this.buffer.slice(idx + 1);
        if (line.length > 0) {
          this.onLine?.(line);
        }
      }
    }
    this.running = false;
  }
}
