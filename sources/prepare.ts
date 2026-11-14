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

function expandStructs(code:string): { code: string; methodCalls: Map<string, { label: string; instance: string }> } {
    type StructMember = { name: string; declaration: string; offset: number }
    type StructMethod = { name: string; parameters: string[]; body: string[] }
    type StructDefinition = { name: string; members: StructMember[]; methods: StructMethod[] }
    const structs = new Map<string, StructDefinition>()
    const structMemberOffsets = new Map<string, number>()
    const methodCalls = new Map<string, { label: string; instance: string }>()
    const methodDefinitions: Array<{ owner: string; method: StructMethod }> = []
    const output:string[] = []
    const lines = code.split(/\r?\n/)
    let currentStruct: { name: string; members: StructMember[]; methods: StructMethod[]; line: number; size: number } | null = null
    let currentMethod: { name: string; parameters: string[]; body: string[]; line: number } | null = null
    let openStructName: string | null = null
    let openMethodName: string | null = null
    let section = ''

    lines.forEach((line, index) => {
        const content = line.split(';', 1)[0].trim()

        if (currentMethod) {
            if (/^endp$/i.test(content)) {
                if (currentStruct!.methods.some(method => method.name.toLowerCase() === currentMethod!.name.toLowerCase())) {
                    throw new Error(`Duplicate struct method "${currentMethod.name}" on line ${currentMethod.line}`)
                }
                currentStruct!.methods.push({
                    name: currentMethod.name,
                    parameters: currentMethod.parameters,
                    body: currentMethod.body
                })
                currentMethod = null
                openMethodName = null
                return
            }
            currentMethod.body.push(line)
            return
        }

        if (currentStruct) {
            if (/^end\s+struct$/i.test(content)) {
                const key = currentStruct.name.toLowerCase()
                if (structs.has(key)) {
                    throw new Error(`Duplicate struct "${currentStruct.name}" on line ${currentStruct.line}`)
                }
                const definition = {
                    name: currentStruct.name,
                    members: currentStruct.members,
                    methods: currentStruct.methods
                }
                structs.set(key, definition)
                for (const member of currentStruct.members) {
                    structMemberOffsets.set(`${key}.${member.name.toLowerCase()}`, member.offset)
                }
                methodDefinitions.push(...currentStruct.methods.map(method => ({ owner: currentStruct!.name, method })))
                currentStruct = null
                openStructName = null
                return
            }

            if (!content) return
            const method = content.match(/^proc\s+([a-z_.$][\w.$]*)(?:\s*,\s*(.*))?$/i)
            if (method) {
                const parameters = method[2] ? splitTopLevelCommaList(method[2]) : []
                if (parameters.some(parameter => !/^[a-z_.$][\w.$]*$/i.test(parameter) || parameter.toLowerCase() === 'this')) {
                    throw new Error(`Invalid struct method parameter on line ${index + 1}`)
                }
                if (new Set(parameters.map(parameter => parameter.toLowerCase())).size !== parameters.length) {
                    throw new Error(`Duplicate struct method parameter on line ${index + 1}`)
                }
                currentMethod = { name: method[1], parameters, body: [], line: index + 1 }
                openMethodName = method[1]
                return
            }

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
            currentStruct = { name: structStart[1], members: [], methods: [], line: index + 1, size: 0 }
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
            const definition = instance ? structs.get(instance[2].toLowerCase()) : undefined
            if (instance && definition) {
                output.push(`${line.slice(0, line.indexOf(content))}${instance[1]}:`)
                for (const member of definition.members) {
                    output.push(`${line.slice(0, line.indexOf(content))}${instance[1]}.${member.name} ${member.declaration}`)
                }
                for (const method of definition.methods) {
                    methodCalls.set(`${instance[1]}.${method.name}`.toLowerCase(), {
                        label: `${definition.name}.${method.name}`,
                        instance: instance[1]
                    })
                }
                return
            }
        }

        output.push(line)
    })

    if (openMethodName) {
        throw new Error(`Struct method "${openMethodName}" is missing "endp"`)
    }
    if (openStructName) {
        throw new Error(`Struct "${openStructName}" is missing "end struct"`)
    }

    const replaceIdentifier = (line:string, name:string, replacement:string): string => {
        let result = ''
        let inString = false
        for (let index = 0; index < line.length;) {
            const character = line[index]
            if (character === "'" && inString && line[index + 1] === "'") {
                result += "''"
                index += 2
                continue
            }
            if (character === "'") {
                inString = !inString
                result += character
                index += 1
                continue
            }
            if (!inString && character === ';') {
                result += line.slice(index)
                break
            }
            if (!inString && /[a-z_.$]/i.test(character)) {
                const token = line.slice(index).match(/^[a-z_.$][\w.$]*/i)![0]
                result += token.toLowerCase() === name.toLowerCase() ? replacement : token
                index += token.length
                continue
            }
            result += character
            index += 1
        }
        return result
    }

    const replaceThisMember = (line:string, owner:string): string => {
        let result = ''
        let inString = false
        for (let index = 0; index < line.length;) {
            const character = line[index]
            if (character === "'" && inString && line[index + 1] === "'") {
                result += "''"
                index += 2
                continue
            }
            if (character === "'") {
                inString = !inString
                result += character
                index += 1
                continue
            }
            if (!inString && character === ';') {
                result += line.slice(index)
                break
            }
            if (!inString && /[a-z_.$]/i.test(character)) {
                const token = line.slice(index).match(/^[a-z_.$][\w.$]*/i)![0]
                const member = token.match(/^this\.([a-z_.$][\w.$]*)$/i)
                const offset = member
                    ? structMemberOffsets.get(`${owner}.${member[1]}`.toLowerCase())
                    : undefined
                result += offset === undefined ? token : `[rsi+${offset}]`
                index += token.length
                continue
            }
            result += character
            index += 1
        }
        return result
    }

    const methodCode = methodDefinitions.flatMap(({ owner, method }) => {
        const parameterRegisters = ['rbx', 'rdi', 'r12']
        const parameters = method.parameters.map((parameter, index) => ({
            name: parameter,
            replacement: index < parameterRegisters.length
                ? parameterRegisters[index]
                : `[rbp+${48 + (index - parameterRegisters.length) * 8}]`
        }))
        const savedRegisters = ['rsi', ...parameters.slice(0, parameterRegisters.length).map(parameter => parameter.replacement)]
        const needsAlignmentPadding = savedRegisters.length % 2 !== 0
        const prologue = [
            ...savedRegisters.map(register => `push ${register}`),
            ...(needsAlignmentPadding ? ['sub rsp, 8'] : []),
            'mov rsi, rcx',
            ...(parameters[0] ? [`mov ${parameters[0].replacement}, rdx`] : []),
            ...(parameters[1] ? [`mov ${parameters[1].replacement}, r8`] : []),
            ...(parameters[2] ? [`mov ${parameters[2].replacement}, r9`] : [])
        ]
        const epilogue = [
            ...(needsAlignmentPadding ? ['add rsp, 8'] : []),
            ...savedRegisters.slice().reverse().map(register => `pop ${register}`)
        ]
        const epilogueLabel = `${owner}.${method.name}.__exit`
        const body = method.body.map(line => {
            const returnStatement = line.match(/^(\s*)ret\s*(?:;.*)?$/i)
            if (returnStatement) return `${returnStatement[1]}jmp ${epilogueLabel}`
            let result = replaceThisMember(line, owner)
            result = replaceIdentifier(result, 'this', 'rsi')
            for (const parameter of parameters) {
                result = replaceIdentifier(result, parameter.name, parameter.replacement)
            }
            return result
        })
        return [`proc ${owner}.${method.name}`, ...prologue, ...body, `${epilogueLabel}:`, ...epilogue, 'endp']
    })

    if (methodCode.length) {
        const dataIndex = output.findIndex(line => /^\.data\b/i.test(line.trim()))
        if (dataIndex === -1) {
            if (!output.some(line => /^\.code\b/i.test(line.trim()))) output.push('.code')
            output.push(...methodCode)
        } else if (output.slice(0, dataIndex).some(line => /^\.code\b/i.test(line.trim()))) {
            output.splice(dataIndex, 0, ...methodCode)
        } else {
            output.splice(dataIndex, 0, '.code', ...methodCode)
        }
    }

    let outputSection = ''
    const expandedCode = output.map(line => {
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

    return { code: expandedCode, methodCalls }
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

    const structureExpansion = expandStructs(code)
    code = structureExpansion.code
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
        const methodCall = structureExpansion.methodCalls.get(name.toLowerCase())
        if (methodCall) {
            name = methodCall.label
            params.unshift(`addr ${methodCall.instance}`)
        }
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
    call ${methodCall ? name : `[${name}]`}
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
        const lines = match.split(/\r?\n/)
        const header = lines[0].trim().match(/^proc\s+([^\s,]+)(?:\s*,\s*(.*)|\s+(.+))?$/i)
        if (!header) {
            throw new Error(`Invalid procedure declaration: ${lines[0].trim()}`)
        }
        const name = header[1]
        const parameterText = header[2] || header[3] || ''
        const params = parameterText ? splitTopLevelCommaList(parameterText) : []
        match = lines.slice(1, -1).join('\n').trim()

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