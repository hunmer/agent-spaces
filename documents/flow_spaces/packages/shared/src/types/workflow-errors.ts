// ============================================================
// Workflow Error Codes
// ============================================================

export type BackendErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'CONNECTION_CLOSED'
  | 'CHANNEL_NOT_FOUND'
  | 'HANDLER_FAILED'
  | 'VALIDATION_FAILED'
  | 'STORAGE_ERROR'
  | 'WORKFLOW_ERROR'
  | 'PLUGIN_ERROR'
  | 'INTERACTION_TIMEOUT'
  | 'INTERNAL_ERROR'

export interface BackendErrorShape {
  code: BackendErrorCode
  message: string
  details?: unknown
  retryable?: boolean
}

export interface ErrorEnvelope {
  id?: string
  channel?: string
  type: 'error'
  error: BackendErrorShape
}

export function createErrorShape(
  code: BackendErrorCode,
  message: string,
  details?: unknown,
  retryable = false,
): BackendErrorShape {
  return { code, message, details, retryable }
}
