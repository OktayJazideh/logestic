export type ApiSuccess<T> = {
  success: true;
  data: T;
  requestId?: string;
};

export type ApiErrorPayload = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
};

export function success<T>(data: T, requestId?: string): ApiSuccess<T> {
  return { success: true, data, requestId };
}

export function failure(
  code: string,
  message: string,
  details?: unknown,
  requestId?: string,
): ApiErrorPayload {
  return {
    success: false,
    error: { code, message, details, requestId },
  };
}

