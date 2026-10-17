type Child = Node | string | null | undefined | false;

interface ElementProps {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
}

/**
 * The only way the HUD builds DOM. Text always goes through `textContent`, so
 * repository names, PR titles and author names can never become markup.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
  for (const [type, handler] of Object.entries(props.on ?? {})) node.addEventListener(type, handler);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** Only http(s) links leave the app; anything else (javascript:, data:) is dropped. */
export function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function externalLink(url: string | undefined, label: string): HTMLAnchorElement | null {
  const href = safeHref(url);
  if (!href) return null;
  return el("a", { class: "external", text: label, attrs: { href, target: "_blank", rel: "noopener noreferrer" } });
}
