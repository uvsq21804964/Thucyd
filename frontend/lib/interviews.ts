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
  tavus: TavusRoom;
};

export type InterviewTurn = {
  question_ref: number | null;
  transcript: string;
  assistant_text: string;
  created_at: string;
};

export type InterviewSessionDetails = {
  session_id: string;
  audit_id: string;
  status: string;
  current_index: number;
  total_questions: number;
  answered_questions: number;
  stage: 'introduction' | 'interview' | 'closing' | 'completed';
  current_question: {
    ref: number;
    category: string;
    workstream: string;
  } | null;
  last_saved_at: string | null;
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
