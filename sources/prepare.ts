import fs from 'fs'
import path from 'path'

let sourceFileName = process.argv[2] || ''
sourceFileName = sourceFileName.replace(/[a-zA-Z0-9\_]+\.asm/gm,'')

function splitTopLevelCommaList(value:string): string[] {
    const parts:string[] = []
    let current = ''
    let inString = false
    let bracketDepth = 0

    for (let index = 0; index < value.length; index++) {
        const character = value[index]

        if (character === "'") {
            const previous = value[index - 1]
            if (inString && previous !== '\\') {
                inString = false
            } else if (!inString) {
                inString = true
            }
            current += character
            continue
        }

        if (!inString) {
            if (character === '[') {
                bracketDepth++
            } else if (character === ']') {
                bracketDepth = Math.max(0, bracketDepth - 1)
            } else if (character === ',' && bracketDepth === 0) {
                const trimmed = current.trim()
                if (trimmed.length) {
                    parts.push(trimmed)
                }
                current = ''
                continue
            }
        }

        current += character
    }

    const finalValue = current.trim()
    if (finalValue.length) {
        parts.push(finalValue)
    }
    return parts
}

function expandStructs(code:string): string {
    type StructMember = { name: string; declaration: string; offset: number }
    const structs = new Map<string, StructMember[]>()
    const structMemberOffsets = new Map<string, number>()
    const output:string[] = []
    const lines = code.split(/\r?\n/)
    let currentStruct: { name: string; members: StructMember[]; line: number; size: number } | null = null
    let openStructName: string | null = null
    let section = ''

    lines.forEach((line, index) => {
        const content = line.split(';', 1)[0].trim()

        if (currentStruct) {
            if (/^end\s+struct$/i.test(content)) {
                const key = currentStruct.name.toLowerCase()
                if (structs.has(key)) {
                    throw new Error(`Duplicate struct "${currentStruct.name}" on line ${currentStruct.line}`)
                }
                structs.set(key, currentStruct.members)
                for (const member of currentStruct.members) {
                    structMemberOffsets.set(`${key}.${member.name.toLowerCase()}`, member.offset)
                }
                currentStruct = null
                openStructName = null
                return
            }

            if (!content) return
            const member = content.match(/^([a-z_.$][\w.$]*)\s+(db|dw|dd|dq)\s+(.+)$/i)
            if (!member) {
                throw new Error(`Invalid struct member on line ${index + 1}: ${content}`)
            }
            if (currentStruct.members.some(item => item.name.toLowerCase() === member[1].toLowerCase())) {
                throw new Error(`Duplicate struct member "${member[1]}" on line ${index + 1}`)
            }
            const kind = member[2].toLowerCase()
            const valueSize = kind === 'db' ? 1 : kind === 'dw' ? 2 : kind === 'dd' ? 4 : 8
            const memberSize = splitTopLevelCommaList(member[3]).reduce((total, value) => {
                if (kind === 'db' && value.startsWith("'") && value.endsWith("'")) {
                    return total + new TextEncoder().encode(value.slice(1, -1)).length
                }
                return total + valueSize
            }, 0)
            currentStruct.members.push({
                name: member[1],
                declaration: `${member[2]} ${member[3]}`,
                offset: currentStruct.size
            })
            currentStruct.size += memberSize
            return
        }

        const structStart = content.match(/^struct\s+([a-z_.$][\w.$]*)$/i)
        if (structStart) {
            currentStruct = { name: structStart[1], members: [], line: index + 1, size: 0 }
            openStructName = structStart[1]
            return
        }

        if (/^\.data$/i.test(content)) {
            section = 'data'
        } else if (/^\.(?:code|import)$/i.test(content)) {
            section = content.slice(1).toLowerCase()
        }

        if (section === 'data') {
            const instance = content.match(/^([a-z_.$][\w.$]*)\s+([a-z_.$][\w.$]*)$/i)
            const members = instance ? structs.get(instance[2].toLowerCase()) : undefined
            if (instance && members) {
                output.push(`${line.slice(0, line.indexOf(content))}${instance[1]}:`)
                for (const member of members) {
                    output.push(`${line.slice(0, line.indexOf(content))}${instance[1]}.${member.name} ${member.declaration}`)
                }
                return
            }
        }

        output.push(line)
    })

    if (openStructName) {
        throw new Error(`Struct "${openStructName}" is missing "end struct"`)
    }

    let outputSection = ''
    return output.map(line => {
        const content = line.split(';', 1)[0].trim()
        if (/^\.data$/i.test(content)) {
            outputSection = 'data'
        } else if (/^\.(?:code|import)$/i.test(content)) {
            outputSection = content.slice(1).toLowerCase()
        }

        if (outputSection !== 'code') return line
        return line.replace(/\[([^\]]*)\]/g, (match, expression:string) => {
            const offsetExpression = expression.match(/^(\s*r(?:ax|cx|dx|bx|sp|bp|si|di|[89]|1[0-5])\s*\+\s*)([a-z_.$][\w.$]*\.[a-z_.$][\w.$]*)(\s*)$/i)
            if (!offsetExpression) return match

            const offset = structMemberOffsets.get(offsetExpression[2].toLowerCase())
            if (offset === undefined) return match
            return `[${offsetExpression[1]}${offset}${offsetExpression[3]}]`
        })
    }).join('\n')
}

