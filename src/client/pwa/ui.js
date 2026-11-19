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
                        <button id="ao-modal-apply-btn" class="ao-btn" type="button" style="display: none;">Review &amp; Apply</button>
                        <a id="ao-modal-link" class="ao-btn" href="#" target="_blank" rel="noopener">Open Source URL</a>
                    </div>
                </div>
            </div>
        `;

        this.querySelector('.ao-modal-close').addEventListener('click', () => this.close());
        this.querySelector('#ao-modal-apply-btn').addEventListener('click', () => {
                const item = this._rawItem;
                this.close();
                if (item) {
                    window.dispatchEvent(new CustomEvent('ao-modal-review-apply', { detail: item }));
                }
        });
        this.addEventListener('click', (e) => {
                if (e.target === this) this.close();
        });
        window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.hasAttribute('open')) this.close();
        });
    }

    open(data) {
        this._rawItem = data.rawItem || null;
        this.querySelector('#ao-modal-title').textContent = data.title || 'Untitled Vacancy';
        this.querySelector('#ao-modal-source').textContent = data.source || 'Scraped';

        const bodyEl = this.querySelector('#ao-modal-body');
        bodyEl.innerHTML = '';

        const metaItems = Array.isArray(data.metaItems) ? data.metaItems.filter((m) => m && m.value) : [];
        if (metaItems.length) {
            const metaGrid = document.createElement('div');
            metaGrid.className = 'ao-modal-meta-grid';
            for (const m of metaItems) {
                const cell = document.createElement('div');
                cell.className = 'ao-modal-meta-item';
                cell.innerHTML = `
                <span class="ao-modal-meta-label">${escapeHtml(m.label)}</span>
                <span class="ao-modal-meta-value">${escapeHtml(m.value)}</span>
            `;
            metaGrid.appendChild(cell);
        }
        bodyEl.appendChild(metaGrid);
    }

    const skills = Array.isArray(data.skills) ? data.skills.filter(Boolean) : [];
    if (skills.length) {
        const skillsSec = document.createElement('div');
        skillsSec.className = 'ao-modal-section';
        const heading = document.createElement('h3');
        heading.className = 'ao-modal-section-title';
        heading.textContent = 'Detected & Tagged Skills';
        const row = document.createElement('div');
        row.className = 'skill-chips-row';
        for (const sk of skills) {
            const chip = document.createElement('span');
            chip.className = 'skill-chip-sm';
            chip.textContent = sk;
            row.appendChild(chip);
        }
        skillsSec.append(heading, row);
        bodyEl.appendChild(skillsSec);
    }

    const descSec = document.createElement('div');
    descSec.className = 'ao-modal-section';
    const descHeading = document.createElement('h3');
    descHeading.className = 'ao-modal-section-title';
    descHeading.textContent = 'Job Description';
    const descContent = document.createElement('div');
    descContent.className = 'ao-modal-desc';
    descContent.innerHTML = formatDescriptionHtml(data.description || 'No detailed description captured.');
    descSec.append(descHeading, descContent);
    bodyEl.appendChild(descSec);

    const applyBtn = this.querySelector('#ao-modal-apply-btn');
    if (applyBtn) {
        applyBtn.style.display = this._rawItem ? 'inline-block' : 'none';
    }
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

function formatDescriptionHtml(raw) {
const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
const out = [];
let listItems = [];

    const flushList = () => {
        if (listItems.length) {
            out.push(`<ul>${listItems.map((li) => `<li>${escapeHtml(li)}</li>`).join('')}</ul>`);
            listItems = [];
        }
    };

    const headingRe = /^(?:about(?:\s+the)?\s+(?:role|job|company|team|us)|responsibilities|requirements|qualifications|preferred\s+qualifications|what\s+you(?:'|’)ll\s+do|what\s+we\s+offer|benefits|perks|skills|tech\s+stack|nice\s+to\s+have|overview|summary)\b/i;

    for (const line of lines) {
        const t = line.trim();
        if (!t) {
            flushList();
            continue;
        }
        const bulletMatch = t.match(/^(?:[•●▪◦\-*]|\d+[.)])\s+(.+)$/);
        if (bulletMatch) {
            listItems.push(bulletMatch[1].trim());
            continue;
        }
        flushList();
        const isHeading = (t.length <= 70 && /:$/.test(t)) || (t.length <= 50 && headingRe.test(t));
        if (isHeading) {
            out.push(`<h4>${escapeHtml(t.replace(/:$/, ''))}</h4>`);
        } else {
            out.push(`<p>${escapeHtml(t)}</p>`);
        }
    }
    flushList();
    return out.join('') || `<p>${escapeHtml(raw)}</p>`;
}

if (!customElements.get('ao-stats')) customElements.define('ao-stats', AoStats);
if (!customElements.get('ao-modal')) customElements.define('ao-modal', AoModal);