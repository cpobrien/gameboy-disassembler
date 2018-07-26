import fs from 'fs';

const PATH = './boot.gb';

const toWord = (lo: number, hi: number): number => hi << 8 | lo;
const toHex = (num: number): string => num.toString(16);
const toSigned = (num: number): number => ((~num & 0xFF) - 1) * ((num & 0x80) === 0 ? 1 : -1);
const clampByte = (num: number): number => num & 0xFF;
const clampWord = (num: number): number => num & 0xFF;

type Registers = {
    A: number,
    B: number,
    C: number,
    D: number,
    E: number,
    H: number,
    L: number,
    F: number,
}

const CB_CYCLE_TABLE: number[] = [
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8,
    8, 8, 8, 8, 8, 8, 16, 8
];


type OpCodeResponse = {
    text: string,
    visited?: boolean,
    cycles?: number
};

type OpCodeRequest = {
    code: Uint8Array;
    computer: Computer;
}

type OpCodeFunction = {(code: OpCodeRequest): OpCodeResponse};

function ret(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    switch (op) {
        case 0xC0:
            return {text: `\tRET NZ`};
        case 0xC8:
            return {text: `\tRET Z`};
        case 0xC9:
            return {text: `\tRET`};
        case 0xD0:
            return {text: `\tRET NC`};
        case 0xD8:
            return {text: `\tRET C`};
        case 0xD9:
            return {text: `\tRETI`};
        default:
            return {text: `???`};
    }
}


function addReg(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    return {text: `\tADD A,${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 0x7]}`}
}

function add(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    if ((op >> 4) === 8) return addReg(request);
    return {text: '???'};
}

const rla: OpCodeFunction = request => {
    const op: number = request.code[0];
    return {text: `\tRLA`};
}

const rl: OpCodeFunction = request => {
    const op: number = request.code[0];
    return {text: `\tRL ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 0x7]}`};
}

const ldWordToA: OpCodeFunction = request => {
    const op: number = request.code[0];
    const word: string = toHex(toWord(request.code[1], request.code[2]));
    if (op === 0xEA) return {text: `\tLD ($${word}),A`};
    else return {text: `\tLD A,($${word})`};
};

const ldWord: OpCodeFunction = request => {
    // For loading words, the small bit represents which word is read from.
    const BC: number = 0;
    const DE: number = 1;
    const HL: number = 2;
    const SP: number = 3;

    let computer: Computer = request.computer;

    const op: number = request.code[0];
    const word: number = toWord(request.code[0], request.code[1]);
    const loc: string = ['BC', 'DE', 'HL', 'SP'][op >> 4];
    const pos: string = toHex(word);
    switch (op >> 4) {
        case BC: computer.writeBC(word); break;
        case DE: computer.writeDE(word); break;
        case HL: computer.writeHL(word); break;
        case SP: computer.SP = word; break;

    }
    return {
        text: `\tLD ${loc},$${pos}`,
        visited: true
    };
};

const ldCombo: OpCodeFunction = request => {
    const op : number = request.code[0];
    const loc: string = ['(BC)', '(DE)', '(HL+)', '(HL-)'][op >> 4];
    if ((op & 0xF) == 0x2) return {text: `\tLD ${loc},A`};
    else return {text: `\tLD A,${loc}`};
};

const sub: OpCodeFunction = request => {
    const op: number = request.code[0];
    var val: number | string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 0x7];
    if (op == 0xD6) {
        val = request.code[1];
    }
    return {text: `\tSUB ${val}`};
};

const ldReg: OpCodeFunction = request => {
    const op: number = request.code[0];
    const regTable: string[] = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const from: string = regTable[(op - 0x40) >> 3];
    const to: string = regTable[op & 7]
    return {text: `\tLD ${from},${to}`};
};

const ldByte: OpCodeFunction = request => {
    const op: number = request.code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 6) >> 3];
    return {text: `\tLD ${reg},$${toHex(request.code[1])}`};
};

const ldC: OpCodeFunction = request => {
    const op: number = request.code[0];
    if (op === 0xE2) return {text: `\tLD ($FF00+C),A`};
    else return {text: `\tLD A,$FF00+C)`};
};

