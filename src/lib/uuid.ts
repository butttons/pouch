const HEX = "0123456789abcdef";

const toHex = (bytes: Uint8Array): string => {
	let s = "";
	for (let i = 0; i < bytes.length; i++) {
		s += HEX[bytes[i]! >>> 4]!;
		s += HEX[bytes[i]! & 0x0f]!;
	}
	return s;
};

export const uuidv7 = (): string => {
	const bytes = new Uint8Array(16);
	const now = Date.now();

	// 48-bit big-endian timestamp
	bytes[0] = (now / 0x10000000000) & 0xff;
	bytes[1] = (now / 0x100000000) & 0xff;
	bytes[2] = (now / 0x1000000) & 0xff;
	bytes[3] = (now / 0x10000) & 0xff;
	bytes[4] = (now / 0x100) & 0xff;
	bytes[5] = now & 0xff;

	// 74 random bits
	crypto.getRandomValues(bytes.subarray(6));

	// Version (4 bits) = 0b0111
	bytes[6] = (bytes[6]! & 0x0f) | 0x70;

	// Variant (2 bits) = 0b10
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;

	const hex = toHex(bytes);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
