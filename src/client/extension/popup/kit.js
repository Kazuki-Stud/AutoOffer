(function () {
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --ao-bg: #f8fafc;
            --ao-card: #ffffff;
            --ao-border: #e2e8f0;
            --ao-text: #0f172a;
            --ao-muted: #64748b;
            --ao-primary: #2563eb;
            --ao-primary-hover: #1d4ed8;
            --ao-success: #059669;
            --ao-warning: #d97706;
            --ao-danger: #dc2626;
            --ao-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --ao-overlay: rgba(15, 23, 42, 0.6);
        }
        ao-report, ao-header, ao-stats, ao-vacancies, ao-callout, ao-table, ao-vacancy-detail {
            display: block;
            font-family: var(--ao-font);
            color: var(--ao-text);
            box-sizing: border-box;
        }
        ao-header {
            border-bottom: 1px solid var(--ao-border);
            padding-bottom: 12px;
            margin-bottom: 16px;
        }
        ao-header h1 {
            font-size: 1.35rem;
            margin: 0;
            color: var(--ao-text);
        }
        ao-header p {
            font-size: 0.85rem;
            color: var(--ao-muted);
            margin: 4px 0 0 0;
        }
        ao-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 10px;
            margin-bottom: 16px;
        }
        .ao-stat-card {
            background: var(--ao-card);
            border: 1px solid var(--ao-border);
            border-radius: 6px;
            padding: 12px;
            text-align: center;
        }
        .ao-stat-num {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--ao-primary);
        }
        .ao-stat-label {
            font-size: 0.75rem;
            color: var(--ao-muted);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        ao-vacancies {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .ao-card {
            background: var(--ao-card);
            border: 1px solid var(--ao-border);
            border-radius: 8px;
            padding: 14px;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .ao-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.08);
            border-color: var(--ao-primary);
        }
        .ao-card-title {
            font-size: 1rem;
            font-weight: 600;
            color: var(--ao-text);
            margin-bottom: 6px;
            line-height: 1.35;
        }
        .ao-card-meta {
            font-size: 0.8rem;
            color: var(--ao-muted);
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #f1f5f9;
        }
        .ao-pill {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 0.72rem;
            font-weight: 600;
            background: #e2e8f0;
            color: #334155;
        }
        .ao-pill[data-status="synced"] {
            background: #dcfce7;
            color: #166534;
        }
        .ao-pill[data-status="local"] {
            background: #e0f2fe;
            color: #0369a1;
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
            z-index: 10000;
            padding: 16px;
            box-sizing: border-box;
            backdrop-filter: blur(2px);
        }
        ao-modal[open] {
            display: flex;
        }
        .ao-modal-card {
            background: var(--ao-card);
            border-radius: 10px;
            max-width: 680px;
            width: 100%;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            border: 1px solid var(--ao-border);
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .ao-modal-header {
            padding: 16px 20px;
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
            font-size: 1.15rem;
            font-weight: 700;
            color: var(--ao-text);
            padding-right: 12px;
        }
        .ao-modal-close {
            background: transparent;
            border: none;
            font-size: 1.4rem;
            line-height: 1;
            color: var(--ao-muted);
            cursor: pointer;
            padding: 0 4px;
        }
        .ao-modal-close:hover {
            color: var(--ao-text);
        }
        .ao-modal-body {
            padding: 20px;
            font-size: 0.9rem;
            line-height: 1.6;
            color: #334155;
            white-space: pre-wrap;
            word-break: break-word;
        }
        .ao-modal-footer {
            padding: 14px 20px;
            border-top: 1px solid var(--ao-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8fafc;
            border-radius: 0 0 10px 10px;
        }
        .ao-btn {
            display: inline-block;
            background: var(--ao-primary);
            color: #ffffff;
            padding: 8px 16px;
            border-radius: 6px;
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 600;
            border: none;
            cursor: pointer;
        }
        .ao-btn:hover {
            background: var(--ao-primary-hover);
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