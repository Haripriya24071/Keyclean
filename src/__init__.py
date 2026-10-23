"""
KeyClean DSP Core Package
"""
from .detector import detect_keystrokes
from .inpaint import inpaint_gaps
from .utils import normalize_audio, resample_audio, ensure_mono

__all__ = ["detect_keystrokes", "inpaint_gaps", "normalize_audio", "resample_audio", "ensure_mono"]

# KeyClean package marker
__version__ = '0.1.0'

