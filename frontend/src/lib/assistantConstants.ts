import { DECISION_CENTER_QUESTIONS } from './decisionCenterConstants'

/** كل الأسئلة المقترحة للمساعد الذكي */
export const ASSISTANT_SUGGESTED_QUESTIONS = DECISION_CENTER_QUESTIONS.map((q) => q.text)
