export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(opts: {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }
}

