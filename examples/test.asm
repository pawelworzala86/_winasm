sub rsp, 40
and rsp, -16

lea rcx, [helloTxt]
xor eax, eax

call [printf]

call EndoFunc
xor ecx, ecx
call [ExitProcess]

EndoFunc:
    sub rsp, 40
    lea rcx, [helloTxt]
    xor eax, eax
    call [printf]
    add rsp, 40
ret
