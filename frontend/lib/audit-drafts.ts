export type AuditDraft = {
  mark: number;
  comment: string;
  updatedAt: number;
};

const key = (auditId: string, questionRef: string | number) => `ornisec:audit:${auditId}:question:${questionRef}`;

export function readAuditDraft(auditId: string, questionRef: string | number): AuditDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key(auditId, questionRef));
    return value ? JSON.parse(value) as AuditDraft : null;
  } catch {
    return null;
  }
}

export function writeAuditDraft(auditId: string, questionRef: string | number, draft: AuditDraft) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key(auditId, questionRef), JSON.stringify(draft));
}

export function removeAuditDraft(auditId: string, questionRef: string | number, updatedAt: number) {
  const draft = readAuditDraft(auditId, questionRef);
  if (draft?.updatedAt === updatedAt) window.localStorage.removeItem(key(auditId, questionRef));
}