const ld: OpCodeFunction = request => {
    const op: number = request.code[0];
    if (op >> 4 < 4 && (op & 7) === 1) return ldWord(request);
    if (op >> 4 < 4 && (op & 7) === 6) return ldByte(request);
    if (op >> 4 < 4 && ((op & 7) === 2 || (op & 0xF) === 0xA)) return ldCombo(request);
    if (op >> 4 >= 4 && op >> 4 < 8) return ldReg(request);
    if (op === 0xE2 || op === 0xF2) return ldC(request);
    if (op === 0xEA || op === 0xFA) return ldWordToA(request);
    return {text: `\t???`};
};

const jr: OpCodeFunction = request => {
    const opcode: number = request.code[0];
    let reg: string = ['', 'NZ', 'Z', 'NC', 'C'][(opcode - 0x18) >> 3];
    return {text: `\tJR ${reg + (reg === '' ? '': ',')}+$${toHex(request.code[1])}`};
};

const xor: OpCodeFunction = request => {
    const op: number = request.code[0];
    const computer: Computer = request.computer;
    const comparison: number = [
        computer.registers.B,
        computer.registers.C,
        computer.registers.D,
        computer.registers.E,
        computer.registers.H,
        computer.registers.L,
        computer.readByte(computer.combineHL()),
        computer.registers.A,
    ][op % 8];
    computer.registers.A ^= comparison;
    computer.registers.A = clampByte(computer.registers.A);
    return {
        text: '\tXOR A',
        visited: true
    };
};

const fail: OpCodeFunction = request => {
    const op: number = request.code[0];
    return {text: "UNKNOWN"}
};

function bit(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', '(HL)', 'A'][op & 7];
    const num: number = (op - 0x40) >> 3;

    return {text: `\tBIT ${num},${reg}`};
}

function decWord(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][op >> 4];
    return {text: `\tDEC ${word}`};
}

function decReg(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 5) >> 3];
    return {text: `\tDEC ${reg}`}
}

function dec(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    if ((op & 7) === 5) return decReg(request);
    else return decWord(request);
}

function push(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][(op >> 4) - 0xC];
    return {text: `\tPUSH ${word}`};
}

function pop(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][(op >> 4) - 0xC];
    return {text: `\tPOP ${word}`};
}

function incReg(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 4) >> 3];
    return {text: `\tINC ${reg}`};
}

function incWord(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][op >> 4];
    return {text: `\tINC ${word}`};
}

function inc(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    if ((op & 7) === 4) return incReg(request);
    else return incWord(request);
}

const ldh: OpCodeFunction = request => {
    const op: number = request.code[0];
    if (op === 0xE0) return {text: `\tLDH ($FF00+$${toHex(request.code[1])}),A}`};
    else return {text: `\tLDH A,($FF00+$${toHex(request.code[1])})`};
};

function call(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    let reg = '';
    switch (op) {
        case 0xC4: reg = 'NZ,'; break;
        case 0xCC: reg = 'Z,'; break;
        case 0xD4: reg = 'NC,'; break;
        case 0xDC: reg = 'C,'; break;
    }
    return {text: `\tCALL ${reg}$${toHex(toWord(request.code[1], request.code[2]))}`};
}

function cp(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
    if (op === 0xFE) return {text: `\tCP $${toHex(request.code[1])}`};
    else return {text: `\tCP ${reg}`};
}

const CB_TABLE: OpCodeFunction[] = [
    fail, fail, fail, fail, fail, fail, fail, fail,   // 0x00
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x08
    rl, rl, rl, rl, rl, rl, rl, rl,                // 0x10
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x18
    fail, fail, fail, fail, fail, fail, fail, fail,   // 0x20
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x28
    fail, fail, fail, fail, fail, fail, fail, fail,   // 0x30
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x38
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x40
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x48
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x50
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x58
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x60
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x68
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x70
    bit, bit, bit, bit, bit, bit, bit, bit,         // 0x78
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x80
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x88
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x90
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x98
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xA0
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xA8
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xB0
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xB8
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xC0
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xC8
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xD0
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xD8
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xE0
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xE8
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xF0
    fail, fail, fail, fail, fail, fail, fail, fail  // 0xF8
];

