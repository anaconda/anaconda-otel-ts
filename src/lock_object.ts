// SPDX-FileCopyrightText: 2025-2026 Anaconda, Inc
// SPDX-License-Identifier: Apache-2.0

export class Lock {
    private _locked = false;
    private _waiting: (() => void)[] = [];

    private async acquire(): Promise<void> {
        if (!this._locked) {
            this._locked = true;
            return;
        }
        // Wait until released
        await new Promise<void>((resolve) => this._waiting.push(resolve));
    }

    private release(): void {
        if (this._waiting.length > 0) {
            // Give the lock to the next waiter
            const next = this._waiting.shift()!;
            next();
        } else {
            this._locked = false;
        }
    }

    public async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }
}
