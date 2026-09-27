"""Generate Klyra's bundled background-music library.

Every track is synthesized from scratch by this script (no samples, no
third-party audio), so the output is original work owned by the Klyra
project and can ship inside the app with no licensing restrictions.

Usage: python3 scripts/music-library/generate.py <ffmpeg-binary> <output-dir>
Requires numpy.
"""

import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
RNG = np.random.default_rng(20260927)


def midi(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def env_adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sustain_len = max(n - a - d - r, 0)
    parts = [
        np.linspace(0, 1, max(a, 1), endpoint=False),
        np.linspace(1, s, max(d, 1), endpoint=False),
        np.full(sustain_len, s),
        np.linspace(s, 0, max(r, 1)),
    ]
    return np.concatenate(parts)[:n]


def one_pole_lowpass(x, cutoff):
    k = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - k) * x[i] + k * acc
        y[i] = acc
    return y


def pad(freqs, dur, bright=1800):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for detune in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (detune / 12)
            phase = RNG.random() * 2 * np.pi
            # band-limited-ish saw from a few harmonics
            for k in range(1, 7):
                out += np.sin(2 * np.pi * ff * k * t + phase * k) / k * 0.5 ** (k / 3)
    out *= env_adsr(n, 0.9, 0.5, 0.8, 1.2)
    out = one_pole_lowpass(out, bright)
    return out / max(len(freqs) * 3, 1)


def pluck(f, dur, decay=3.5, harmonics=8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * f * k * t) * np.exp(-t * (decay + k * 1.3)) / k
    attack = np.minimum(t / 0.004, 1)
    return out * attack


def piano(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, amp in enumerate((1.0, 0.45, 0.25, 0.12, 0.06, 0.03), start=1):
        out += amp * np.sin(2 * np.pi * f * k * 1.0008 ** k * t) * np.exp(-t * (1.1 + 0.9 * k))
    attack = np.minimum(t / 0.003, 1)
    return out * attack * 0.8


def rhodes(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 1.0 * t) * 1.2 * np.exp(-t * 2.5)
    tone = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 0.9)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * t)
    return tone * trem * np.minimum(t / 0.005, 1) * 0.7


def bass(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return np.tanh(1.6 * tone) * env_adsr(n, 0.01, 0.1, 0.8, 0.08) * 0.6


def kick(dur=0.45):
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = 45 + 75 * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(phase) * np.exp(-t * 7.5)


def hat(dur=0.08, open_=False):
    n = int((0.3 if open_ else dur) * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n)
    noise = noise - one_pole_lowpass(noise, 7000)
    return noise * np.exp(-t * (14 if open_ else 55)) * 0.35


def snare(dur=0.25):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n)
    noise = noise - one_pole_lowpass(noise, 1500)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30)
    return (noise * np.exp(-t * 18) * 0.5 + tone * 0.5) * 0.7


def clap(dur=0.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n)
    noise = noise - one_pole_lowpass(noise, 1200)
    envelope = np.zeros(n)
    for offset in (0.0, 0.012, 0.024):
        start = int(offset * SR)
        envelope[start:] += np.exp(-(t[: n - start]) * 40)
    return noise * envelope * 0.25


class Track:
    def __init__(self, seconds):
        self.left = np.zeros(int(seconds * SR) + SR * 3)
        self.right = np.zeros_like(self.left)

    def add(self, signal, at, gain=1.0, pan=0.0):
        start = int(at * SR)
        end = min(start + len(signal), len(self.left))
        if start >= len(self.left):
            return
        chunk = signal[: end - start] * gain
        self.left[start:end] += chunk * np.sqrt((1 - pan) / 2) * np.sqrt(2)
        self.right[start:end] += chunk * np.sqrt((1 + pan) / 2) * np.sqrt(2)


