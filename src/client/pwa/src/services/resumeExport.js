import { escapeHtml } from '../utils/helpers.js';

export function buildResumeDocumentHtml({ profile = {}, resume = {} }) {
    const title = (resume.title || '').trim();
    const summary = (resume.summary || '').trim();
    const plainText = (resume.plain_text || '').trim();
    const skills = Array.isArray(resume.skills) ? resume.skills : [];

    const fullName =
        `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
        profile.profile_name ||
        'Candidate';
    const contactLine = [profile.email, profile.phone, profile.location, profile.links]
        .filter(Boolean)
        .join('  |  ');
    const bodyParagraphs = (plainText || summary || '')
        .split(/\r?\n/)
        .map((line) => `<p>${escapeHtml(line) || '&nbsp;'}</p>`)
        .join('');

    return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(fullName)} - ${escapeHtml(title || 'Resume')}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.5; margin: 0; padding: 24px; }
  h1 { font-size: 22pt; margin: 0 0 4px 0; color: #0f172a; }
  .subtitle { font-size: 13pt; font-weight: 600; color: #1d4ed8; margin-bottom: 6px; }
  .contact { font-size: 9.5pt; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 10px; margin-bottom: 16px; }
  h2 { font-size: 11.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 16px 0 8px 0; }
  p { font-size: 10.5pt; margin: 0 0 6px 0; }
  .skills { font-size: 10.5pt; }
</style>
</head>
<body>
  <h1>${escapeHtml(fullName)}</h1>
  ${title ? `<div class="subtitle">${escapeHtml(title)}</div>` : ''}
  ${contactLine ? `<div class="contact">${escapeHtml(contactLine)}</div>` : ''}
  ${summary ? `<h2>Summary</h2><p>${escapeHtml(summary)}</p>` : ''}
  ${skills.length ? `<h2>Skills</h2><p class="skills">${escapeHtml(skills.join(' • '))}</p>` : ''}
  <h2>Experience & Details</h2>
  ${bodyParagraphs}
</body>
</html>`;
}

export function exportResumeAsWord(payload) {
    const title = (payload?.resume?.title || '').trim() || 'resume';
    const html = buildResumeDocumentHtml(payload);
    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'resume'}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
}

export function exportResumeAsPdf(payload, iframeEl) {
    if (!iframeEl) return;
    const html = buildResumeDocumentHtml(payload);
    iframeEl.onload = () => {
        iframeEl.contentWindow.focus();
        iframeEl.contentWindow.print();
    };
    iframeEl.srcdoc = html;
}
