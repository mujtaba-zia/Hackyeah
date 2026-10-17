export interface ReconcileOptions<T, Visual> {
  id(item: T): string;
  create(item: T): Visual;
  update(visual: Visual, item: T): void;
  dispose(visual: Visual): void;
}

/**
 * Reconciles render objects by their stable model ids. Updating a model with the
 * same id deliberately preserves the existing visual object and its GPU state.
 */
export function reconcileById<T, Visual>(
  visuals: Map<string, Visual>,
  items: readonly T[],
  options: ReconcileOptions<T, Visual>,
): void {
  const retained = new Set<string>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) continue;
    const id = options.id(item);
    retained.add(id);
    const existing = visuals.get(id);
    if (existing === undefined) {
      visuals.set(id, options.create(item));
    } else {
      options.update(existing, item);
    }
  }

  for (const [id, visual] of visuals) {
    if (!retained.has(id)) {
      options.dispose(visual);
      visuals.delete(id);
    }
  }
}
