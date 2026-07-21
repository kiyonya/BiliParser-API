const TABLE = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF';
const TR: Record<string, number> = {};
for (let i = 0; i < 58; i++) {
    TR[TABLE[i] as string] = i;
}
const S = [11, 10, 3, 8, 4, 6];
const XOR = 177451812;
const ADD = 8728348608;

export function bvToAv(bvid: string): number {
    let result = 0;
    for (let i = 0; i < S.length; i++) {
        const char = bvid[S[i] as number] as string;
        const value = TR[char];
        if (value === undefined) {
            throw new Error(`invalid char: ${char}`);
        }
        result += value * Math.pow(58, i);
    }
    return (result - ADD) ^ XOR;
}

export function avToBv(avid: number): string {
    let x = (avid ^ XOR) + ADD;
    const result = Array.from('BV1  4 1 7  ');
    for (let i = 0; i < S.length; i++) {
        const index = Math.floor(x / Math.pow(58, i)) % 58;
        //@ts-ignore
        result[S[i] as number] = TABLE[index];
    }
    return result.join('');
}