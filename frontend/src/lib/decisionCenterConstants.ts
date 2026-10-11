export type DecisionQuestionCategory = 'inventory' | 'sales' | 'profit' | 'customers' | 'repairs'

export interface DecisionCenterQuestion {
  text: string
  category: DecisionQuestionCategory
}

export const DECISION_QUESTION_CATEGORIES: Record<
  DecisionQuestionCategory,
  { label: string; color: string }
> = {
  inventory: { label: 'مخزون', color: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  sales: { label: 'مبيعات', color: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  profit: { label: 'أرباح', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  customers: { label: 'عملاء', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  repairs: { label: 'صيانة', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

/** أسئلة سريعة لمركز القرارات — تُفتح في المساعد الذكي */
export const DECISION_CENTER_QUESTIONS: DecisionCenterQuestion[] = [
  { text: 'ما المنتجات التي يجب إعادة طلبها؟', category: 'inventory' },
  { text: 'ما المنتجات التي ستنفد مخزونها قريباً؟', category: 'inventory' },
  { text: 'ما المنتجات الراكدة حالياً؟', category: 'inventory' },
  { text: 'ما المنتجات ذات هامش ربح منخفض؟', category: 'profit' },
  { text: 'ما هو أكثر منتج ربحاً؟', category: 'profit' },
  { text: 'ما هي أقل المنتجات مبيعاً؟', category: 'sales' },
  { text: 'ما أكثر المنتجات مبيعاً هذا الشهر؟', category: 'sales' },
  { text: 'لماذا انخفضت الأرباح هذا الأسبوع؟', category: 'profit' },
  { text: 'كم صافي ربح الشهر الحالي؟', category: 'profit' },
  { text: 'هل المصاريف مرتفعة هذا الأسبوع؟', category: 'profit' },
  { text: 'أي مورد يقدم أفضل الأسعار؟', category: 'inventory' },
  { text: 'ما العملاء الذين لديهم ديون مستحقة؟', category: 'customers' },
  { text: 'ما أوامر الصيانة المتأخرة؟', category: 'repairs' },
  { text: 'ما هي insights اليوم؟', category: 'profit' },
]