def reverb(x, seconds=1.8, mix=0.25):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = RNG.standard_normal(n) * np.exp(-t * 6.9 / seconds)
    ir[0] = 0
    ir /= np.sqrt(np.sum(ir**2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - mix) + wet * mix


def master(track, seconds, verb=0.25, verb_len=1.8):
    n = int(seconds * SR)
    stereo = []
    for channel in (track.left, track.right):
        channel = reverb(channel, verb_len, verb)[:n]
        stereo.append(channel)
    audio = np.stack(stereo, axis=1)
    fade_in, fade_out = int(0.05 * SR), int(3.0 * SR)
    audio[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    audio[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    audio = np.tanh(audio / np.max(np.abs(audio)) * 1.3)
    return audio / np.max(np.abs(audio)) * 0.89


def chord(root, quality):
    shapes = {
        "maj": (0, 4, 7), "min": (0, 3, 7), "maj7": (0, 4, 7, 11),
        "min7": (0, 3, 7, 10), "dom7": (0, 4, 7, 10), "six": (0, 4, 7, 9),
        "sus2": (0, 2, 7),
    }
    return [root + i for i in shapes[quality]]


# ---------------------------------------------------------------- tracks

def calm_focus():
    bpm, bars = 72, 20
    beat = 60 / bpm
    seconds = bars * 4 * beat
    track = Track(seconds)
    prog = [chord(60, "maj7"), chord(57, "min7"), chord(53, "maj7"), chord(55, "six")]
    for bar in range(bars):
        notes = prog[bar % 4]
        at = bar * 4 * beat
        track.add(pad([midi(n) for n in notes], 4 * beat + 1.2, 1400), at, 0.55)
        track.add(bass(midi(notes[0] - 24), 4 * beat), at, 0.35)
        if bar >= 2:
            for step, idx in enumerate((0, 2, 3, 1)):
                track.add(piano(midi(notes[idx] + 12), 2.5), at + step * beat, 0.22, pan=0.3 * (-1) ** step)
    return master(track, seconds, verb=0.35, verb_len=2.6)


def upbeat_product():
    bpm, bars = 118, 36
    beat = 60 / bpm
    seconds = bars * 4 * beat
    track = Track(seconds)
    prog = [chord(62, "maj"), chord(57, "maj"), chord(59, "min"), chord(55, "maj")]
    for bar in range(bars):
        notes = prog[bar % 4]
        at = bar * 4 * beat
        for b in range(4):
            if bar >= 2:
                track.add(kick(), at + b * beat, 0.9)
            track.add(hat(), at + b * beat + beat / 2, 0.5, pan=0.25)
            if b in (1, 3) and bar >= 4:
                track.add(clap(), at + b * beat, 0.8)
        for step in range(8):
            note = notes[(0, 1, 2, 1, 0, 2, 1, 2)[step]] + 12
            track.add(pluck(midi(note), 0.5), at + step * beat / 2, 0.25, pan=0.4 if step % 2 else -0.4)
        for b in (0, 1.5, 2, 3.5):
            track.add(bass(midi(notes[0] - 24), beat * 0.45), at + b * beat, 0.5)
        track.add(pad([midi(n) for n in notes], 4 * beat, 2200), at, 0.25)
    return master(track, seconds, verb=0.18)


def lofi_chill():
    bpm, bars = 80, 24
    beat = 60 / bpm
    swing = beat * 0.58
    seconds = bars * 4 * beat
    track = Track(seconds)
    prog = [chord(55, "min7"), chord(60, "dom7"), chord(53, "maj7"), chord(50, "min7")]
    for bar in range(bars):
        notes = prog[bar % 4]
        at = bar * 4 * beat
        for n in notes:
            track.add(rhodes(midi(n), 4 * beat), at + RNG.random() * 0.02, 0.2)
        track.add(bass(midi(notes[0] - 24), 2 * beat), at, 0.4)
        track.add(bass(midi(notes[0] - 24), 1.5 * beat), at + 2.5 * beat, 0.35)
        track.add(kick(), at, 0.6)
        track.add(kick(), at + 2.5 * beat, 0.5)
        track.add(snare(), at + beat, 0.45)
        track.add(snare(), at + 3 * beat, 0.45)
        for b in range(4):
            track.add(hat(), at + b * beat, 0.35, pan=-0.2)
            track.add(hat(), at + b * beat + swing, 0.22, pan=-0.2)
    audio = master(track, seconds, verb=0.28, verb_len=1.5)
    crackle = RNG.standard_normal(audio.shape) * 0.004
    crackle[RNG.random(audio.shape) > 0.9995] += 0.15
    return np.clip(audio + crackle, -0.95, 0.95)


def tech_pulse():
    bpm, bars = 124, 36
    beat = 60 / bpm
    seconds = bars * 4 * beat
    track = Track(seconds)
    prog = [chord(57, "min"), chord(53, "maj"), chord(60, "maj"), chord(55, "maj")]
    for bar in range(bars):
        notes = prog[bar % 4]
        at = bar * 4 * beat
        for b in range(4):
            track.add(kick(), at + b * beat, 0.95)
            track.add(hat(open_=True), at + b * beat + beat / 2, 0.35, pan=0.3)
        for step in range(16):
            note = notes[step % 3] + (12 if step % 8 >= 4 else 24)
            track.add(pluck(midi(note), 0.22, decay=9, harmonics=5), at + step * beat / 4, 0.18,
                      pan=0.5 * np.sin(step))
        for b in range(8):
            track.add(bass(midi(notes[0] - 24), beat * 0.3), at + b * beat / 2 + beat / 4, 0.45)
        pumped = pad([midi(n) for n in notes], 4 * beat, 2600)
        t = np.arange(len(pumped)) / SR
        pumped *= 0.35 + 0.65 * np.minimum((t % beat) / (beat * 0.6), 1)
        track.add(pumped, at, 0.3)
    return master(track, seconds, verb=0.15)


def corporate_bright():
    bpm, bars = 105, 32
    beat = 60 / bpm
    seconds = bars * 4 * beat
    track = Track(seconds)
    prog = [chord(55, "maj"), chord(62, "maj"), chord(64, "min"), chord(60, "maj")]
    for bar in range(bars):
        notes = prog[bar % 4]
        at = bar * 4 * beat
        for b in range(4):
            track.add(piano(midi(notes[b % 3] + 12), 1.2), at + b * beat, 0.28)
            track.add(piano(midi(notes[(b + 1) % 3] + 12), 1.0), at + b * beat + beat / 2, 0.18)
        if bar >= 4:
            for b in range(4):
                track.add(kick(), at + b * beat, 0.6)
            track.add(clap(), at + beat, 0.7)
            track.add(clap(), at + 3 * beat, 0.7)
            for b in range(8):
                track.add(hat(), at + b * beat / 2, 0.3, pan=0.3)
        track.add(bass(midi(notes[0] - 24), 4 * beat * 0.95), at, 0.4)
        track.add(pad([midi(n) for n in notes], 4 * beat, 2000), at, 0.22)
    return master(track, seconds, verb=0.22)


def minimal_piano():
    bpm, bars = 66, 20
    beat = 60 / bpm
    seconds = bars * 4 * beat
    track = Track(seconds)
    prog = [chord(57, "min"), chord(52, "min"), chord(53, "maj"), chord(48, "maj")]
    for bar in range(bars):
        notes = prog[bar % 4]
        at = bar * 4 * beat
        track.add(piano(midi(notes[0] - 12), 4), at, 0.35)
        pattern = (0, 1, 2, 1, 2, 1, 0, 2)
        for step, idx in enumerate(pattern):
            track.add(piano(midi(notes[idx] + 12), 2.5), at + step * beat / 2, 0.24,
                      pan=-0.25 if step % 2 else 0.25)
    return master(track, seconds, verb=0.4, verb_len=3.0)


TRACKS = {
    "calm-focus": calm_focus,
    "upbeat-product": upbeat_product,
    "lofi-chill": lofi_chill,
    "tech-pulse": tech_pulse,
    "corporate-bright": corporate_bright,
    "minimal-piano": minimal_piano,
}


def write_wav(path, audio):
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())


def main():
    ffmpeg, out_dir = sys.argv[1], Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, build in TRACKS.items():
        audio = build()
        wav_path = out_dir / f"{name}.wav"
        write_wav(wav_path, audio)
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(wav_path),
             "-codec:a", "libmp3lame", "-b:a", "160k", str(out_dir / f"{name}.mp3")],
            check=True,
        )
        wav_path.unlink()
        print(f"{name}: {len(audio) / SR:.1f}s")


if __name__ == "__main__":
    main()