export function Prepare(code:string){
    const stringLiterals:any[] = []

    const makeStringLabel = (literal:string) => {
        const safeLabel = `__str_${stringLiterals.length}`
        const text = literal.substring(1, literal.length - 1).replace(/'/g, "''")
        stringLiterals.push(`${safeLabel} db '${text}',0`)
        return safeLabel
    }

    const normalizeStringParameter = (param:string) => {
        const trimmed = param.trim()
        const target = trimmed.replace(/^addr\s+/i, '').trim()
        if (target.startsWith("'") && target.endsWith("'")) {
            return `addr ${makeStringLabel(target)}`
        }
        return trimmed
    }

    code = code.replace(/include .*/gm,match=>{
        let file = match.split('\'')[1].trim()
        try{
            let p = path.resolve(sourceFileName,'../../cache/'+file)
            //console.log('include file... ',p)
            const data = fs.readFileSync(p).toString()
            return data
        }catch(e){
            let p = path.resolve(sourceFileName,''+file)
            //console.log('include file... ',p)
            const data = fs.readFileSync(p).toString()
            return data
        }
    })

    const MACRO:any = []

    code = code.replace(/macro([\s\S]+?)end macro/gm,match=>{
        let name = match.split(' ')[1].trim()
        let params:any = []
        match.replace('macro '+name,'').split('\n')[0].split(',').map(t=>t.trim()).map(p=>{
            if(p.length){
                params.push(p)
            }
        })
        match = match.replace(/^macro (.*)/gm,'')
        match = match.replace(/^end macro/gm,'')
        match = match.trim()
        MACRO.push({name,params,body:match})
        return ''
    })

    //console.log(MACRO)

    for(let MA of MACRO){
        code = code.replace(new RegExp('\\b'+MA.name+'\\b(.*)','gm'),match=>{
            //const name = match.split(' ')[0].trim()
            const params = match.replace(MA.name+' ','').split(',').map(t=>t.trim())
            //console.log(MA.name,params)
            let result = MA.body
            params.map((param,i)=>{
                result = result.replace(new RegExp('\\b'+MA.params[i]+'\\b','gm'),param)
            })
            return result
        })
    }

    code = expandStructs(code)
    //fs.writeFileSync('./prepared.asm', code)

    //process.exit()

    /*let dataTXT = []
    code = code.replace(/.* db /gm,match=>{
        const name = match.split(' ')[0].trim()
        dataTXT.push(name)
        return match
    })*/

    const REGS = ['rcx','rdx','r8','r9']
    const REGS6 = ['rcx','rdx','r8','r9','[rsp+32]','[rsp+24]']
    const REGS8 = ['rcx','rdx','r8','r9','[rsp+32]','[rsp+40]','[rsp+48]','[rsp+56]']

    code = code.replace(/invoke .*/gm,match=>{
        let name = match.split(' ')[1].trim()
        let params:any = splitTopLevelCommaList(match.replace('invoke '+name+'',''))
        name = name.replace(',','').trim()
        params = params.map((param:any)=>normalizeStringParameter(param))
        let reg = 0
        params = params.map((param:any,i:number)=>{
            if(i<4){
                let oper = 'mov'
                if(param.indexOf('addr')>-1){
                    oper = 'lea'
                    param = '['+param.replace('addr','').trim()+']'
                }
                return `${oper} ${REGS[reg++]}, ${param}`
            }else{
                if(params.length<=6){
                    return `mov ${REGS6[reg++]}, ${param}`
                }else{
                    return `mov ${REGS8[reg++]}, ${param}`
                }
            }
        })
        let sub = 40
        if(params.length>6){
            sub = 64
        }
        return `    sub rsp, ${sub}
    ${params.join('\n')}
    call [${name}]
    add rsp, ${sub}`
    })

    code = code.replace(/rvcall .*/gm,match=>{
        let name = match.split(' ')[1].trim()
        let params = splitTopLevelCommaList(match.replace('rvcall '+name+'',''))
        name = name.replace(',','').trim()
        params = params.map((param:any)=>normalizeStringParameter(param))
        let reg = 0
        const pushes = params.map((param,i)=>{
            if(param.indexOf('addr')>-1){
                return `lea rax, [${param.replace('addr','').trim()}]\npush rax`
            }
            return `push [${param}]`
        })
        const shadowSpace = 32 + (params.length % 2) * 8
        return `    ${pushes.join('\n')}
    sub rsp, ${shadowSpace}
    call ${name}
    add rsp, ${shadowSpace + params.length * 8}`
    })

    const PROCS:any = []

    code = code.replace(/proc([\s\S]+?)endp/gm,match=>{
        let name = match.split(' ')[1].trim()
        let lines = match.split('\n')
        let params = lines[0].replace('proc '+name,'').trim().split('\n')[0].split(',').map(t=>t.trim()).filter(p=>p.length)
        match = match.replace(/^proc (.*)/gm,'')
        match = match.replace(/endp$/gm,'')
        match = match.trim()

        const shadowSpace = 32 + (params.length % 2) * 8
        params.map((param,i)=>{
            match = match.replace(new RegExp('\\b'+param+'\\b','gm'),match=>{
                const stackOffset = 16 + shadowSpace + (params.length - i - 1) * 8
                return `[rbp+${stackOffset}]`
            })
        })

        PROCS.push({name,params,body:match})
        return `${name}:
    push rbp
    mov rbp, rsp
    sub rsp, ${params.length*8}

    ${match}

    add rsp, ${params.length*8}
    mov rsp, rbp
    pop rbp

    ret`
    })

    //console.log(PROCS)

    /*for(let PR of PROCS){
        code = code.replace(new RegExp('\\b'+PR.name+'\\b(.*)','gm'),match=>{
            const name = match.split(' ')[0].trim()
            const params = match.replace(name+' ','').split(',').map(t=>t.trim())
            //console.log(name,params)
            let result = PR.body
            params.map((param,i)=>{
                //result = result.replace(new RegExp('\\b'+PR.params[i]+'\\b','gm'),param)
            })
            return result
        })
    }*/

    if(stringLiterals.length){
        const dataBlock = stringLiterals.map(line => `    ${line}`).join('\n')
        if(/(^|\n)\s*\.data\b/m.test(code)){
            code = code.replace(/(^|\n)(\s*\.data\b)/m, `$1$2\n${dataBlock}`)
        }else{
            code += `\n.data\n${dataBlock}\n`
        }
    }

    code = code.replace(/\[\[/gm,'[')
    code = code.replace(/\]\]/gm,']')

    //fs.writeFileSync('./prepared.asm', code)

    //process.exit()

    return code
}

export default Prepare