import hljs from 'highlight.js'
import juice from 'juice'
import { Marked } from 'marked'

export type ThemeName = 'default' | 'grace' | 'simple'
export type LegendMode = 'title-alt' | 'alt-title' | 'title' | 'alt' | 'none'
export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
export type HeadingStyleType = 'default' | 'color-only' | 'border-bottom' | 'border-left' | 'custom'
export type HeadingStyles = Partial<Record<HeadingLevel, HeadingStyleType>>

export interface RenderOptions {
  legend: LegendMode
}

export interface ThemeCssOptions {
  themeName: ThemeName
  primaryColor: string
  fontFamily: string
  fontSize: string
  lineHeight: number
  isUseJustify: boolean
  headingStyles: HeadingStyles
  customCss: string
}

export function buildThemeCss(opts: ThemeCssOptions): string {
  const { themeName, primaryColor, fontFamily, fontSize, lineHeight, isUseJustify, headingStyles, customCss } = opts
  const common = `
#output {
  --md-primary-color: ${primaryColor};
  --md-font-family: ${fontFamily};
  --md-font-size: ${fontSize};
  font-family: var(--md-font-family);
  font-size: var(--md-font-size);
  line-height: ${lineHeight};
  color: #1f2937;
  word-break: break-word;
}
#output h1 { display: table; margin: 2em auto 1em; padding: 0 .8em; border-bottom: 2px solid var(--md-primary-color); font-size: 1.45em; line-height: 1.35; text-align: center; }
#output h2 { margin: 1.8em 0 .9em; padding: .28em .7em; border-radius: 5px; background: var(--md-primary-color); color: #fff; font-size: 1.25em; line-height: 1.35; }
#output h3 { margin: 1.4em 0 .7em; padding-left: .55em; border-left: 3px solid var(--md-primary-color); font-size: 1.12em; line-height: 1.4; }
#output h4,#output h5,#output h6 { margin: 1.2em 0 .6em; color: var(--md-primary-color); }
#output p { margin: .9em 0; letter-spacing: .02em; ${isUseJustify ? 'text-align: justify;' : ''} }
#output ul,#output ol { margin: .85em 0; padding-left: 1.5em; }
#output li { margin: .3em 0; }
#output blockquote { margin: 1em 0; padding: .85em .95em; border: 1px dashed #cbd5e1; background: transparent; color: #334155; border-radius: 8px; }
#output blockquote p { margin: 0; }
#output a { color: var(--md-primary-color); text-decoration: none; border-bottom: 1px solid rgba(37,99,235,.35); }
#output hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.35em 0; }
#output code { padding: .08em .28em; border-radius: 4px; background: #f1f5f9; font-size: .92em; }
#output pre { margin: 1em 0; padding: .85em; border-radius: 8px; overflow: auto; background: #0f172a; color: #e2e8f0; }
#output pre code { padding: 0; background: transparent; color: inherit; }
#output table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: .95em; }
#output th,#output td { border: 1px solid #e2e8f0; padding: .45em .6em; text-align: left; }
#output thead th { background: #eff6ff; }
#output img { max-width: 100%; display: block; margin: 1em auto; border-radius: 6px; }
#output figure { margin: 1em 0; }
#output figcaption { margin-top: .4em; text-align: center; color: #64748b; font-size: .9em; }

/* Official blocks for public account article ending */
#output .official-summary {
  margin: 1.2em 0;
  padding: 1em 1em .8em;
  border: 1px solid #e2e8f0;
  border-left: 4px solid var(--md-primary-color);
  border-radius: 8px;
  background: #f8fafc;
}

#output .official-summary-title {
  margin: 0 0 .6em;
  font-size: calc(var(--md-font-size) * 1.05);
  font-weight: 700;
  color: #0f172a;
}

#output .official-summary p,
#output .official-summary ul,
#output .official-summary ol {
  margin: 0 0 .5em;
  color: #334155;
}

#output .official-summary li {
  margin: .22em 0;
}

#output .official-disclaimer {
  margin: .6em 0 0;
  padding: .45em .7em;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
  line-height: 1.5;
}

#output .official-disclaimer strong {
  color: #374151;
}

/* QR guide block for article ending */
#output .official-qr-guide {
  margin: 1.2em 0 0;
  padding: 1em;
  border: 1px solid var(--md-primary-color);
  border-top-width: 3px;
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

#output .official-qr-title {
  margin: 0 0 .45em;
  font-size: calc(var(--md-font-size) * 1.02);
  font-weight: 700;
  color: var(--md-primary-color);
  text-align: center;
}

#output .official-qr-desc {
  margin: 0 0 .8em;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

#output .official-qr-image-wrap {
  margin: 0 auto;
  width: 132px;
  max-width: 42%;
  min-width: 120px;
  padding: 8px;
  border: 1px solid var(--md-primary-color);
  border-radius: 10px;
  background: #ffffff;
}

#output .official-qr-image-wrap img {
  margin: 0;
  width: 100%;
  border-radius: 6px;
  box-shadow: none;
}

#output .official-qr-tip {
  margin: .65em 0 0;
  font-size: 12px;
  color: var(--md-primary-color);
  text-align: center;
}
`.trim()

  function headingRule(level: HeadingLevel, style: HeadingStyleType | undefined): string {
    if (!style || style === 'default' || style === 'custom') return ''
    if (style === 'color-only') {
      return `#output ${level} { border: none; background: none; color: var(--md-primary-color); padding-left: 0; }`
    }
    if (style === 'border-bottom') {
      return `#output ${level} { border-left: none; background: none; border-bottom: 2px solid var(--md-primary-color); color: #0f172a; border-radius: 0; display: block; padding: .2em 0; }`
    }
    return `#output ${level} { background: none; border-left: 3px solid var(--md-primary-color); border-bottom: none; color: #0f172a; border-radius: 0; display: block; padding: .2em 0 .2em .6em; }`
  }

  const headingOverrides = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as HeadingLevel[])
    .map((level) => headingRule(level, headingStyles[level]))
    .filter(Boolean)
    .join('\n')

  const defaultTheme = `
#output h1 {
  display: table;
  padding: 0 1em;
  border-bottom: 2px solid var(--md-primary-color);
  margin: 2em auto 1em;
  color: hsl(var(--foreground));
  font-size: calc(var(--md-font-size) * 1.2);
  font-weight: bold;
  text-align: center;
}

#output h2 {
  display: table;
  padding: 0 0.2em;
  margin: 4em auto 2em;
  color: #fff;
  background: var(--md-primary-color);
  font-size: calc(var(--md-font-size) * 1.2);
  font-weight: bold;
  text-align: center;
}

#output h3 {
  padding-left: 8px;
  border-left: 3px solid var(--md-primary-color);
  margin: 2em 8px 0.75em 0;
  color: hsl(var(--foreground));
  font-size: calc(var(--md-font-size) * 1.1);
  font-weight: bold;
  line-height: 1.2;
}

#output h4 {
  margin: 2em 8px 0.5em;
  color: var(--md-primary-color);
  font-size: calc(var(--md-font-size) * 1);
  font-weight: bold;
}

#output h5 {
  margin: 1.5em 8px 0.5em;
  color: var(--md-primary-color);
  font-size: calc(var(--md-font-size) * 1);
  font-weight: bold;
}

#output h6 {
  margin: 1.5em 8px 0.5em;
  font-size: calc(var(--md-font-size) * 1);
  color: var(--md-primary-color);
}

#output p {
  margin: 1.5em 8px;
  letter-spacing: 0.1em;
  color: hsl(var(--foreground));
  ${isUseJustify ? 'text-align: justify;' : ''}
}

#output blockquote {
  font-style: normal;
  padding: .95em 1em;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: hsl(var(--foreground));
  background: transparent;
  margin-bottom: 1em;
}

#output blockquote > p {
  display: block;
  font-size: 1em;
  letter-spacing: 0.1em;
  color: hsl(var(--foreground));
  margin: 0;
}

#output .alert-title-note,
#output .alert-title-tip,
#output .alert-title-info,
#output .alert-title-important,
#output .alert-title-warning,
#output .alert-title-caution,
#output .alert-title-abstract,
#output .alert-title-summary,
#output .alert-title-tldr,
#output .alert-title-todo,
#output .alert-title-success,
#output .alert-title-done,
#output .alert-title-question,
#output .alert-title-help,
#output .alert-title-faq,
#output .alert-title-failure,
#output .alert-title-fail,
#output .alert-title-missing,
#output .alert-title-danger,
#output .alert-title-error,
#output .alert-title-bug,
#output .alert-title-example,
#output .alert-title-quote,
#output .alert-title-cite {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.5em;
}

#output .alert-title-note { color: #478be6; }
#output .alert-title-tip { color: #57ab5a; }
#output .alert-title-info { color: #93c5fd; }
#output .alert-title-important { color: #986ee2; }
#output .alert-title-warning { color: #c69026; }
#output .alert-title-caution { color: #e5534b; }
#output .alert-title-abstract,
#output .alert-title-summary,
#output .alert-title-tldr { color: #00bfff; }
#output .alert-title-todo { color: #478be6; }
#output .alert-title-success,
#output .alert-title-done { color: #57ab5a; }
#output .alert-title-question,
#output .alert-title-help,
#output .alert-title-faq { color: #c69026; }
#output .alert-title-failure,
#output .alert-title-fail,
#output .alert-title-missing { color: #e5534b; }
#output .alert-title-danger,
#output .alert-title-error { color: #e5534b; }
#output .alert-title-bug { color: #e5534b; }
#output .alert-title-example { color: #986ee2; }
#output .alert-title-quote,
#output .alert-title-cite { color: #9ca3af; }

#output .alert-icon-note { fill: #478be6; }
#output .alert-icon-tip { fill: #57ab5a; }
#output .alert-icon-info { fill: #93c5fd; }
#output .alert-icon-important { fill: #986ee2; }
#output .alert-icon-warning { fill: #c69026; }
#output .alert-icon-caution { fill: #e5534b; }
#output .alert-icon-abstract,
#output .alert-icon-summary,
#output .alert-icon-tldr { fill: #00bfff; }
#output .alert-icon-todo { fill: #478be6; }
#output .alert-icon-success,
#output .alert-icon-done { fill: #57ab5a; }
#output .alert-icon-question,
#output .alert-icon-help,
#output .alert-icon-faq { fill: #c69026; }
#output .alert-icon-failure,
#output .alert-icon-fail,
#output .alert-icon-missing { fill: #e5534b; }
#output .alert-icon-danger,
#output .alert-icon-error { fill: #e5534b; }
#output .alert-icon-bug { fill: #e5534b; }
#output .alert-icon-example { fill: #986ee2; }
#output .alert-icon-quote,
#output .alert-icon-cite { fill: #9ca3af; }

#output pre.code__pre,
#output .hljs.code__pre {
  font-size: 90%;
  overflow-x: auto;
  border-radius: 8px;
  padding: 0 !important;
  line-height: 1.5;
  margin: 10px 8px;
}

#output img {
  display: block;
  max-width: 100%;
  margin: 0.1em auto 0.5em;
  border-radius: 4px;
}

#output ol {
  padding-left: 1em;
  margin-left: 0;
  color: hsl(var(--foreground));
}

#output ul {
  list-style: circle;
  padding-left: 1em;
  margin-left: 0;
  color: hsl(var(--foreground));
}

#output li {
  display: block;
  margin: 0.2em 8px;
  color: hsl(var(--foreground));
}

#output p.footnotes {
  margin: 0.5em 8px;
  font-size: 80%;
  color: hsl(var(--foreground));
}

#output figure {
  margin: 1.5em 8px;
  color: hsl(var(--foreground));
}

#output figcaption,
#output .md-figcaption {
  text-align: center;
  color: #888;
  font-size: 0.8em;
}

#output hr {
  border-style: solid;
  border-width: 2px 0 0;
  border-color: rgba(0, 0, 0, 0.1);
  -webkit-transform-origin: 0 0;
  -webkit-transform: scale(1, 0.5);
  transform-origin: 0 0;
  transform: scale(1, 0.5);
  height: 0.4em;
  margin: 1.5em 0;
}

#output code {
  font-size: 90%;
  color: #d14;
  background: rgba(27, 31, 35, 0.05);
  padding: 3px 5px;
  border-radius: 4px;
}

#output pre.code__pre > code,
#output .hljs.code__pre > code {
  display: -webkit-box;
  padding: 0.5em 1em 1em;
  overflow-x: auto;
  text-indent: 0;
  color: inherit;
  background: none;
  white-space: nowrap;
  margin: 0;
}

#output em {
  font-style: italic;
  font-size: inherit;
}

#output a {
  color: #576b95;
  text-decoration: none;
}

#output strong {
  color: var(--md-primary-color);
  font-weight: bold;
  font-size: inherit;
}

#output table {
  color: hsl(var(--foreground));
}

#output thead {
  font-weight: bold;
  color: hsl(var(--foreground));
}

#output th {
  border: 1px solid #dfdfdf;
  padding: 0.25em 0.5em;
  color: hsl(var(--foreground));
  word-break: keep-all;
  background: rgba(0, 0, 0, 0.05);
}

#output td {
  border: 1px solid #dfdfdf;
  padding: 0.25em 0.5em;
  color: hsl(var(--foreground));
  word-break: keep-all;
}

#output .katex-inline {
  max-width: 100%;
  overflow-x: auto;
}

#output .katex-block {
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0.5em 0;
  text-align: center;
}

#output .markup-highlight {
  background-color: var(--md-primary-color);
  padding: 2px 4px;
  border-radius: 2px;
  color: #fff;
}

#output .markup-underline {
  text-decoration: underline;
  text-decoration-color: var(--md-primary-color);
}

#output .markup-wavyline {
  text-decoration: underline wavy;
  text-decoration-color: var(--md-primary-color);
  text-decoration-thickness: 2px;
}
`.trim()
  const graceTheme = `
#output h1 {
  padding: 0.5em 1em;
  border-bottom: 2px solid var(--md-primary-color);
  font-size: calc(var(--md-font-size) * 1.4);
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

#output h2 {
  padding: 0.3em 1em;
  border-radius: 8px;
  font-size: calc(var(--md-font-size) * 1.3);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

#output h3 {
  padding-left: 12px;
  font-size: calc(var(--md-font-size) * 1.2);
  border-left: 4px solid var(--md-primary-color);
  border-bottom: 1px dashed var(--md-primary-color);
}

#output h4 {
  font-size: calc(var(--md-font-size) * 1.1);
}

#output h5 {
  font-size: var(--md-font-size);
}

#output h6 {
  font-size: var(--md-font-size);
}

#output blockquote {
  font-style: normal;
  margin: 1em 0;
  padding: .85em 1em;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #334155;
  background: transparent;
  box-shadow: none;
}

#output blockquote > p {
  margin: 0;
  color: #334155;
  letter-spacing: .02em;
}

#output .markdown-alert {
  font-style: italic;
}

#output pre.code__pre,
#output .hljs.code__pre {
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.05);
}

#output pre.code__pre > code,
#output .hljs.code__pre > code {
  font-family: 'Fira Code', Menlo, Operator Mono, Consolas, Monaco, monospace;
}

#output img {
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

#output figcaption,
#output .md-figcaption {
  text-align: center;
  color: #888;
  font-size: 0.8em;
}

#output ol {
  padding-left: 1.5em;
}

#output ul {
  list-style: none;
  padding-left: 1.5em;
}

#output li {
  margin: 0.5em 8px;
}

#output hr {
  height: 1px;
  border: none;
  margin: 2em 0;
  background: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0));
}

#output table {
  border-collapse: separate;
  border-spacing: 0;
  border-radius: 8px;
  margin: 1em 8px;
  color: hsl(var(--foreground));
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

#output thead {
  color: #fff;
}

#output td {
  padding: 0.5em 1em;
}

#output em {
  font-style: italic;
  font-size: inherit;
}

#output a {
  color: #576b95;
  text-decoration: none;
}
`.trim()
  const simpleTheme = `
#output h1,#output h2,#output h3 { border: none; background: none; padding-left: 0; color: #0f172a; }
#output h1 { border-bottom: 2px solid #e2e8f0; text-align: left; margin-left: 0; }
#output h3 { border-left: 2px solid #e2e8f0; padding-left: .6em; }
`.trim()
  const macCodeBlock = `
#output.mac-code-block pre { position: relative; padding-top: 1.9em; }
#output.mac-code-block pre::before {
  content: "";
  position: absolute;
  left: 12px;
  top: 10px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff5f57;
  box-shadow: 16px 0 0 #ffbd2e, 32px 0 0 #28c840;
}
`.trim()

  const themeCss = themeName === 'grace'
    ? `${defaultTheme}\n\n${graceTheme}`
    : themeName === 'simple'
      ? `${defaultTheme}\n\n${simpleTheme}`
      : defaultTheme
  return [common, themeCss, headingOverrides, macCodeBlock, customCss.trim()].filter(Boolean).join('\n\n')
}

