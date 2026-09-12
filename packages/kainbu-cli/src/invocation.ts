import { InvalidArgumentError } from 'commander';

export type Invocation = {
	json: boolean;
	nonInteractive: boolean;
	authProfile?: string;
	timeout: number;
};

let invocation: Invocation = { json: false, nonInteractive: false, timeout: 30_000 };
export const getInvocation = () => invocation;
export const configureInvocation = (options: Partial<Invocation>) => {
	invocation = { ...invocation, ...options };
};

export const integerOption =
	(minimum: number, maximum = Number.MAX_SAFE_INTEGER) =>
	(value: string) => {
		if (
			!/^\d+$/.test(value) ||
			!Number.isSafeInteger(Number(value)) ||
			Number(value) < minimum ||
			Number(value) > maximum
		) {
			throw new InvalidArgumentError(`Expected an integer between ${minimum} and ${maximum}.`);
		}
		return Number(value);
	};

export const booleanOption = (value: string) => {
	if (value !== 'true' && value !== 'false')
		throw new InvalidArgumentError('Expected true or false.');
	return value === 'true';
};

export const requestSignal = () => AbortSignal.timeout(getInvocation().timeout);
