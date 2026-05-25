export type SortDir = 'asc' | 'desc';

export const toggleSort = <T extends string>(key: T, activeKey: T, dir: SortDir): { key: T; dir: SortDir } => {
	if (key === activeKey) {
		return { key, dir: dir === 'asc' ? 'desc' : 'asc' };
	}
	return { key, dir: 'asc' };
};

export const sortDirSymbol = (active: boolean, dir: SortDir) => (active ? (dir === 'asc' ? '↑' : '↓') : '');

export const compareStrings = (left: string, right: string) =>
	left.localeCompare(right, undefined, { sensitivity: 'base' });

export const compareNumbers = (left: number, right: number) => left - right;

export const parsePbDateMs = (value: string | undefined) => {
	if (!value?.trim()) return 0;
	const normalized = value.includes('T') ? value : value.replace(' ', 'T');
	const ms = Date.parse(normalized);
	return Number.isFinite(ms) ? ms : 0;
};
