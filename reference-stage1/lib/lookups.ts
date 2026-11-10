/** Editable lists managed from Settings. Only these table names may ever be written by saveLookup. */
export const LOOKUPS = {
  meeting_types: { table: "meeting_types", title: "أنواع الاجتماعات", hint: "تظهر عند إنشاء الاجتماعات." },
  task_priorities: { table: "task_priorities", title: "أولويات المهام", hint: "تُستعمل للمهام وللمشاريع." },
  project_categories: { table: "project_categories", title: "تصنيفات المشاريع", hint: "تظهر عند إنشاء المشاريع وتصفيتها." },
} as const;

export type LookupKind = keyof typeof LOOKUPS;
