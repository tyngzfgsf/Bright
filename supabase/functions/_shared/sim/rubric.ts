// Skill tags on rubric items. A later skill profile aggregates grade results by these.
export const RUBRIC_TAGS = [
  "airway", "breathing", "circulation", "assessment", "medication", "communication", "escalation", "safety",
] as const;
export type RubricTag = (typeof RUBRIC_TAGS)[number];

/** Known tags only, deduplicated, in vocabulary order. Anything else in the database is dropped, never echoed. */
export function tagsOf(item: { tags?: unknown }): RubricTag[] {
  const raw = Array.isArray(item.tags) ? item.tags : [];
  return RUBRIC_TAGS.filter((t) => raw.includes(t));
}