function normalizeMarkdownForWechat(raw: string): string {
  return raw
    .replace(/\*\*([^\n*]+)\*\*\s*\n+\s*([：:])/g, '**$1**$2')
    .replace(/__([^\n_]+)__\s*\n+\s*([：:])/g, '__$1__$2')
}

export function renderMarkdown(markdown: string, options: RenderOptions): string {
  const normalizedMarkdown = normalizeMarkdownForWechat(markdown || '')
  const renderer = {
    code(token: { text?: string; lang?: string }) {
      const text = token.text || ''
      const lang = (token.lang || '').trim().split(/\s+/)[0]
      const highlighted = lang && hljs.getLanguage(lang)
        ? hljs.highlight(text, { language: lang }).value
        : hljs.highlightAuto(text).value
      return `<pre><code class="hljs language-${lang || 'plaintext'}">${highlighted}</code></pre>`
    },
    image(token: { href?: string; title?: string | null; text?: string }) {
      const href = token.href || ''
      const title = token.title || ''
      const alt = token.text || ''

      let caption = ''
      if (options.legend === 'none') caption = ''
      else if (options.legend === 'title') caption = title
      else if (options.legend === 'alt') caption = alt
      else if (options.legend === 'title-alt') caption = title || alt
      else caption = alt || title

      const imageTag = `<img src="${href}" alt="${alt.replace(/"/g, '&quot;')}" />`
      if (!caption) return imageTag
      return `<figure>${imageTag}<figcaption>${caption}</figcaption></figure>`
    },
  }

  const markedInstance = new Marked({
    gfm: true,
    breaks: true,
  })
  markedInstance.use({ renderer })
  return markedInstance.parse(normalizedMarkdown) as string
}

