declare module "xlsx-stream-reader" {
  import { Writable } from "node:stream";

  interface XlsxStreamReaderOptions {
    verbose?: boolean;
    formatting?: boolean;
    saxTrim?: boolean;
  }

  interface XlsxRow {
    attributes: {
      r: string | number;
      [key: string]: unknown;
    };
    values: unknown[];
  }

  interface XlsxWorksheetReader {
    id: number;
    name?: string;
    rowCount?: number;
    on(event: "row", listener: (row: XlsxRow) => void): this;
    on(event: "end", listener: () => void): this;
    process(): void;
    skip(): void;
  }

  export default class XlsxStreamReader extends Writable {
    constructor(options?: XlsxStreamReaderOptions);
    on(event: "worksheet", listener: (worksheet: XlsxWorksheetReader) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "end", listener: () => void): this;
  }
}
