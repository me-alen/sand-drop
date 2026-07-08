import { EXPLOSION_FULL_CHARGE_MS } from './constants';

// Synthesized game audio via Web Audio — no asset files. Every call is safe
// in environments without AudioContext (jsdom, old browsers): it no-ops.

type PourKind = 'sand' | 'water';

class GameAudio {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private pour: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
    private charge: { osc: OscillatorNode; gain: GainNode } | null = null;
    private muted = false;

    private ensure(): boolean {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => undefined);
            }
            return this.master !== null;
        }
        const Ctor =
            window.AudioContext ??
            (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return false;
        try {
            this.ctx = new Ctor();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 1;
            this.master.connect(this.ctx.destination);

            this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            return true;
        } catch {
            this.ctx = null;
            this.master = null;
            return false;
        }
    }

    // Must be called from a user gesture so autoplay policies allow audio.
    unlock(): void {
        this.ensure();
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (this.master && this.ctx) {
            this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
        }
    }

    startPour(kind: PourKind): void {
        if (this.pour || !this.ensure() || !this.ctx || !this.master || !this.noiseBuffer) return;
        try {
            const source = this.ctx.createBufferSource();
            source.buffer = this.noiseBuffer;
            source.loop = true;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = kind === 'sand' ? 4200 : 900;
            filter.Q.value = kind === 'sand' ? 0.9 : 1.6;
            const gain = this.ctx.createGain();
            gain.gain.value = 0;
            gain.gain.setTargetAtTime(kind === 'sand' ? 0.06 : 0.09, this.ctx.currentTime, 0.05);
            source.connect(filter);
            filter.connect(gain);
            gain.connect(this.master);
            source.start();
            this.pour = { source, gain };
        } catch {
            this.pour = null;
        }
    }

    stopPour(): void {
        const pour = this.pour;
        this.pour = null;
        if (!pour || !this.ctx) return;
        try {
            pour.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
            pour.source.stop(this.ctx.currentTime + 0.35);
        } catch {
            // already stopped
        }
    }

    startCharge(): void {
        if (this.charge || !this.ensure() || !this.ctx || !this.master) return;
        try {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(70, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(
                560,
                this.ctx.currentTime + EXPLOSION_FULL_CHARGE_MS / 1000
            );
            const gain = this.ctx.createGain();
            gain.gain.value = 0;
            gain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.08);
            osc.connect(gain);
            gain.connect(this.master);
            osc.start();
            this.charge = { osc, gain };
        } catch {
            this.charge = null;
        }
    }

    chargeReady(): void {
        this.blip(880, 0.07);
    }

    stopCharge(): void {
        const charge = this.charge;
        this.charge = null;
        if (!charge || !this.ctx) return;
        try {
            charge.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
            charge.osc.stop(this.ctx.currentTime + 0.15);
        } catch {
            // already stopped
        }
    }

    explosion(intensity: number): void {
        if (!this.ensure() || !this.ctx || !this.master || !this.noiseBuffer) return;
        try {
            const t = this.ctx.currentTime;
            const power = 0.35 + 0.65 * Math.max(0, Math.min(intensity, 1));

            const thump = this.ctx.createOscillator();
            thump.type = 'sine';
            thump.frequency.setValueAtTime(110, t);
            thump.frequency.exponentialRampToValueAtTime(32, t + 0.4);
            const thumpGain = this.ctx.createGain();
            thumpGain.gain.setValueAtTime(0.9 * power, t);
            thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            thump.connect(thumpGain);
            thumpGain.connect(this.master);
            thump.start(t);
            thump.stop(t + 0.55);

            const burst = this.ctx.createBufferSource();
            burst.buffer = this.noiseBuffer;
            const burstFilter = this.ctx.createBiquadFilter();
            burstFilter.type = 'lowpass';
            burstFilter.frequency.setValueAtTime(6000, t);
            burstFilter.frequency.exponentialRampToValueAtTime(180, t + 0.45);
            const burstGain = this.ctx.createGain();
            burstGain.gain.setValueAtTime(0.5 * power, t);
            burstGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            burst.connect(burstFilter);
            burstFilter.connect(burstGain);
            burstGain.connect(this.master);
            burst.start(t);
            burst.stop(t + 0.65);
        } catch {
            // audio glitches must never break the game
        }
    }

    private blip(frequency: number, volume: number): void {
        if (!this.ensure() || !this.ctx || !this.master) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = frequency;
            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            osc.connect(gain);
            gain.connect(this.master);
            osc.start(t);
            osc.stop(t + 0.2);
        } catch {
            // ignore
        }
    }
}

export const gameAudio = new GameAudio();

export const vibrate = (pattern: number | number[]): void => {
    try {
        if (typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
    } catch {
        // ignore
    }
};
