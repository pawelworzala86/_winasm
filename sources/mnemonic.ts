import instructions from './instructions.ts'

function classifyRegister(reg:any) {
    reg = reg.toLowerCase();

    const r8 = ["al","cl","dl","bl","spl","bpl","sil","dil"];
    const r16 = ["ax","cx","dx","bx","sp","bp","si","di"];
    const r32 = ["eax","ecx","edx","ebx","esp","ebp","esi","edi"];
    const r64 = ["rax","rcx","rdx","rbx","rsp","rbp","rsi","rdi"];

    if (r8.includes(reg) || /^r\d+b$/.test(reg)) return "r8";
    if (r16.includes(reg) || /^r\d+w$/.test(reg)) return "r16";
    if (r32.includes(reg) || /^r\d+d$/.test(reg)) return "r32";
    if (r64.includes(reg) || /^r\d+$/.test(reg)) return "r64";

    return null;
}

function classifyImmediate(val:any) {
    const v = parseNumericValue(val);
    if (v === null) return null;

    if (v >= -128 && v <= 255) return "imm8";
    if (v >= -32768 && v <= 65535) return "imm16";
    if (v >= -2147483648 && v <= 4294967295) return "imm32";
    return "imm64";
}

function parseNumericValue(value:any): number | null {
    if (typeof value !== "string") return null;
    const normalized = value.replace(/[ui]$/i, "");
    if (/^-?0x[0-9a-f]+$/i.test(normalized)) return Number(normalized);
    if (/^-?[0-9a-f]+h$/i.test(normalized)) {
        const negative = normalized.startsWith("-");
        const digits = normalized.replace(/^-?/, "").slice(0, -1);
        const parsed = Number.parseInt(digits, 16);
        return negative ? -parsed : parsed;
    }
    if (/^-?\d+$/.test(normalized)) return Number(normalized);
    return null;
}

function classifyMemory(op:any) {
    // memory operand → width unknown, infer from other operand
    return "m";
}

function classifyOperand(op:any) {
    if (typeof op !== 'string') return null;

    op = op.trim();
    if (!op) return null;

    // register
    const reg = classifyRegister(op);
    if (reg) return reg;
    if(/^xmm(?:[0-9]|1[0-5])$/i.test(op)) return "xmm";

    const sizedMemory = op.match(/^(byte|word|dword|qword)\s+(\[.*\])$/i);
    if (sizedMemory) {
        const width = { byte: 8, word: 16, dword: 32, qword: 64 }[sizedMemory[1].toLowerCase() as 'byte' | 'word' | 'dword' | 'qword'];
        return `r/m${width}`;
    }

    // immediate
    if (parseNumericValue(op) !== null) {
        return classifyImmediate(op);
    }

    // memory operand
    if (/^\[.*\]$/.test(op)) {
        return classifyMemory(op);
    }

    if (/^[a-z_.$][\w.$]*$/i.test(op)) return "symbol";
    return null;
}

function inferMemoryWidth(memType:any, otherType:any) {
    // r/mX width = width of register operand
    if (otherType.startsWith("r")) return "r/m" + otherType.slice(1);
    if (otherType.startsWith("imm")) return "r/m64"; // default for imm → 64-bit mem
    return "m";
}

