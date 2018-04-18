import fs from 'fs';
import { SSL_OP_NETSCAPE_DEMO_CIPHER_CHANGE_BUG } from 'constants';

const PATH = './boot.gb';

const toWord = (lo: number, hi: number): number => hi << 8 | lo;
const toHex = (num: number): string => num.toString(16);
const toSigned = (num: number): number => ((~num & 0xFF) - 1) * ((num & 0x80) === 0 ? 1 : -1);

type ParsingFunction = {(code: Uint8Array): string};

const ret: ParsingFunction = code => {
    const op: number = code[0];
    switch (op) {
        case 0xC0: return `\tRET NZ`;
        case 0xC8: return `\tRET Z`;
        case 0xC9: return `\tRET`;
        case 0xD0: return `\tRET NC`;
        case 0xD8: return `\tRET C`;
        case 0xD9: return `\tRETI`;
        default: return `???`;
    }
}

const addReg: ParsingFunction = code => {
    const op: number = code[0];
    return `\tADD A,${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 0x7]}`
}
const add: ParsingFunction = code => {
    const op: number = code[0];
    if ((op >> 4) === 8) return addReg(code);
    return '???';
}

const rla: ParsingFunction = code => `\tRLA`;

const rl: ParsingFunction = code => {
    const op: number = code[0];
    return `\tRL ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 0x7]}`;
}

const ldWordToA: ParsingFunction = code => {
    const op: number = code[0];
    const word: string = toHex(toWord(code[1], code[2]));
    if (op === 0xEA) return `\tLD ($${word}),A`;
    else return `\tLD A,($${word})`;
}

const ldWord: ParsingFunction = code => {
    const op: number = code[0];
    const loc: string = ['BC', 'DE', 'HL', 'SP'][op >> 4];
    const pos: string = toHex(toWord(code[1], code[2]));
    return `\tLD ${loc},$${pos}`;
}

const ldCombo: ParsingFunction = code => {
    const op : number = code[0];
    const loc: string = ['(BC)', '(DE)', '(HL+)', '(HL-)'][op >> 4];
    if ((op & 0xF) == 0x2) return `\tLD ${loc},A`;
    else return `\tLD A,${loc}`;
}

const sub: ParsingFunction = code => {
    const op: number = code[0];
    var val: number | string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 0x7];
    if (op == 0xD6) {
        val = code[1];
    }
    return `\tSUB ${val}`;
}

const ldReg: ParsingFunction = code => {
    const op: number = code[0];
    const regTable: string[] = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const from: string = regTable[(op - 0x40) >> 3];
    const to: string = regTable[op & 7]
    return `\tLD ${from},${to}`;
}

const ldByte: ParsingFunction = code => {
    const op: number = code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 6) >> 3];
    return `\tLD ${reg},$${toHex(code[1])}`;
}

const ldC: ParsingFunction = code => {
    const op: number = code[0];
    if (op === 0xE2) return `\tLD ($FF00+C),A`;
    else return `\tLD A,$FF00+C)`;
}

const ld: ParsingFunction = code => {
    const op: number = code[0];
    if (op >> 4 < 4 && (op & 7) === 1) return ldWord(code);
    if (op >> 4 < 4 && (op & 7) === 6) return ldByte(code);
    if (op >> 4 < 4 && ((op & 7) === 2 || (op & 0xF) === 0xA)) return ldCombo(code);
    if (op >> 4 >= 4 && op >> 4 < 8) return ldReg(code);
    if (op === 0xE2 || op === 0xF2) return ldC(code);
    if (op === 0xEA || op === 0xFA) return ldWordToA(code);
    return `\t???`;
}
const jr: ParsingFunction = code => {
    const opcode: number = code[0];
    let reg: string = ['', 'NZ', 'Z', 'NC', 'C'][(opcode - 0x18) >> 3];
    return `\tJR ${reg + (reg === '' ? '': ',')}+$${toHex(code[1])}`;
};
const xor: ParsingFunction = code => '\tXOR A';
const fail: ParsingFunction = code => "UNKNOWN";
const bit: ParsingFunction = code => {
    const op: number = code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', '(HL)', 'A'][op & 7];
    const num: number = (op - 0x40) >> 3;

    return `\tBIT ${num},${reg}`;
}

const decWord: ParsingFunction = code => {
    const op: number = code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][op >> 4];
    return `\tDEC ${word}`;
}

const decReg: ParsingFunction = code => {
    const op: number = code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 5) >> 3];
    return `\tDEC ${reg}`
}

const dec: ParsingFunction = code => {
    const op: number = code[0];
    if ((op & 7) === 5) return decReg(code);
    else return decWord(code);
}

const push: ParsingFunction = code => {
    const op: number = code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][(op >> 4) - 0xC];
    return `\tPUSH ${word}`;
}

const pop: ParsingFunction = code => {
    const op: number = code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][(op >> 4) - 0xC];
    return `\tPOP ${word}`;
}

const incReg: ParsingFunction = code => {
    const op: number = code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 4) >> 3];
    return `\tINC ${reg}`
}
const incWord: ParsingFunction = code => {
    const op: number = code[0];
    const word: string = ['BC', 'DE', 'HL', 'SP'][op >> 4];
    return `\tINC ${word}`;
}
const inc: ParsingFunction = code => {
    const op: number = code[0];
    if ((op & 7) === 4) return incReg(code);
    else return incWord(code);
}

const ldh: ParsingFunction = code => {
    const op: number = code[0];
    if (op === 0xE0) return `\tLDH ($FF00+$${toHex(code[1])}),A`;
    else return `\tLDH A,($FF00+$${toHex(code[1])})`;
}

const call: ParsingFunction = code => {
    const op: number = code[0];
    let reg = '';
    switch (op) {
        case 0xC4: reg = 'NZ,'; break;
        case 0xCC: reg = 'Z,'; break;
        case 0xD4: reg = 'NC,'; break;
        case 0xDC: reg = 'C,'; break;
    }
    return `\tCALL ${reg}$${toHex(toWord(code[1], code[2]))}`;
}

const cp: ParsingFunction = code => {
    const op: number = code[0];
    const reg: string = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
    if (op === 0xFE) return `\tCP $${toHex(code[1])}`
    else return `\tCP ${reg}`;
}

const CB_TABLE: ParsingFunction[] = [
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
]

const PARSE_TABLE: ParsingFunction[] = [
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

const disassemble = (program: Uint8Array): string => {
    let instructions: string[] = [];
    let i = 0;
    while (i < program.length) {
        var opcode: number = program[i];
        var size: number = INSTRUCTION_SIZE_TABLE[opcode];
        var code: Uint8Array = program.slice(i, i + size);
        var parser: ParsingFunction = PARSE_TABLE[opcode];
        if (opcode == 0xCB) {
            opcode = program[++i];
            code = program.slice(i, i + size);
            parser = CB_TABLE[opcode];
        }
        if (parser === fail) {
            console.error(`fail at $${toHex(opcode)}`);
            break;
        }
        const disassembled: string = parser(code);
        instructions.push(`${disassembled}\t\t$${toHex(i)}`);
        if (i === 0xA7) {
            instructions.push('~~~Gameboy logo data, skipping ahead~~~');
            i = 0xE0;
            continue;
        }
        i += size;
    }
    return instructions.reduce((a, b) => `${a}\n${b}`, "");
}

fs.readFile(PATH, (err, data: Buffer) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log(disassemble(data));
});