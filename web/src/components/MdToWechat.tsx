import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildThemeCss,
  generatePureHTML,
  type HeadingStyleType,
  processClipboardContent,
  renderMarkdown,
} from '../utils/mdToWechat'
import { uploadImageToGithub } from '../utils/githubImageUpload'

interface UploadedImageHistoryItem {
  url: string
  fileName: string
  uploadedAt: string
  repo: string
  branch: string
}

const UPLOAD_HISTORY_KEY = 'md_wechat_uploaded_images'
const UPLOAD_HISTORY_LIMIT = 50

const FIXED_THEME_NAME = 'grace' as const
const FIXED_FONT_FAMILY = '-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif'
const FIXED_FONT_SIZE = '14px'
const FIXED_CODE_THEME = 'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/github.min.css'
const FIXED_LEGEND = 'alt' as const
const OFFICIAL_GUIDE_TEMPLATE = `
<section class="official-qr-guide">
  <p class="official-qr-title">关注我们，获取每日 AI 精选资讯</p>
  <p class="official-qr-desc">点击下方公众号名片，第一时间获取前沿动态与深度解读。</p>
  <section class="mp_profile_iframe_wrp custom_select_card_wrp" nodeleaf=""><mp-common-profile class="mpprofile js_uneditable custom_select_card mp_profile_iframe" data-pluginname="mpprofile" data-nickname="9.AI" data-from="1" data-headimg="http://mmbiz.qpic.cn/sz_mmbiz_png/GwX6gMaSicxgDAmicclDAvB06FYAXRkd9ibzUDEKNY0VcDa2FqcS7KwiauJMNic2tEh5qP77ptKvrzcbcsO10L0U5ccmsy3PsSJvNF3h8u3OvvBo/0?wx_fmt=png" data-signature="每天9点，刷新认知" data-id="MzYzNDc3MTkzMg==" data-is-hover="1"></mp-common-profile><br class="ProseMirror-trailingBreak"></section>
  <p class="official-qr-tip">本文基于公开网络资料整理，旨在呈现AI领域动态，不代表任何立场。</p>
</section>
`.trim()

function hasOfficialGuide(markdown: string): boolean {
  return markdown.includes('<section class="official-qr-guide">')
}

function withOfficialGuide(markdown: string): string {
  const base = markdown.trimEnd()
  if (hasOfficialGuide(base)) return base
  if (!base) return `${OFFICIAL_GUIDE_TEMPLATE}\n`
  return `${base}\n\n${OFFICIAL_GUIDE_TEMPLATE}\n`
}

type ConfigurableHeadingLevel = 'h1' | 'h2' | 'h3'
const HEADING_LEVELS: ConfigurableHeadingLevel[] = ['h1', 'h2', 'h3']
const HEADING_STYLE_OPTIONS: Array<{ label: string; value: HeadingStyleType }> = [
  { label: '默认', value: 'default' },
  { label: '主题色文字', value: 'color-only' },
  { label: '下边框', value: 'border-bottom' },
  { label: '左边框', value: 'border-left' },
  { label: '自定义', value: 'custom' },
]

function colorToHex(value: string): string {
  const v = value.trim().toLowerCase()
  if (v.startsWith('#')) {
    if (v.length === 7) return v
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
    }
    return '#7a1e1e'
  }
  const match = v.match(/rgba?\(([^)]+)\)/)
  if (!match) return '#7a1e1e'
  const parts = match[1].split(',').map((s) => Number(s.trim()))
  if (parts.length < 3) return '#7a1e1e'
  const [r, g, b] = parts
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizePlainTextForWechat(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const paragraphs = normalized.split(/\n{2,}/)
  const merged = paragraphs.map((part) => part.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim())
  return merged
    .filter(Boolean)
    .join('\n\n')
    // prevent dangling colon on a new line in some editors
    .replace(/\n+\s*([：:])/g, '$1')
}

function getClipboardPlainText(container: HTMLElement): string {
  // Do not use innerText here: it introduces visual-wrap line breaks from layout width.
  return normalizePlainTextForWechat(container.textContent || '')
}

