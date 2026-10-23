# Unit Tests for Audio Utility Functions
import numpy as np
from src.utils import normalize_audio, prevent_clipping, get_audio_duration_seconds

def test_audio_normalization_peak():
    signal = np.array([0.5, -1.0, 0.25], dtype=np.float32)
    norm = normalize_audio(signal)
    assert np.max(np.abs(norm)) <= 1.0

def test_prevent_clipping_bounds():
    overshot = np.array([1.5, -2.0, 0.5], dtype=np.float32)
    clamped = prevent_clipping(overshot, max_val=0.99)
    assert np.max(clamped) <= 0.99
    assert np.min(clamped) >= -0.99

def test_audio_duration_calculation():
    sr = 44100
    audio = np.zeros(sr * 3, dtype=np.float32)
    duration = get_audio_duration_seconds(audio, sr)
    assert abs(duration - 3.0) < 1e-4
