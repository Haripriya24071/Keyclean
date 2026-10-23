import numpy as np
import librosa

def ensure_mono(audio: np.ndarray) -> np.ndarray:
    """
    Converts multi-channel (stereo) audio signal to a 1D mono float32 array.
    """
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim > 1:
        return np.mean(audio, axis=1)
    return audio

def normalize_audio(audio: np.ndarray, target_peak: float = 0.95) -> np.ndarray:
    """
    Normalizes a 1D float32 audio array to a target peak magnitude.
    """
    audio = np.nan_to_num(np.asarray(audio, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    max_val = np.max(np.abs(audio))
    if max_val > 1e-7:
        return audio * (target_peak / max_val)
    return audio

def resample_audio(audio: np.ndarray, orig_sr: int, target_sr: int = 16000) -> tuple[np.ndarray, int]:
    """
    Resamples a 1D audio array to target_sr Hz using librosa if sample rates differ.
    """
    audio = ensure_mono(audio)
    if orig_sr != target_sr and len(audio) > 0:
        resampled = librosa.resample(audio, orig_sr=orig_sr, target_sr=target_sr)
        return resampled.astype(np.float32), target_sr
    return audio, orig_sr

# Audio I/O and Signal Normalization Utilities


# Validate audio sample rate and channel layout before DSP steps


# Peak and RMS normalization helper routines


from typing import Optional

def get_audio_duration_seconds(audio: np.ndarray, sr: int) -> float:
    """Calculates audio duration in fractional seconds."""
    if audio is None or sr <= 0:
        return 0.0
    return float(len(audio)) / float(sr)

def compute_signal_rms(signal: np.ndarray) -> float:
    """Computes Root Mean Square (RMS) energy level of an audio vector."""
    if signal is None or len(signal) == 0:
        return 0.0
    return float(np.sqrt(np.mean(signal.astype(np.float64)**2)))

def prevent_clipping(signal: np.ndarray, max_val: float = 0.99) -> np.ndarray:
    """Clamps audio peak amplitudes to safe [-max_val, max_val] margin."""
    return np.clip(signal, -max_val, max_val).astype(np.float32)
