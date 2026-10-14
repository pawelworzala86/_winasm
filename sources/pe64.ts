import fs from 'fs'

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
  // Rozmiar pliku zwiększony do 0x800 (Headers 0x200 + .text 0x200 + .data 0x200 + .idata 0x200)
  const fileSize = 0x800;
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
  writeUInt32LE(exe, 0x00000400, optOffset + 8, 'Size of Initialized Data (.data + .idata)');

  writeUInt32LE(exe, 0x00001000, optOffset + 16, 'Address of Entry Point (RVA)');
  writeUInt32LE(exe, 0x00001000, optOffset + 20, 'Base Of Code');

  writeUInt32LE(exe, 0x00400000, optOffset + 24, 'ImageBase (0x00400000)');

  writeUInt32LE(exe, 0x00001000, optOffset + 32, 'Section Alignment (0x1000)');
  writeUInt32LE(exe, 0x00000200, optOffset + 36, 'File Alignment (0x200)');
  writeUInt16LE(exe, 6, optOffset + 40, 'Major OS Version');
  writeUInt16LE(exe, 0, optOffset + 42, 'Minor OS Version');
  writeUInt16LE(exe, 6, optOffset + 48, 'Major Subsystem Version');
  writeUInt16LE(exe, 0, optOffset + 50, 'Minor Subsystem Version');
  writeUInt32LE(exe, 0x00004000, optOffset + 56, 'Size of Image');
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
  writeUInt32LE(exe, 0x00001000, secOffset + 8, 'Virtual Size .idata');
  writeUInt32LE(exe, 0x00003000, secOffset + 12, 'Virtual Address .idata (RVA 0x3000)');
  writeUInt32LE(exe, 0x00000200, secOffset + 16, 'Size of Raw Data .idata');
  writeUInt32LE(exe, 0x00000600, secOffset + 20, 'Pointer to Raw Data .idata (0x600)');
  writeUInt32LE(exe, 0xC0000040, secOffset + 36, 'INITIALIZED_DATA | READ | WRITE');

  const enc = new TextEncoder();

  // --- 5. ZAWARTOŚĆ SEKCJI .data (RAW 0x400, RVA 0x2000) ---
  const dataRaw = 0x400;
  const stringHelloRva = 0x2000;
  exe.set(enc.encode('Hello World!\n\0'), dataRaw);

  // --- 6. ZAWARTOŚĆ SEKCJI .idata (RAW 0x600, RVA 0x3000) ---
  const IAT_LAYOUT = [
    { dll: 'kernel32.dll', functions: ['ExitProcess'] },
    { dll: 'msvcrt.dll',   functions: ['printf', 'malloc'] },
  ];

  const idataRaw = 0x600;
  const idataRva = 0x3000;

  // Rezerwacja miejsca na Import Directory Table
  let currentRva = idataRva + (IAT_LAYOUT.length + 1) * 20;
  const iatAddresses:any = {};

  IAT_LAYOUT.forEach((dllGroup, dllIndex) => {
    const importDescOffset = idataRaw + (dllIndex * 20);

    const iatRva = currentRva;
    const iltRva = iatRva + (dllGroup.functions.length + 1) * 8;
    currentRva = iltRva + (dllGroup.functions.length + 1) * 8;

    writeUInt32LE(exe, iltRva, importDescOffset + 0, `OriginalFirstThunk (ILT) dla ${dllGroup.dll}`);
    writeUInt32LE(exe, 0,       importDescOffset + 4, 'TimeDateStamp');
    writeUInt32LE(exe, 0,       importDescOffset + 8, 'ForwarderChain');

    dllGroup.functions.forEach((fnName, fnIndex) => {
      const fnNameRva = currentRva;
      const fnNameRaw = idataRaw + (fnNameRva - idataRva);

      exe[fnNameRaw] = 0x00;
      exe[fnNameRaw + 1] = 0x00;
      exe.set(enc.encode(`${fnName}\0`), fnNameRaw + 2);

      const nameStructSize = 2 + fnName.length + 1;
      const paddedSize = (nameStructSize % 2 !== 0) ? nameStructSize + 1 : nameStructSize;
      currentRva += paddedSize;

      const iatOffset = idataRaw + (iatRva - idataRva) + (fnIndex * 8);
      const iltOffset = idataRaw + (iltRva - idataRva) + (fnIndex * 8);

      writeUInt32LE(exe, fnNameRva, iatOffset, `IAT Entry: ${dllGroup.dll}!${fnName}`);
      writeUInt32LE(exe, fnNameRva, iltOffset, `ILT Entry: ${dllGroup.dll}!${fnName}`);

      iatAddresses[fnName] = iatRva + (fnIndex * 8);
    });

    const iatNullOffset = idataRaw + (iatRva - idataRva) + (dllGroup.functions.length * 8);
    const iltNullOffset = idataRaw + (iltRva - idataRva) + (dllGroup.functions.length * 8);
    writeUInt32LE(exe, 0, iatNullOffset, `IAT NULL Terminator dla ${dllGroup.dll}`);
    writeUInt32LE(exe, 0, iltNullOffset, `ILT NULL Terminator dla ${dllGroup.dll}`);

    const dllNameRva = currentRva;
    const dllNameRaw = idataRaw + (dllNameRva - idataRva);
    exe.set(enc.encode(`${dllGroup.dll}\0`), dllNameRaw);
    currentRva += dllGroup.dll.length + 1;

    writeUInt32LE(exe, dllNameRva, importDescOffset + 12, `Name RVA dla ${dllGroup.dll}`);
    writeUInt32LE(exe, iatRva,     importDescOffset + 16, `FirstThunk (IAT) dla ${dllGroup.dll}`);
  });

  const nullDescOffset = idataRaw + (IAT_LAYOUT.length * 20);
  for (let i = 0; i < 5; i++) {
    writeUInt32LE(exe, 0, nullDescOffset + i * 4, 'Null Import Descriptor');
  }

  // --- 7. KOD .text (RAW 0x200, RVA 0x1000) ---
  const RVA_TEXT_START = 0x1000;

  const code = new Uint8Array([
    0x48, 0x83, 0xEC, 0x28,                         // sub rsp, 40
    0x48, 0x83, 0xE4, 0xF0,                         // and rsp, -16

    0x48, 0x8D, 0x0D, 0x00, 0x00, 0x00, 0x00,       // lea rcx, [RIP + ?]
    0x31, 0xC0,                                     // xor eax, eax

    0xFF, 0x15, 0x00, 0x00, 0x00, 0x00,             // call [RIP + ?] ; printf

    0x31, 0xC9,                                     // xor ecx, ecx

    0xFF, 0x15, 0x00, 0x00, 0x00, 0x00              // call [RIP + ?] ; ExitProcess
  ]);

  console.log('stringHelloRva', stringHelloRva);

  const ripAfterLea    = RVA_TEXT_START + 0x08 + 7;
  const offsetToHello  = stringHelloRva - ripAfterLea;
  console.log('offsetToHello', offsetToHello);
  writeUInt32LE(code, offsetToHello, 0x0B);

  const ripAfterPrintf = RVA_TEXT_START + 0x11 + 6;
  const offsetToPrintf = iatAddresses['printf'] - ripAfterPrintf;
  writeUInt32LE(code, offsetToPrintf, 0x13);

  const ripAfterExit   = RVA_TEXT_START + 0x19 + 6;
  const offsetToExit   = iatAddresses['ExitProcess'] - ripAfterExit;
  writeUInt32LE(code, offsetToExit, 0x1B);

  exe.set(code, 0x200);

  fs.writeFileSync(outputPath, exe);
  console.log(`[+] Plik wygenerowany pomyślnie: ${outputPath}`);
}

generatePrintfExecutable('./dist/hello.exe');