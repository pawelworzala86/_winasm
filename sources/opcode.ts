import instructions from './instructions.ts'

class OpcodeParser {
    table:any
    constructor(instructionTable:any) {
        this.table = instructionTable;
    }

    encode(mnemonic:any, operands:any) {
        return this.encodeDetailed(mnemonic, operands).bytes;
    }

    encodeDetailed(mnemonic:any, operands:any) {
        const entry = this.table.find((x:any) => x.mnemonic === mnemonic);
        if (!entry) throw new Error("Unknown instruction: " + mnemonic);

        const encoded = this.encodeOpcodePattern(entry.opcode, operands, entry.mnemonic);
        return {
            bytes: Array.from(encoded.bytes).map(b => b.toString(16).padStart(2, '0')),
            relocations: encoded.relocations
        };
    }

    encodeOpcodePattern(pattern:any, operands:any, mnemonic:any) {
        pattern = pattern.replace(/\s*\+\s*/g, '+');
        const tokens = pattern.split(/\s+/);
        let out: number[] = [];
        const relocations:any[] = [];

        const needsExtendedRegister = (operands:any[]) => operands.some((operand:any) => {
            if (typeof operand !== 'string') return false;
            if (this.regIndex(operand) > 7) return true;
            const memoryBase = operand.match(/^\[\s*(rax|rcx|rdx|rbx|rsp|rbp|rsi|rdi|r(?:[89]|1[0-5]))\b/i);
            return memoryBase !== null && this.regIndex(memoryBase[1]) > 7;
        });

        const appendModRM = (encoded:any, hasRex:boolean) => {
            const bytes = encoded.bytes;
            const rex = bytes[0];
            let insertionOffset = out.length;
            let relocationOffset = encoded.relocation?.offset;
            if (hasRex) {
                if (out[0] >= 0x40 && out[0] <= 0x4F) {
                    out[0] |= rex;
                    out.push(...bytes.slice(1));
                    if (relocationOffset !== undefined) relocationOffset--;
                } else {
                    out.unshift(...bytes);
                    insertionOffset = 0;
                }
            } else {
                out.push(...bytes);
            }
            if (encoded.relocation) {
                relocations.push({
                    ...encoded.relocation,
                    offset: insertionOffset + relocationOffset
                });
            }
        };

        for (let t of tokens) {
            if (t === "/r") {
                appendModRM(this.encodeModRM(operands, mnemonic), needsExtendedRegister(operands));
            }
            else if (t.startsWith("/")) {
                const reg = parseInt(t.substring(1));
                appendModRM(this.encodeModRM_fixedReg(reg, operands), needsExtendedRegister(operands));
            }
            else if (t === "cb") {
                out.push(this.encodeRel8(operands));
            }
            else if (t === "cd") {
                out.push(...this.encodeRel32(operands));
            }
            else if (t === "ib") {
                out.push(this.encodeImm8(operands));
            }
            else if (t === "iw") {
                out.push(...this.encodeImm16(operands));
            }
            else if (t === "id") {
                out.push(...this.encodeImm32(operands));
            }
            else if (t === "iq") {
                out.push(...this.encodeImm64(operands));
            }
            else if (t.includes("+")) {
                out.push(...this.encodeOpcodePlus(t, operands));
            }
            else {
                // normal hex byte
                out.push(parseInt(t, 16));
            }
        }

        return {
            bytes: Uint8Array.from(out),
            relocations
        };
    }

    parseMemoryOperand(operand:any): { kind: 'register'; base: string; displacement: number } | { kind: 'symbol'; expression: string; addend: number } | null {
        if (typeof operand !== 'string') return null;

        const memory = operand.match(/^\[\s*([a-z_.$][\w.$]*|r(?:ax|cx|dx|bx|sp|bp|si|di|[89]|1[0-5]))\s*(?:([+-])\s*(0x[0-9a-f]+|\d+))?\s*\]$/i);
        if (!memory) return null;

        const name = memory[1];
        const displacementValue = memory[3] ? Number(memory[3]) : 0;
        const displacement = memory[2] === '-' ? -displacementValue : displacementValue;
        if (!Number.isSafeInteger(displacement)) {
            throw new Error(`Invalid memory displacement: ${operand}`);
        }

        if (this.regWidth(name)) {
            return { kind: 'register', base: name.toLowerCase(), displacement };
        }

        return { kind: 'symbol', expression: name.toLowerCase(), addend: displacement };
    }

    encodeMemoryOperand(regField:any, operand:any) {
        const memory = this.parseMemoryOperand(operand);
        if (!memory) throw new Error(`Invalid memory operand: ${operand}`);

        if (memory.kind === 'symbol') {
            const rex = this.rex(regField, 0);
            const modrm = ((regField & 7) << 3) | 5;
            const bytes = rex ? [rex, modrm, 0, 0, 0, 0] : [modrm, 0, 0, 0, 0];
            return {
                bytes,
                relocation: {
                    expression: memory.expression,
                    addend: memory.addend,
                    offset: bytes.length - 4
                }
            };
        }

        const baseIndex = this.regIndex(memory.base);
        const displacement = memory.displacement;
        if (displacement < -0x80000000 || displacement > 0x7fffffff) {
            throw new Error(`Invalid memory displacement: ${operand}`);
        }

        const needsSib = (baseIndex & 7) === 4;
        const needsDisplacement = displacement !== 0 || (baseIndex & 7) === 5;
        const useDisp8 = needsDisplacement && displacement >= -128 && displacement <= 127;
        const mod = needsDisplacement ? (useDisp8 ? 1 : 2) : 0;
        const rm = needsSib ? 4 : baseIndex & 7;
        const modrm = (mod << 6) | ((regField & 7) << 3) | rm;
        const rex = this.rex(regField, baseIndex);
        const bytes = rex ? [rex, modrm] : [modrm];

        if (needsSib) {
            bytes.push((4 << 3) | (baseIndex & 7));
        }
        if (useDisp8) {
            bytes.push(displacement & 0xff);
        } else if (needsDisplacement) {
            bytes.push(
                displacement & 0xff,
                (displacement >> 8) & 0xff,
                (displacement >> 16) & 0xff,
                (displacement >> 24) & 0xff
            );
        }

        return { bytes };
    }

    encodeModRM(operands:any, mnemonic:any) {
        const [dst, src] = operands;

        let dstReg = this.regIndex(dst);
        let srcReg = this.regIndex(src);

        const dstMemory = this.parseMemoryOperand(dst);
        const srcMemory = this.parseMemoryOperand(src);
        if (dstMemory && srcMemory) {
            throw new Error(`Memory-to-memory instruction is not supported: ${mnemonic}`);
        }
        if (dstMemory) return this.encodeMemoryOperand(srcReg, dst);
        if (srcMemory) return this.encodeMemoryOperand(dstReg, src);

        // Jeśli drugi operand jest adresem (np. '0x...' lub '[0x...]') — RIP-relative (Mod=00, R/M=101)
        if (typeof src === 'string' && !this.regWidth(src)) {
            const normalized = src.replace(/^\[|\]$/g, '')
            const address = parseInt(normalized, 16) || 0;

            // reg = dstReg, rm = 101 (RIP-relative)
            const rex = this.rex(dstReg, 0);
            const modrm = (0 << 6) | ((dstReg & 7) << 3) | 5;

            const disp32 = [
                address & 0xFF,
                (address >> 8) & 0xFF,
                (address >> 16) & 0xFF,
                (address >> 24) & 0xFF
            ];

            return { bytes: rex ? [rex, modrm, ...disp32] : [modrm, ...disp32] };
        }

        // Obie strony to rejestry -> Mod = 11
        if (/^\w+ r\/m\d+, r\d+$/.test(mnemonic)) {
            [dstReg, srcReg] = [srcReg, dstReg];
        }
        const rex = this.rex(dstReg, srcReg);
        const modrm = 0xC0 | ((dstReg & 7) << 3) | (srcReg & 7);

        return { bytes: rex ? [rex, modrm] : [modrm] };
    }

    encodeModRM_fixedReg(reg:any, operands:any) {
        const [dst] = operands;
        if (this.parseMemoryOperand(dst)) {
            return this.encodeMemoryOperand(reg, dst);
        }

        // 1. Jeśli operand to nazwa rejestru (np. "rax", "rcx")
        if (typeof dst === 'string' && this.regWidth(dst)) {
            const dstReg = this.regIndex(dst);
            const rex = this.rex(reg, dstReg);
            const modrm = 0xC0 | (reg << 3) | (dstReg & 7); // Mod = 11 (rejestr)
            return { bytes: rex ? [rex, modrm] : [modrm] };
        }

        // 2. Jeśli operand to adres w pamięci / Liczba / Hex string (np. '0x00000FF9' lub 0xFF9)
        const address = typeof dst === 'string' ? parseInt(dst, 16) : dst;

        // Mod = 00, R/M = 101 (5) oznacza adresowanie RIP-relative w x86-64
        const modrm = (0 << 6) | (reg << 3) | 5; // Bajt 0x15 dla reg=2
        
        // Obliczamy offset 32-bitowy (Little-Endian)
        const disp32 = [
            address & 0xFF,
            (address >> 8) & 0xFF,
            (address >> 16) & 0xFF,
            (address >> 24) & 0xFF
        ];

        return { bytes: [modrm, ...disp32] };
    }

    rex(regR:any, regB:any, W = 0) {
        const R = (regR >> 3) & 1;
        const B = (regB >> 3) & 1;
        const X = 0;

        if (R || B || X || W)
            return 0x40 | (W << 3) | (R << 2) | (X << 1) | B;

        return null;
    }

    regIndex(reg:any) {
        const map:any = {
            al:0, cl:1, dl:2, bl:3, spl:4, bpl:5, sil:6, dil:7,
            r8b:8, r9b:9, r10b:10, r11b:11, r12b:12, r13b:13, r14b:14, r15b:15,

            ax:0, cx:1, dx:2, bx:3, sp:4, bp:5, si:6, di:7,
            r8w:8, r9w:9, r10w:10, r11w:11, r12w:12, r13w:13, r14w:14, r15w:15,

            eax:0, ecx:1, edx:2, ebx:3, esp:4, ebp:5, esi:6, edi:7,
            r8d:8, r9d:9, r10d:10, r11d:11, r12d:12, r13d:13, r14d:14, r15d:15,

            rax:0, rcx:1, rdx:2, rbx:3, rsp:4, rbp:5, rsi:6, rdi:7,
            r8:8, r9:9, r10:10, r11:11, r12:12, r13:13, r14:14, r15:15,
        };
        return map[reg];
    }

    regWidth(reg:any) {
        if (!reg || typeof reg !== 'string') return null;
        if (/^(rax|rcx|rdx|rbx|rsp|rbp|rsi|rdi|r[89]|r1[0-5])$/.test(reg)) return 64;
        if (/^(eax|ecx|edx|ebx|esp|ebp|esi|edi|r[89]d|r1[0-5]d)$/.test(reg)) return 32;
        if (/^(ax|cx|dx|bx|sp|bp|si|di|r[89]w|r1[0-5]w)$/.test(reg)) return 16;
        if (/^(al|cl|dl|bl|spl|bpl|sil|dil|r[89]b|r1[0-5]b)$/.test(reg)) return 8;
        return null;
    }

        parseImmediateValue(operands:any) {
        const numericOperand = operands.find((x:any) => typeof x === "number" || typeof x === "bigint");
        if (numericOperand !== undefined) {
            return typeof numericOperand === "number" ? numericOperand : Number(numericOperand);
        }

        const stringOperand = operands.find((x:any) => typeof x === "string" && /^(-?\d+|0x[0-9a-fA-F]+|-?\d+u|-?\d+i)$/.test(x));
        if (stringOperand !== undefined) {
            if (/^0x[0-9a-fA-F]+$/.test(stringOperand)) return parseInt(stringOperand, 16);
            if (/^-?\d+$/.test(stringOperand)) return parseInt(stringOperand, 10);
            if (/^-?\d+u$/.test(stringOperand)) return parseInt(stringOperand.replace(/u$/, ''), 10);
            if (/^-?\d+i$/.test(stringOperand)) return parseInt(stringOperand.replace(/i$/, ''), 10);
        }

        return 0;
    }

    encodeImm8(operands:any) {
        return this.parseImmediateValue(operands) & 0xFF;
    }

    encodeImm16(operands:any) {
        const v = this.parseImmediateValue(operands);
        return [v & 0xFF, (v >> 8) & 0xFF];
    }

    encodeImm32(operands:any) {
        const v = this.parseImmediateValue(operands);
        return [
            v & 0xFF,
            (v >> 8) & 0xFF,
            (v >> 16) & 0xFF,
            (v >> 24) & 0xFF
        ];
    }

    encodeImm64(operands:any) {
        const val = operands.find((x:any) => typeof x === "bigint" || typeof x === "number" || typeof x === "string");
        let v;
        if (typeof val === "bigint") {
            v = val;
        } else if (typeof val === "number") {
            v = BigInt(val);
        } else if (typeof val === "string") {
            if (/^0x[0-9a-fA-F]+$/.test(val)) {
                v = BigInt(val);
            } else if (/^-?\d+$/.test(val)) {
                v = BigInt(parseInt(val, 10));
            } else if (/^-?\d+u$/.test(val)) {
                v = BigInt(parseInt(val.replace(/u$/, ''), 10));
            } else if (/^-?\d+i$/.test(val)) {
                v = BigInt(parseInt(val.replace(/i$/, ''), 10));
            } else {
                v = 0n;
            }
        } else {
            v = 0n;
        }
        return [
            Number(v & 0xFFn),
            Number((v >> 8n) & 0xFFn),
            Number((v >> 16n) & 0xFFn),
            Number((v >> 24n) & 0xFFn),
            Number((v >> 32n) & 0xFFn),
            Number((v >> 40n) & 0xFFn),
            Number((v >> 48n) & 0xFFn),
            Number((v >> 56n) & 0xFFn)
        ];
    }

    encodeRel8(operands:any) {
        const rel = operands.find((x:any) => typeof x === "object" && x.rel);
        if (rel) return rel.offset & 0xFF;

        return this.parseImmediateValue(operands) & 0xFF;
    }

    encodeRel32(operands:any) {
        const rel = operands.find((x:any) => typeof x === "object" && x.rel);
        let v;

        if (rel) {
            v = rel.offset;
        } else {
            v = this.parseImmediateValue(operands);
        }

        return [
            v & 0xFF,
            (v >> 8) & 0xFF,
            (v >> 16) & 0xFF,
            (v >> 24) & 0xFF
        ];
    }

    encodeOpcodePlus(token:any, operands:any) {
        const [baseHex, modifier] = token.split("+").map((x:any) => x.trim());
        const base = parseInt(baseHex, 16);

        const regOperand = operands.find((x:any) => typeof x === "string");
        const reg = this.regIndex(regOperand);
        const low3 = reg & 7;

        const width = this.regWidth(regOperand);
        const rex = this.rex(reg, 0, width === 64 ? 1 : 0);

        const opcode = base + low3;
        const out = rex ? [rex, opcode] : [opcode];

        const imm = operands.find((x:any) => typeof x === "number" || typeof x === "bigint");
        if (imm !== undefined) {
            if (modifier === 'rb') {
                out.push(this.encodeImm8(operands));
            } else if (modifier === 'rw') {
                out.push(...this.encodeImm16(operands));
            } else if (modifier === 'rd') {
                out.push(...this.encodeImm32(operands));
            } else if (modifier === 'rq') {
                if (typeof imm === 'bigint') {
                    out.push(...this.encodeImm64(operands));
                } else {
                    out.push(...this.encodeImm32(operands));
                }
            }
        }

        return out;
    }
}


const parser = new OpcodeParser(instructions);
/*

const code = parser.encode("mov r64, imm32", ["rax", 123]);
console.log([...code]);
//[ '48', 'b8', '7b', '00', '00', '00' ]

const code2 = parser.encode("call r/m64", ['0x00000FF9']);
console.log([...code2]);
//[ 'ff', 'd0' ]

const code3 = parser.encode("lea r64, r/m64", ['rcx','0x00000000']);
console.log([...code3]);
//48 8D 0D 00 00 00 00

const code4 = parser.encode("call rel32", ['0x00000000']);
console.log([...code4]);
//48 8D 0D 00 00 00 00
// */

export default parser