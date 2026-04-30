// Strip Indian PII before sending text to external AI APIs
const PATTERNS: [RegExp, string][] = [
  // UPI VPA: user@bank
  [/\b[\w.\-+]+@[a-zA-Z]{2,}\b/g, "[UPI-VPA]"],
  // IFSC: 4 letters + 0 + 6 alphanum
  [/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "[IFSC]"],
  // PAN: 5 letters + 4 digits + 1 letter
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[PAN]"],
  // Aadhaar: 12 digits (with optional spaces every 4)
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[AADHAAR]"],
  // Mobile numbers
  [/\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g, "[PHONE]"],
  // Account numbers: 9-18 digit sequences
  [/\b\d{9,18}\b/g, "[ACCT-NO]"],
]

export function redactPII(text: string): string {
  let out = text
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}
