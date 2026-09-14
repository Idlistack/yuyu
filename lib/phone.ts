/** Normalize a user-entered international telephone number to E.164 form. */
export function normalizeInternationalPhone(value: string) {
  return value.trim().replace(/[()\s-]+/g, "");
}

/**
 * Validate an E.164 number, with India's mobile-number allocation applied to
 * +91 values. Indian mobile numbers are exactly ten digits and begin 6–9.
 */
export function isValidInternationalPhone(value: string) {
  if (!/^\+\d{8,15}$/.test(value)) return false;
  return !value.startsWith("+91") || /^\+91[6-9]\d{9}$/.test(value);
}

export function phoneValidationMessage(label: string, value: string) {
  return value.startsWith("+91")
    ? `${label} must be a valid 10-digit Indian mobile number.`
    : `${label} must be a valid phone number (include country code).`;
}
