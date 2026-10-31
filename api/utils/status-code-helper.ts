export function isSuccessStatus(statusCode: number): boolean {
  return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 300;
}

export function isClientError(statusCode: number): boolean {
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500;
}

export function isServerError(statusCode: number): boolean {
  return Number.isInteger(statusCode) && statusCode >= 500 && statusCode < 600;
}
