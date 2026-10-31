.code
    sub rsp, 40

    VALAA = 1

    invoke printf, addr format, addr msgA, [valA]

    rvcall EndoFunc, addr helloTxt

    rvcall EndoFunc, addr helloTxt

    invoke ExitProcess

    proc EndoFunc hello
        invoke printf, hello
    endp

.data
    helloTxt db 'Hello World!!!',0
    format db 'msg %s %i',0
    msgA db 'a',0
    valA dq 1

.import
    library kernel32,'kernel32.dll',\
        msvcrt,'msvcrt.dll'
    import kernel32,\
        ExitProcess,'ExitProcess'
    import msvcrt,\
        printf,'printf'