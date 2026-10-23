import fs from 'fs'
import parseInstruction from './mnemonic.ts'
import parser from './opcode.ts'

if(!fs.existsSync('./dist/')){
  fs.mkdirSync('./dist/')
}



function writeUInt32LE(array:any, value:any, offset:any, comment:string|null=null) {
  array[offset] = value & 0xff;
  array[offset + 1] = (value >> 8) & 0xff;
  array[offset + 2] = (value >> 16) & 0xff;
  array[offset + 3] = (value >> 24) & 0xff;
}

function writeUInt16LE(array:any, value:any, offset:any, comment:string|null=null) {
  array[offset] = value & 0xff;
  array[offset + 1] = (value >> 8) & 0xff;
}

export function generatePrintfExecutable(outputPath:string) {

  const enc = new TextEncoder();


  const DATASET:any = {}






  const REPLS:any = []
  const SOURCE:any = {
    code: '',
    data: '',
    import: '',
  }
  const source = fs.readFileSync('./examples/test.asm').toString()
  let swith = 'code'
  source.split('\n').map(line=>{
    line = line.trim()
    if(line=='.code'){
      swith = 'code'
    }else if(line=='.data'){
      swith = 'data'
    }else if(line=='.import'){
      swith = 'import'
    }else{
      SOURCE[swith] += line+'\n'
    }
  })
  const codeTxt = SOURCE.code


  const lines = codeTxt.split(/\r?\n/)
  const labels = new Map<string, number>()
  const instructions:any[] = []
  let OFFSET = 0

  lines.forEach((sourceLine:any, index:any) => {
    const line = sourceLine.split(';', 1)[0].trim()
    if (!line) return

    const labelMatch = line.match(/^([a-z_.$][\w.$]*):$/i)
    if (labelMatch) {
      const label = labelMatch[1].toLowerCase()
      if (labels.has(label)) {
        throw new Error(`Duplicate label "${labelMatch[1]}" on line ${index + 1}`)
      }
      labels.set(label, OFFSET)
      return
    }

    const instructionMatch = line.match(/^(\S+)(?:\s+(.+))?$/)
    if (!instructionMatch) return

    const [, command, rawParameters = ''] = instructionMatch
    const instr = parseInstruction(line)
    if (!instr) {
      throw new Error(`Invalid or unsupported instruction on line ${index + 1}: ${line}`)
    }

    const parameters = rawParameters
      ? rawParameters.split(',').map((parameter:any) => parameter.trim())
      : []
    const bytes = parser.encode(instr, parameters)
    instructions.push({ line: index + 1, command: command.toLowerCase(), instr, parameters, offset: OFFSET, bytes })

    parameters.forEach((param:any) => {
      if (/^\[[a-z_.$][\w.$]*\]$/i.test(param)) {
        const name = param.substring(1, param.length - 1)
        REPLS.push({ expr: name, offset: OFFSET, length: bytes.length })
      }
    })
    OFFSET += bytes.length
  })

  const assembledBytes:string[] = []
  for (const instruction of instructions) {
    let bytes = instruction.bytes
    if (
      (instruction.command === 'jmp' && instruction.instr === 'jmp rel32') ||
      (instruction.command === 'call' && instruction.instr === 'call rel32')
    ) {
      const target = instruction.parameters[0]?.toLowerCase()
      const targetOffset = labels.get(target)
      if (targetOffset === undefined) {
        throw new Error(`Undefined label "${instruction.parameters[0]}" on line ${instruction.line}`)
      }
      const relativeOffset = targetOffset - (instruction.offset + bytes.length)
      bytes = parser.encode(instruction.instr, [{ rel: true, offset: relativeOffset }])
    }
    assembledBytes.push(...bytes)
  }

  let hex = assembledBytes.join('')
  console.log('DATASET',DATASET)


  const codeRawStart = 0x200;
  let codeRawSize
  {
    const idataVirtualSize = hex.length / 2;
    const fileAlignment = 0x200;
    codeRawSize = Math.ceil(idataVirtualSize / fileAlignment) * fileAlignment;
    hex = hex.padEnd(codeRawSize * 2, '0');
  }
  const code = Buffer.from(hex,'hex')
















function textToHex(text: string): string {
  // 1. Zakoduj tekst do UTF-8 jako ciąg bajtów (Uint8Array)
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  // 2. Przekształć każdy bajt na postać szesnastkową i połącz w jeden łańcuch
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}




  


  // --- 5. ZAWARTOŚĆ SEKCJI .data (RAW 0x400, RVA 0x2000) ---
  const dataRawStart = codeRawSize + codeRawStart
  //const dataRawSize = 0x200;

  const stringHelloRva = 0x2000;

  //exe.set(enc.encode('Hello World!\n\0'), dataRaw);
  DATASET['helloTxt'] = stringHelloRva + 0

  let dataHex = ''
  dataHex += textToHex('Hello World!')
  dataHex += '00'

  dataHex = dataHex.replace(/\t|\r|\n\|\ /gm,'')

  let dataRawSize
  {
    const idataVirtualSize = dataHex.length / 2;
    const fileAlignment = 0x200;
    dataRawSize = Math.ceil(idataVirtualSize / fileAlignment) * fileAlignment;
    dataHex = dataHex.padEnd(dataRawSize * 2, '0');
  }
  const dataSet = Buffer.from(dataHex,'hex')















  const idataRawStart = dataRawStart + dataRawSize

  let idataRaw = codeRawSize + 0x400;
  const idataRva = 0x3000;



  
  let idata = '';
  const writeHexToidata = (hex: string, offset: number) => {
    const start = offset * 2;
    if (idata.length < start) {
      idata = idata.padEnd(start, '0');
    }
    const end = start + hex.length;
    if (idata.length < end) {
      idata = idata.padEnd(end, '0');
    }
    idata = idata.slice(0, start) + hex + idata.slice(end);
  };
  const writeToidata = (value: number, offset: number, byteLength = 4) => {
    const hex = Array.from({ length: byteLength }, (_, index) =>
      (index < 4 ? (value >>> (index * 8)) & 0xff : 0).toString(16).padStart(2, '0')
    ).join('');
    writeHexToidata(hex, offset);
  };
  idataRaw = 0

  // --- 6. ZAWARTOŚĆ SEKCJI .idata (RAW 0x600, RVA 0x3000) ---
  const IAT_LAYOUT = [
    { dll: 'kernel32.dll', functions: ['ExitProcess'] },
    { dll: 'msvcrt.dll',   functions: ['printf', 'malloc'] },
  ];

  // Rezerwacja miejsca na Import Directory Table
  let currentRva = idataRva + (IAT_LAYOUT.length + 1) * 20;
  const iatAddresses:any = {};

  IAT_LAYOUT.forEach((dllGroup, dllIndex) => {
    const importDescOffset = idataRaw + (dllIndex * 20);

    const iatRva = currentRva;
    const iltRva = iatRva + (dllGroup.functions.length + 1) * 8;
    currentRva = iltRva + (dllGroup.functions.length + 1) * 8;

    writeToidata(iltRva, importDescOffset + 0);
    writeToidata(0,      importDescOffset + 4);
    writeToidata(0,      importDescOffset + 8);

    dllGroup.functions.forEach((fnName, fnIndex) => {
      const fnNameRva = currentRva;
      const fnNameRaw = idataRaw + (fnNameRva - idataRva);

      writeToidata(0, fnNameRaw, 2);
      writeHexToidata(textToHex(`${fnName}\0`), fnNameRaw + 2);

      const nameStructSize = 2 + fnName.length + 1;
      const paddedSize = (nameStructSize % 2 !== 0) ? nameStructSize + 1 : nameStructSize;
      currentRva += paddedSize;

      const iatOffset = idataRaw + (iatRva - idataRva) + (fnIndex * 8);
      const iltOffset = idataRaw + (iltRva - idataRva) + (fnIndex * 8);

      writeToidata(fnNameRva, iatOffset);
      writeToidata(fnNameRva, iltOffset);

      iatAddresses[fnName] = iatRva + (fnIndex * 8);
    });

    const iatNullOffset = idataRaw + (iatRva - idataRva) + (dllGroup.functions.length * 8);
    const iltNullOffset = idataRaw + (iltRva - idataRva) + (dllGroup.functions.length * 8);
    writeToidata(0, iatNullOffset, 8);
    writeToidata(0, iltNullOffset, 8);

    const dllNameRva = currentRva;
    const dllNameRaw = idataRaw + (dllNameRva - idataRva);
    writeHexToidata(textToHex(`${dllGroup.dll}\0`), dllNameRaw);
    currentRva += dllGroup.dll.length + 1;

    writeToidata(dllNameRva, importDescOffset + 12);
    writeToidata(iatRva,     importDescOffset + 16);
  });

  const nullDescOffset = idataRaw + (IAT_LAYOUT.length * 20);
  for (let i = 0; i < 5; i++) {
    writeToidata(0, nullDescOffset + i * 4);
  }

  const idataVirtualSize = idata.length / 2;
  const fileAlignment = 0x200;
  const idataRawSize = Math.ceil(idataVirtualSize / fileAlignment) * fileAlignment;
  idata = idata.padEnd(idataRawSize * 2, '0');












  // Rozmiar sekcji .idata jest wyliczany z wygenerowanego ciągu hex i wyrównywany do File Alignment.
  const fileSize = idataRawStart + idataRawSize
  const exe = new Uint8Array(fileSize);

  // --- 1. DOS HEADER ---
  exe[0] = 0x4D; exe[1] = 0x5A; // 'MZ'
  writeUInt32LE(exe, 0x00000080, 0x3C, 'e_lfanew = 0x80');

  // --- 2. PE HEADER (COFF) ---
  const peOffset = 0x80;
  exe[peOffset] = 0x50; exe[peOffset + 1] = 0x45; // 'PE\0\0'

  writeUInt16LE(exe, 0x8664, peOffset + 4, 'Machine: AMD64 (64-bit)');
  writeUInt16LE(exe, 3, peOffset + 6, 'Number of Sections: 3 (.text, .data, .idata)');
  writeUInt32LE(exe, 0x60000000, peOffset + 8, 'TimeDateStamp');
  writeUInt16LE(exe, 0xF0, peOffset + 20, 'Size of Optional Header (240 bajtów)');
  writeUInt16LE(exe, 0x0022, peOffset + 22, 'Characteristics: EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE');

  // --- 3. OPTIONAL HEADER (PE32+) ---
  const optOffset = peOffset + 24;
  writeUInt16LE(exe, 0x020B, optOffset, 'Magic: PE32+ (64-bit)');

  writeUInt32LE(exe, 0x00000200, optOffset + 4, 'Size of Code');
  writeUInt32LE(exe, dataRawSize + idataRawSize, optOffset + 8, 'Size of Initialized Data (.data + .idata)');

  writeUInt32LE(exe, 0x00001000, optOffset + 16, 'Address of Entry Point (RVA)');
  writeUInt32LE(exe, 0x00001000, optOffset + 20, 'Base Of Code');

  writeUInt32LE(exe, 0x00400000, optOffset + 24, 'ImageBase (0x00400000)');

  writeUInt32LE(exe, 0x00001000, optOffset + 32, 'Section Alignment (0x1000)');
  writeUInt32LE(exe, 0x00000200, optOffset + 36, 'File Alignment (0x200)');
  writeUInt16LE(exe, 6, optOffset + 40, 'Major OS Version');
  writeUInt16LE(exe, 0, optOffset + 42, 'Minor OS Version');
  writeUInt16LE(exe, 6, optOffset + 48, 'Major Subsystem Version');
  writeUInt16LE(exe, 0, optOffset + 50, 'Minor Subsystem Version');
  const sizeOfImage = Math.ceil((idataRva + idataVirtualSize) / 0x1000) * 0x1000;
  writeUInt32LE(exe, sizeOfImage, optOffset + 56, 'Size of Image');
  writeUInt32LE(exe, 0x00000200, optOffset + 60, 'Size of Headers');
  writeUInt16LE(exe, 3, optOffset + 68, 'Subsystem: 3 = Windows CUI (Konsola)');

  writeUInt32LE(exe, 0x00100000, optOffset + 72, 'Stack Reserve');
  writeUInt32LE(exe, 0x00001000, optOffset + 80, 'Stack Commit');
  writeUInt32LE(exe, 0x00100000, optOffset + 88, 'Heap Reserve');
  writeUInt32LE(exe, 0x00001000, optOffset + 96, 'Heap Commit');
  writeUInt32LE(exe, 16, optOffset + 108, 'Number of Data Directories');

  // Import Table Directory (RVA 0x3000)
  writeUInt32LE(exe, 0x00003000, optOffset + 120, 'Import Table RVA (.idata)');
  writeUInt32LE(exe, 0x0000003C, optOffset + 124, 'Import Table Size');

  // IAT Directory (RVA 0x3040)
  writeUInt32LE(exe, 0x00003040, optOffset + 208, 'IAT RVA (.idata)');
  writeUInt32LE(exe, 0x00000028, optOffset + 212, 'IAT Size');

  // --- 4. SECTION HEADERS ---
  let secOffset = optOffset + 240;

  // Sekcja 1: .text (RVA 0x1000, RAW 0x200)
  exe.set(new TextEncoder().encode('.text\0\0\0'), secOffset);
  writeUInt32LE(exe, 0x00001000, secOffset + 8, 'Virtual Size .text');
  writeUInt32LE(exe, 0x00001000, secOffset + 12, 'Virtual Address .text (RVA 0x1000)');
  writeUInt32LE(exe, 0x00000200, secOffset + 16, 'Size of Raw Data .text');
  writeUInt32LE(exe, 0x00000200, secOffset + 20, 'Pointer to Raw Data .text (0x200)');
  writeUInt32LE(exe, 0x60000020, secOffset + 36, 'CODE | EXECUTE | READ');

  // Sekcja 2: .data (RVA 0x2000, RAW 0x400)
  secOffset += 40;
  exe.set(new TextEncoder().encode('.data\0\0\0'), secOffset);
  writeUInt32LE(exe, 0x00001000, secOffset + 8, 'Virtual Size .data');
  writeUInt32LE(exe, 0x00002000, secOffset + 12, 'Virtual Address .data (RVA 0x2000)');
  writeUInt32LE(exe, 0x00000200, secOffset + 16, 'Size of Raw Data .data');
  writeUInt32LE(exe, 0x00000400, secOffset + 20, 'Pointer to Raw Data .data (0x400)');
  writeUInt32LE(exe, 0xC0000040, secOffset + 36, 'INITIALIZED_DATA | READ | WRITE');

  // Sekcja 3: .idata (RVA 0x3000, RAW 0x600)
  secOffset += 40;
  exe.set(new TextEncoder().encode('.idata\0\0'), secOffset);
  writeUInt32LE(exe, idataVirtualSize, secOffset + 8, 'Virtual Size .idata');
  writeUInt32LE(exe, 0x00003000, secOffset + 12, 'Virtual Address .idata (RVA 0x3000)');
  writeUInt32LE(exe, idataRawSize, secOffset + 16, 'Size of Raw Data .idata');
  writeUInt32LE(exe, 0x00000600, secOffset + 20, 'Pointer to Raw Data .idata (0x600)');
  writeUInt32LE(exe, 0xC0000040, secOffset + 36, 'INITIALIZED_DATA | READ | WRITE');













  // --- 7. KOD .text (RAW 0x200, RVA 0x1000) ---
  const RVA_TEXT_START = 0x1000;



  



  for(const RP of REPLS){
    if(DATASET[RP.expr]){
      const ripAfterLea    = RVA_TEXT_START + RP.offset + RP.length;
      const offsetToHello  = DATASET[RP.expr] - ripAfterLea;
      console.log('offsetToHello', offsetToHello);
      const writeAddr = RP.offset + (RP.length-4)
      writeUInt32LE(code, offsetToHello, writeAddr)
      //console.log(offsetToHello, 0x0B);
    }else{
      const ripAfterPrintf = RVA_TEXT_START + RP.offset + RP.length;
      const offsetToPrintf = iatAddresses[RP.expr] - ripAfterPrintf;
      const writeAddr = RP.offset + (RP.length-4)
      writeUInt32LE(code, offsetToPrintf, writeAddr);
    }
  }

  exe.set(code, codeRawStart);
  exe.set(dataSet, dataRawStart);
  exe.set(Buffer.from(idata, 'hex'), idataRawStart);


  fs.writeFileSync(outputPath, exe);
  console.log(`[+] Plik wygenerowany pomyślnie: ${outputPath}`);
}

generatePrintfExecutable('./dist/hello.exe');