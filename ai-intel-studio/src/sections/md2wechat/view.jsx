import { useEffect, useMemo, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';

import { paths } from 'src/routes/paths';

import { DashboardContent } from 'src/layouts/dashboard';

import { CustomBreadcrumbs } from 'src/components/custom-breadcrumbs';

import { uploadImageToGithub } from './githubImageUpload';
import {
  buildThemeCss,
  generatePureHTML,
  processClipboardContent,
  renderMarkdown,
} from './mdToWechat';

const UPLOAD_HISTORY_KEY = 'md_wechat_uploaded_images';
const UPLOAD_HISTORY_LIMIT = 50;
const FIXED_THEME_NAME = 'grace';
const FIXED_FONT_FAMILY =
  '-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Arial, sans-serif';
const FIXED_FONT_SIZE = '14px';
const FIXED_CODE_THEME =
  'https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/npm/highlightjs/11.11.1/styles/github.min.css';
const FIXED_LEGEND = 'alt';
const HEADING_LEVELS = ['h1', 'h2', 'h3'];
const HEADING_STYLE_OPTIONS = [
  { label: '默认', value: 'default' },
  { label: '主题色文字', value: 'color-only' },
  { label: '下边框', value: 'border-bottom' },
  { label: '左边框', value: 'border-left' },
  { label: '自定义', value: 'custom' },
];

const OFFICIAL_GUIDE_TEMPLATE = `
<section class="official-qr-guide">
  <p class="official-qr-title">关注我们，获取每日 AI 精选资讯</p>
  <p class="official-qr-desc">点击下方公众号名片，第一时间获取前沿动态与深度解读。</p>
  <section class="mp_profile_iframe_wrp custom_select_card_wrp" nodeleaf=""><mp-common-profile class="mpprofile js_uneditable custom_select_card mp_profile_iframe" data-pluginname="mpprofile" data-nickname="9.AI" data-from="1" data-headimg="http://mmbiz.qpic.cn/sz_mmbiz_png/GwX6gMaSicxgDAmicclDAvB06FYAXRkd9ibzUDEKNY0VcDa2FqcS7KwiauJMNic2tEh5qP77ptKvrzcbcsO10L0U5ccmsy3PsSJvNF3h8u3OvvBo/0?wx_fmt=png" data-signature="每天9点，刷新认知" data-id="MzYzNDc3MTkzMg==" data-is-hover="1"></mp-common-profile><br class="ProseMirror-trailingBreak"></section>
  <p class="official-qr-tip">本文基于公开网络资料整理，旨在呈现AI领域动态，不代表任何立场。</p>
</section>
`.trim();

function hasOfficialGuide(markdown) {
  return markdown.includes('<section class="official-qr-guide">');
}

function withOfficialGuide(markdown) {
  const base = markdown.trimEnd();
  if (hasOfficialGuide(base)) return base;
  if (!base) return `${OFFICIAL_GUIDE_TEMPLATE}\n`;
  return `${base}\n\n${OFFICIAL_GUIDE_TEMPLATE}\n`;
}

function colorToHex(value) {
  const v = value.trim().toLowerCase();
  if (v.startsWith('#')) {
    if (v.length === 7) return v;
    if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    return '#7a1e1e';
  }
  const match = v.match(/rgba?\(([^)]+)\)/);
  if (!match) return '#7a1e1e';
  const parts = match[1].split(',').map((s) => Number(s.trim()));
  if (parts.length < 3) return '#7a1e1e';
  const [r, g, b] = parts;
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizePlainTextForWechat(value) {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split(/\n{2,}/);
  const merged = paragraphs.map((part) => part.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim());
  return merged
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n+\s*([：:])/g, '$1');
}

function getClipboardPlainText(container) {
  return normalizePlainTextForWechat(container.textContent || '');
}

async function writeClipboardItems(items) {
  if (!navigator.clipboard?.write) {
    throw new Error('Clipboard API not available.');
  }
  await delay(0);
  await navigator.clipboard.write(items);
}

function fallbackCopyUsingExecCommand(htmlContent) {
  const selection = window.getSelection();
  if (!selection) return false;

  const tempContainer = document.createElement('div');
  tempContainer.innerHTML = htmlContent;
  tempContainer.style.position = 'fixed';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '0';
  tempContainer.style.opacity = '0';
  tempContainer.style.pointerEvents = 'none';
  tempContainer.style.setProperty('background-color', '#ffffff', 'important');
  tempContainer.style.setProperty('color', '#000000', 'important');
  document.body.appendChild(tempContainer);

  const htmlElement = document.documentElement;
  const wasDark = htmlElement.classList.contains('dark');

  let successful = false;
  try {
    if (wasDark) {
      htmlElement.classList.remove('dark');
    }

    const range = document.createRange();
    range.selectNodeContents(tempContainer);
    selection.removeAllRanges();
    selection.addRange(range);
    successful = document.execCommand('copy');
  } catch {
    successful = false;
  } finally {
    selection.removeAllRanges();
    tempContainer.remove();
    if (wasDark) {
      htmlElement.classList.add('dark');
    }
  }

  return successful;
}

