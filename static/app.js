// ==========================================================================
// KeyClean App.js — Multi-Page SPA Controller
// ==========================================================================

// ── PAGE NAVIGATION ──────────────────────────────────────────────────────
function navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const target = document.getElementById('page-' + page);
    if (target) target.classList.remove('hidden');

    const navBtn = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Expose globally for onclick usage in HTML
window.navigate = navigate;


// ── INTERACTIVE KEYBOARD ─────────────────────────────────────────────────
function initKeyboard() {
    const keys = document.querySelectorAll('.full-keyboard .key');
    const feedback = document.getElementById('key-feedback');
    let feedbackTimer = null;

    function showFeedback(text) {
        feedback.textContent = text;
        feedback.classList.add('show');
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => feedback.classList.remove('show'), 900);
    }

    // Mouse / touch click
    keys.forEach(key => {
        key.addEventListener('mousedown', () => triggerKey(key));
        key.addEventListener('touchstart', (e) => { e.preventDefault(); triggerKey(key); });
    });

    function triggerKey(key) {
        key.classList.add('pressed');
        setTimeout(() => {
            key.classList.remove('pressed');
            key.classList.add('muted-flash');
            setTimeout(() => key.classList.remove('muted-flash'), 280);
        }, 80);
        showFeedback('🔇 Click muted by DSP');
    }

    // Physical keyboard events
    document.addEventListener('keydown', (e) => {
        const pageHome = document.getElementById('page-home');
        const pageDash = document.getElementById('page-dashboard');
        // Only animate if dashboard is visible
        if (!pageDash || pageDash.classList.contains('hidden')) return;

        const selector = `[data-key="${e.key.toLowerCase()}"]`;
        const matchedKey = document.querySelector(`.full-keyboard ${selector}`);
        if (matchedKey) {
            matchedKey.classList.add('pressed');
            showFeedback('🔇 Click muted by DSP');
        }
    });

    document.addEventListener('keyup', (e) => {
        const selector = `[data-key="${e.key.toLowerCase()}"]`;
        const matchedKey = document.querySelector(`.full-keyboard ${selector}`);
        if (matchedKey) {
            matchedKey.classList.remove('pressed');
            matchedKey.classList.add('muted-flash');
            setTimeout(() => matchedKey.classList.remove('muted-flash'), 280);
        }
    });
}

