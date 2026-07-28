export type QuestionnaireReference = {
  id: string;
  name: string;
  version: number;
  source: 'builtin' | 'custom' | 'legacy' | string;
  checksum: string;
  question_count: number;
  created_by: string;
  created_at: string;
  is_latest?: boolean;
};
