import API from '@/lib/api-client';

export type TavusRoom = {
  conversation_id: string;
  conversation_url: string;
  meeting_token: string | null;
  status: string;
};

export type InterviewSession = {
  session_id: string;
  audit_id: string;
  status: string;
  custom_greeting: string;
  reused?: boolean;
  resumed?: boolean;
  tavus: TavusRoom;
};

export type InterviewTurn = {
  question_ref: number | null;
  transcript: string;
  assistant_text: string;
  created_at: string;
};

export type InterviewReviewItem = {
  question_ref: number;
  category: string;
  workstream: string;
  question: string;
  summary: string;
  mark: number | null;
  mark_rationale: string | null;
  confidence: number | null;
  evidence: string[];
  without_evidence: boolean;
  status: 'ready' | 'attention' | 'unanswered';
  reasons: string[];
};

export type InterviewReview = {
  counts: {
    total: number;
    ready: number;
    attention: number;
    unanswered: number;
    without_evidence: number;
  };
  items: InterviewReviewItem[];
};

export type InterviewSessionDetails = {
  session_id: string;
  audit_id: string;
  company_name: string;
  status: string;
  current_index: number;
  total_questions: number;
  answered_questions: number;
  stage: 'introduction' | 'interview' | 'closing' | 'completed';
  resumable: boolean;
  current_question: {
    ref: number;
    category: string;
    workstream: string;
  } | null;
  last_saved_at: string | null;
  review: InterviewReview;
  latest_capture: {
    recorded_at: string;
    items: {
      question_ref: number;
      summary: string;
      evidence: string[];
      mark: number | null;
      mark_rationale: string | null;
      confidence: number;
    }[];
  } | null;
  closing_notes: string[];
  tavus: TavusRoom | null;
  turns: InterviewTurn[];
};

export async function createInterviewSession(auditId: string) {
  const response = await API.post<InterviewSession>(
    `interviews/${auditId}/sessions`
  );
  return response.data;
}

export async function resumeInterviewSession(sessionId: string) {
  const response = await API.post<InterviewSession>(
    `interviews/${sessionId}/resume`
  );
  return response.data;
}

export async function interruptInterviewSession(sessionId: string) {
  const response = await API.post<{
    session_id: string;
    status: string;
    resumable: boolean;
    cleanup_pending: boolean;
  }>(`interviews/${sessionId}/interrupt`);
  return response.data;
}

export async function endInterviewSession(sessionId: string) {
  const response = await API.post<{
    session_id: string;
    status: string;
    tavus: TavusRoom;
  }>(`interviews/${sessionId}/end`);
  return response.data;
}

export async function getInterviewSession(sessionId: string) {
  const response = await API.get<InterviewSessionDetails>(
    `interviews/${sessionId}`
  );
  return response.data;
}

export async function getLatestInterviewSession(auditId: string) {
  const response = await API.get<InterviewSessionDetails>(
    `audits/${auditId}/interviews/latest`
  );
  return response.data;
}

export function interviewErrorMessage(error: unknown) {
  const candidate = error as {
    response?: { data?: { detail?: unknown } };
    message?: string;
  };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }
  return "L'entretien vidéo n'a pas pu être démarré.";
}
