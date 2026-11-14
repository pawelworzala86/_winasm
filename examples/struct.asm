.code
    invoke printf, 'start %i', [obj.propA]

    lea rax, [obj]
    invoke printf, 'start %i', [rax+OBJ.propA]

    invoke obj.show, 22

    invoke obj.show2

    invoke ExitProcess

.data
    struct OBJ
        propA dq 11
        proc show, value
            invoke printf, 'mmm %i', [this.propA]
            invoke printf, 'method %i', [this+OBJ.propA]
            invoke printf, ' arg %i', value
        endp
        proc show2
            invoke printf, 'vvv %i', [this.propA]
        endp
    end struct
    obj OBJ

.import
    import 'kernel32.dll',\
        ExitProcess,'ExitProcess'
    import 'msvcrt.dll',\
        printf,'printf'