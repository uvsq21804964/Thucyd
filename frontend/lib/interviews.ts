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
  tavus: TavusRoom;
};

export type InterviewTurn = {
  question_ref: number;
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
