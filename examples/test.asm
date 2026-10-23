.code
    sub rsp, 40
    and rsp, -16

    invoke printf, addr helloTxt

    rvcall EndoFunc, addr helloTxt

    rvcall EndoFunc, addr helloTxt

    call [ExitProcess]

    proc EndoFunc hello
        invoke printf, hello
    endp

.data
    helloTxt db 'Hello World!!!',0