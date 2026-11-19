import assert from 'node:assert/strict'
import test from 'node:test'
import Compile from '../sources/compile.ts'

function getSection(executable:Uint8Array,name:string){
    const image = Buffer.from(executable)
    const peOffset = image.readUInt32LE(0x3c)
    const sectionCount = image.readUInt16LE(peOffset+6)
    const sectionOffset = peOffset+24+image.readUInt16LE(peOffset+20)
    for(let index=0;index<sectionCount;index++){
        const offset = sectionOffset+index*40
        if(image.toString('ascii',offset,offset+8).replace(/\0+$/,'')===name){
            return {
                virtualSize:image.readUInt32LE(offset+8),
                rawPointer:image.readUInt32LE(offset+20),
            }
        }
    }
    assert.fail(`Missing ${name} section`)
}

test('constant aliases resolve before assembly without creating data symbols',()=>{
    const executable = Buffer.from(Compile(`.code
mov rax, ALIAS
ret
.data
ALIAS = BASE
BASE = 4660
.import
import 'kernel32.dll',ExitProcess,'ExitProcess'`))
    const text = getSection(executable,'.text')
    const data = getSection(executable,'.data')

    assert.equal(data.virtualSize,0)
    assert.notEqual(executable.indexOf(Buffer.from([0x48,0xb8,0x34,0x12,0,0,0,0,0,0]),text.rawPointer),-1)
})

test('cyclic constant aliases report a compile error',()=>{
    assert.throws(()=>Compile(`.code
ret
.data
FIRST = SECOND
SECOND = FIRST
.import
import 'kernel32.dll',ExitProcess,'ExitProcess'`),/Cyclic constant definition: first -> second -> first/)
})

test('rvcall passes resolved aliases as immediate values',()=>{
    const executable = Buffer.from(Compile(`.code
rvcall callback, VALUE
ret
callback:
ret
.data
VALUE = 42
.import
import 'kernel32.dll',ExitProcess,'ExitProcess'`))
    const text = getSection(executable,'.text')

    assert.notEqual(executable.indexOf(Buffer.from([0x48,0xb8,0x2a,0,0,0,0,0,0,0,0xff,0xf0]),text.rawPointer),-1)
})
