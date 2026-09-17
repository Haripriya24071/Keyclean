import os
import sys
import argparse
import numpy as np

# Add parent directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.detector import detect_keystrokes
from demo.synth import generate_synthetic_data
from demo.run_demo import evaluate_detections

def run_grid_search(thresholds=[8.0, 10.0, 12.0, 15.0], low_thresholds=[2.0, 2.5, 3.5, 4.0], modes=["standard", "hysteresis"]):
    """
    Grid search hyperparameter optimizer for KeyClean click detection engine.
    Sweeps over thresholds and modes to find optimal parameter combinations.
    """
    print("="*65)
    print("        KEYCLEAN DSP HYPERPARAMETER GRID SEARCH OPTIMIZER")
    print("="*65)
    
    sr = 16000
    duration = 6.0
    num_clicks = 40
    
    voice_ref, noisy, gt_times = generate_synthetic_data(sr, duration, num_clicks, seed=42)
    
    results = []
    
    for mode in modes:
        for thresh in thresholds:
            for low_t in low_thresholds:
                if mode == "standard" and low_t != low_thresholds[0]:
                    # Low threshold only applies to hysteresis mode
                    continue
                    
                gaps, _ = detect_keystrokes(
                    noisy, sr, 
                    threshold=thresh, 
                    low_threshold=low_t, 
                    mode=mode,
                    pre_pad_sec=0.005,
                    post_pad_sec=0.015
                )
                metrics = evaluate_detections(gaps, gt_times, sr)
                
                results.append({
                    "mode": mode,
                    "threshold": thresh,
                    "low_threshold": low_t if mode == "hysteresis" else None,
                    "tp": metrics["tp"],
                    "fp": metrics["fp"],
                    "fn": metrics["fn"],
                    "precision": metrics["precision"],
                    "recall": metrics["recall"],
                    "f1": metrics["f1"],
                    "mean_error_ms": metrics["mean_timing_error_ms"]
                })
                
    # Sort results by F1 score descending
    results.sort(key=lambda r: (r["f1"], r["precision"]), reverse=True)
    
    print(f"\n{'Mode':<12} | {'Thresh':<6} | {'LowT':<6} | {'TP':<3} | {'FP':<3} | {'FN':<3} | {'Prec':<5} | {'Rec':<5} | {'F1':<5} | {'Error(ms)':<8}")
    print("-" * 75)
    
    for res in results[:10]:
        low_t_str = f"{res['low_threshold']:.1f}" if res['low_threshold'] is not None else "-"
        print(f"{res['mode']:<12} | {res['threshold']:<6.1f} | {low_t_str:<6} | {res['tp']:<3} | {res['fp']:<3} | {res['fn']:<3} | {res['precision']:<5.2f} | {res['recall']:<5.2f} | {res['f1']:<5.2f} | {res['mean_error_ms']:<8.2f}")
        
    print("-" * 75)
    best = results[0]
    print(f"\n[BEST] Optimal Profile: Mode={best['mode']} | Threshold={best['threshold']} | F1={best['f1']:.2f}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="KeyClean DSP Grid Search Optimizer")
    parser.parse_args()
    run_grid_search()
