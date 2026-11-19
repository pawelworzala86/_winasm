import assert from 'node:assert/strict'
import test from 'node:test'
import Compile from '../sources/compile.ts'

type Section = {
    virtualSize:number
    virtualAddress:number
    rawSize:number
    rawPointer:number
}

function alignTo(size:number,alignment:number){
    return Math.ceil(size/alignment)*alignment
}

function readImage(executable:Uint8Array){
    const image = Buffer.from(executable)
    const peOffset = image.readUInt32LE(0x3c)
    const optionalHeaderOffset = peOffset+24
    const sectionCount = image.readUInt16LE(peOffset+6)
    const sectionOffset = optionalHeaderOffset+image.readUInt16LE(peOffset+20)
    const sections = new Map<string,Section>()
    for(let index=0;index<sectionCount;index++){
        const offset = sectionOffset+index*40
        const name = image.toString('ascii',offset,offset+8).replace(/\0+$/,'')
        sections.set(name,{
            virtualSize:image.readUInt32LE(offset+8),
            virtualAddress:image.readUInt32LE(offset+12),
            rawSize:image.readUInt32LE(offset+16),
            rawPointer:image.readUInt32LE(offset+20),
        })
    }
    return {
        sizeOfCode:image.readUInt32LE(optionalHeaderOffset+4),
        sizeOfInitializedData:image.readUInt32LE(optionalHeaderOffset+8),
        sizeOfImage:image.readUInt32LE(optionalHeaderOffset+56),
        sectionAlignment:image.readUInt32LE(optionalHeaderOffset+32),
        fileAlignment:image.readUInt32LE(optionalHeaderOffset+36),
        sections,
    }
}

function getSection(image:ReturnType<typeof readImage>,name:string){
    const section = image.sections.get(name)
    assert.ok(section,`Missing ${name} section`)
    return section
}

test('PE headers report actual code and data section sizes',()=>{
    const image = readImage(Compile(`.code
nop
.data
payload dq 1
.import
import 'kernel32.dll',ExitProcess,'ExitProcess'`))
    const text = getSection(image,'.text')
    const data = getSection(image,'.data')
    const idata = getSection(image,'.idata')

    assert.equal(text.virtualSize,1)
    assert.equal(text.rawSize,alignTo(text.virtualSize,image.fileAlignment))
    assert.equal(image.sizeOfCode,text.rawSize)
    assert.equal(data.virtualSize,8)
    assert.equal(data.rawSize,alignTo(data.virtualSize,image.fileAlignment))
    assert.equal(image.sizeOfInitializedData,data.rawSize+idata.rawSize)
})

test('large code and data sections do not overlap',()=>{
    const code = [
        '.code',
        ...Array(0x1001).fill('nop'),
        'mov rax, [payload]',
        'ret',
    ]
    const dataValues = Array(600).fill('0').join(',')
    const image = readImage(Compile(`${code.join('\n')}
.data
payload dq ${dataValues}
.import
import 'kernel32.dll',ExitProcess,'ExitProcess'`))
    const text = getSection(image,'.text')
    const data = getSection(image,'.data')
    const idata = getSection(image,'.idata')

    assert.ok(text.virtualSize>0x1000)
    assert.equal(text.rawSize,alignTo(text.virtualSize,image.fileAlignment))
    assert.equal(image.sizeOfCode,text.rawSize)

    assert.equal(data.virtualSize,600*8)
    assert.equal(data.rawSize,alignTo(data.virtualSize,image.fileAlignment))
    assert.equal(data.virtualAddress,alignTo(text.virtualAddress+text.virtualSize,image.sectionAlignment))
    assert.equal(idata.virtualAddress,alignTo(data.virtualAddress+data.virtualSize,image.sectionAlignment))
    assert.ok(text.virtualAddress+Math.max(text.virtualSize,text.rawSize)<=data.virtualAddress)
    assert.ok(data.virtualAddress+Math.max(data.virtualSize,data.rawSize)<=idata.virtualAddress)

    assert.equal(data.rawPointer,text.rawPointer+text.rawSize)
    assert.equal(idata.rawPointer,data.rawPointer+data.rawSize)
    assert.equal(image.sizeOfInitializedData,data.rawSize+idata.rawSize)
    assert.equal(image.sizeOfImage,alignTo(idata.virtualAddress+Math.max(idata.virtualSize,idata.rawSize),image.sectionAlignment))
})
