import fs from 'fs';

const PATH = './boot.gb';

const toWord = (lo: number, hi: number): number => hi << 8 | lo;
const toHex = (num: number): string => num.toString(16);
const toSigned = (num: number): number => ((~num & 0xFF) - 1) * ((num & 0x80) === 0 ? 1 : -1);
const clampByte = (num: number): number => num & 0xFF;
const clampWord = (num: number): number => num & 0xFFFF;
function calculateHalfBit(num: number): boolean {
    const higherNibbleCarried: boolean = (num & 0xFF) !== num;
    const lowerNibbleCarried: boolean = (num & 0x0F) !== num;
    return lowerNibbleCarried && !higherNibbleCarried;
}

type Flags = {
    Z: boolean,
    N: boolean,
    H: boolean,
    C: boolean
}

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
    const computer: Computer = request.computer;
    const register: Registers = computer.registers;

    const carry: boolean = (register.A & 0x80) !== 0;
    register.A = clampByte(register.A << 1);
    computer.setZ(false);
    computer.setN(false);
    computer.setH(false);
    computer.setC(carry);
    return {text: `\tRLA`, visited: true};
};

const rl: OpCodeFunction = request => {
    const B: number = 0x10;
    const C: number = 0x11;
    const D: number = 0x12;
    const E: number = 0x13;
    const H: number = 0x14;
    const L: number = 0x15;
    const HL: number = 0x16;
    const A: number = 0x17;

    const op: number = request.code[0];
    const computer: Computer = request.computer;
    const registers: Registers = computer.registers;

    const register: number = [
        registers.B,
        registers.C,
        registers.D,
        registers.E,
        registers.H,
        registers.L,
        computer.readByte(computer.combineHL()),
        registers.A,
    ][op & 0x7];


    const carry: boolean = (register & 0x80) !== 0;
    const rotated: number = clampByte(register << 1);
    const zero: boolean = rotated === 0;

    switch (op) {
        case B: registers.B = rotated; break;
        case C: registers.C = rotated; break;
        case D: registers.D = rotated; break;
        case E: registers.E = rotated; break;
        case H: registers.H = rotated; break;
        case L: registers.L = rotated; break;
        case HL: computer.writeByte(computer.combineHL(), rotated); break;
        case A: registers.A = rotated; break;
    }
    computer.setZ(zero);
    computer.setN(false);
    computer.setH(false);
    computer.setC(carry);

    return {text: `\tRL ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 0x7]}`, visited: true};
};

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
    const word: number = toWord(request.code[1], request.code[2]);
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
    const computer: Computer = request.computer;
    const BC: number = 0x00;
    const DE: number = 0x01;
    const HL_INC: number = 0x02;
    const HL_DEC: number = 0x03;

    const op : number = request.code[0];
    var address: number = -1;
    switch (op >> 4) {
        case BC:
            address = computer.combineBC();
            break;
        case DE:
            address = computer.combineDE();
            break;
        case HL_INC:
            address = computer.combineHL();
            computer.writeHL(clampWord(address + 1));
            break;
        case HL_DEC:
            address = computer.combineHL();
            computer.writeHL(clampWord(address - 1));
            break;
        default:
            console.error("Something bad happened!");
    }
    const loc: string = ['(BC)', '(DE)', '(HL+)', '(HL-)'][op >> 4];
    if ((op & 0xF) == 0x2) {
        computer.registers.A = computer.readByte(address);
        return {text: `\tLD ${loc},A`, visited: true};
    } else {
        computer.writeByte(address, computer.registers.A);
        return {text: `\tLD A,${loc}`, visited: true};
    }
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
    const B: number = 0x00;
    const C: number = 0x01;
    const D: number = 0x02;
    const E: number = 0x03;
    const H: number = 0x04;
    const L: number = 0x05;
    const HL: number = 0x06;
    const A: number = 0x07;
    const op: number = request.code[0];

    const computer: Computer = request.computer;
    const register: Registers = computer.registers;

    const regTableText: string[] = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const fromText: string = regTableText[(op - 0x40) >> 3];
    const toText: string = regTableText[op & 7];

    const byte: number = [
        register.B,
        register.C,
        register.D,
        register.E,
        register.H,
        register.L,
        computer.readByte(computer.combineHL()),
        register.A,
    ][op & 7];

    switch ((op - 0x40) >> 3) {
        case B: register.B = byte; break;
        case C: register.C = byte; break;
        case D: register.D = byte; break;
        case E: register.E = byte; break;
        case H: register.H = byte; break;
        case L: register.L = byte; break;
        case HL: computer.writeByte(computer.combineHL(), byte); break;
        case A: register.A = byte; break;
    }

    return {text: `\tLD ${fromText},${toText}`, visited: true};
};

