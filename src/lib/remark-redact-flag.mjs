import { redactionTargets, redactString, blockFor, escapeRegExp } from './redact.mjs';

/**
 * Remark plugin: redact the article's flag (and its base64 encodings) from the
 * markdown body using the per-file frontmatter. Runs at the mdast stage, before
 * syntax highlighting, so the real value never reaches the rendered HTML.
 *
 * - code / inlineCode: the secret characters are swapped for a censor bar.
 * - prose text: the secret is replaced by a blurred <span> censor chip.
 */
export default function remarkRedactFlag() {
  return (tree, file) => {
    const flag = file?.data?.astro?.frontmatter?.flag;
    const secrets = redactionTargets(flag);
    if (!secrets.length) return;

    const pattern = new RegExp(secrets.map(escapeRegExp).join('|'), 'g');

    const splitText = (value) => {
      const nodes = [];
      let last = 0;
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(value)) !== null) {
        if (match.index > last) {
          nodes.push({ type: 'text', value: value.slice(last, match.index) });
        }
        nodes.push({
          type: 'html',
          value: `<span class="flag-redacted" title="flag oculta" aria-label="flag oculta">${blockFor(
            match[0],
          )}</span>`,
        });
        last = match.index + match[0].length;
      }
      if (last < value.length) {
        nodes.push({ type: 'text', value: value.slice(last) });
      }
      return nodes;
    };

    const visit = (node) => {
      if (!node || typeof node !== 'object') return;

      if (
        (node.type === 'code' || node.type === 'inlineCode') &&
        typeof node.value === 'string'
      ) {
        node.value = redactString(node.value, secrets);
        return;
      }

      if (Array.isArray(node.children)) {
        const next = [];
        for (const child of node.children) {
          if (
            child.type === 'text' &&
            typeof child.value === 'string' &&
            secrets.some((s) => child.value.includes(s))
          ) {
            next.push(...splitText(child.value));
          } else {
            visit(child);
            next.push(child);
          }
        }
        node.children = next;
      }
    };

    visit(tree);
  };
}