async function writeClipboardItems(items: ClipboardItem[]): Promise<void> {
  if (!navigator.clipboard?.write) {
    throw new Error('Clipboard API not available.')
  }
  await delay(0)
  await navigator.clipboard.write(items)
}

function fallbackCopyUsingExecCommand(htmlContent: string): boolean {
  const selection = window.getSelection()
  if (!selection) return false

  const tempContainer = document.createElement('div')
  tempContainer.innerHTML = htmlContent
  tempContainer.style.position = 'fixed'
  tempContainer.style.left = '-9999px'
  tempContainer.style.top = '0'
  tempContainer.style.opacity = '0'
  tempContainer.style.pointerEvents = 'none'
  tempContainer.style.setProperty('background-color', '#ffffff', 'important')
  tempContainer.style.setProperty('color', '#000000', 'important')
  document.body.appendChild(tempContainer)

  const htmlElement = document.documentElement
  const wasDark = htmlElement.classList.contains('dark')

  let successful = false
  try {
    if (wasDark) {
      htmlElement.classList.remove('dark')
    }

    const range = document.createRange()
    range.selectNodeContents(tempContainer)
    selection.removeAllRanges()
    selection.addRange(range)
    successful = document.execCommand('copy')
  } catch {
    successful = false
  } finally {
    selection.removeAllRanges()
    tempContainer.remove()
    if (wasDark) {
      htmlElement.classList.add('dark')
    }
  }

  return successful
}

