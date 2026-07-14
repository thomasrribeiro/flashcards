/**
 * Analytics dashboard — inline SVG, no chart library (keeps the no-framework,
 * near-zero-dependency character of the app). Renders:
 *   - a calendar-aligned, current-year review heatmap
 *   - weekly retention (recall accuracy) line
 *   - projected due load over the next 30 days
 *   - per-deck reviewed counts
 */

import { getAllCards, getAllReviews, getCurrentUser } from './storage.js';
import { getHabitStatus, levelForXp } from './habit-client.js';
import { getLocalDate } from './today-queue.js';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';
const GOLD = 'var(--gold)';
const INK = 'var(--black)';

function plainCardText(value) {
    return String(value || '')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[`*_#>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cardPrompt(card, review) {
    const content = card?.content || {};
    const prompt = card?.type === 'problem'
        ? content.problem
        : card?.type === 'cloze'
            ? content.text
            : content.question;
    const label = plainCardText(prompt || review?.cardLabel);
    return label || `Card ${String(review?.cardHash || '').slice(0, 8)}`;
}

function reviewPath(review, card) {
    const repo = review?.repo || card?.source?.repo || card?.deckName || 'unknown deck';
    const deck = repo.split('/').pop();
    const file = review?.filepath || card?.source?.file || '';
    const chapter = file.split('/').pop().replace(/\.md$/, '');
    return chapter ? `${deck} / ${chapter}` : deck;
}

function relativeDue(due, now) {
    const diff = due - now;
    if (diff <= 0) {
        const minutes = Math.floor(Math.abs(diff) / 60000);
        if (minutes < 60) return 'Due now';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h overdue`;
        const days = Math.floor(hours / 24);
        return `${days}d overdue`;
    }
    const minutes = Math.ceil(diff / 60000);
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.ceil(minutes / 60);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.ceil(hours / 24);
    return `in ${days}d`;
}

/** A scrollable ledger of every introduced card and its exact FSRS due time. */
export function reviewScheduleHtml(reviews = [], cards = [], now = new Date()) {
    if (reviews.length === 0) return '<p class="dash-empty">No cards have been introduced yet.</p>';
    const cardMap = new Map(cards.map(card => [card.hash, card]));
    const formatter = new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    });
    const rows = reviews
        .map(review => ({ review, card: cardMap.get(review.cardHash), due: new Date(review.fsrsCard?.due) }))
        .filter(item => !Number.isNaN(item.due.getTime()))
        .sort((a, b) => a.due - b.due)
        .map(({ review, card, due }) => {
            const isDue = due <= now;
            const last = new Date(review.lastReviewed);
            const lastLabel = Number.isNaN(last.getTime()) ? 'Unknown' : formatter.format(last);
            return `<article class="review-schedule-row${isDue ? ' is-due' : ''}">
                <div class="review-schedule-main">
                    <strong title="${esc(cardPrompt(card, review))}">${esc(cardPrompt(card, review))}</strong>
                    <span>${esc(reviewPath(review, card))}</span>
                </div>
                <div class="review-schedule-time">
                    <strong>${esc(relativeDue(due, now))}</strong>
                    <time datetime="${esc(due.toISOString())}">${esc(formatter.format(due))}</time>
                    <span>Last reviewed ${esc(lastLabel)}</span>
                </div>
            </article>`;
        }).join('');
    const dueCount = reviews.filter(review => new Date(review.fsrsCard?.due) <= now).length;
    return `<div class="review-schedule-summary">${reviews.length} introduced · ${dueCount} due now</div>
        <div class="review-schedule-list" tabindex="0" aria-label="All reviewed cards ordered by next review time">${rows}</div>`;
}

export function daysSinceYearStart(now = new Date()) {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const januaryFirst = Date.UTC(now.getFullYear(), 0, 1);
    return Math.max(1, Math.floor((today - januaryFirst) / 86400000));
}

