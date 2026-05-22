/** Briefing helpers — consumed by Dashboard and future morning briefing flows. */

export function getIncompleteTodos(todos) {
  return (Array.isArray(todos) ? todos : [])
    .filter((t) => t && !t.done)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function getTodaysIncompleteTodos(todos) {
  return getIncompleteTodos(todos);
}

/** @param {import('@/jarvis.d.ts').JarvisData | { todos?: unknown[] }} data */
export function buildMorningBriefing(data) {
  const incomplete = getTodaysIncompleteTodos(data?.todos);
  return {
    tasks: incomplete.slice(0, 8),
    taskCount: incomplete.length,
    generatedAt: Date.now(),
  };
}

export function formatTodoForBriefing(todo) {
  if (!todo?.text) return '';
  return todo.done ? `✓ ${todo.text}` : todo.text;
}