export function MdToWechat() {
  const [markdown, setMarkdown] = useState('')
  const [primaryColor, setPrimaryColor] = useState('rgba(122, 30, 30, 1)')
  const [isUseJustify, setIsUseJustify] = useState(true)
  const [headingStyles, setHeadingStyles] = useState<Record<ConfigurableHeadingLevel, HeadingStyleType>>({
    h1: 'default',
    h2: 'default',
    h3: 'default',
  })
  const [customCss, setCustomCss] = useState('')
  const [lineHeight, setLineHeight] = useState(1.75)
  const [status, setStatus] = useState('')
  const [copying, setCopying] = useState(false)
  const [showCustomCss, setShowCustomCss] = useState(false)
  const [githubRepo, setGithubRepo] = useState('')
  const [githubBranch, setGithubBranch] = useState('master')
  const [githubToken, setGithubToken] = useState('')
  const [imgUploading, setImgUploading] = useState(false)
  const [uploadHistory, setUploadHistory] = useState<UploadedImageHistoryItem[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const markdownInputRef = useRef<HTMLTextAreaElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const syncingScrollRef = useRef(false)

  const outputHtml = useMemo(() => renderMarkdown(markdown, { legend: FIXED_LEGEND }), [markdown])
  const themeCss = useMemo(
    () =>
      buildThemeCss({
        themeName: FIXED_THEME_NAME,
        primaryColor,
        fontFamily: FIXED_FONT_FAMILY,
        fontSize: FIXED_FONT_SIZE,
        lineHeight,
        isUseJustify,
        headingStyles,
        customCss,
      }),
    [primaryColor, lineHeight, isUseJustify, headingStyles, customCss],
  )

  useEffect(() => {
    let mounted = true
    async function loadInitialMarkdown(): Promise<void> {
      try {
        const basePath = import.meta.env.BASE_URL || '/'
        const res = await fetch(`${basePath}data/ai-output-md/ai-analysis-24h.md`)
        if (!res.ok) return
        const text = await res.text()
        if (mounted && text.trim()) {
          setMarkdown(withOfficialGuide(text))
        }
      } catch {
        // no-op
      }
    }
    loadInitialMarkdown()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('md_wechat_github_config')
      if (!raw) return
      const cfg = JSON.parse(raw) as { repo?: string; branch?: string; token?: string }
      if (cfg.repo) setGithubRepo(cfg.repo)
      if (cfg.branch) setGithubBranch(cfg.branch)
      if (cfg.token) setGithubToken(cfg.token)
    } catch {
      // ignore bad local config
    }
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPLOAD_HISTORY_KEY)
      if (!raw) return
      const items = JSON.parse(raw) as UploadedImageHistoryItem[]
      if (Array.isArray(items)) {
        setUploadHistory(items)
      }
    } catch {
      // ignore bad local data
    }
  }, [])

  useEffect(() => {
    const head = document.head
    let hljsLink = document.getElementById('hljs') as HTMLLinkElement | null
      if (!hljsLink) {
        hljsLink = document.createElement('link')
        hljsLink.id = 'hljs'
        hljsLink.rel = 'stylesheet'
        head.appendChild(hljsLink)
      }
      hljsLink.href = FIXED_CODE_THEME

      let mdTheme = document.getElementById('md-theme') as HTMLStyleElement | null
      if (!mdTheme) {
        mdTheme = document.createElement('style')
        mdTheme.id = 'md-theme'
        head.appendChild(mdTheme)
      }
      mdTheme.textContent = themeCss
  }, [themeCss])

  useEffect(() => {
    if (!status) return
    const timer = window.setTimeout(() => setStatus(''), 2200)
    return () => window.clearTimeout(timer)
  }, [status])

  async function copyMarkdownSource(): Promise<void> {
    try {
      await navigator.clipboard.writeText(markdown)
      setStatus('已复制 Markdown 源码到剪贴板。')
    } catch (error) {
      setStatus(`复制失败：${normalizeErrorMessage(error)}`)
    }
  }

  async function copyWechatReady(): Promise<void> {
    const clipboardDiv = document.getElementById('output')
    if (!clipboardDiv) {
      setStatus('未找到复制输出区域，请刷新页面后重试。')
      return
    }

    setCopying(true)

    window.setTimeout(() => {
      void (async () => {
        try {
          await processClipboardContent(primaryColor, {
            fontSize: FIXED_FONT_SIZE,
            fontFamily: FIXED_FONT_FAMILY,
          })
        } catch (error) {
          setStatus(`处理 HTML 失败，请联系开发者。${normalizeErrorMessage(error)}`)
          clipboardDiv.innerHTML = outputHtml
          setCopying(false)
          return
        }

        clipboardDiv.focus()
        window.getSelection()?.removeAllRanges()
        const temp = clipboardDiv.innerHTML

        try {
          if (typeof ClipboardItem === 'undefined') {
            throw new TypeError('ClipboardItem is not supported in this browser.')
          }
          const plainText = getClipboardPlainText(clipboardDiv)
          const clipboardItem = new ClipboardItem({
            'text/html': new Blob([temp], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          })
          await writeClipboardItems([clipboardItem])
        } catch (error) {
          const fallbackSucceeded = fallbackCopyUsingExecCommand(temp)
          if (!fallbackSucceeded) {
            clipboardDiv.innerHTML = outputHtml
            window.getSelection()?.removeAllRanges()
            setCopying(false)
            setStatus(`复制失败，请联系开发者。${normalizeErrorMessage(error)}`)
            return
          }
        }

        clipboardDiv.innerHTML = outputHtml
        setCopying(false)
        setStatus('已复制渲染后的内容到剪贴板，可直接到公众号后台粘贴。')
      })()
    }, 350)
  }

  async function copyPureHtml(): Promise<void> {
    try {
      const html = generatePureHTML(markdown)
      await navigator.clipboard.writeText(html)
      setStatus('已复制 HTML 源码，请进行下一步操作。')
    } catch (error) {
      setStatus(`复制失败：${normalizeErrorMessage(error)}`)
    }
  }

  function resetStyle(): void {
    setPrimaryColor('rgba(122, 30, 30, 1)')
    setIsUseJustify(true)
    setHeadingStyles({
      h1: 'default',
      h2: 'default',
      h3: 'default',
    })
    setLineHeight(1.75)
    setCustomCss('')
  }

  function saveGithubConfig(): void {
    try {
      localStorage.setItem(
        'md_wechat_github_config',
        JSON.stringify({
          repo: githubRepo.trim(),
          branch: githubBranch.trim() || 'master',
          token: githubToken.trim(),
        }),
      )
      setStatus('GitHub 图床配置已保存。')
    } catch (error) {
      setStatus(`保存失败：${normalizeErrorMessage(error)}`)
    }
  }

  function insertMarkdownAtCursor(insertText: string): void {
    const ta = markdownInputRef.current
    if (!ta) {
      setMarkdown((prev) => `${prev}${insertText}`)
      return
    }
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? ta.value.length
    const current = ta.value
    const next = `${current.slice(0, start)}${insertText}${current.slice(end)}`
    setMarkdown(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + insertText.length
      ta.setSelectionRange(pos, pos)
    })
  }

  function persistUploadHistory(next: UploadedImageHistoryItem[]): void {
    setUploadHistory(next)
    localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(next))
  }

  function appendUploadHistory(item: UploadedImageHistoryItem): void {
    const next = [item, ...uploadHistory.filter((h) => h.url !== item.url)].slice(0, UPLOAD_HISTORY_LIMIT)
    persistUploadHistory(next)
  }

  async function handleImageFile(file: File): Promise<void> {
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('请选择图片文件')
      }
      if (!githubRepo.trim() || !githubToken.trim()) {
        throw new Error('请先填写并保存 GitHub 图床配置')
      }
      setImgUploading(true)
      const url = await uploadImageToGithub(file, {
        repo: githubRepo.trim(),
        branch: githubBranch.trim() || 'master',
        accessToken: githubToken.trim(),
      })
      insertMarkdownAtCursor(`\n![](${url})\n`)
      appendUploadHistory({
        url,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        repo: githubRepo.trim(),
        branch: githubBranch.trim() || 'master',
      })
      setStatus('图片上传成功，已插入 Markdown。')
    } catch (error) {
      setStatus(`上传失败：${normalizeErrorMessage(error)}`)
    } finally {
      setImgUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function onSelectImage(): void {
    fileInputRef.current?.click()
  }

  function syncScroll(from: 'markdown' | 'preview'): void {
    if (syncingScrollRef.current) return

    const mdEl = markdownInputRef.current
    const previewEl = previewScrollRef.current
    if (!mdEl || !previewEl) return

    const source = from === 'markdown' ? mdEl : previewEl
    const target = from === 'markdown' ? previewEl : mdEl

    const sourceMax = source.scrollHeight - source.clientHeight
    const targetMax = target.scrollHeight - target.clientHeight
    if (sourceMax <= 0 || targetMax <= 0) return

    const ratio = source.scrollTop / sourceMax
    syncingScrollRef.current = true
    target.scrollTop = ratio * targetMax
    window.requestAnimationFrame(() => {
      syncingScrollRef.current = false
    })
  }

  function useHistoryImage(url: string): void {
    insertMarkdownAtCursor(`\n![](${url})\n`)
    setStatus('已从历史记录插入图片链接。')
  }

  function insertOfficialGuideTemplate(): void {
    insertMarkdownAtCursor(`\n\n${OFFICIAL_GUIDE_TEMPLATE}\n`)
    setStatus('已插入公众号引导。')
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">MD 转公众号排版</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">复制渲染结果后可直接粘贴到公众号后台</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-ghost text-sm py-1.5 px-3" onClick={copyMarkdownSource}>
              复制 Markdown
            </button>
            <button className="btn btn-ghost text-sm py-1.5 px-3" onClick={copyPureHtml}>
              复制 HTML
            </button>
            <button className="btn btn-ghost text-sm py-1.5 px-3" onClick={insertOfficialGuideTemplate}>
              插入公众号引导
            </button>
            <button className="btn btn-primary text-sm py-1.5 px-3" onClick={copyWechatReady} disabled={copying}>
              {copying ? '复制中...' : '复制到微信公众号'}
            </button>
            <button className="btn btn-ghost text-sm py-1.5 px-3" onClick={resetStyle}>
              重置样式
            </button>
          </div>
        </div>
        {status && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">{status}</p>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="card p-4 space-y-3 xl:sticky xl:top-20 max-h-[82vh] overflow-auto">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">样式与图片设置</h3>
          <div className="grid grid-cols-1 gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400 p-2 rounded border border-slate-200 dark:border-slate-700">
              主题：优雅 ｜ 字体：无衬线 ｜ 字号：14px
            </div>
            <label className="text-xs text-slate-500 dark:text-slate-400">
              主色
              <input
                type="color"
                value={colorToHex(primaryColor)}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-slate-300 dark:border-slate-600"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-slate-400">
              行高 {lineHeight.toFixed(2)}
              <input
                type="range"
                min={1.6}
                max={2.2}
                step={0.05}
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <input
                type="checkbox"
                checked={isUseJustify}
                onChange={(e) => setIsUseJustify(e.target.checked)}
                className="rounded"
              />
              段落两端对齐
            </label>
          </div>

          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">标题样式</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {HEADING_LEVELS.map((level) => (
                <label key={level} className="text-xs text-slate-500 dark:text-slate-400">
                  {level.toUpperCase()}
                  <select
                    className="input mt-1 py-2"
                    value={headingStyles[level]}
                    onChange={(e) =>
                      setHeadingStyles((prev) => ({
                        ...prev,
                        [level]: e.target.value as HeadingStyleType,
                      }))
                    }
                  >
                    {HEADING_STYLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div>
            <button className="btn btn-ghost text-sm py-1.5 px-3" onClick={() => setShowCustomCss((v) => !v)}>
              {showCustomCss ? '隐藏自定义 CSS' : '显示自定义 CSS'}
            </button>
            {showCustomCss && (
              <textarea
                value={customCss}
                onChange={(e) => setCustomCss(e.target.value)}
                className="input mt-2 min-h-[140px] font-mono text-xs leading-5"
                placeholder="在此输入附加样式，例如：#output h2 { letter-spacing: .05em; }"
              />
            )}
          </div>

          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">插入图片（GitHub 图床）</p>
            <div className="grid grid-cols-1 gap-2">
              <input
                className="input py-2 text-sm"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="owner/repo 或 github.com/owner/repo"
              />
              <input
                className="input py-2 text-sm"
                value={githubBranch}
                onChange={(e) => setGithubBranch(e.target.value)}
                placeholder="分支，默认 master"
              />
            </div>
            <input
              className="input py-2 text-sm"
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="GitHub Personal Access Token"
            />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost text-sm py-1.5 px-3" onClick={saveGithubConfig}>
                保存 GitHub 配置
              </button>
              <button className="btn btn-primary text-sm py-1.5 px-3" onClick={onSelectImage} disabled={imgUploading}>
                {imgUploading ? '上传中...' : '选择图片并插入'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    void handleImageFile(file)
                  }
                }}
              />
            </div>
            {uploadHistory.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">上传历史（最近 {uploadHistory.length} 条）</p>
                <div className="max-h-36 overflow-auto space-y-1">
                  {uploadHistory.map((item) => (
                    <button
                      key={`${item.url}-${item.uploadedAt}`}
                      className="w-full text-left text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => useHistoryImage(item.url)}
                      title={item.url}
                    >
                      <span className="block truncate">{item.fileName}</span>
                      <span className="block text-slate-400 truncate">{item.url}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3">Markdown</h3>
          <textarea
            ref={markdownInputRef}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            onScroll={() => syncScroll('markdown')}
            className="input h-[72vh] font-mono text-sm leading-6 overflow-auto"
            spellCheck={false}
            placeholder="在这里输入 Markdown..."
          />
        </div>

        <div className="card p-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3">公众号预览</h3>
          <div
            ref={previewScrollRef}
            onScroll={() => syncScroll('preview')}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-4 h-[72vh] overflow-auto"
          >
            <section
              id="output"
              className="w-full mac-code-block"
              dangerouslySetInnerHTML={{ __html: outputHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
