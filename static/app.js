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

    // ── Sliders & Controls
    const modeInput = document.getElementById('mode');
    const thresholdInput = document.getElementById('threshold');
    const lowThresholdInput = document.getElementById('low-threshold');
    const prePadInput = document.getElementById('pre-pad');
    const postPadInput = document.getElementById('post-pad');
    const rollingWindowInput = document.getElementById('rolling-window');
    
    const valThreshold = document.getElementById('val-threshold');
    const valLowThreshold = document.getElementById('val-low-threshold');
    const valPrePad = document.getElementById('val-pre-pad');
    const valPostPad = document.getElementById('val-post-pad');
    const valRollingWindow = document.getElementById('val-rolling-window');
    const groupLowThreshold = document.getElementById('group-low-threshold');

    function updateSliderLabels() {
        if (thresholdInput) valThreshold.textContent = parseFloat(thresholdInput.value).toFixed(1);
        if (lowThresholdInput) valLowThreshold.textContent = parseFloat(lowThresholdInput.value).toFixed(1);
        if (prePadInput) valPrePad.textContent = prePadInput.value + ' ms';
        if (postPadInput) valPostPad.textContent = postPadInput.value + ' ms';
        if (rollingWindowInput) valRollingWindow.textContent = rollingWindowInput.value;
    }

    function toggleModeControls() {
        if (groupLowThreshold && modeInput) {
            groupLowThreshold.style.display = modeInput.value === 'hysteresis' ? 'flex' : 'none';
        }
    }

    // ── Real-time Client-side Re-detection & Re-evaluation (100ms Debounced) ──
    let updateDebounceTimer = null;

    function runClientSideReDetection() {
        if (!currentPlotData || !currentPlotData.z_scores || !groundTruthTimes) return;

        const threshold = parseFloat(thresholdInput?.value || 12);
        const lowThreshold = parseFloat(lowThresholdInput?.value || 2.5);
        const prePadSec = (parseFloat(prePadInput?.value || 5)) / 1000;
        const postPadSec = (parseFloat(postPadInput?.value || 15)) / 1000;
        const mode = modeInput?.value || 'standard';

        const { z_scores, times } = currentPlotData;
        const nFrames = z_scores.length;
        const totalDuration = (times && times.length) ? times[times.length - 1] : 6.0;

        const rawIntervals = [];

        if (mode === 'hysteresis') {
            for (let i = 0; i < nFrames; i++) {
                if (z_scores[i] >= threshold) {
                    let startFrame = i;
                    while (startFrame > 0 && z_scores[startFrame] >= lowThreshold) {
                        startFrame--;
                    }
                    let endFrame = i;
                    while (endFrame < nFrames - 1 && z_scores[endFrame] >= lowThreshold) {
                        endFrame++;
                    }
                    const startSec = Math.max(0, times[startFrame] - prePadSec);
                    const endSec = Math.min(totalDuration, times[endFrame] + postPadSec);
                    rawIntervals.push({ start: startSec, end: endSec });
                }
            }
        } else {
            for (let i = 0; i < nFrames; i++) {
                if (z_scores[i] > threshold) {
                    const startSec = Math.max(0, times[i] - prePadSec);
                    const endSec = Math.min(totalDuration, times[i] + postPadSec);
                    rawIntervals.push({ start: startSec, end: endSec });
                }
            }
        }

        // Merge overlapping intervals
        const mergedGaps = [];
        if (rawIntervals.length > 0) {
            rawIntervals.sort((a, b) => a.start - b.start);
            let curStart = rawIntervals[0].start;
            let curEnd = rawIntervals[0].end;
            for (let k = 1; k < rawIntervals.length; k++) {
                if (rawIntervals[k].start <= curEnd) {
                    curEnd = Math.max(curEnd, rawIntervals[k].end);
                } else {
                    mergedGaps.push({ start: curStart, end: curEnd });
                    curStart = rawIntervals[k].start;
                    curEnd = rawIntervals[k].end;
                }
            }
            mergedGaps.push({ start: curStart, end: curEnd });
        }

        detectedGaps = mergedGaps;

        // Re-evaluate against ground truth times (30ms tolerance matching backend)
        const toleranceSec = 0.03;
        let tp = 0;
        let fn = 0;
        const matchedGapIndices = new Set();

        groundTruthTimes.forEach(gtSec => {
            let matched = false;
            for (let idx = 0; idx < mergedGaps.length; idx++) {
                const g = mergedGaps[idx];
                if ((g.start - toleranceSec) <= gtSec && gtSec <= (g.end + toleranceSec)) {
                    matched = true;
                    matchedGapIndices.add(idx);
                    break;
                }
            }
            if (matched) tp++;
            else fn++;
        });

        const fp = mergedGaps.length - matchedGapIndices.size;
        const precision = (tp + fp) > 0 ? (tp / (tp + fp)) : 0.0;
        const recall = groundTruthTimes.length > 0 ? (tp / groundTruthTimes.length) : 0.0;
        const f1 = (precision + recall) > 0 ? (2 * precision * recall / (precision + recall)) : 0.0;

        // Update DOM metrics
        const mPrec = document.getElementById('m-precision');
        const mRec = document.getElementById('m-recall');
        const mF1 = document.getElementById('m-f1');
        const mHits = document.getElementById('m-hits');
        const mDetail = document.getElementById('m-detail');

        if (mPrec) mPrec.textContent = precision.toFixed(2);
        if (mRec) mRec.textContent = recall.toFixed(2);
        if (mF1) mF1.textContent = f1.toFixed(2);
        if (mHits) mHits.textContent = `${tp} / ${groundTruthTimes.length}`;
        if (mDetail) mDetail.textContent = `${fp} FP · ${fn} Missed`;

        // Redraw chart with updated threshold lines & gaps
        drawChart();
    }

    function scheduleDebouncedUpdate() {
        clearTimeout(updateDebounceTimer);
        updateDebounceTimer = setTimeout(runClientSideReDetection, 100);
    }

    // ── DSP Presets ──
    const PRESETS = {
        balanced: { threshold: 12.0, pre_pad: 5, post_pad: 15, rolling_window: 150, name: 'Balanced' },
        aggressive: { threshold: 7.0, pre_pad: 8, post_pad: 25, rolling_window: 100, name: 'Aggressive' },
        conservative: { threshold: 18.0, pre_pad: 3, post_pad: 10, rolling_window: 200, name: 'Conservative' },
        mech: { threshold: 9.0, pre_pad: 6, post_pad: 30, rolling_window: 120, name: 'Mech Keyboard' }
    };

    const presetButtons = document.querySelectorAll('.preset-btn');
    const presetActiveTag = document.getElementById('preset-active-tag');

    function setActivePresetTag(name) {
        if (presetActiveTag) presetActiveTag.textContent = `Profile: ${name}`;
    }

    function clearPresetSelection() {
        presetButtons.forEach(btn => btn.classList.remove('active'));
        setActivePresetTag('Custom');
    }

    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-preset');
            const p = PRESETS[key];
            if (!p) return;

            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setActivePresetTag(p.name);

            if (thresholdInput) thresholdInput.value = p.threshold;
            if (prePadInput) prePadInput.value = p.pre_pad;
            if (postPadInput) postPadInput.value = p.post_pad;
            if (rollingWindowInput) rollingWindowInput.value = p.rolling_window;

            updateSliderLabels();
            scheduleDebouncedUpdate();
        });
    });

    modeInput?.addEventListener('change', () => {
        toggleModeControls();
        clearPresetSelection();
        scheduleDebouncedUpdate();
    });
    toggleModeControls();

    [thresholdInput, lowThresholdInput, prePadInput, postPadInput, rollingWindowInput].forEach(s => {
        if (s) {
            s.addEventListener('input', () => {
                updateSliderLabels();
                clearPresetSelection();
                scheduleDebouncedUpdate();
            });
        }
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
        const p = PRESETS.balanced;
        if (modeInput) modeInput.value = 'standard';
        if (thresholdInput) thresholdInput.value = p.threshold;
        if (lowThresholdInput) lowThresholdInput.value = 2.5;
        if (prePadInput) prePadInput.value = p.pre_pad;
        if (postPadInput) postPadInput.value = p.post_pad;
        if (rollingWindowInput) rollingWindowInput.value = p.rolling_window;
        
        presetButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-preset') === 'balanced'));
        setActivePresetTag('Balanced');
        toggleModeControls();
        updateSliderLabels();
        scheduleDebouncedUpdate();
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

    const SUPPORTED_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];

    function handleFiles(files) {
        if (!files?.length) return;
        const file = files[0];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!SUPPORTED_EXTENSIONS.includes(ext)) {
            showToast("Unsupported format. Supported formats: .wav, .mp3, .m4a, .flac, .ogg", "error");
            return;
        }
        selectedFile = file;
        if (selectedFileName) selectedFileName.textContent = file.name;
        if (selectedFileSize) selectedFileSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
        if (uploadActions) uploadActions.style.display = 'flex';
        const realPlayers = document.getElementById('real-audio-players');
        if (realPlayers) realPlayers.style.display = 'none';
        showToast(`Loaded ${file.name}`, 'info', 2000);
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

    // ── Layer Visibility State ──
    const activeLayers = {
        waveform: true,
        zscore: true,
        onset: true
    };

    ['waveform', 'zscore', 'onset'].forEach(layer => {
        const btn = document.getElementById(`toggle-layer-${layer}`);
        btn?.addEventListener('click', () => {
            activeLayers[layer] = !activeLayers[layer];
            btn.classList.toggle('active', activeLayers[layer]);
            if (currentPlotData) drawChart();
        });
    });

    function drawChart() {
        if (!ctx || !currentPlotData) return;
        const { times, z_scores, onset_strength, waveform } = currentPlotData;
        const threshold = parseFloat(thresholdInput?.value || 12);
        const lowThreshold = parseFloat(lowThresholdInput?.value || 2.5);
        const isHysteresis = modeInput?.value === 'hysteresis';

        const maxZ = z_scores ? Math.max(...z_scores) : 10;
        const maxVal = Math.max(maxZ, threshold * 1.5, 10);
        const pL = 40, pR = 15, pT = 20, pB = 25;
        const gW = canvasWidth - pL - pR;
        const gH = canvasHeight - pT - pB;
        const maxT = (times && times.length) ? times[times.length - 1] : 6;

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

        // Inpainted gap rectangles
        if (detectedGaps) {
            detectedGaps.forEach(gap => {
                const x1 = xOf(gap.start), x2 = xOf(gap.end);
                ctx.fillStyle = 'rgba(255,42,127,0.15)';
                ctx.fillRect(x1, pT, x2 - x1, gH);
                ctx.strokeStyle = 'rgba(255,42,127,0.4)';
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

        // Layer 1: Audio Waveform (Light Blue, normalized)
        if (activeLayers.waveform && waveform && waveform.length > 0) {
            const maxW = Math.max(...waveform.map(Math.abs)) || 1;
            const midY = pT + gH / 2;
            ctx.strokeStyle = 'rgba(79, 172, 254, 0.45)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            const wLen = waveform.length;
            waveform.forEach((val, i) => {
                const wx = pL + (i / (wLen - 1)) * gW;
                const wy = midY - (val / maxW) * (gH / 2.2);
                i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
            });
            ctx.stroke();
        }

        // Low Threshold line (if hysteresis mode & z-score layer active)
        if (isHysteresis && activeLayers.zscore) {
            ctx.strokeStyle = '#a55eea'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
            const lty = yOf(lowThreshold);
            ctx.beginPath(); ctx.moveTo(pL, lty); ctx.lineTo(canvasWidth - pR, lty); ctx.stroke();
            ctx.setLineDash([]);
        }

        // Threshold line (if z-score layer active)
        if (activeLayers.zscore) {
            ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
            const ty = yOf(threshold);
            ctx.beginPath(); ctx.moveTo(pL, ty); ctx.lineTo(canvasWidth - pR, ty); ctx.stroke();
            ctx.setLineDash([]);
        }

        // Layer 3: Onset Strength (Violet, dashed)
        if (activeLayers.onset && onset_strength && onset_strength.length > 0) {
            const maxOnset = Math.max(...onset_strength) || 1;
            ctx.strokeStyle = '#a55eea'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
            ctx.beginPath();
            times.forEach((t, i) => {
                const ox = xOf(t);
                const oy = pT + gH - (onset_strength[i] / maxOnset) * gH;
                i === 0 ? ctx.moveTo(ox, oy) : ctx.lineTo(ox, oy);
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Layer 2: Z-Score trace (Cyan)
        if (activeLayers.zscore && z_scores && z_scores.length > 0) {
            ctx.strokeStyle = '#00f2fe'; ctx.lineWidth = 1.8;
            ctx.beginPath();
            times.forEach((t, i) => {
                const zx = xOf(t), zy = yOf(z_scores[i]);
                i === 0 ? ctx.moveTo(zx, zy) : ctx.lineTo(zx, zy);
            });
            ctx.stroke();
        }
    }

    // Enhanced Tooltip (with gap duration in ms on hover over inpainted region)
    const chartTooltip = document.getElementById('chart-tooltip');
    dspCanvas?.addEventListener('mousemove', e => {
        if (!currentPlotData || !chartTooltip) return;
        const rect = dspCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const pL = 40, pR = 15;
        const gW = canvasWidth - pL - pR;
        if (mx < pL || mx > canvasWidth - pR) { chartTooltip.style.display = 'none'; return; }
        
        const maxT = (currentPlotData.times && currentPlotData.times.length) ? currentPlotData.times[currentPlotData.times.length - 1] : 6;
        const hT = ((mx - pL) / gW) * maxT;

        // Check if mouse is hovering over an inpainted gap
        let hoveredGap = null;
        if (detectedGaps) {
            hoveredGap = detectedGaps.find(g => hT >= g.start && hT <= g.end);
        }

        let ci = 0, md = Infinity;
        if (currentPlotData.times) {
            currentPlotData.times.forEach((t, i) => { const d = Math.abs(t - hT); if (d < md) { md = d; ci = i; } });
        }

        chartTooltip.style.left = Math.min(mx + 14, canvasWidth - 180) + 'px';
        chartTooltip.style.top = (e.clientY - rect.top - 30) + 'px';
        chartTooltip.style.display = 'block';

        if (hoveredGap) {
            const gapMs = Math.round((hoveredGap.end - hoveredGap.start) * 1000);
            chartTooltip.innerHTML = `
                <div style="color: #ff2a7f; font-weight:700;">✂️ Inpainted Gap: ${gapMs} ms</div>
                <div><b>Interval:</b> ${hoveredGap.start.toFixed(3)}s – ${hoveredGap.end.toFixed(3)}s</div>
                <div><b>Z-score:</b> ${currentPlotData.z_scores[ci] ? currentPlotData.z_scores[ci].toFixed(2) : '-'}</div>
            `;
        } else {
            chartTooltip.innerHTML = `
                <div><b>Time:</b> ${hT.toFixed(3)}s</div>
                <div><b>Z-score:</b> ${currentPlotData.z_scores[ci] ? currentPlotData.z_scores[ci].toFixed(2) : '-'}</div>
            `;
        }
    });
    dspCanvas?.addEventListener('mouseleave', () => { if (chartTooltip) chartTooltip.style.display = 'none'; });

    // ── API helpers
    function getDSPFormData() {
        const fd = new FormData();
        fd.append('mode', modeInput?.value || 'standard');
        fd.append('threshold', thresholdInput?.value || 12);
        fd.append('low_threshold', lowThresholdInput?.value || 2.5);
        fd.append('pre_pad_sec', ((parseFloat(prePadInput?.value || 5)) / 1000).toString());
        fd.append('post_pad_sec', ((parseFloat(postPadInput?.value || 15)) / 1000).toString());
        fd.append('rolling_window', rollingWindowInput?.value || 150);
        return fd;
    }

    // ── TOAST NOTIFICATION SYSTEM ──
    function showToast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        // Max 3 toasts visible at once
        while (container.children.length >= 3) {
            container.firstElementChild.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '✓',
            error: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
                <span class="toast-msg">${message}</span>
            </div>
            <button class="toast-close-btn" aria-label="Close">&times;</button>
        `;

        const closeBtn = toast.querySelector('.toast-close-btn');
        closeBtn?.addEventListener('click', () => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 250);
        });

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.classList.add('toast-out');
                    setTimeout(() => toast.remove(), 250);
                }
            }, duration);
        }
    }

    // ── FRIENDLY ERROR MAPPER ──
    function handleFriendlyError(err) {
        const msg = err?.message || String(err);
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
            showToast("Can't reach the server. Is the FastAPI backend running?", 'error');
        } else if (msg.includes('ffmpeg is required')) {
            showToast("ffmpeg is required to process MP3/M4A files. Please install ffmpeg or upload a .wav, .flac, or .ogg file.", 'error');
        } else if (msg.includes('Unsupported file format') || msg.includes('Supported formats')) {
            showToast(msg, 'error');
        } else if (msg.includes('500') || msg.includes('Internal Server Error') || msg.includes('processing this file')) {
            showToast("Something went wrong processing this file. Try a shorter clip.", 'error');
        } else {
            showToast(msg, 'error');
        }
    }

    // ── SEQUENTIAL LOADING OVERLAY STAGES ──
    let loadingStageTimer = null;
    const LOADING_STAGES = [
        "Analyzing audio frames...",
        "Computing spectral flux...",
        "Detecting keystroke regions...",
        "Inpainting gaps..."
    ];

    function showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        const stageText = document.getElementById('loading-stage-text');
        
        if (loadingStageTimer) {
            clearInterval(loadingStageTimer);
            loadingStageTimer = null;
        }

        if (overlay) {
            overlay.classList.toggle('hidden', !show);
        }

        if (show) {
            let stageIndex = 0;
            if (stageText) stageText.textContent = LOADING_STAGES[0];

            loadingStageTimer = setInterval(() => {
                stageIndex = (stageIndex + 1) % LOADING_STAGES.length;
                if (stageText) stageText.textContent = LOADING_STAGES[stageIndex];
            }, 600);
        }
    }

    // ── SYNTH BENCHMARK
    document.getElementById('btn-run-synth')?.addEventListener('click', async () => {
        showLoading(true);
        try {
            const res = await fetch('/api/synth', { method: 'POST', body: getDSPFormData() });
            if (!res.ok) throw new Error('Something went wrong processing this file. Try a shorter clip.');
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

            showToast("Synthetic benchmark completed!", "success", 3000);
            setTimeout(() => { resizeCanvas(); drawChart(); }, 60);
        } catch (err) {
            handleFriendlyError(err);
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
            if (!res.ok) { throw new Error('Something went wrong processing this file. Try a shorter clip.'); }
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

            showToast(`Successfully cleaned ${data.count} click transients!`, "success", 3500);
            setTimeout(() => { resizeCanvas(); drawChart(); }, 60);
        } catch (err) {
            handleFriendlyError(err);
        } finally {
            showLoading(false);
        }
    });

    // ── WAV Encoder Helper ──
    function encodeWAV(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);
        
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // Mono PCM
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, samples.length * 2, true);

        let offset = 44;
        for (let i = 0; i < samples.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Blob([buffer], { type: 'audio/wav' });
    }

    // ── RECORD & CLEAN ──
    const btnRecordClean = document.getElementById('btn-record-clean');
    const micErrorBanner = document.getElementById('mic-error-banner');
    const recordingCard = document.getElementById('recording-card');
    const recCountdown = document.getElementById('rec-countdown');
    const micCanvas = document.getElementById('mic-canvas');

    btnRecordClean?.addEventListener('click', async () => {
        if (micErrorBanner) micErrorBanner.style.display = 'none';
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Your browser does not support microphone recording.", "error");
            if (micErrorBanner) {
                micErrorBanner.innerHTML = '⚠️ Your browser does not support microphone recording (navigator.mediaDevices.getUserMedia not available).';
                micErrorBanner.style.display = 'block';
            }
            return;
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            let msg = '⚠️ Microphone access was denied or unavailable. Please check your browser permissions.';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                msg = '🔒 Microphone permission denied. Please allow microphone access in your browser settings to record audio.';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                msg = '🎙️ No microphone device found on your system. Please connect a microphone and try again.';
            }
            showToast(msg, 'error');
            if (micErrorBanner) {
                micErrorBanner.innerHTML = msg;
                micErrorBanner.style.display = 'block';
            }
            return;
        }

        // Show live recording container
        if (recordingCard) recordingCard.style.display = 'flex';
        btnRecordClean.disabled = true;

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        const recordedBuffers = [];

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            recordedBuffers.push(new Float32Array(inputData));
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);

        // Live mic waveform canvas animation
        let animFrameId;
        const micCtx = micCanvas?.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function drawWaveform() {
            if (!micCtx || !micCanvas) return;
            animFrameId = requestAnimationFrame(drawWaveform);
            analyser.getByteTimeDomainData(dataArray);

            const width = micCanvas.parentElement ? micCanvas.parentElement.clientWidth : 300;
            micCanvas.width = width;
            micCanvas.height = 60;

            micCtx.fillStyle = '#050b14';
            micCtx.fillRect(0, 0, width, 60);
            micCtx.lineWidth = 2;
            micCtx.strokeStyle = '#ff2a7f';
            micCtx.beginPath();

            const sliceWidth = width * 1.0 / bufferLength;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * 60) / 2;
                if (i === 0) micCtx.moveTo(x, y);
                else micCtx.lineTo(x, y);
                x += sliceWidth;
            }
            micCtx.stroke();
        }
        drawWaveform();

        // 5-second countdown timer
        let secondsLeft = 5;
        if (recCountdown) recCountdown.textContent = `${secondsLeft}s remaining`;

        const countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                if (recCountdown) recCountdown.textContent = `${secondsLeft}s remaining`;
            } else {
                if (recCountdown) recCountdown.textContent = `Processing audio...`;
                clearInterval(countdownInterval);
            }
        }, 1000);

        // Stop recording after 5 seconds
        setTimeout(async () => {
            cancelAnimationFrame(animFrameId);
            processor.disconnect();
            source.disconnect();
            stream.getTracks().forEach(track => track.stop());
            if (audioCtx.state !== 'closed') await audioCtx.close();

            if (recordingCard) recordingCard.style.display = 'none';
            btnRecordClean.disabled = false;

            // Merge Float32 buffers
            let totalLength = 0;
            recordedBuffers.forEach(b => totalLength += b.length);
            const mergedSamples = new Float32Array(totalLength);
            let offset = 0;
            recordedBuffers.forEach(b => {
                mergedSamples.set(b, offset);
                offset += b.length;
            });

            showLoading(true);

            try {
                // Send WAV blob to /api/clean
                const wavBlob = encodeWAV(mergedSamples, audioCtx.sampleRate);
                const fd = getDSPFormData();
                fd.append('file', wavBlob, 'recording.wav');

                let res = await fetch('/api/clean', { method: 'POST', body: fd });
                
                // Fallback to /api/record if needed
                if (!res.ok) {
                    const payload = {
                        pcm: Array.from(mergedSamples),
                        sr: audioCtx.sampleRate,
                        threshold: parseFloat(thresholdInput?.value || 12),
                        low_threshold: parseFloat(lowThresholdInput?.value || 2.5),
                        mode: modeInput?.value || 'standard',
                        pre_pad_sec: parseFloat(prePadInput?.value || 5) / 1000,
                        post_pad_sec: parseFloat(postPadInput?.value || 15) / 1000,
                        rolling_window: parseInt(rollingWindowInput?.value || 150)
                    };
                    res = await fetch('/api/record', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                if (!res.ok) { throw new Error('Something went wrong processing this file. Try a shorter clip.'); }
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

                showToast(`Live recording cleaned! Removed ${data.count} clicks.`, "success", 3500);
                setTimeout(() => { resizeCanvas(); drawChart(); }, 60);
            } catch (err) {
                handleFriendlyError(err);
            } finally {
                showLoading(false);
            }
        }, 5000);
    });
});
