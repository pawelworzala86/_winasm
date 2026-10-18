.code
    sub rsp, 40
    and rsp, -16

    lea rcx, [helloTxt]
    xor eax, eax

    call [printf]

    lea rcx, [helloTxt]
    push rcx
    call EndoFunc
    add rsp, 8
    xor ecx, ecx

    call [ExitProcess]

    EndoFunc:
        push rbp
        mov rbp, rsp
        sub rsp, 16

        mov rcx, [rbp+16]
        xor eax, eax
        call [printf]

        mov rsp, rbp
        pop rbp
    ret

.data
    helloTxt db 'Hello World!!!',0