const PARSE_TABLE: OpCodeFunction[] = [
    fail, ld, ld, inc, inc, dec, ld, fail,     // 0x00
    fail, fail, ld, dec, inc, dec, ld, fail,   // 0x08
    fail, ld, ld, inc, inc, dec, ld, rla,     // 0x10
    jr, fail, ld, dec, inc, dec, ld, fail,     // 0x18
    jr, ld, ld, inc, inc, dec, ld, fail,       // 0x20
    jr, fail, ld, dec, inc, dec, ld, fail,     // 0x28
    jr, ld, ld, inc, inc, dec, ld, fail,       // 0x30
    jr, fail, ld, dec, inc, dec, ld, fail,     // 0x38
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x40
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x48
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x50
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x58
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x60
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x68
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x70
    ld, ld, ld, ld, ld, ld, ld, ld,                 // 0x78
    add, add, add, add, add, add, add, add,         // 0x80
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x88
    sub, sub, sub, sub, sub, sub, sub, sub,         // 0x90
    fail, fail, fail, fail, fail, fail, fail, fail, // 0x98
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xA0
    fail, fail, fail, fail, fail, fail, fail, xor, // 0xA8
    fail, fail, fail, fail, fail, fail, fail, fail, // 0xB0
    cp, cp, cp, cp, cp, cp, cp, cp, // 0xB8
    ret, pop, fail, fail, call, push, fail, fail, // 0xC0
    ret, ret, fail, fail, call, call, fail, fail, // 0xC8
    ret, pop, fail, fail, call, push, sub, fail, // 0xD0
    ret, ret, fail, fail, call, fail, fail, fail, // 0xD8
    ldh, pop, ld, fail, fail, push, fail, fail, // 0xE0
    fail, fail, ld, fail, fail, fail, fail, fail, // 0xE8
    ldh, pop, ld, fail, fail, push, fail, fail, // 0xF0
    fail, fail, ld, fail, fail, fail, cp, fail  // 0xF8
];

const PARSE_CYCLE_TABLE: number[] = [
    4, 12, 8, 8, 4, 4, 8, 4,
    20, 8, 8, 8, 4, 4, 8, 4,
    4, 12, 8, 8, 4, 4, 8, 4,
    12, 8, 8, 8, 4, 4, 8, 4,
    12, 12, 8, 8, 4, 4, 8, 4,
    12, 8, 8, 8, 4, 4, 8, 4,
    12, 12, 8, 8, 12, 12, 12, 4,
    12, 8, 8, 8, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    8, 8, 8, 8, 8, 8, 4, 8,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    4, 4, 4, 4, 4, 4, 8, 4,
    20, 12, 16, 16, 24, 16, 8, 16,
    20, 16, 16, 4, 24, 24, 8, 16,
    20, 12, 16, -1, 24, 16, 8, 16,
    20, 16, 16, -1, 24, -1, 8, 16,
    12, 12, 8, -1, -1, 16, 8, 16,
    16, 4, 16, -1, -1, -1, 8, 16,
    12, 12, 8, 4, -1, 16, 8, 16,
    12, 8, 16, 4, -1, -1, 8, 16
];


const INSTRUCTION_SIZE_TABLE: number[] = [
    0, 3, 1, 1, 1, 1, 2, 0, // 0x00
    0, 0, 1, 1, 1, 1, 2, 0, // 0x08
    0, 3, 1, 1, 1, 1, 2, 1, // 0x10
    2, 0, 1, 1, 1, 1, 2, 0, // 0x18
    2, 3, 1, 1, 1, 1, 2, 0, // 0x20
    2, 0, 1, 1, 1, 1, 2, 0, // 0x28
    2, 3, 1, 1, 1, 1, 2, 0, // 0x30
    2, 0, 1, 1, 1, 1, 2, 0, // 0x38
    2, 1, 1, 1, 1, 1, 1, 1, // 0x40
    2, 1, 1, 1, 1, 1, 1, 1, // 0x48
    1, 1, 1, 1, 1, 1, 1, 1, // 0x50
    1, 1, 1, 1, 1, 1, 1, 1, // 0x58
    1, 1, 1, 1, 1, 1, 1, 1, // 0x60
    1, 1, 1, 1, 1, 1, 1, 1, // 0x68
    1, 1, 1, 1, 1, 1, 1, 1, // 0x70
    1, 1, 1, 1, 1, 1, 1, 1, // 0x78
    1, 1, 1, 1, 1, 1, 1, 1, // 0x80
    1, 1, 1, 1, 1, 1, 1, 1, // 0x88
    1, 1, 1, 1, 1, 1, 1, 1, // 0x90
    1, 1, 1, 1, 1, 1, 1, 1, // 0x98
    1, 1, 1, 1, 1, 1, 1, 1, // 0xA0
    1, 1, 1, 1, 1, 1, 1, 1, // 0xA8
    1, 1, 1, 1, 1, 1, 1, 1, // 0xB0
    1, 1, 1, 1, 1, 1, 1, 1, // 0xB8
    1, 1, 0, 0, 3, 1, 0, 0, // 0xC0
    1, 1, 0, 1, 3, 3, 0, 0, // 0xC8
    1, 1, 0, 0, 3, 1, 2, 0, // 0xD0
    1, 1, 0, 0, 3, 0, 0, 0, // 0xD8
    2, 1, 1, 0, 0, 1, 0, 0, // 0xE0
    0, 0, 3, 0, 0, 0, 0, 0, // 0xE8
    2, 1, 1, 0, 0, 1, 0, 0, // 0xF0
    0, 0, 3, 0, 0, 0, 2, 0  // 0xF8
];