export function Md2WechatView() {
  const [markdown, setMarkdown] = useState('');
  const [primaryColor, setPrimaryColor] = useState('rgba(122, 30, 30, 1)');
  const [isUseJustify, setIsUseJustify] = useState(true);
  const [headingStyles, setHeadingStyles] = useState({ h1: 'default', h2: 'default', h3: 'default' });
  const [customCss, setCustomCss] = useState('');
  const [lineHeight, setLineHeight] = useState(1.75);
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const [showCustomCss, setShowCustomCss] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  const [githubBranch, setGithubBranch] = useState('master');
  const [githubToken, setGithubToken] = useState('');
  const [imgUploading, setImgUploading] = useState(false);
  const [uploadHistory, setUploadHistory] = useState([]);

  const fileInputRef = useRef(null);
  const markdownInputRef = useRef(null);
  const previewScrollRef = useRef(null);
  const syncingScrollRef = useRef(false);

  const outputHtml = useMemo(() => renderMarkdown(markdown, { legend: FIXED_LEGEND }), [markdown]);
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
    [primaryColor, lineHeight, isUseJustify, headingStyles, customCss]
  );

  useEffect(() => {
    let mounted = true;
    async function loadInitialMarkdown() {
      try {
        const basePath = import.meta.env.BASE_URL || '/';
        const res = await fetch(`${basePath}data/ai-output-md/ai-analysis-24h.md`);
        if (!res.ok) return;
        const text = await res.text();
        if (mounted && text.trim()) {
          setMarkdown(withOfficialGuide(text));
        }
      } catch {
        // no-op
      }
    }
    loadInitialMarkdown();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('md_wechat_github_config');
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if (cfg.repo) setGithubRepo(cfg.repo);
      if (cfg.branch) setGithubBranch(cfg.branch);
      if (cfg.token) setGithubToken(cfg.token);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPLOAD_HISTORY_KEY);
      if (!raw) return;
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        setUploadHistory(items);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const head = document.head;
    let hljsLink = document.getElementById('hljs');
    if (!hljsLink) {
      hljsLink = document.createElement('link');
      hljsLink.id = 'hljs';
      hljsLink.rel = 'stylesheet';
      head.appendChild(hljsLink);
    }
    hljsLink.href = FIXED_CODE_THEME;

    let mdTheme = document.getElementById('md-theme');
    if (!mdTheme) {
      mdTheme = document.createElement('style');
      mdTheme.id = 'md-theme';
      head.appendChild(mdTheme);
    }
    mdTheme.textContent = themeCss;
  }, [themeCss]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = window.setTimeout(() => setStatus(''), 2200);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copyMarkdownSource() {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus('已复制 Markdown 源码到剪贴板。');
    } catch (error) {
      setStatus(`复制失败：${normalizeErrorMessage(error)}`);
    }
  }

  async function copyWechatReady() {
    const clipboardDiv = document.getElementById('output');
    if (!clipboardDiv) {
      setStatus('未找到复制输出区域，请刷新页面后重试。');
      return;
    }

    setCopying(true);

    window.setTimeout(() => {
      void (async () => {
        try {
          await processClipboardContent(primaryColor, {
            fontSize: FIXED_FONT_SIZE,
            fontFamily: FIXED_FONT_FAMILY,
          });
        } catch (error) {
          setStatus(`处理 HTML 失败，请联系开发者。${normalizeErrorMessage(error)}`);
          clipboardDiv.innerHTML = outputHtml;
          setCopying(false);
          return;
        }

        clipboardDiv.focus();
        window.getSelection()?.removeAllRanges();
        const temp = clipboardDiv.innerHTML;

        try {
          if (typeof ClipboardItem === 'undefined') {
            throw new TypeError('ClipboardItem is not supported in this browser.');
          }
          const plainText = getClipboardPlainText(clipboardDiv);
          const clipboardItem = new ClipboardItem({
            'text/html': new Blob([temp], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          });
          await writeClipboardItems([clipboardItem]);
        } catch (error) {
          const fallbackSucceeded = fallbackCopyUsingExecCommand(temp);
          if (!fallbackSucceeded) {
            clipboardDiv.innerHTML = outputHtml;
            window.getSelection()?.removeAllRanges();
            setCopying(false);
            setStatus(`复制失败，请联系开发者。${normalizeErrorMessage(error)}`);
            return;
          }
        }

        clipboardDiv.innerHTML = outputHtml;
        setCopying(false);
        setStatus('已复制渲染后的内容到剪贴板，可直接到公众号后台粘贴。');
      })();
    }, 350);
  }

  async function copyPureHtml() {
    try {
      const html = generatePureHTML(markdown);
      await navigator.clipboard.writeText(html);
      setStatus('已复制 HTML 源码，请进行下一步操作。');
    } catch (error) {
      setStatus(`复制失败：${normalizeErrorMessage(error)}`);
    }
  }

  function resetStyle() {
    setPrimaryColor('rgba(122, 30, 30, 1)');
    setIsUseJustify(true);
    setHeadingStyles({ h1: 'default', h2: 'default', h3: 'default' });
    setLineHeight(1.75);
    setCustomCss('');
  }

  function saveGithubConfig() {
    try {
      localStorage.setItem(
        'md_wechat_github_config',
        JSON.stringify({
          repo: githubRepo.trim(),
          branch: githubBranch.trim() || 'master',
          token: githubToken.trim(),
        })
      );
      setStatus('GitHub 图床配置已保存。');
    } catch (error) {
      setStatus(`保存失败：${normalizeErrorMessage(error)}`);
    }
  }

  function insertMarkdownAtCursor(insertText) {
    const ta = markdownInputRef.current;
    if (!ta) {
      setMarkdown((prev) => `${prev}${insertText}`);
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const current = ta.value;
    const next = `${current.slice(0, start)}${insertText}${current.slice(end)}`;
    setMarkdown(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + insertText.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function persistUploadHistory(next) {
    setUploadHistory(next);
    localStorage.setItem(UPLOAD_HISTORY_KEY, JSON.stringify(next));
  }

  function appendUploadHistory(item) {
    const next = [item, ...uploadHistory.filter((h) => h.url !== item.url)].slice(0, UPLOAD_HISTORY_LIMIT);
    persistUploadHistory(next);
  }

  async function handleImageFile(file) {
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('请选择图片文件');
      }
      if (!githubRepo.trim() || !githubToken.trim()) {
        throw new Error('请先填写并保存 GitHub 图床配置');
      }
      setImgUploading(true);
      const url = await uploadImageToGithub(file, {
        repo: githubRepo.trim(),
        branch: githubBranch.trim() || 'master',
        accessToken: githubToken.trim(),
      });
      insertMarkdownAtCursor(`\n![](${url})\n`);
      appendUploadHistory({
        url,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        repo: githubRepo.trim(),
        branch: githubBranch.trim() || 'master',
      });
      setStatus('图片上传成功，已插入 Markdown。');
    } catch (error) {
      setStatus(`上传失败：${normalizeErrorMessage(error)}`);
    } finally {
      setImgUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function syncScroll(from) {
    if (syncingScrollRef.current) return;

    const mdEl = markdownInputRef.current;
    const previewEl = previewScrollRef.current;
    if (!mdEl || !previewEl) return;

    const source = from === 'markdown' ? mdEl : previewEl;
    const target = from === 'markdown' ? previewEl : mdEl;

    const sourceMax = source.scrollHeight - source.clientHeight;
    const targetMax = target.scrollHeight - target.clientHeight;
    if (sourceMax <= 0 || targetMax <= 0) return;

    const ratio = source.scrollTop / sourceMax;
    syncingScrollRef.current = true;
    target.scrollTop = ratio * targetMax;
    window.requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }

  function insertHistoryImage(url) {
    insertMarkdownAtCursor(`\n![](${url})\n`);
    setStatus('已从历史记录插入图片链接。');
  }

  function insertOfficialGuideTemplate() {
    insertMarkdownAtCursor(`\n\n${OFFICIAL_GUIDE_TEMPLATE}\n`);
    setStatus('已插入公众号引导。');
  }

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={3}>
        <CustomBreadcrumbs
          heading="公众号排版"
          links={[
            { name: '首页', href: paths.dashboard.general.home },
            { name: '公众号排版' },
          ]}
          action={
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Button variant="outlined" onClick={copyMarkdownSource}>复制 Markdown</Button>
              <Button variant="outlined" onClick={copyPureHtml}>复制 HTML</Button>
              <Button variant="outlined" onClick={insertOfficialGuideTemplate}>插入公众号引导</Button>
              <Button variant="contained" onClick={copyWechatReady} disabled={copying}>
                {copying ? '复制中...' : '复制到微信公众号'}
              </Button>
              <Button variant="text" onClick={resetStyle}>重置样式</Button>
            </Stack>
          }
          sx={{ mb: { xs: 3, md: 5 } }}
        />

        {!!status && <Alert severity={status.includes('失败') ? 'error' : 'success'}>{status}</Alert>}

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', xl: '340px 1fr 1fr' },
            alignItems: 'start',
          }}
        >
          <Card sx={{ p: 2, maxHeight: { xl: '82vh' }, overflow: 'auto', position: { xl: 'sticky' }, top: { xl: 88 } }}>
            <Stack spacing={2}>
              <Typography variant="subtitle1">样式与图片设置</Typography>

              <Box sx={{ p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider', fontSize: 12, color: 'text.secondary' }}>
                主题：优雅 ｜ 字体：无衬线 ｜ 字号：14px
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">主色</Typography>
                <Box sx={{ mt: 1 }}>
                  <input
                    type="color"
                    value={colorToHex(primaryColor)}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    style={{ height: 36, width: '100%', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">行高 {lineHeight.toFixed(2)}</Typography>
                <Slider min={1.6} max={2.2} step={0.05} value={lineHeight} onChange={(_, v) => setLineHeight(Number(v))} />
              </Box>

              <FormControlLabel
                control={<Checkbox checked={isUseJustify} onChange={(e) => setIsUseJustify(e.target.checked)} />}
                label="段落两端对齐"
              />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  标题样式
                </Typography>
                <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                  {HEADING_LEVELS.map((level) => (
                    <FormControl key={level} size="small" fullWidth>
                      <InputLabel>{level.toUpperCase()}</InputLabel>
                      <Select
                        label={level.toUpperCase()}
                        value={headingStyles[level]}
                        onChange={(e) =>
                          setHeadingStyles((prev) => ({
                            ...prev,
                            [level]: e.target.value,
                          }))
                        }
                      >
                        {HEADING_STYLE_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ))}
                </Box>
              </Box>

              <Box>
                <Button variant="text" onClick={() => setShowCustomCss((v) => !v)}>
                  {showCustomCss ? '隐藏自定义 CSS' : '显示自定义 CSS'}
                </Button>
                {showCustomCss && (
                  <TextField
                    value={customCss}
                    onChange={(e) => setCustomCss(e.target.value)}
                    multiline
                    minRows={6}
                    fullWidth
                    placeholder="在此输入附加样式，例如：#output h2 { letter-spacing: .05em; }"
                  />
                )}
              </Box>

              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>插入图片（GitHub 图床）</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  <TextField
                    size="small"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="owner/repo 或 github.com/owner/repo"
                  />
                  <TextField
                    size="small"
                    value={githubBranch}
                    onChange={(e) => setGithubBranch(e.target.value)}
                    placeholder="分支，默认 master"
                  />
                  <TextField
                    size="small"
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="GitHub Personal Access Token"
                  />
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                    <Button variant="outlined" size="small" onClick={saveGithubConfig}>保存 GitHub 配置</Button>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={imgUploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {imgUploading ? '上传中...' : '选择图片并插入'}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleImageFile(file);
                        }
                      }}
                    />
                  </Stack>

                  {uploadHistory.length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        上传历史（最近 {uploadHistory.length} 条）
                      </Typography>
                      <Stack spacing={0.5} sx={{ mt: 1, maxHeight: 144, overflow: 'auto' }}>
                        {uploadHistory.map((item) => (
                          <Button
                            key={`${item.url}-${item.uploadedAt}`}
                            variant="outlined"
                            size="small"
                            sx={{
                              justifyContent: 'flex-start',
                              textTransform: 'none',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'block',
                              textAlign: 'left',
                            }}
                            onClick={() => insertHistoryImage(item.url)}
                            title={item.url}
                          >
                            {item.fileName}
                          </Button>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </Box>
            </Stack>
          </Card>

          <Card sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1.5 }}>Markdown</Typography>
            <TextField
              inputRef={markdownInputRef}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              onScroll={() => syncScroll('markdown')}
              multiline
              fullWidth
              minRows={30}
              placeholder="在这里输入 Markdown..."
              InputProps={{
                sx: {
                  height: '72vh',
                  alignItems: 'flex-start',
                  overflow: 'auto',
                  '& textarea': {
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
                    fontSize: 14,
                    lineHeight: 1.7,
                    overflow: 'auto !important',
                    height: '72vh !important',
                  },
                },
              }}
            />
          </Card>

          <Card sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1.5 }}>公众号预览</Typography>
            <Box
              ref={previewScrollRef}
              onScroll={() => syncScroll('preview')}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                bgcolor: 'background.paper',
                p: 2,
                height: '72vh',
                overflow: 'auto',
              }}
            >
              <section id="output" className="mac-code-block" dangerouslySetInnerHTML={{ __html: outputHtml }} />
            </Box>
          </Card>
        </Box>
      </Stack>
    </DashboardContent>
  );
}
