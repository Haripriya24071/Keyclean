import os
import sys
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'c:\\Users\\hp\\keyclean')))

from demo.synth import generate_synthetic_data
from demo.run_demo import evaluate_detections

sr = 16000
duration = 6.0
num_clicks = 40
voice_ref, noisy, gt_times = generate_synthetic_data(sr, duration, num_clicks)

# Double thresholding (hysteresis) detector
def detect_keystrokes_hysteresis(y, sr, frame_size=512, hop_size=128, threshold=12.0, low_threshold=2.5, rolling_window=150, pre_pad_sec=0.003, post_pad_sec=0.008):
    n_samples = len(y)
    win = np.hanning(frame_size)
    n_frames = int(np.floor((n_samples - frame_size) / hop_size)) + 1
    fft_size = frame_size // 2 + 1
    magnitude = np.zeros((fft_size, n_frames))
    
    for t in range(n_frames):
        start = t * hop_size
        frame = y[start : start + frame_size] * win
        magnitude[:, t] = np.abs(np.fft.rfft(frame, n=frame_size))
        
    sf = np.zeros(n_frames)
    if n_frames > 1:
        diffs = magnitude[:, 1:] - magnitude[:, :-1]
        sf[1:] = np.sum(np.maximum(0, diffs), axis=0)
        
    frequencies = np.fft.rfftfreq(frame_size, d=1.0/sr)
    hf_bins = frequencies >= 3000
    
    hf_energy = np.sum(magnitude[hf_bins, :], axis=0)
    total_energy = np.sum(magnitude, axis=0) + 1e-10
    hf_ratio = hf_energy / total_energy
    
    onset_strength = sf * hf_ratio
    
    z_scores = np.zeros(n_frames)
    for i in range(n_frames):
        if i < 10:
            z_scores[i] = 0
            continue
        start_idx = max(0, i - rolling_window)
        window = onset_strength[start_idx : i]
        med = np.median(window)
        mad = np.median(np.abs(window - med))
        z_scores[i] = (onset_strength[i] - med) / (1.4826 * mad + 1e-5)
            
    # Find peak candidate frames
    peaks = np.where(z_scores >= threshold)[0]
    
    pre_samples = int(pre_pad_sec * sr)
    post_samples = int(post_pad_sec * sr)
    
    raw_intervals = []
    
    for p in peaks:
        # Trace backward to find start
        start_frame = p
        while start_frame > 0 and z_scores[start_frame] >= low_threshold:
            start_frame -= 1
            
        # Trace forward to find end
        end_frame = p
        while end_frame < n_frames - 1 and z_scores[end_frame] >= low_threshold:
            end_frame += 1
            
        start_sample = max(0, start_frame * hop_size - pre_samples)
        end_sample = min(n_samples, end_frame * hop_size + post_samples)
        raw_intervals.append((start_sample, end_sample))
        
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
        
    return gaps, z_scores

# Test multiple parameters
for thresh in [10.0, 12.0, 15.0]:
    for low_t in [2.0, 2.5, 3.0, 4.0]:
        gaps, z = detect_keystrokes_hysteresis(noisy, sr, threshold=thresh, low_threshold=low_t)
        metrics = evaluate_detections(gaps, gt_times, sr)
        print(f"Thresh: {thresh} | LowThresh: {low_t} | TP: {metrics['tp']} | FP: {metrics['fp']} | FN: {metrics['fn']} | F1: {metrics['f1']:.2f}")
