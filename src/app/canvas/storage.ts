// Sandbox persistence. The grid is RLE-encoded (long runs of empty sky and
// water compress well) and kept in localStorage together with UI settings.

export type SavedGrid = {
    version: 1;
    cols: number;
    rows: number;
    grid: string;
};

export type SavedSettings = {
    colored: boolean;
    grains: number;
    muted: boolean;
};

const GRID_KEY = 'sand-drop/grid';
const SETTINGS_KEY = 'sand-drop/settings';

export const encodeRle = (data: Uint32Array): string => {
    const runs: number[] = [];
    let i = 0;
    while (i < data.length) {
        const value = data[i];
        let run = 1;
        while (i + run < data.length && data[i + run] === value) run++;
        runs.push(run, value);
        i += run;
    }
    const packed = Uint32Array.from(runs);
    const bytes = new Uint8Array(packed.buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + chunk)));
    }
    return btoa(binary);
};

export const decodeRle = (encoded: string, expectedLength: number): Uint32Array | null => {
    try {
        const binary = atob(encoded);
        if (binary.length === 0 || binary.length % 8 !== 0) return null;
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const packed = new Uint32Array(bytes.buffer);
        const out = new Uint32Array(expectedLength);
        let position = 0;
        for (let i = 0; i + 1 < packed.length; i += 2) {
            const run = packed[i];
            const value = packed[i + 1];
            for (let k = 0; k < run; k++) {
                if (position >= expectedLength) return null;
                out[position++] = value;
            }
        }
        return position === expectedLength ? out : null;
    } catch {
        return null;
    }
};

export const saveGrid = (data: SavedGrid): void => {
    try {
        window.localStorage.setItem(GRID_KEY, JSON.stringify(data));
    } catch {
        // storage full or unavailable — the game just won't persist
    }
};

export const loadGrid = (): SavedGrid | null => {
    try {
        const raw = window.localStorage.getItem(GRID_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedGrid;
        if (
            parsed.version !== 1 ||
            typeof parsed.cols !== 'number' ||
            typeof parsed.rows !== 'number' ||
            typeof parsed.grid !== 'string' ||
            parsed.cols < 1 ||
            parsed.rows < 1
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

export const clearGrid = (): void => {
    try {
        window.localStorage.removeItem(GRID_KEY);
    } catch {
        // ignore
    }
};

export const saveSettings = (settings: SavedSettings): void => {
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // ignore
    }
};

export const loadSettings = (): SavedSettings | null => {
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedSettings;
        if (
            typeof parsed.colored !== 'boolean' ||
            typeof parsed.grains !== 'number' ||
            typeof parsed.muted !== 'boolean'
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};