const ldByte: OpCodeFunction = request => {
    const B: number = 0x06;
    const C: number = 0x0E;
    const D: number = 0x16;
    const E: number = 0x1E;
    const H: number = 0x26;
    const L: number = 0x2E;
    const HL: number = 0x36;
    const A: number = 0x3E;

    const computer: Computer = request.computer;
    const op: number = request.code[0];
    const byte: number = request.code[1];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 6) >> 3];
    switch (op) {
        case B: computer.registers.B = byte; break;
        case D: computer.registers.D = byte; break;
        case H: computer.registers.H = byte; break;
        case C: computer.registers.C = byte; break;
        case E: computer.registers.E = byte; break;
        case L: computer.registers.L = byte; break;
        case A: computer.registers.A = byte; break;
        case HL:
            const address: number = computer.combineHL();
            computer.writeByte(address, byte);
            break;
    }
    return {text: `\tLD ${reg},$${toHex(request.code[1])}`, visited: true};
};

const ldC: OpCodeFunction = request => {
    const computer: Computer = request.computer;
    const op: number = request.code[0];
    const address: number = 0xFF00 | computer.registers.C;
    if (op === 0xE2) {
        computer.registers.A = computer.readByte(address);
        return {text: `\tLD ($FF00+C),A`, visited: true};
    } else {
        computer.writeByte(address, computer.registers.A);
        return {text: `\tLD A,$FF00+C)`, visited: true};
    }
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
    const computer: Computer = request.computer;
    const jumpTo: number = request.code[1];
    let regString: string = ['', 'NZ', 'Z', 'NC', 'C'][(opcode - 0x18) >> 3];
    let shouldJump: boolean = [true,
        !computer.getZ(),
        computer.getZ(),
        !computer.getC(),
        computer.getC()][(opcode - 0x18) >> 3];
    var cycles: number | undefined = undefined;
    if (shouldJump) {
        computer.PC += toSigned(jumpTo) - 2; // size
        cycles = 4;
    }
    return {
        text: `\tJR ${regString + (regString === '' ? '': ',')}+$${toHex(jumpTo)}`,
        visited: true,
        cycles: cycles
    };
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
    let computer: Computer = request.computer;
    let registers: Registers = computer.registers;
    const op: number = request.code[0];
    const regString: string = ['B', 'C', 'D', 'E', 'H', '(HL)', 'A'][op & 7];
    const register: number = [
        registers.B,
        registers.C,
        registers.D,
        registers.E,
        registers.H,
        computer.readByte(computer.combineHL()),
        registers.A
    ][op & 7];
    const num: number = (op - 0x40) >> 3;
    const flag : boolean = (register & (1 << num)) === 0;
    computer.setZ(flag);
    return {text: `\tBIT ${num},${regString}`, visited: true};
}

function push(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const computer: Computer = request.computer;

    const wordString: string = ['BC', 'DE', 'HL', 'SP'][(op >> 4) - 0xC];
    const word: number = [computer.combineBC(),
        computer.combineDE(),
        computer.combineHL(),
        computer.SP][(op >> 4) - 0xC];
    computer.pushWord(word);
    return {text: `\tPUSH ${wordString}`, visited: true};
}

function pop(request: OpCodeRequest): OpCodeResponse {
    const BC: number = 0;
    const DE: number = 1;
    const HL: number = 2;
    const AF: number = 3;

    const computer: Computer = request.computer;
    const op: number = request.code[0];
    const combined: string = ['BC', 'DE', 'HL', 'AF'][(op >> 4) - 0xC];
    const word: number = computer.popWord();

    switch ((op >> 4) - 0xC) {
        case BC: computer.writeBC(word); break;
        case DE: computer.writeDE(word); break;
        case HL: computer.writeHL(word); break;
        case AF: computer.writeAF(word); break;
        default: throw new Error("???")
    }
    return {text: `\tPOP ${combined}`, visited: true};
}

function decWord(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][op >> 4];

    return {text: `\tDEC ${word}`};
}

function decReg(request: OpCodeRequest): OpCodeResponse {
    const B: number = 0x5;
    const C: number = 0xD;
    const D: number = 0x15;
    const E: number = 0x1D;
    const H: number = 0x25;
    const L: number = 0x2D;
    const HL: number = 0x35;
    const A: number = 0x3D;

    const computer: Computer = request.computer;
    const register: Registers = computer.registers;
    const op: number = request.code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 5) >> 3];
    let byte: number = [
        register.B,
        register.C,
        register.D,
        register.E,
        register.H,
        register.L,
        computer.readByte(computer.combineHL()),
        register.A,
    ][(op - 5) >> 3];

    byte--;
    computer.setZ(clampByte(byte) === 0);
    computer.setN(true);
    computer.setH(calculateHalfBit(byte));
    byte = clampByte(byte);

    switch (op) {
        case B: register.B = byte; break;
        case C: register.C = byte; break;
        case D: register.D = byte; break;
        case E: register.E = byte; break;
        case H: register.H = byte; break;
        case L: register.L = byte; break;
        case HL: computer.writeByte(computer.combineHL(), byte); break;
        case A: register.A = byte; break;
        default: throw "???";
    }
    
    return {text: `\tDEC ${reg}`, visited: true};
}