export function generatePureHTML(raw: string): string {
  const normalizedMarkdown = normalizeMarkdownForWechat(raw || '')
  const plain = new Marked({ gfm: true, breaks: true })
  return plain.parse(normalizedMarkdown) as string
}

export function solveWeChatImage(root: HTMLElement): void {
  const images = root.getElementsByTagName('img')
  Array.from(images).forEach((image) => {
    const width = image.getAttribute('width')
    const height = image.getAttribute('height')
    if (width) {
      image.removeAttribute('width')
      image.style.width = /^\d+$/.test(width) ? `${width}px` : width
    }
    if (height) {
      image.removeAttribute('height')
      image.style.height = /^\d+$/.test(height) ? `${height}px` : height
    }
  })
}

async function getHljsStyles(): Promise<string> {
  const hljsLink = document.querySelector('#hljs') as HTMLLinkElement | null
  if (!hljsLink) return ''
  try {
    const response = await fetch(hljsLink.href)
    const cssText = await response.text()
    return `<style>${cssText}</style>`
  } catch {
    return ''
  }
}

function getThemeStyles(): string {
  const themeStyle = document.querySelector('#md-theme') as HTMLStyleElement | null
  if (!themeStyle || !themeStyle.textContent) return ''

  let cssContent = themeStyle.textContent
  cssContent = cssContent.replace(/#output\s*\{/g, 'body {')
  cssContent = cssContent.replace(/#output\s+/g, '')
  cssContent = cssContent.replace(/^#output\s*/gm, '')

  return `<style>${cssContent}</style>`
}

function mergeCss(html: string): string {
  return juice(html, {
    inlinePseudoElements: true,
    preserveImportant: true,
    resolveCSSVariables: false,
  })
}

function modifyHtmlStructure(htmlString: string): string {
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = htmlString
  tempDiv.querySelectorAll('li > ul, li > ol').forEach((originalItem) => {
    originalItem.parentElement?.insertAdjacentElement('afterend', originalItem)
  })
  return tempDiv.innerHTML
}

function createEmptyNode(): HTMLElement {
  const node = document.createElement('p')
  node.style.fontSize = '0'
  node.style.lineHeight = '0'
  node.style.margin = '0'
  node.innerHTML = '&nbsp;'
  return node
}

function flattenInlineBreaksForWechat(root: HTMLElement): void {
  root.querySelectorAll('p, li, blockquote, td, th, figcaption').forEach((node) => {
    const el = node as HTMLElement
    const breaks = Array.from(el.querySelectorAll('br'))
    breaks.forEach((br) => br.replaceWith(document.createTextNode(' ')))
    el.innerHTML = el.innerHTML.replace(/\s{2,}/g, ' ').trim()
  })
}

function wrapTextAfterStrongForWechat(root: HTMLElement): void {
  root.querySelectorAll('p, li').forEach((node) => {
    const container = node as HTMLElement
    const first = container.firstElementChild
    if (!first || first.tagName.toLowerCase() !== 'strong') return

    const next = first.nextSibling
    if (!next || next.nodeType !== Node.TEXT_NODE) return

    const text = next.textContent || ''
    if (!text.trim()) return

    const inline = document.createElement('span')
    inline.style.display = 'inline'
    inline.style.whiteSpace = 'normal'
    inline.textContent = text
    container.replaceChild(inline, next)
  })
}


async function getStylesToAdd(): Promise<string> {
  const themeStyles = getThemeStyles()
  const hljsStyles = await getHljsStyles()
  return [themeStyles, hljsStyles].filter(Boolean).join('')
}

export async function processClipboardContent(
  primaryColor: string,
  options?: { fontSize?: string; fontFamily?: string },
): Promise<void> {
  const clipboardDiv = document.getElementById('output')
  if (!clipboardDiv) {
    throw new Error('output not found')
  }

  const stylesToAdd = await getStylesToAdd()
  if (stylesToAdd) {
    clipboardDiv.innerHTML = stylesToAdd + clipboardDiv.innerHTML
  }

  clipboardDiv.innerHTML = modifyHtmlStructure(mergeCss(clipboardDiv.innerHTML))

  clipboardDiv.innerHTML = clipboardDiv.innerHTML
    .replace(/([^-])top:(.*?)em/g, '$1transform: translateY($2em)')
    .replace(/hsl\(var\(--foreground\)\)/g, '#3f3f3f')
    .replace(/var\(--blockquote-background\)/g, '#f8fafc')
    .replace(/var\(--md-primary-color\)/g, primaryColor)
    .replace(/var\(--md-font-size\)/g, options?.fontSize || '14px')
    .replace(
      /var\(--md-font-family\)/g,
      options?.fontFamily
        || '-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif',
    )
    .replace(/--md-primary-color:.+?;/g, '')
    .replace(/--md-font-family:.+?;/g, '')
    .replace(/--md-font-size:.+?;/g, '')
    .replace(
      /<span class="nodeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      '<span class="nodeLabel"$1>$2</span>',
    )
    .replace(
      /<span class="edgeLabel"([^>]*)><p[^>]*>(.*?)<\/p><\/span>/g,
      '<span class="edgeLabel"$1>$2</span>',
    )
    // avoid ":" being pushed to a new line after bold lead text
    .replace(/<\/strong>(?:\s|&nbsp;|<br\s*\/?>)+([：:])/gi, '</strong>$1')
    .replace(/\n+\s*([：:])/g, '$1')

  // WeChat editor may drop inherited root font-size and fallback to platform default (often 17px).
  // Force body-text nodes to carry explicit inline font-size/font-family for stable paste result.
  const bodyFontSize = options?.fontSize || '14px'
  const bodyFontFamily = options?.fontFamily
    || '-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif'
  clipboardDiv.querySelectorAll('p, li, td, th, blockquote, figcaption, .official-qr-desc, .official-qr-tip, .official-disclaimer')
    .forEach((el) => {
      const node = el as HTMLElement
      node.style.fontSize = bodyFontSize
      node.style.fontFamily = bodyFontFamily
    })

  flattenInlineBreaksForWechat(clipboardDiv)
  wrapTextAfterStrongForWechat(clipboardDiv)
  solveWeChatImage(clipboardDiv)

  const beforeNode = createEmptyNode()
  const afterNode = createEmptyNode()
  clipboardDiv.insertBefore(beforeNode, clipboardDiv.firstChild)
  clipboardDiv.appendChild(afterNode)

  const nodes = clipboardDiv.querySelectorAll('.nodeLabel')
  nodes.forEach((node) => {
    const parent = node.parentElement
    if (!parent) return
    const xmlns = parent.getAttribute('xmlns')
    const style = parent.getAttribute('style')
    const section = document.createElement('section')
    if (xmlns) section.setAttribute('xmlns', xmlns)
    if (style) section.setAttribute('style', style)
    section.innerHTML = parent.innerHTML

    const grand = parent.parentElement
    if (!grand) return
    grand.innerHTML = ''
    grand.appendChild(section)
  })

  clipboardDiv.innerHTML = clipboardDiv.innerHTML.replace(
    /<tspan([^>]*)>/g,
    '<tspan$1 style="fill: #333333 !important; color: #333333 !important; stroke: none !important;">',
  )

  clipboardDiv.querySelectorAll('.infographic-diagram').forEach((diagram) => {
    diagram.querySelectorAll('text').forEach((textElem) => {
      const dominantBaseline = textElem.getAttribute('dominant-baseline')
      const variantMap: Record<string, string> = {
        alphabetic: '',
        central: '0.35em',
        middle: '0.35em',
        hanging: '-0.55em',
        ideographic: '0.18em',
        'text-before-edge': '-0.85em',
        'text-after-edge': '0.15em',
      }
      if (dominantBaseline) {
        textElem.removeAttribute('dominant-baseline')
        const dy = variantMap[dominantBaseline]
        if (dy) {
          textElem.setAttribute('dy', dy)
        }
      }
    })
  })
}