// ── MAIN DASHBOARD INITIALIZER ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // ── Init keyboard
    initKeyboard();

    // ── State
    let currentPlotData = null;
    let groundTruthTimes = null;
    let detectedGaps = null;
    let selectedFile = null;

    // ── Sliders
    const thresholdInput = document.getElementById('threshold');
    const prePadInput = document.getElementById('pre-pad');
    const postPadInput = document.getElementById('post-pad');
    const rollingWindowInput = document.getElementById('rolling-window');
    const valThreshold = document.getElementById('val-threshold');
    const valPrePad = document.getElementById('val-pre-pad');
    const valPostPad = document.getElementById('val-post-pad');
    const valRollingWindow = document.getElementById('val-rolling-window');

    function updateSliderLabels() {
        if (thresholdInput) valThreshold.textContent = parseFloat(thresholdInput.value).toFixed(1);
        if (prePadInput) valPrePad.textContent = prePadInput.value + ' ms';
        if (postPadInput) valPostPad.textContent = postPadInput.value + ' ms';
        if (rollingWindowInput) valRollingWindow.textContent = rollingWindowInput.value;
    }

    [thresholdInput, prePadInput, postPadInput, rollingWindowInput].forEach(s => {
        if (s) s.addEventListener('input', updateSliderLabels);
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
        if (thresholdInput) thresholdInput.value = 12.0;
        if (prePadInput) prePadInput.value = 5;
        if (postPadInput) postPadInput.value = 15;
        if (rollingWindowInput) rollingWindowInput.value = 150;
        updateSliderLabels();
    });

    updateSliderLabels();

    // ── Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const pane = document.getElementById(btn.getAttribute('data-tab'));
            if (pane) pane.classList.add('active');
            const vizCard = document.getElementById('visualization-card');
            if (vizCard) vizCard.style.display = 'none';
        });
    });

    // ── File Drop Zone
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadActions = document.getElementById('upload-actions');
    const selectedFileName = document.getElementById('selected-file-name');
    const selectedFileSize = document.getElementById('selected-file-size');

    dropZone?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', e => handleFiles(e.target.files));

    ['dragenter', 'dragover'].forEach(ev => {
        dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(ev => {
        dropZone?.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); });
    });
    dropZone?.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

    function handleFiles(files) {
        if (!files?.length) return;
        const file = files[0];
        if (!file.name.endsWith('.wav')) { alert('Please select a .wav file.'); return; }
        selectedFile = file;
        if (selectedFileName) selectedFileName.textContent = file.name;
        if (selectedFileSize) selectedFileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
        if (uploadActions) uploadActions.style.display = 'flex';
        const realPlayers = document.getElementById('real-audio-players');
        if (realPlayers) realPlayers.style.display = 'none';
    }

    // ── Canvas Chart
    const dspCanvas = document.getElementById('dsp-canvas');
    let ctx = dspCanvas ? dspCanvas.getContext('2d') : null;
    let canvasWidth = 0, canvasHeight = 0;

    function resizeCanvas() {
        if (!dspCanvas) return;
        const rect = dspCanvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvasWidth = rect.width;
        canvasHeight = rect.height;
        dspCanvas.width = canvasWidth * dpr;
        dspCanvas.height = canvasHeight * dpr;
        dspCanvas.style.width = canvasWidth + 'px';
        dspCanvas.style.height = canvasHeight + 'px';
        ctx = dspCanvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    window.addEventListener('resize', () => { if (currentPlotData) { resizeCanvas(); drawChart(); } });

    function drawChart() {
        if (!ctx || !currentPlotData) return;
        const { times, z_scores } = currentPlotData;
        const threshold = parseFloat(thresholdInput?.value || 12);
        const maxVal = Math.max(Math.max(...z_scores), threshold * 1.5, 10);
        const pL = 40, pR = 15, pT = 20, pB = 25;
        const gW = canvasWidth - pL - pR;
        const gH = canvasHeight - pT - pB;
        const maxT = times[times.length - 1] || 6;

        ctx.fillStyle = '#03060c';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const xOf = t => pL + (t / maxT) * gW;
        const yOf = z => pT + gH - Math.min((z / maxVal) * gH, gH);

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const gy = yOf((maxVal / 5) * i);
            ctx.beginPath(); ctx.moveTo(pL, gy); ctx.lineTo(canvasWidth - pR, gy); ctx.stroke();
            ctx.fillStyle = '#64748b'; ctx.font = '9px Outfit'; ctx.textAlign = 'right';
            ctx.fillText(Math.round((maxVal / 5) * i), pL - 5, gy + 3);
        }
        for (let s = 0; s <= maxT; s += maxT > 10 ? 5 : 1) {
            const gx = xOf(s);
            ctx.beginPath(); ctx.moveTo(gx, pT); ctx.lineTo(gx, canvasHeight - pB); ctx.stroke();
            ctx.fillStyle = '#64748b'; ctx.font = '10px Outfit'; ctx.textAlign = 'center';
            ctx.fillText(s + 's', gx, canvasHeight - pB + 14);
        }

        // Inpainted gaps
        if (detectedGaps) {
            detectedGaps.forEach(gap => {
                const x1 = xOf(gap.start), x2 = xOf(gap.end);
                ctx.fillStyle = 'rgba(255,42,127,0.15)';
                ctx.fillRect(x1, pT, x2 - x1, gH);
                ctx.strokeStyle = 'rgba(255,42,127,0.35)';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(x1, pT); ctx.lineTo(x1, canvasHeight - pB);
                ctx.moveTo(x2, pT); ctx.lineTo(x2, canvasHeight - pB); ctx.stroke();
            });
        }

        // Ground truth lines
        if (groundTruthTimes) {
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
            groundTruthTimes.forEach(t => {
                const gx = xOf(t);
                ctx.beginPath(); ctx.moveTo(gx, pT); ctx.lineTo(gx, canvasHeight - pB); ctx.stroke();
            });
            ctx.setLineDash([]);
        }

        // Threshold line
        ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
        const ty = yOf(threshold);
        ctx.beginPath(); ctx.moveTo(pL, ty); ctx.lineTo(canvasWidth - pR, ty); ctx.stroke();
        ctx.setLineDash([]);

        // Z-score wave
        ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 1.8;
        ctx.beginPath();
        times.forEach((t, i) => {
            const x = xOf(t), y = yOf(z_scores[i]);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Tooltip
    const chartTooltip = document.getElementById('chart-tooltip');
    dspCanvas?.addEventListener('mousemove', e => {
        if (!currentPlotData || !chartTooltip) return;
        const rect = dspCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const pL = 40, pR = 15;
        const gW = canvasWidth - pL - pR;
        if (mx < pL || mx > canvasWidth - pR) { chartTooltip.style.display = 'none'; return; }
        const hT = ((mx - pL) / gW) * (currentPlotData.times[currentPlotData.times.length - 1] || 6);
        let ci = 0, md = Infinity;
        currentPlotData.times.forEach((t, i) => { const d = Math.abs(t - hT); if (d < md) { md = d; ci = i; } });
        chartTooltip.style.left = (mx + 14) + 'px';
        chartTooltip.style.top = (e.clientY - rect.top - 30) + 'px';
        chartTooltip.style.display = 'block';
        chartTooltip.innerHTML = `<div><b>Time:</b> ${currentPlotData.times[ci].toFixed(3)}s</div><div><b>Z:</b> ${currentPlotData.z_scores[ci].toFixed(2)}</div>`;
    });
    dspCanvas?.addEventListener('mouseleave', () => { if (chartTooltip) chartTooltip.style.display = 'none'; });

    // ── API helpers
    function getDSPFormData() {
        const fd = new FormData();
        fd.append('threshold', thresholdInput?.value || 12);
        fd.append('pre_pad_sec', ((parseFloat(prePadInput?.value || 5)) / 1000).toString());
        fd.append('post_pad_sec', ((parseFloat(postPadInput?.value || 15)) / 1000).toString());
        fd.append('rolling_window', rollingWindowInput?.value || 150);
        return fd;
    }

    function showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.classList.toggle('hidden', !show);
    }

    // ── SYNTH BENCHMARK
    document.getElementById('btn-run-synth')?.addEventListener('click', async () => {
        showLoading(true);
        try {
            const res = await fetch('/api/synth', { method: 'POST', body: getDSPFormData() });
            if (!res.ok) throw new Error('Synth request failed');
            const data = await res.json();

            document.getElementById('m-precision').textContent = data.metrics.precision.toFixed(2);
            document.getElementById('m-recall').textContent = data.metrics.recall.toFixed(2);
            document.getElementById('m-f1').textContent = data.metrics.f1.toFixed(2);
            document.getElementById('m-hits').textContent = `${data.metrics.tp} / ${data.metrics.total_injected}`;
            document.getElementById('m-detail').textContent = `${data.metrics.fp} FP · ${data.metrics.fn} Missed`;

            document.getElementById('audio-synth-noisy').src = data.audio_urls.noisy;
            document.getElementById('audio-synth-cleaned').src = data.audio_urls.cleaned;
            document.getElementById('audio-synth-ref').src = data.audio_urls.reference;
            ['audio-synth-noisy', 'audio-synth-cleaned', 'audio-synth-ref'].forEach(id => document.getElementById(id)?.load());

            currentPlotData = data.plot_data;
            groundTruthTimes = data.gt_times;
            detectedGaps = data.detected_gaps;

            document.getElementById('legend-gt').style.display = 'flex';
            document.getElementById('synth-metrics-row').style.display = 'grid';
            document.getElementById('synth-audio-players').style.display = 'flex';

            const vizCard = document.getElementById('visualization-card');
            if (vizCard) vizCard.style.display = 'block';

            setTimeout(() => { resizeCanvas(); drawChart(); }, 60);
        } catch (err) {
            alert('DSP Error: ' + err.message);
        } finally {
            showLoading(false);
        }
    });

    // ── REAL CLEAN
    document.getElementById('btn-run-clean')?.addEventListener('click', async () => {
        if (!selectedFile) return;
        showLoading(true);
        const fd = getDSPFormData();
        fd.append('file', selectedFile);
        try {
            const res = await fetch('/api/clean', { method: 'POST', body: fd });
            if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }
            const data = await res.json();

            document.getElementById('audio-real-noisy').src = data.audio_urls.noisy;
            document.getElementById('audio-real-cleaned').src = data.audio_urls.cleaned;
            const dlBtn = document.getElementById('btn-download-cleaned');
            if (dlBtn) dlBtn.href = data.audio_urls.cleaned;
            ['audio-real-noisy', 'audio-real-cleaned'].forEach(id => document.getElementById(id)?.load());
            document.getElementById('real-click-count').textContent = data.count;

            currentPlotData = data.plot_data;
            groundTruthTimes = null;
            detectedGaps = data.detected_gaps;
            document.getElementById('legend-gt').style.display = 'none';
            document.getElementById('real-audio-players').style.display = 'flex';

            const vizCard = document.getElementById('visualization-card');
            if (vizCard) vizCard.style.display = 'block';

            setTimeout(() => { resizeCanvas(); drawChart(); }, 60);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            showLoading(false);
        }
    });
});
