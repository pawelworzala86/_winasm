.code
    sub rsp, 40

    invoke printf, addr helloTxt

    rvcall EndoFunc, addr helloTxt

    rvcall EndoFunc, addr helloTxt

    invoke ExitProcess

    proc EndoFunc hello
        invoke printf, hello
    endp

.data
    helloTxt db 'Hello World!!!',0