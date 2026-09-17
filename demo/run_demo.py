import os
import argparse
import numpy as np
import scipy.io.wavfile as wav

# Add parent directory to sys.path so we can import src
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.detector import detect_keystrokes
from src.inpaint import inpaint_gaps
from demo.synth import generate_synthetic_data, save_wav

def load_wav(filepath):
    """
    Reads a WAV file and returns a mono float32 signal in the range [-1.0, 1.0].
    """
    sr, data = wav.read(filepath)
    # Convert to float32
    if data.dtype == np.int16:
        data = data.astype(np.float32) / 32767.0
    elif data.dtype == np.int32:
        data = data.astype(np.float32) / 2147483647.0
    elif data.dtype == np.uint8:
        data = (data.astype(np.float32) - 128.0) / 128.0
    elif data.dtype == np.float32:
        pass
    else:
        raise ValueError(f"Unsupported audio data type: {data.dtype}")
        
    # Convert multi-channel (stereo) to mono
    if len(data.shape) > 1:
        data = np.mean(data, axis=1)
        
    return data, sr

def evaluate_detections(gaps, ground_truth_secs, sr, tolerance_sec=0.03):
    """
    Matches detected gaps to ground-truth keystroke timestamps and calculates
    precision, recall, F1, and mean timing offset error (in ms).
    """
    tp = 0
    fn = 0
    fp = 0
    timing_errors_ms = []
    
    # Track which gaps matched a ground-truth click
    matched_gaps = set()
    
    for gt_sec in ground_truth_secs:
        gt_sample = int(gt_sec * sr)
        match_found = False
        
        # Check if click is inside or close to any detected gap
        for i, (start, end) in enumerate(gaps):
            # Include a small tolerance window around the gap
            tol = int(tolerance_sec * sr)
            if (start - tol) <= gt_sample <= (end + tol):
                match_found = True
                matched_gaps.add(i)
                gap_center = (start + end) / 2.0
                timing_errors_ms.append(abs(gt_sample - gap_center) / sr * 1000.0)
                break
                
        if match_found:
            tp += 1
        else:
            fn += 1
            
    # Any gap that didn't match a ground-truth click is a false positive
    fp = len(gaps) - len(matched_gaps)
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / len(ground_truth_secs) if len(ground_truth_secs) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    mean_error = float(np.mean(timing_errors_ms)) if len(timing_errors_ms) > 0 else 0.0
    
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "mean_timing_error_ms": round(mean_error, 2)
    }

def main():
    parser = argparse.ArgumentParser(description="KeyClean Audio Denoiser Demo Runner")
    parser.add_argument("--real", type=str, help="Path to real audio file to clean (bypasses synthetic generation)")
    parser.add_argument("--threshold", type=float, default=12.0, help="Detector Z-score threshold (default: 12.0)")
    parser.add_argument("--low-threshold", type=float, default=2.5, help="Hysteresis low threshold (default: 2.5)")
    parser.add_argument("--mode", type=str, choices=["standard", "hysteresis"], default="standard", help="Detection mode (default: standard)")
    parser.add_argument("--pre-pad", type=float, default=0.005, help="Pre-onset padding in seconds (default: 0.005)")
    parser.add_argument("--post-pad", type=float, default=0.015, help="Post-onset padding in seconds (default: 0.015)")
    parser.add_argument("--rolling-window", type=int, default=150, help="MAD baseline rolling window (default: 150)")
    parser.add_argument("--output", type=str, default="data/cleaned.wav", help="Output path for cleaned audio file")
    args = parser.parse_args()
    
    os.makedirs("data", exist_ok=True)
    
    if args.real:
        print(f"Cleaning real recording: {args.real}")
        if not os.path.exists(args.real):
            print(f"Error: file '{args.real}' not found.")
            return
            
        y, sr = load_wav(args.real)
        print(f"Audio loaded: {len(y)} samples @ {sr}Hz ({len(y)/sr:.2f}s)")
        
        # Run detection
        gaps, _ = detect_keystrokes(
            y, sr, 
            threshold=args.threshold,
            low_threshold=args.low_threshold,
            mode=args.mode,
            pre_pad_sec=args.pre_pad,
            post_pad_sec=args.post_pad,
            rolling_window=args.rolling_window
        )
        print(f"Detected {len(gaps)} potential click intervals.")
        
        # Run inpainting
        y_clean = inpaint_gaps(y, gaps)
        
        # Save cleaned file
        save_wav(args.output, y_clean, sr)
        print(f"Cleaned audio saved to: {args.output}")
        
    else:
        print("Running KeyClean Synthetic Benchmark...")
        sr = 16000
        duration = 6.0
        num_clicks = 40
        
        # 1. Generate Voice and Clicks
        voice_ref, noisy, gt_times = generate_synthetic_data(sr, duration, num_clicks)
        
        # Save inputs
        save_wav("data/voice_only_reference.wav", voice_ref, sr)
        save_wav("data/noisy.wav", noisy, sr)
        print("Generated files 'data/voice_only_reference.wav' and 'data/noisy.wav'")
        
        # 2. Run detection
        gaps, _ = detect_keystrokes(
            noisy, sr, 
            threshold=args.threshold,
            low_threshold=args.low_threshold,
            mode=args.mode,
            pre_pad_sec=args.pre_pad, 
            post_pad_sec=args.post_pad,
            rolling_window=args.rolling_window
        )
        
        # 3. Evaluate results
        metrics = evaluate_detections(gaps, gt_times, sr)
        
        # 4. Inpaint noise
        cleaned = inpaint_gaps(noisy, gaps)
        save_wav(args.output, cleaned, sr)
        print(f"Inpainted and saved cleaned output to '{args.output}'")
        
        # Output Benchmarking Metrics
        print("\n" + "="*40)
        print("           BENCHMARK RESULTS")
        print("="*40)
        print(f"Ground-Truth Keystrokes Injected: {num_clicks}")
        print(f"Correctly Detected (TP):        {metrics['tp']}")
        print(f"False Positives (FP):           {metrics['fp']}")
        print(f"Missed Detections (FN):         {metrics['fn']}")
        print("-"*40)
        print(f"Precision:                      {metrics['precision']:.2f}")
        print(f"Recall:                         {metrics['recall']:.2f}")
        print(f"F1-Score:                       {metrics['f1']:.2f}")
        print(f"Mean Timing Offset Error:       {metrics['mean_timing_error_ms']:.2f} ms")
        print("="*40)
        
if __name__ == "__main__":
    main()
