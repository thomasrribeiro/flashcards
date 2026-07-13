/**
 * Analytics dashboard — inline SVG, no chart library (keeps the no-framework,
 * near-zero-dependency character of the app). Renders:
 *   - a calendar-aligned, one-year review heatmap
 *   - weekly retention (recall accuracy) line
 *   - projected due load over the next 30 days
 *   - per-deck reviewed counts
 */

import { getCurrentUser } from './storage.js';
import { getHabitStatus, levelForXp } from './habit-client.js';
import { getLocalDate } from './today-queue.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';
const GOLD = '#F5C842';
const INK = '#1a1a1a';

async function fetchStats() {
    const user = getCurrentUser();
    if (!user) return null;
    const id = user.github_id || user.id;
    try {
        const resp = await fetch(`${WORKER_URL}/api/stats/${id}?days=365`);
        if (!resp.ok) throw new Error(resp.statusText);
        return await resp.json();
    } catch (error) {
        console.error('[Dashboard] Failed to load stats:', error);
        return null;
    }
}

function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Calendar-aligned activity for the last year. Columns are Sunday-based weeks,
 * matching the familiar contribution-calendar layout; rows are weekdays.
 */
export function heatmapHtml(heatmap, now = new Date()) {
    const byDate = new Map(heatmap.map(d => [d.date, d]));
    const weeks = 53, cell = 11, gap = 3, size = cell + gap;
    const gridX = 34, gridY = 22;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeStart = new Date(today);
    rangeStart.setDate(today.getDate() - 364);

    // Sunday at the beginning of the leftmost calendar column.
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);

    let max = 1;
    for (const d of heatmap) max = Math.max(max, d.reviews);

    const rects = [];
    const monthLabels = [];
    let lastMonth = null;
    for (let w = 0; w < weeks; w++) {
        const weekStart = new Date(start);
        weekStart.setDate(start.getDate() + w * 7);

        // Put each month name over the week that actually contains its first
        // day. The first partial month is labeled over the leftmost column.
        const visibleDays = [];
        for (let dow = 0; dow < 7; dow++) {
            const candidate = new Date(weekStart);
            candidate.setDate(weekStart.getDate() + dow);
            if (candidate < rangeStart || candidate > today) continue;
            visibleDays.push(candidate);
        }
        const labelDay = w === 0
            ? visibleDays[0]
            : visibleDays.find(candidate => candidate.getDate() === 1);
        if (labelDay) {
            const monthKey = `${labelDay.getFullYear()}-${labelDay.getMonth()}`;
            if (monthKey !== lastMonth) {
                monthLabels.push(`<text class="heatmap-month" x="${gridX + w * size}" y="11">${esc(labelDay.toLocaleDateString(undefined, { month: 'short' }))}</text>`);
                lastMonth = monthKey;
            }
        }

        for (let dow = 0; dow < 7; dow++) {
            const day = new Date(weekStart);
            day.setDate(weekStart.getDate() + dow);
            if (day < rangeStart || day > today) continue;
            const key = getLocalDate(day);
            const rec = byDate.get(key);
            const n = rec ? rec.reviews : 0;
            const level = n === 0 ? 0 : Math.max(1, Math.ceil(4 * Math.log1p(n) / Math.log1p(max)));
            const intensity = [1, 0.28, 0.5, 0.72, 1][level];
            const fill = n === 0 ? '#eee' : GOLD;
            const stroke = rec && rec.goalMet ? INK : 'none';
            const dateLabel = day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            const reviewLabel = `${n} ${n === 1 ? 'review' : 'reviews'}`;
            const label = `${dateLabel}: ${reviewLabel}${rec && rec.goalMet ? '; daily goal met' : ''}`;
            rects.push(`<rect class="heatmap-day heatmap-level-${level}${rec && rec.goalMet ? ' goal-met' : ''}" data-label="${esc(label)}" x="${gridX + w * size}" y="${gridY + dow * size}" width="${cell}" height="${cell}" rx="2" fill="${fill}" fill-opacity="${intensity}" stroke="${stroke}" stroke-width="${stroke === 'none' ? 0 : 1.5}" tabindex="${n > 0 ? 0 : -1}" role="gridcell" aria-label="${esc(label)}"></rect>`);
        }
    }

    const weekdays = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]
        .map(([dow, label]) => `<text class="heatmap-weekday" x="0" y="${gridY + dow * size + cell - 1}">${label}</text>`)
        .join('');
    const width = gridX + weeks * size - gap, height = gridY + 7 * size;
    const total = heatmap.reduce((sum, day) => sum + day.reviews, 0);
    const rangeFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const rangeLabel = `${rangeFormatter.format(rangeStart)} – ${rangeFormatter.format(today)}`;
    const yearLabel = rangeStart.getFullYear() === today.getFullYear()
        ? String(today.getFullYear())
        : `${rangeStart.getFullYear()}–${today.getFullYear()}`;

    return `<div class="review-heatmap">
        <div class="heatmap-summary">
            <strong>${total.toLocaleString()} ${total === 1 ? 'review' : 'reviews'} in the last year</strong>
            <span><span class="heatmap-year">${yearLabel}</span>${esc(rangeLabel)}</span>
        </div>
        <div class="heatmap-scroll" tabindex="0" aria-label="Scrollable review activity calendar">
            <svg class="review-heatmap-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="grid" aria-label="Review activity from ${esc(rangeLabel)}">${monthLabels.join('')}${weekdays}${rects.join('')}</svg>
        </div>
        <div class="heatmap-footer">
            <span class="heatmap-goal-key"><span class="heatmap-legend-cell goal-met"></span> Daily goal met</span>
            <span class="heatmap-legend" aria-label="Review count intensity: fewer to more">
                <span>Fewer</span>
                ${[0, 1, 2, 3, 4].map(level => `<span class="heatmap-legend-cell heatmap-level-${level}"></span>`).join('')}
                <span>More</span>
            </span>
        </div>
        <div class="heatmap-tooltip" role="tooltip" hidden></div>
    </div>`;
}

