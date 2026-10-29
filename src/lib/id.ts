/** Short, collision-safe id for projects and environments. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
