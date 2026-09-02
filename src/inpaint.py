import numpy as np

def inpaint_gaps(y, gaps):
    """
    Reconstructs audio in the gaps (list of (start, end) sample index tuples) by taking 
    nearby audio on both sides, time-reversing it, and crossfading it.
    
    Parameters:
    ----------
    y : np.ndarray
        Audio signal (1D array).
    gaps : list of tuple
        Click intervals as sample indices [(start_sample, end_sample), ...]
        
    Returns:
    -------
    y_clean : np.ndarray
        Cleaned audio signal (1D array).
    """
    y_clean = y.copy()
    n_samples = len(y_clean)
    
    # Sort and process gaps to ensure sequential inplace updates (so later gaps use updated contexts if close)
    sorted_gaps = sorted(gaps, key=lambda x: x[0])
    
    for start, end in sorted_gaps:
        if start >= end or start >= n_samples or end <= 0:
            continue
            
        start = max(0, start)
        end = min(n_samples, end)
        L = end - start
        
        # 1. Left Context Segment (Size L)
        # If start is less than L, we take what is available and pad it using reflection
        left_start = start - L
        if left_start < 0:
            left_segment = y_clean[0:start]
            left_reverse = np.flip(left_segment)
            if len(left_reverse) > 0:
                pad_len = L - len(left_reverse)
                left_reverse = np.pad(left_reverse, (0, pad_len), mode='reflect')
            else:
                left_reverse = np.zeros(L)
        else:
            left_reverse = np.flip(y_clean[left_start:start])
            
        # 2. Right Context Segment (Size L)
        # If we overlap the boundary, pad mirroring the end
        right_end = end + L
        if right_end > n_samples:
            right_segment = y_clean[end:n_samples]
            right_reverse = np.flip(right_segment)
            if len(right_reverse) > 0:
                pad_len = L - len(right_reverse)
                right_reverse = np.pad(right_reverse, (pad_len, 0), mode='reflect')
            else:
                right_reverse = np.zeros(L)
        else:
            right_reverse = np.flip(y_clean[end:right_end])
            
        # 3. Create Raised Cosine Crossfade Window
        # Weight goes from 1.0 (left context dominance) to 0.0 (right context dominance)
        if L > 1:
            w = 0.5 + 0.5 * np.cos(np.pi * np.arange(L) / (L - 1))
        else:
            w = np.array([0.5])
            
        # 4. Synthesize Inpainted Audio
        inpainted = w * left_reverse + (1.0 - w) * right_reverse
        
        # Replace the noisy gap with the reconstructed signal
        y_clean[start:end] = inpainted
        
    return y_clean
