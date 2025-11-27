export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export enum ValidationErrorCode {
  INVALID_URL = 'invalid_url',
  INVALID_PROTOCOL = 'invalid_protocol',
  INVALID_EXTENSION = 'invalid_extension',
  INVALID_BUCKET_NAME = 'invalid_bucket_name',
  INVALID_KEY_PREFIX = 'invalid_key_prefix'
}
