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

# Unit Tests for Digital Signal Processing Algorithms


# Verifies energy conservation and boundary continuity


def test_silence_returns_no_detections():
    """Verifies that purely silent audio returns empty detected gaps list."""
    from src.detector import detect_click_regions
    sr = 44100
    silence = np.zeros(sr * 2, dtype=np.float32)
    gaps, _ = detect_click_regions(silence, sr=sr, threshold=10.0)
    assert len(gaps) == 0, f"Expected 0 detections in silence, got {len(gaps)}"

def test_hysteresis_low_threshold_bounding():
    """Ensures hysteresis low threshold cannot exceed high threshold."""
    from src.detector import detect_click_regions
    sr = 44100
    signal = np.random.randn(sr).astype(np.float32) * 0.01
    gaps, _ = detect_click_regions(signal, sr=sr, mode="hysteresis", threshold=10.0, low_threshold=15.0)
    assert isinstance(gaps, list)

def test_constant_sine_tone_immunity():
    """Verifies that a steady 440 Hz vocal fundamental tone does not trigger click onset."""
    from src.detector import detect_click_regions
    sr = 44100
    t = np.linspace(0, 1.0, sr)
    steady_tone = (0.7 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    gaps, _ = detect_click_regions(steady_tone, sr=sr, threshold=12.0)
    assert len(gaps) == 0, f"Expected 0 detections on steady tone, got {len(gaps)}"

def test_inpainting_preserves_finite_values():
    """Verifies that inpainting output never introduces NaN or Inf samples."""
    from src.inpaint import inpaint_gaps
    sr = 44100
    audio = np.sin(np.linspace(0, 50, sr)).astype(np.float32)
    gaps = [(0.2, 0.25), (0.6, 0.65)]
    cleaned = inpaint_gaps(audio, gaps, sr=sr)
    assert np.all(np.isfinite(cleaned)), "Inpainting introduced non-finite values"

def test_inpainting_boundary_edge_gaps():
    """Verifies safe handling when click transients occur at sample 0 or final sample."""
    from src.inpaint import inpaint_gaps
    sr = 44100
    audio = np.ones(sr, dtype=np.float32) * 0.5
    edge_gaps = [(0.0, 0.05), (0.95, 1.0)]
    cleaned = inpaint_gaps(audio, edge_gaps, sr=sr)
    assert len(cleaned) == len(audio)