async function fetchStats(now = new Date()) {
    const user = getCurrentUser();
    if (!user) return null;
    const id = user.github_id || user.id;
    try {
        // Include a small timezone cushion; the calendar renderer strictly
        // clips the response to January 1 through the user's local today.
        const resp = await fetch(`${WORKER_URL}/api/stats/${id}?days=${daysSinceYearStart(now) + 2}`);
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
 * Calendar-aligned activity for the current year. Columns are Sunday-based weeks,
 * matching the familiar contribution-calendar layout; rows are weekdays.
 */
export function heatmapHtml(heatmap, now = new Date()) {
    const cell = 11, gap = 3, size = cell + gap;
    const gridX = 34, gridY = 22;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeStart = new Date(today.getFullYear(), 0, 1);
    const firstDate = getLocalDate(rangeStart);
    const lastDate = getLocalDate(today);
    const visibleActivity = heatmap.filter(day => day.date >= firstDate && day.date <= lastDate);
    const byDate = new Map(visibleActivity.map(d => [d.date, d]));

    // Sunday containing January 1 through the Sunday containing today.
    const start = new Date(rangeStart);
    start.setDate(rangeStart.getDate() - rangeStart.getDay());
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const weeks = Math.floor((todayUtc - startUtc) / (7 * 86400000)) + 1;

    let max = 1;
    for (const d of visibleActivity) max = Math.max(max, d.reviews);

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
            const fill = n === 0 ? 'var(--heatmap-empty)' : GOLD;
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
    const total = visibleActivity.reduce((sum, day) => sum + day.reviews, 0);
    const rangeFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const rangeLabel = `${rangeFormatter.format(rangeStart)} – ${rangeFormatter.format(today)}`;
    const yearLabel = String(today.getFullYear());

    return `<div class="review-heatmap">
        <div class="heatmap-summary">
            <strong>${total.toLocaleString()} ${total === 1 ? 'review' : 'reviews'} in ${yearLabel}</strong>
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

export function scrollHeatmapToPresent(root) {
    const scroll = root?.querySelector?.('.heatmap-scroll');
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
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
    const grid = [0, 0.5, 1].map(a => `<line x1="${padL}" y1="${y(a)}" x2="${W - 8}" y2="${y(a)}" stroke="var(--subtle-border)"/><text x="0" y="${y(a) + 4}" font-size="10" fill="var(--muted)">${a * 100}%</text>`).join('');
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
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Projected due load">${bars}<text x="0" y="${H - 4}" font-size="10" fill="var(--muted)">today</text><text x="${W - 40}" y="${H - 4}" font-size="10" fill="var(--muted)">+30d</text></svg>`;
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

    const now = new Date();
    const [stats, habit, reviews, cards] = await Promise.all([
        fetchStats(now),
        getHabitStatus().catch(() => null),
        getAllReviews(),
        getAllCards()
    ]);
    const schedule = reviewScheduleHtml(reviews, cards, now);

    if (!stats) {
        el.innerHTML = `<div class="dash-header"><h2>Progress</h2></div>
            <p class="dash-empty">Activity charts sync after login. Your local review schedule is shown below.</p>
            <section class="dash-section"><h3>Card schedule</h3>${schedule}</section>`;
        return;
    }

    const year = now.getFullYear();
    const yearPrefix = `${year}-`;
    const yearActivity = stats.heatmap.filter(day => day.date.startsWith(yearPrefix));
    const totalReviews = yearActivity.reduce((a, d) => a + d.reviews, 0);
    const activeDays = yearActivity.filter(d => d.reviews > 0).length;
    const level = habit ? levelForXp(habit.totalXp) : 0;

    el.innerHTML = `
        <div class="dash-header">
            <h2>Progress</h2>
            <div class="dash-kpis">
                <div class="dash-kpi"><strong>${habit ? habit.streak : 0}</strong><span>day streak</span></div>
                <div class="dash-kpi"><strong>${totalReviews}</strong><span>reviews (${year})</span></div>
                <div class="dash-kpi"><strong>${activeDays}</strong><span>active days</span></div>
                <div class="dash-kpi"><strong>lvl ${level}</strong><span>${habit ? habit.totalXp : 0} XP</span></div>
            </div>
        </div>
        <section class="dash-section"><h3>Review activity</h3>${heatmapHtml(stats.heatmap, now)}</section>
        <section class="dash-section"><h3>Retention (weekly recall accuracy)</h3>${retentionSvg(stats.retention)}</section>
        <section class="dash-section"><h3>Upcoming reviews (next 30 days)</h3>${projectedSvg(stats.projectedDue)}</section>
        <section class="dash-section"><h3>Card schedule</h3>${schedule}</section>
        <section class="dash-section"><h3>Reviewed by deck</h3><div class="dash-decks">${perDeckHtml(stats.perDeck)}</div></section>
    `;
    wireHeatmapTooltip(el);
    scrollHeatmapToPresent(el);
}