function dec(request: OpCodeRequest): OpCodeResponse {
    const op: number = request.code[0];
    if ((op & 7) === 5) return decReg(request);
    else return decWord(request);
}


function incReg(request: OpCodeRequest): OpCodeResponse {
    const B: number = 0x04;
    const C: number = 0x0C;
    const D: number = 0x14;
    const E: number = 0x1C;
    const H: number = 0x24;
    const L: number = 0x2C;
    const HL: number = 0x34;
    const A: number = 0x4C;

    const op: number = request.code[0];
    const computer: Computer = request.computer;
    const registers: Registers = computer.registers;
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 4) >> 3];
    let byte : number = [
        registers.B,
        registers.C,
        registers.D,
        registers.E,
        registers.H,
        registers.L,
        computer.readByte(computer.combineHL()),
        registers.A,
    ][(op - 4) >> 3];
    byte++;
    computer.setZ(clampByte(byte) === 0);
    computer.setN(false);
    computer.setH(calculateHalfBit(byte));
    byte = clampByte(byte);
    switch (op) {
        case B: registers.B = byte; break;
        case C: registers.C = byte; break;
        case D: registers.D = byte; break;
        case E: registers.E = byte; break;
        case H: registers.H = byte; break;
        case L: registers.L = byte; break;
        case A: registers.A = byte; break;
        case HL: computer.writeByte(computer.combineHL(), byte); break;
    }
    return {text: `\tINC ${reg}`, visited: true};
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
    const computer: Computer = request.computer;
    const registers: Registers = computer.registers;
    const op: number = request.code[0];
    const lowByte: number = request.code[1];
    const address: number = 0xFF00 | lowByte;
    if (op === 0xE0) {
        registers.A = computer.readByte(address);
        return {text: `\tLDH ($FF00+$${toHex(request.code[1])}),A}`, visited: true};
    } else {
        computer.writeByte(address, registers.A);
        return {text: `\tLDH A,($FF00+$${toHex(request.code[1])})`, visited: true};
    }
};

