import os
import sys
import numpy as np

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.detector import detect_keystrokes
from src.inpaint import inpaint_gaps
from src.utils import ensure_mono, normalize_audio, resample_audio
from demo.synth import generate_synthetic_data

def test_detector_nan_and_inf_handling():
    noisy = np.array([np.nan, np.inf, -np.inf, 0.0] * 1000, dtype=np.float32)
    gaps, info = detect_keystrokes(noisy, sr=16000)
    assert isinstance(gaps, list)
    assert "z_scores" in info

def test_detector_synthetic_clicks():
    voice_ref, noisy, gt_times = generate_synthetic_data(sr=16000, duration=3.0, num_clicks=10, seed=42)
    gaps, info = detect_keystrokes(noisy, sr=16000, threshold=10.0)
    assert len(gaps) > 0
    assert len(info["z_scores"]) > 0

def test_inpainting_preserves_length():
    y = np.random.randn(16000).astype(np.float32)
    gaps = [(1000, 1500), (4000, 4200)]
    y_clean = inpaint_gaps(y, gaps)
    assert len(y_clean) == len(y)
    assert not np.isnan(y_clean).any()

def test_inpainting_boundary_edge_cases():
    y = np.ones(500, dtype=np.float32)
    # Gap near index 0
    y_clean = inpaint_gaps(y, [(1, 10)])
    assert len(y_clean) == len(y)

def test_utils_ensure_mono():
    stereo = np.random.randn(100, 2).astype(np.float32)
    mono = ensure_mono(stereo)
    assert mono.ndim == 1
    assert len(mono) == 100

def test_utils_normalize_audio():
    audio = np.array([0.1, -0.5, 0.2], dtype=np.float32)
    norm = normalize_audio(audio, target_peak=1.0)
    assert abs(np.max(np.abs(norm)) - 1.0) < 1e-4

if __name__ == "__main__":
    test_detector_nan_and_inf_handling()
    test_detector_synthetic_clicks()
    test_inpainting_preserves_length()
    test_inpainting_boundary_edge_cases()
    test_utils_ensure_mono()
    test_utils_normalize_audio()
    print("ALL 6 DSP UNIT TESTS PASSED!")
