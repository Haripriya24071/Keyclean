import numpy as np

def detect_keystrokes(y, sr, frame_size=512, hop_size=128, threshold=12.0, rolling_window=150, pre_pad_sec=0.005, post_pad_sec=0.015):
    """
    Detect keystroke click noise in an audio signal using spectral flux and high-frequency energy ratio,
    with a robust Median/MAD z-score rolling baseline.
    
    Parameters:
    ----------
    y : np.ndarray
        Audio signal (1D array).
    sr : int
        Sample rate in Hz.
    frame_size : int
        Size of each STFT frame.
    hop_size : int
        Hop size between frames.
    threshold : float
        MAD Z-score threshold for click onset detection defaults to 12.0.
    rolling_window : int
        Number of historical frames to calculate baseline median/MAD.
    pre_pad_sec : float
        Padding before the detected onset in seconds.
    post_pad_sec : float
        Padding after the detected onset in seconds.
        
    Returns:
    -------
    gaps : list of tuple
        Detected keystroke click intervals as sample indices [(start_sample, end_sample), ...]
    metrics_info : dict
        Debugging and plotting info (z_scores, onset_strength, etc.)
    """
    n_samples = len(y)
    if n_samples < frame_size:
        return [], {"z_scores": [], "onset_strength": []}
        
    # Generate Hanning window
    win = np.hanning(frame_size)
    
    # Compute STFT magnitude using base numpy for robustness
    n_frames = int(np.floor((n_samples - frame_size) / hop_size)) + 1
    fft_size = frame_size // 2 + 1
    magnitude = np.zeros((fft_size, n_frames))
    
    for t in range(n_frames):
        start = t * hop_size
        frame = y[start : start + frame_size] * win
        magnitude[:, t] = np.abs(np.fft.rfft(frame, n=frame_size))
        
    # 1. Compute Spectral Flux
    # Difference in magnitude spectrum between frame t and t-1
    sf = np.zeros(n_frames)
    if n_frames > 1:
        diffs = magnitude[:, 1:] - magnitude[:, :-1]
        sf[1:] = np.sum(np.maximum(0, diffs), axis=0)
        
    # 2. Compute High-frequency energy ratio (>3kHz)
    frequencies = np.fft.rfftfreq(frame_size, d=1.0/sr)
    hf_bins = frequencies >= 3000
    
    hf_energy = np.sum(magnitude[hf_bins, :], axis=0)
    total_energy = np.sum(magnitude, axis=0) + 1e-10
    hf_ratio = hf_energy / total_energy
    
    # 3. Combine to get Click Onset Strength
    onset_strength = sf * hf_ratio
    
    # 4. Compute Rolling Z-score with MAD (excluding current frame to avoid self-contamination)
    z_scores = np.zeros(n_frames)
    for i in range(n_frames):
        # Startup guard: ignore the first 10 frames (~80ms startup) to avoid boundary transition false triggers
        if i < 10:
            z_scores[i] = 0
            continue
            
        start_idx = max(0, i - rolling_window)
        # Calculate trailing history excluding current frame
        window = onset_strength[start_idx : i]
        med = np.median(window)
        mad = np.median(np.abs(window - med))
        z_scores[i] = (onset_strength[i] - med) / (1.4826 * mad + 1e-5)
        
    # 5. Extract click onset frames and map to sample indices
    detected_frames = np.where(z_scores > threshold)[0]
    
    pre_samples = int(pre_pad_sec * sr)
    post_samples = int(post_pad_sec * sr)
    
    raw_intervals = []
    for f in detected_frames:
        onset_sample = f * hop_size
        start_sample = max(0, onset_sample - pre_samples)
        end_sample = min(n_samples, onset_sample + post_samples)
        raw_intervals.append((start_sample, end_sample))
        
    # Merge overlapping intervals
    gaps = []
    if len(raw_intervals) > 0:
        raw_intervals = sorted(raw_intervals, key=lambda x: x[0])
        current_start, current_end = raw_intervals[0]
        
        for next_start, next_end in raw_intervals[1:]:
            if next_start <= current_end:
                current_end = max(current_end, next_end)
            else:
                gaps.append((current_start, current_end))
                current_start, current_end = next_start, next_end
        gaps.append((current_start, current_end))
        
    metrics_info = {
        "z_scores": z_scores.tolist(),
        "onset_strength": onset_strength.tolist(),
        "sf": sf.tolist(),
        "hf_ratio": hf_ratio.tolist(),
        "frames_t": (np.arange(n_frames) * hop_size / sr).tolist()
    }
    
    return gaps, metrics_info
