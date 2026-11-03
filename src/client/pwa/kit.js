(function () {
    const style = document.createElement('style');
    style.id = 'ao-kit-styles';
    style.textContent = `
        :root, [data-theme="dark"] {
            --ao-bg: #030712;
            --ao-surface: #071225;
            --ao-card: #081329;
            --ao-card-hover: #0c1a36;
            --ao-border: #132646;
            --ao-border-subtle: #0d1b32;
            --ao-text: #f8fafc;
            --ao-text-secondary: #94a3b8;
            --ao-muted: #64748b;
            --ao-primary: #3b82f6;
            --ao-primary-hover: #60a5fa;
            --ao-primary-btn: #2563eb;
            --ao-primary-btn-hover: #1d4ed8;
            --ao-stat-num: #3b82f6;
            --ao-accent-search: #eab308;
            --ao-input-bg: #040915;
            --ao-input-border: #132646;
            --ao-input-text: #f8fafc;
            --ao-input-placeholder: #64748b;
            --ao-pill-complete-bg: #064e3b;
            --ao-pill-complete-text: #34d399;
            --ao-pill-complete-border: #059669;
            --ao-pill-basic-bg: #1e293b;
            --ao-pill-basic-text: #93c5fd;
            --ao-pill-basic-border: #3b82f6;
            --ao-overlay: rgba(3, 7, 18, 0.78);
            --ao-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
            --ao-card-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            --ao-toggle-bg: #040915;
            --ao-toggle-active: #1e293b;
            --ao-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        [data-theme="light"] {
            --ao-bg: #f8fafc;
            --ao-surface: #f1f5f9;
            --ao-card: #ffffff;
            --ao-card-hover: #f8fafc;
            --ao-border: #e2e8f0;
            --ao-border-subtle: #edf2f7;
            --ao-text: #0f172a;
            --ao-text-secondary: #475569;
            --ao-muted: #64748b;
            --ao-primary: #2563eb;
            --ao-primary-hover: #1d4ed8;
            --ao-primary-btn: #2563eb;
            --ao-primary-btn-hover: #1d4ed8;
            --ao-stat-num: #2563eb;
            --ao-accent-search: #d97706;
            --ao-input-bg: #ffffff;
            --ao-input-border: #cbd5e1;
            --ao-input-text: #0f172a;
            --ao-input-placeholder: #94a3b8;
            --ao-pill-complete-bg: #dcfce7;
            --ao-pill-complete-text: #15803d;
            --ao-pill-complete-border: #86efac;
            --ao-pill-basic-bg: #e0f2fe;
            --ao-pill-basic-text: #0369a1;
            --ao-pill-basic-border: #7dd3fc;
            --ao-overlay: rgba(15, 23, 42, 0.6);
            --ao-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
            --ao-card-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            --ao-toggle-bg: #e2e8f0;
            --ao-toggle-active: #ffffff;
            --ao-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        ao-header, ao-stats, ao-modal {
            display: block;
            font-family: var(--ao-font);
            color: var(--ao-text);
            box-sizing: border-box;
        }

        ao-header {
            border-bottom: 1px solid var(--ao-border);
            padding-bottom: 14px;
            margin-bottom: 20px;
        }

        ao-header h1 {
            font-size: 1.35rem;
            margin: 0;
            color: var(--ao-text);
            font-weight: 700;
            letter-spacing: -0.01em;
        }

        ao-header p {
            font-size: 0.85rem;
            color: var(--ao-muted);
            margin: 4px 0 0 0;
        }

        ao-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }

        @media (max-width: 680px) {
            ao-stats {
                grid-template-columns: 1fr;
            }
        }

        .ao-stat-card {
            background: var(--ao-card);
            border: 1px solid var(--ao-border);
            border-radius: 12px;
            padding: 22px 16px;
            text-align: center;
            box-shadow: var(--ao-card-shadow);
            transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
        }

        .ao-stat-card:hover {
            border-color: var(--ao-primary);
            transform: translateY(-1px);
        }

        .ao-stat-num {
            font-size: 2rem;
            font-weight: 700;
            color: var(--ao-stat-num);
            line-height: 1.15;
            letter-spacing: -0.02em;
        }

        .ao-stat-label {
            font-size: 0.76rem;
            color: var(--ao-muted);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-top: 6px;
            font-weight: 600;
        }

        .ao-pill {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 9999px;
            font-size: 0.72rem;
            font-weight: 600;
            line-height: 1.4;
            letter-spacing: 0.02em;
            border: 1px solid transparent;
            transition: all 0.2s ease;
        }

        .ao-pill[data-status="complete"] {
            background: var(--ao-pill-complete-bg);
            color: var(--ao-pill-complete-text);
            border-color: var(--ao-pill-complete-border);
        }

        .ao-pill[data-status="basic"] {
            background: var(--ao-pill-basic-bg);
            color: var(--ao-pill-basic-text);
            border-color: var(--ao-pill-basic-border);
        }

        ao-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--ao-overlay);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            padding: 16px;
            box-sizing: border-box;
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
        }

        ao-modal[open] {
            display: flex;
        }

        .ao-modal-card {
            background: var(--ao-card);
            border-radius: 12px;
            max-width: 680px;
            width: 100%;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px -5px rgba(0, 0, 0, 0.4);
            border: 1px solid var(--ao-border);
            display: flex;
            flex-direction: column;
            position: relative;
            color: var(--ao-text);
            transition: background 0.2s ease, border-color 0.2s ease;
        }

        .ao-modal-header {
            padding: 18px 24px;
            border-bottom: 1px solid var(--ao-border);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            position: sticky;
            top: 0;
            background: var(--ao-card);
            z-index: 2;
        }

        .ao-modal-title {
            margin: 0;
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--ao-text);
            padding-right: 12px;
            line-height: 1.35;
        }

        .ao-modal-close {
            background: transparent;
            border: none;
            font-size: 1.5rem;
            line-height: 1;
            color: var(--ao-muted);
            cursor: pointer;
            padding: 0 4px;
            border-radius: 4px;
            transition: color 0.15s ease, background 0.15s ease;
        }

        .ao-modal-close:hover {
            color: var(--ao-text);
            background: var(--ao-border-subtle);
        }

        .ao-modal-body {
            padding: 24px;
            font-size: 0.92rem;
            line-height: 1.65;
            color: var(--ao-text-secondary);
            white-space: pre-wrap;
            word-break: break-word;
        }

        .ao-modal-footer {
            padding: 16px 24px;
            border-top: 1px solid var(--ao-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--ao-surface);
            border-radius: 0 0 12px 12px;
        }

        .ao-btn {
            display: inline-block;
            background: var(--ao-primary-btn);
            color: #ffffff;
            padding: 8px 18px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 0.88rem;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: background 0.15s ease;
        }

        .ao-btn:hover {
            background: var(--ao-primary-btn-hover);
        }
    `;
    document.head.appendChild(style);

    class AoHeader extends HTMLElement {
        connectedCallback() {
            const title = this.getAttribute('title') || '';
            const sub = this.getAttribute('sub') || '';
            this.innerHTML = `<h1>${escapeHtml(title)}</h1>${sub ? `<p>${escapeHtml(sub)}</p>` : ''}`;
        }
    }

    class AoStats extends HTMLElement {
        connectedCallback() {
            const raw = this.textContent.trim();
            this.innerHTML = '';
            const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                const [val, label] = line.split('|').map(s => s.trim());
                const card = document.createElement('div');
                card.className = 'ao-stat-card';
                card.innerHTML = `<div class="ao-stat-num">${escapeHtml(val || '0')}</div><div class="ao-stat-label">${escapeHtml(label || '')}</div>`;
                this.appendChild(card);
            }
        }
    }

    class AoModal extends HTMLElement {
        connectedCallback() {
            this.innerHTML = `
                <div class="ao-modal-card">
                    <div class="ao-modal-header">
                        <h2 class="ao-modal-title" id="ao-modal-title">Job Details</h2>
                        <button class="ao-modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="ao-modal-body" id="ao-modal-body"></div>
                    <div class="ao-modal-footer">
                        <span id="ao-modal-source" class="ao-pill">Direct</span>
                        <a id="ao-modal-link" class="ao-btn" href="#" target="_blank" rel="noopener">Open Source URL</a>
                    </div>
                </div>
            `;

            this.querySelector('.ao-modal-close').addEventListener('click', () => this.close());
            this.addEventListener('click', (e) => {
                if (e.target === this) this.close();
            });
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.hasAttribute('open')) this.close();
            });
        }

        open(data) {
            this.querySelector('#ao-modal-title').textContent = data.title || 'Untitled Vacancy';
            this.querySelector('#ao-modal-body').textContent = data.description || 'No detailed description captured.';
            this.querySelector('#ao-modal-source').textContent = data.source || 'Scraped';
            const linkBtn = this.querySelector('#ao-modal-link');
            if (data.url) {
                linkBtn.href = data.url;
                linkBtn.style.display = 'inline-block';
            } else {
                linkBtn.style.display = 'none';
            }
            this.setAttribute('open', '');
        }

        close() {
            this.removeAttribute('open');
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    customElements.define('ao-header', AoHeader);
    customElements.define('ao-stats', AoStats);
    customElements.define('ao-modal', AoModal);
})();