function wireHeatmapTooltip(root) {
    const wrapper = root.querySelector('.review-heatmap');
    const tooltip = wrapper?.querySelector('.heatmap-tooltip');
    if (!wrapper || !tooltip) return;

    const show = event => {
        const cell = event.currentTarget;
        const cellRect = cell.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const desiredX = cellRect.left - wrapperRect.left + cellRect.width / 2;
        tooltip.textContent = cell.dataset.label;
        tooltip.style.left = `${Math.max(105, Math.min(wrapper.clientWidth - 105, desiredX))}px`;
        tooltip.style.top = `${cellRect.top - wrapperRect.top - 7}px`;
        tooltip.hidden = false;
    };
    const hide = () => { tooltip.hidden = true; };

    wrapper.querySelectorAll('.heatmap-day').forEach(cell => {
        cell.addEventListener('pointerenter', show);
        cell.addEventListener('pointerleave', hide);
        cell.addEventListener('focus', show);
        cell.addEventListener('blur', hide);
    });
}

/** Weekly retention line chart. */
function retentionSvg(retention) {
    const pts = retention.filter(r => r.accuracy !== null);
    if (pts.length === 0) return '<p class="dash-empty">Not enough review history yet.</p>';
    const W = 520, H = 140, padL = 34, padB = 20, padT = 10;
    const innerW = W - padL - 8, innerH = H - padB - padT;
    const x = i => padL + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
    const y = a => padT + innerH - a * innerH;
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ');
    const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.accuracy).toFixed(1)}" r="3" fill="${INK}"><title>${p.week}: ${Math.round(p.accuracy * 100)}% (${p.total} reviews)</title></circle>`).join('');
    const grid = [0, 0.5, 1].map(a => `<line x1="${padL}" y1="${y(a)}" x2="${W - 8}" y2="${y(a)}" stroke="#eee"/><text x="0" y="${y(a) + 4}" font-size="10" fill="#999">${a * 100}%</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Weekly retention">${grid}<path d="${line}" fill="none" stroke="${GOLD}" stroke-width="2"/>${dots}</svg>`;
}

