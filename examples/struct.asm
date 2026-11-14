.code
    invoke printf, 'start %i', [obj.propA]

    lea rax, [obj]
    invoke printf, 'start %i', [rax+OBJ.propA]

    invoke ExitProcess

.data
    struct OBJ
        propA dq 11
    end struct
    obj OBJ

.import
    import 'kernel32.dll',\
        ExitProcess,'ExitProcess'
    import 'msvcrt.dll',\
        printf,'printf'