sub rsp, 40
and rsp, -16

lea rcx, [helloTxt]
xor eax, eax

call [printf]
xor ecx, ecx

EndoFunc:
    call [printf]
    xor ecx, ecx
ret

call [EndoFunc]

call [ExitProcess]