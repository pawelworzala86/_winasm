import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Compile from '../sources/compile.ts'
import Prepare from '../sources/prepare.ts'

test('procedures require an explicit final return', () => {
    assert.throws(() => Prepare('.code\nproc example\n mov rax, 1\nendp'), /example.*ret.*endp/)
    assert.throws(() => Prepare('.code\nproc example\n ret\n mov rax, 1\nendp'), /example.*ret.*endp/)
    assert.doesNotThrow(() => Prepare('.code\nproc example\n ; endp is not a directive here\n ret ; return\n ; comment\nendp ; example'))
    assert.throws(() => Prepare('.code\r\nproc example\r\nendp\r\n'), /example.*ret.*endp/)
})

test('each procedure return restores its frame', () => {
    const source = Prepare(`.code
proc example
 local value dq 1
 ret 8
 ret ; final return
endp`)
    assert.match(source, /add rsp, 8\s+mov rsp, rbp\s+pop rbp\s+ret 8/)
    assert.match(source, /add rsp, 8\s+mov rsp, rbp\s+pop rbp\s+ret ; final return/)
    assert.equal((source.match(/\bret\b/g) || []).length, 2)
    assert.doesNotThrow(() => Compile(source))
})

test('struct methods require and clean up each explicit return', () => {
    const prefix = '.data\nstruct Example\n value dq 1\n proc method\n'
    assert.throws(() => Prepare(`${prefix} mov rax, 1\n endp\nend struct`), /Example\.method.*ret.*endp/)
    const source = Prepare(`${prefix} ret 8\n ret ; final return\n endp\nend struct`)
    assert.match(source, /add rsp, 8\s+pop rsi\s+add rsp, 0\s+mov rsp, rbp\s+pop rbp\s+ret 8/)
    assert.match(source, /add rsp, 8\s+pop rsi\s+add rsp, 0\s+mov rsp, rbp\s+pop rbp\s+ret ; final return/)
    assert.doesNotThrow(() => Compile(source))
})

test('procedure examples compile with explicit returns', () => {
    for (const name of ['test', 'struct']) {
        assert.doesNotThrow(() => Compile(fs.readFileSync(new URL(`../examples/${name}.asm`, import.meta.url), 'utf8')))
    }
})
