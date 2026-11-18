function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export const AoTheme = {
    initTheme() {
        const saved = localStorage.getItem('ao_theme');
        const next = saved === 'light' || saved === 'dark'
            ? saved
            : (document.documentElement.getAttribute('data-theme') || 'dark');
        document.documentElement.setAttribute('data-theme', next);
        return next;
    },
    getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'dark';
    },
    setTheme(theme) {
        const next = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ao_theme', next);
        window.dispatchEvent(new CustomEvent('ao-theme-changed', { detail: { theme: next } }));
        return next;
    },
    toggleTheme() {
        const next = AoTheme.getTheme() === 'dark' ? 'light' : 'dark';
        return AoTheme.setTheme(next);
    },
};

class AoStats extends HTMLElement {
    connectedCallback() {
        if (!this.children.length) {
            this.render(this.textContent);
        }
    }

    render(rawText) {
        const raw = (rawText !== undefined ? rawText : this.textContent).trim();
        this.innerHTML = '';
        if (!raw) return;
        const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
            const [val, label] = line.split('|').map((s) => s.trim());
            const card = document.createElement('div');
            card.className = 'ao-stat-card';
            card.innerHTML = `<div class="ao-stat-num">${escapeHtml(val || '0')}</div><div class="ao-stat-label">${escapeHtml(label || '')}</div>`;
            this.appendChild(card);
        }
    }
}

class AoModal extends HTMLElement {
    connectedCallback() {
        if (this.children.length) return;
        this.innerHTML = `
            <div class="ao-modal-card">
                <div class="ao-modal-header">
                    <h2 class="ao-modal-title" id="ao-modal-title">Job Details</h2>
                    <button class="ao-modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="ao-modal-body" id="ao-modal-body"></div>
                <div class="ao-modal-footer">
                    <span id="ao-modal-source" class="ao-pill">Direct</span>
                    <div class="ao-modal-footer-actions">
                        <a id="ao-modal-link" class="ao-btn" href="#" target="_blank" rel="noopener">Open Source URL</a>
                    </div>
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
        if (data.url && data.url !== '#') {
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

if (!customElements.get('ao-stats')) customElements.define('ao-stats', AoStats);
if (!customElements.get('ao-modal')) customElements.define('ao-modal', AoModal);