/**
 * Signatures storage service.
 *
 * THE SINGLE SOURCE OF TRUTH for email signatures.
 * localStorage key: "email_signatures"  ← must not be renamed
 *
 * Both Compose and Reply panels MUST read through this module.
 * A prior regression split the storage so newly-created signatures never
 * appeared in one of the panels — this module exists to prevent that.
 */
import type { Signature } from '../../types';
import { STORAGE_KEYS } from '../../utils/storage-keys';

export function loadSignatures(): Signature[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.EMAIL_SIGNATURES) || '[]');
  } catch {
    return [];
  }
}

export function saveSignatures(signatures: Signature[]): void {
  localStorage.setItem(STORAGE_KEYS.EMAIL_SIGNATURES, JSON.stringify(signatures));
}

export function getDefaultSignature(): Signature | null {
  const sigs = loadSignatures();
  return sigs.find((s) => s.isDefault) ?? sigs[0] ?? null;
}
