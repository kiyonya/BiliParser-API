export {};

declare global {
  interface Env extends Record<string,string> {}
  interface Console {
    alert(...data: unknown[]): void;
  }

  interface ESACache {
    put(request: Request | string, response: Response): Promise<void>;
    get(request: Request | string): Promise<Response | undefined>;
    delete(request: Request | string): Promise<boolean>;
  }

  const cache: ESACache;

  type EdgeKVGetType = "stream" | "text" | "json" | "arrayBuffer";

  interface EdgeKVOptions {
    namespace?: string;
    namespaceId?: string;
  }

  interface EdgeKVGetOptions {
    type?: EdgeKVGetType;
  }

  class EdgeKV {
    constructor(options: EdgeKVOptions);
    get(
      key: string,
      options?: EdgeKVGetOptions & { type: "text" }
    ): Promise<string | undefined>;
    get(
      key: string,
      options?: EdgeKVGetOptions & { type: "json" }
    ): Promise<unknown>;
    get(
      key: string,
      options?: EdgeKVGetOptions & { type: "arrayBuffer" }
    ): Promise<ArrayBuffer | undefined>;
    get(
      key: string,
      options?: EdgeKVGetOptions & { type: "stream" }
    ): Promise<ReadableStream | undefined>;
    get(key: string, options?: EdgeKVGetOptions): Promise<unknown>;
    put(
      key: string,
      value: string | ReadableStream | ArrayBuffer | ArrayBufferView | Response
    ): Promise<void>;
    delete(key: string): Promise<boolean>;
  }

  class HTMLStream extends ReadableStream<Uint8Array> {
    constructor(
      source: ReadableStream,
      rewriters: Array<[string | null, ESA.ElementCallback | ESA.DocumentCallback]>
    );
  }
}

declare namespace ESA {
  interface HTMLOptions {
    html?: boolean;
  }

  interface Element {
    readonly tagName: string;
    readonly attributes: IterableIterator<[string, string]>;
    readonly removed: boolean;
    readonly namespaceURI: string;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    hasAttribute(name: string): boolean;
    removeAttribute(name: string): void;
    before(data: string, option?: HTMLOptions): void;
    after(data: string, option?: HTMLOptions): void;
    prepend(data: string, option?: HTMLOptions): void;
    append(data: string, option?: HTMLOptions): void;
    replace(data: string, option?: HTMLOptions): void;
    setInnerContent(data: string, option?: HTMLOptions): void;
    remove(): void;
    removeAndKeepContent(): void;
  }

  interface TextChunk {
    readonly removed: boolean;
    readonly text: string;
    readonly lastInTextNode: boolean;
    before(data: string, option?: HTMLOptions): void;
    after(data: string, option?: HTMLOptions): void;
    replace(data: string, option?: HTMLOptions): void;
    remove(): void;
  }

  interface Comments {
    readonly removed: boolean;
    text: string;
    before(data: string, option?: HTMLOptions): void;
    after(data: string, option?: HTMLOptions): void;
    replace(data: string, option?: HTMLOptions): void;
    remove(): void;
  }

  interface Doctype {
    readonly name: string;
    readonly publicId: string | null;
    readonly systemId: string | null;
  }

  interface Docend {
    append(data: string, option?: HTMLOptions): void;
  }

  interface ElementCallback {
    element?(e: Element): void;
    comments?(e: Comments): void;
    text?(e: TextChunk): void;
  }

  interface DocumentCallback {
    doctype?(e: Doctype): void;
    comments?(e: Comments): void;
    text?(e: TextChunk): void;
    docend?(e: Docend): void;
  }
}
