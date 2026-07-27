import API from '@/lib/api-client';

export type EvidenceStatus = 'pending' | 'validated' | 'rejected';

export type EvidenceItem = {
  id: string;
  audit_id: string;
  question_ref: number;
  filename: string;
  content_type: string;
  size: number;
  checksum: string;
  status: EvidenceStatus;
  uploaded_by: string;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  can_validate: boolean;
  can_delete: boolean;
};

export async function getEvidence(
  auditId: string,
  questionRef: string | number
) {
  const response = await API.get<EvidenceItem[]>(
    `audits/${auditId}/questions/${questionRef}/evidence`
  );
  return response.data;
}

export async function uploadEvidence(
  auditId: string,
  questionRef: string | number,
  document: File
) {
  const body = new FormData();
  body.append('document', document);
  const response = await API.post<EvidenceItem>(
    `audits/${auditId}/questions/${questionRef}/evidence`,
    body,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

export async function reviewEvidence(
  evidenceId: string,
  status: 'validated' | 'rejected',
  comment: string
) {
  const response = await API.patch<EvidenceItem>(
    `evidence/${evidenceId}/validation`,
    { status, comment }
  );
  return response.data;
}

export async function deleteEvidence(evidenceId: string) {
  await API.delete(`evidence/${evidenceId}`);
}

export function evidenceErrorMessage(error: unknown) {
  const candidate = error as {
    response?: { data?: { detail?: unknown } };
  };
  const detail = candidate.response?.data?.detail;
  return typeof detail === 'string'
    ? detail
    : 'La gestion de cette preuve a échoué.';
}