function parseInstruction(instr:any) {
    if (typeof instr !== 'string') return null;

    let trimmed = instr.trim().toLowerCase();
    if (!trimmed) return null;

    const alias = { je: 'jz', jne: 'jnz' } as Record<string, string>;
    const [firstToken, ...remainingTokens] = trimmed.split(/\s+/).filter(Boolean);
    trimmed = [alias[firstToken] || firstToken, ...remainingTokens].join(' ');

    if (instructions.some((entry:any) => entry.mnemonic === trimmed)) {
        return trimmed;
    }

    const mnemonicEnd = trimmed.search(/\s/);
    const mnemonic = mnemonicEnd === -1 ? trimmed : trimmed.slice(0, mnemonicEnd);
    const operandsText = mnemonicEnd === -1 ? '' : trimmed.slice(mnemonicEnd).trim();
    const operands = operandsText ? operandsText.split(',').map((operand:any) => operand.trim()) : [];
    const [op1raw, op2raw] = operands;

    if (mnemonic === "ret") {
        if (operands.length === 0) return "ret";
        if (operands.length === 1 && /^\d+$/.test(op1raw) && Number(op1raw) <= 0xFFFF) {
            return "ret imm16";
        }
        return null;
    }

    if (operands.length === 0) return null;

    if (
        op1raw &&
        !op2raw &&
        classifyRegister(op1raw) === null &&
        /^[a-z_.$][\w.$]*$/i.test(op1raw) &&
        instructions.some((entry:any) => entry.mnemonic === `${mnemonic} rel32`)
    ) {
        return `${mnemonic} rel32`;
    }

    if (!instructions.some((entry:any) => entry.mnemonic.split(' ')[0] === mnemonic)) {
        return null;
    }

    const op1 = classifyOperand(op1raw || null);
    const op2 = op2raw ? classifyOperand(op2raw) : null;

    if (!op1 || (op2raw && op2 === null)) return null;

    let o1 = op1;
    let o2 = op2;

    // infer memory width
    if (op1 === "m" && op2) o1 = inferMemoryWidth(op1, op2);
    if (op2 === "m" && op1) o2 = inferMemoryWidth(op2, op1);

    if(o1==='xmm'||o2==='xmm'){
        const actualOperands = [o1,o2].filter((operand):operand is string=>typeof operand==='string')
        const matchesOperand = (actual:string,expected:string)=>{
            if(actual===expected) return true
            if(actual==='xmm'&&expected.startsWith('xmm/m')) return true
            if(actual==='r/m64'&&expected==='xmm/m64') return true
            if(actual==='r/m32'&&expected==='xmm/m32') return true
            if(actual==='r64'&&expected==='r/m64') return true
            if(actual==='r32'&&expected==='r/m32') return true
            return false
        }
        const sseInstruction = instructions.find((entry:any)=>{
            const separator = entry.mnemonic.indexOf(' ')
            const entryMnemonic = separator===-1?entry.mnemonic:entry.mnemonic.slice(0,separator)
            const signature = separator===-1?[]:entry.mnemonic.slice(separator+1).split(/\s*,\s*/)
            if(entryMnemonic!==mnemonic||signature.length!==actualOperands.length||!signature.some((operand:string)=>operand==='xmm'||operand.startsWith('xmm/'))){
                return false
            }
            return signature.every((operand:string,index:number)=>matchesOperand(actualOperands[index],operand))
        })
        if(sseInstruction){
            return sseInstruction.mnemonic
        }
    }

    if (o2 === "symbol") {
        o2 = o1.startsWith("r/m") ? "imm32" : o1 === "r64" ? "imm64" : "imm32";
    }

    if (mnemonic === "mov" && o1 === "r64" && o2?.startsWith("imm")) {
        o2 = "imm64";
    }

    if (
        o1.startsWith("r") &&
        !o1.startsWith("r/") &&
        o2 &&
        !instructions.some((entry:any) => entry.mnemonic === `${mnemonic} ${o1}, ${o2}`) &&
        instructions.some((entry:any) => entry.mnemonic === `${mnemonic} r/m${o1.slice(1)}, ${o2}`)
    ) {
        o1 = `r/m${o1.slice(1)}`;
    }

    if(
        o2==='r64'&&
        instructions.some((entry:any)=>entry.mnemonic===`${mnemonic} ${o1}, r/m64`)
    ){
        o2='r/m64';
    }

    if(
        !o2&&
        o1.startsWith('r')&&
        !o1.startsWith('r/')&&
        instructions.some((entry:any)=>entry.mnemonic===`${mnemonic} r/m${o1.slice(1)}`)
    ){
        o1=`r/m${o1.slice(1)}`;
    }

    const signature = o2
        ? `${mnemonic} ${o1}, ${o2}`
        : `${mnemonic} ${o1}`;
    if (instructions.some((entry:any) => entry.mnemonic === signature)) {
        return signature;
    }

    if (o2?.startsWith("imm") && o2 !== "imm32") {
        const widenedSignature = `${mnemonic} ${o1}, imm32`;
        if (instructions.some((entry:any) => entry.mnemonic === widenedSignature)) {
            return widenedSignature;
        }
    }

    return signature;
}

//console.log(parseInstruction('and rsp, -16'))

export default parseInstruction