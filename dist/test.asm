.code
    sub rsp, 40
    and rsp, -16

        sub rsp, 40
    lea rcx, [helloTxt]
    call [printf]
    add rsp, 40

        lea rax, [helloTxt]
push rax
    call EndoFunc
    add rsp, 8

        lea rax, [helloTxt]
push rax
    call EndoFunc
    add rsp, 8

    call [ExitProcess]

    EndoFunc:
    push rbp
    mov rbp, rsp
    sub rsp, 8

    sub rsp, 40
    mov rcx, [rbp+16]
    call [printf]
    add rsp, 40

    add rsp, 8
    mov rsp, rbp
    pop rbp

    ret

.data
    helloTxt db 'Hello World!!!',0