function call(request: OpCodeRequest): OpCodeResponse {
    const NZ: number = 0xC4;
    const Z: number = 0xCC;
    const NC: number = 0xD4;
    const C: number = 0xDC;

    const computer: Computer = request.computer;
    const op: number = request.code[0];
    const address: number = toWord(request.code[1], request.code[2]);

    var jump: boolean = true;
    let regString: string = '';
    switch (op) {
        case NZ:
            jump = !computer.getZ();
            regString = 'NZ,';
            break;
        case Z:
            jump = computer.getZ();
            regString = 'Z,';
            break;
        case NC:
            jump = !computer.getC();
            regString = 'NC,';
            break;
        case C:
            jump = computer.getC();
            regString = 'C,';
            break;
        default: break;
    }
    const cycles: number = jump && op != 0xCD ? 12 : 0;
    if (jump) {
        computer.pushWord(computer.PC + 3);
        computer.PC = address - 3;
    }
    return {
        text: `\tCALL ${regString}$${toHex(toWord(request.code[1], request.code[2]))}`,
        cycles: cycles,
        visited: true
    };
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
    4, 12, 8, 8, 4, 4, 8, 4,       // 0x00
    20, 8, 8, 8, 4, 4, 8, 4,       // 0x08
    4, 12, 8, 8, 4, 4, 8, 4,       // 0x10
    12, 8, 8, 8, 4, 4, 8, 4,       // 0x18
    12, 12, 8, 8, 4, 4, 8, 4,      // 0x20
    12, 8, 8, 8, 4, 4, 8, 4,       // 0x28
    12, 12, 8, 8, 12, 12, 12, 4,   // 0x30
    12, 8, 8, 8, 4, 4, 8, 4,       // 0x38
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x40
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x48
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x50
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x58
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x60
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x68
    8, 8, 8, 8, 8, 8, 4, 8,        // 0x70
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x78
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x80
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x88
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x90
    4, 4, 4, 4, 4, 4, 8, 4,        // 0x98
    4, 4, 4, 4, 4, 4, 8, 4,        // 0xA0
    4, 4, 4, 4, 4, 4, 8, 4,        // 0xA8
    4, 4, 4, 4, 4, 4, 8, 4,        // 0xB0
    4, 4, 4, 4, 4, 4, 8, 4,        // 0xB8
    20, 12, 16, 16, 24, 16, 8, 16, // 0xC0
    20, 16, 16, 4, 24, 24, 8, 16,  // 0xC8
    20, 12, 16, -1, 24, 16, 8, 16, // 0xD0
    20, 16, 16, -1, 24, -1, 8, 16, // 0xD8
    12, 12, 8, -1, -1, 16, 8, 16,  // 0xE0
    16, 4, 16, -1, -1, -1, 8, 16,  // 0xE8
    12, 12, 8, 4, -1, 16, 8, 16,   // 0xF0
    12, 8, 16, 4, -1, -1, 8, 16    // 0xF0
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
    private program: Uint8Array;
    public cycles: number = 0;
    public PC: number = 0;
    public SP: number = 0;
    public registers: Registers;
    private flags: Flags;
    constructor(program: Uint8Array, pc: Registers, flags: Flags) {
        this.program = new Uint8Array(0xFFFF);
        for (var i: number = 0; i < program.length; i++) {
            this.program[i] = program[i];
        }
        this.registers = pc;
        this.flags = flags;
    }

    public readWord(address: number): number {
        assertWord(address);
        assertWord(address + 1);
        const lo: number = this.readByte(address);
        const hi: number = this.readByte(address + 1);
        return (hi << 8) | lo;
    }
    public readByte(address: number): number {
        assertWord(address);
        return this.program[address];
    }

    public writeByte(address: number, byte: number) {
        assertWord(address);
        assertByte(byte);
        this.program[address] = byte;
    }
    public writeWord(address: number, word: number) {
        const lo: number = word & 0xFF;
        const hi: number = word >> 8;
        this.writeByte(address, lo);
        this.writeByte(address + 1, hi);
    }

    public combineBC = (): number => (this.registers.B << 8) | this.registers.C;
    public combineDE = (): number => (this.registers.D << 8) | this.registers.E;
    public combineHL = (): number => (this.registers.H << 8) | this.registers.L;
    public combineAF = (): number => (this.registers.A << 8) | this.registers.F;

    public writeAF(word: number) {
        assertWord(word);
        const lo: number = word & 0xFF;
        const hi: number = word >> 8;
        this.registers.A = hi;
        this.registers.F = lo;
    }

    public writeBC(word: number) {
        assertWord(word);
        const lo: number = word & 0xFF;
        const hi: number = word >> 8;
        this.registers.B = hi;
        this.registers.C = lo;
    }

    public writeDE(word: number) {
        assertWord(word);
        const lo: number = word & 0xFF;
        const hi: number = word >> 8;
        this.registers.D = hi;
        this.registers.E = lo;
    }

    public writeHL(word: number) {
        assertWord(word);
        const lo: number = word & 0xFF;
        const hi: number = (word >> 8);
        this.registers.H = hi;
        this.registers.L = lo;
    }

    public setZ(bit: boolean) {
        this.flags.Z = bit;
    }

    public setN(bit: boolean) {
        this.flags.N = bit;
    }

    public setH(bit: boolean) {
        this.flags.H = bit;
    }

    public setC(bit: boolean) {
        this.flags.C = bit;
    }

    public getZ(): boolean {
        return this.flags.Z;
    }

    public getN(): boolean {
        return this.flags.N;
    }

    public getH(): boolean {
        return this.flags.H;
    }

    public getC(): boolean {
        return this.flags.C;
    }

    public pushWord(number: number) {
        assertWord(number);
        const lo: number = number & 0xFF;
        const hi: number = (number >> 8);
        this.pushByte(lo);
        this.pushByte(hi);
    }

    public pushByte(number: number) {
        assertByte(number);
        this.writeByte(--this.SP, number);
    }

    public popWord(): number {
        const hi: number = this.popByte();
        const lo: number = this.popByte();
        return toWord(lo, hi);
    }

    public popByte(): number {
        return this.readByte(this.SP++)
    }
}

function assertBit(bit: number) {
    if (bit < 0x00 || bit > 0x01) {
        throw new Error('Not a bit!');
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
    var flags: Flags = {
        Z: false,
        N: false,
        H: false,
        C: false
    };
    let computer: Computer = new Computer(program, pc, flags);
    var message: string = "";
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
        if (!response.visited) {
            message = `Break at position $${toHex(computer.PC)}, opcode $${toHex(opcode)} (${parser.name})`;
            break;
        }
        computer.PC += size;
        computer.cycles += cycles;
    }
    return `${instructions.reduce((a, b) => `${a}\n${b}`, "")}\n\n\tcycles: ${computer.cycles}\n\n\t${message}`;
}

fs.readFile(PATH, (err: any, data: any) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(tick(data));
});
