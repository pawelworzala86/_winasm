.code
    VALAA = 1

    invoke printf, addr format, addr msgA, [valA]

    rvcall EndoFunc, addr helloTxt

    invoke malloc, 16
    mov [ptr], rax
    mov [ptr+0], 11
    mov [ptr+8], 12
    mov [ptr], rax
    invoke printf, addr formatA, [ptr+8]

    invoke ExitProcess

    proc EndoFunc hello
        invoke printf, hello
    endp

.data
    LF = 13,10
    helloTxt db 'Hello World!!!',LF,0
    format db 'msg %s %i',LF,0
    msgA db 'a',0
    valA dq 1
    formatA db 'msg %i',0
    ptr dq 0

.import
    import 'kernel32.dll',\
        ExitProcess,'ExitProcess'
    import 'msvcrt.dll',\
        printf,'printf',\
        malloc,'malloc'