/** Projected due load bar chart (next 30 days). */
function projectedSvg(projected) {
    if (projected.length === 0) return '<p class="dash-empty">No scheduled reviews yet.</p>';
    const days = [];
    const base = new Date();
    for (let i = 0; i < 30; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        days.push(getLocalDate(d));
    }
    const byDay = new Map(projected.map(p => [p.day, p.count]));
    let overdue = 0;
    for (const p of projected) if (p.day < days[0]) overdue += p.count;
    const counts = days.map((d, i) => (i === 0 ? overdue : 0) + (byDay.get(d) || 0));
    const max = Math.max(1, ...counts);
    const W = 520, H = 120, bw = W / 30;
    const bars = counts.map((c, i) => {
        const h = (c / max) * (H - 20);
        return `<rect x="${(i * bw).toFixed(1)}" y="${(H - 20 - h).toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" fill="${i === 0 ? INK : GOLD}"><title>${days[i]}${i === 0 ? ' (incl. overdue)' : ''}: ${c} due</title></rect>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Projected due load">${bars}<text x="0" y="${H - 4}" font-size="10" fill="#999">today</text><text x="${W - 40}" y="${H - 4}" font-size="10" fill="#999">+30d</text></svg>`;
}

function perDeckHtml(perDeck) {
    if (perDeck.length === 0) return '<p class="dash-empty">No decks reviewed yet.</p>';
    const max = Math.max(1, ...perDeck.map(d => d.reviewed));
    return perDeck.slice(0, 15).map(d => {
        const name = esc((d.repo || '').split('/').pop());
        const pct = Math.round((d.reviewed / max) * 100);
        return `<div class="dash-deck-row"><span class="dash-deck-name">${name}</span><span class="dash-deck-bar"><span style="width:${pct}%"></span></span><span class="dash-deck-count">${d.reviewed}</span></div>`;
    }).join('');
}

/**
 * Render the dashboard into #dashboard. Caller handles show/hide of the grid.
 */
export async function renderDashboard() {
    const el = document.getElementById('dashboard');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading your stats…</div>';

    const [stats, habit] = await Promise.all([fetchStats(), getHabitStatus().catch(() => null)]);

    if (!stats) {
        el.innerHTML = `<div class="dash-header"><h2>Progress</h2></div>
            <p class="dash-empty">Stats sync once you're logged in and have reviewed some cards. Keep drilling!</p>`;
        return;
    }

    const totalReviews = stats.heatmap.reduce((a, d) => a + d.reviews, 0);
    const activeDays = stats.heatmap.filter(d => d.reviews > 0).length;
    const level = habit ? levelForXp(habit.totalXp) : 0;

    el.innerHTML = `
        <div class="dash-header">
            <h2>Progress</h2>
            <div class="dash-kpis">
                <div class="dash-kpi"><strong>${habit ? habit.streak : 0}</strong><span>day streak</span></div>
                <div class="dash-kpi"><strong>${totalReviews}</strong><span>reviews (1y)</span></div>
                <div class="dash-kpi"><strong>${activeDays}</strong><span>active days</span></div>
                <div class="dash-kpi"><strong>lvl ${level}</strong><span>${habit ? habit.totalXp : 0} XP</span></div>
            </div>
        </div>
        <section class="dash-section"><h3>Review activity</h3>${heatmapHtml(stats.heatmap)}</section>
        <section class="dash-section"><h3>Retention (weekly recall accuracy)</h3>${retentionSvg(stats.retention)}</section>
        <section class="dash-section"><h3>Upcoming reviews (next 30 days)</h3>${projectedSvg(stats.projectedDue)}</section>
        <section class="dash-section"><h3>Reviewed by deck</h3><div class="dash-decks">${perDeckHtml(stats.perDeck)}</div></section>
    `;
    wireHeatmapTooltip(el);
}