class Computer {
    private readonly program: Uint8Array;
    public cycles: number = 0;
    public PC: number = 0;
    public SP: number = 0;
    public registers: Registers;
    constructor(program: Uint8Array, pc: Registers) {
        this.program = program;
        this.registers = pc;
    }

    public readWord(address: number): number { return 0; }
    public readByte(address: number): number { return 0; }
    public writeByte(address: number, byte: number) {
        assertWord(address);
        assertByte(byte);
        this.program[address] = byte;
    }
    public writeWord(address: number, word: number) {
        const lo: number = word & 0xFF;
        const hi: number = word >> 4;
        this.writeByte(address, lo);
        this.writeByte(address + 1, hi);
    }

    public combineBC = (): number => (this.registers.B << 4) | this.registers.C;
    public combineDE = (): number => (this.registers.D << 4) | this.registers.E;
    public combineHL = (): number => (this.registers.H << 4) | this.registers.L;

    public writeBC(word: number) {
        assertWord(word);
        const lo: number = word & 0xFF;
        const hi: number = word >> 4;
        this.registers.B = lo;
        this.registers.C = hi;
    }

    public writeDE(word: number) {
        assertWord(word);
        const lo: number = word & 0xFF;
        const hi: number = word >> 4;
        this.registers.D = lo;
        this.registers.E = hi;
    }

    public writeHL(word: number) {
        assertWord(word);
        const lo: number = word & 0xFF;
        const hi: number = word >> 4;
        this.registers.H = lo;
        this.registers.L = hi;
    }
}

function assertByte(byte: number) {
    if (byte < 0x00 || byte > 0xFF) {
        throw new Error('Not a byte!');
    }
}

function assertWord(word: number) {
    if (word < 0x00 || word > 0xFFFF) {
        throw new Error('Not a word!');
    }
}

function tick(program: Uint8Array): string {
    let instructions: string[] = [];
    let i = 0;
    var pc: Registers = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        E: 0,
        H: 0,
        L: 0,
        F: 0,
    };

    let computer: Computer = new Computer(program, pc);
    while (computer.PC < program.length) {
        var opcode: number = program[computer.PC];
        var size: number = INSTRUCTION_SIZE_TABLE[opcode];
        var code: Uint8Array = program.slice(computer.PC, computer.PC + size);
        var parser: OpCodeFunction = PARSE_TABLE[opcode];
        var cycles = PARSE_CYCLE_TABLE[opcode];
        if (opcode == 0xCB) {
            cycles = CB_CYCLE_TABLE[opcode];
            opcode = program[++computer.PC];
            code = program.slice(computer.PC, computer.PC + size);
            parser = CB_TABLE[opcode];
        }
        if (parser === fail) {
            console.error(`fail at $${toHex(opcode)}`);
            break;
        }
        const response: OpCodeResponse = parser({code: code, computer: computer});
        cycles += response.cycles || 0;
        instructions.push(`${response.text}\t\t$${toHex(computer.PC)}\t${cycles} cycles`);
        if (computer.PC === 0xA7) {
            instructions.push('~~~Gameboy logo data, skipping ahead~~~');
            computer.PC = 0xE0;
            continue;
        }
        computer.PC += size;
        computer.cycles += cycles;
        if (!response.visited) {
            console.error(`Break at $${toHex(computer.PC)}`);
            break;
        }
    }
    return `${instructions.reduce((a, b) => `${a}\n${b}`, "")}\n\n\tcycles: ${computer.cycles}`;
}

fs.readFile(PATH, (err: any, data: any) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(tick(data));
});
