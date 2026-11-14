.code
    ; Wyrównanie stosu i alokacja shadow space (40 bajtów: 32 shadow + 8 wyrównanie)

        ; GetModuleHandleA(NULL)
        sub     rsp, 40
        xor     rcx, rcx
        call    [GetModuleHandleA]
        add     rsp, 40
        mov     rsi, rax                ; rsi = hInstance

        ; --- WYPEŁNIENIE I REJESTRACJA WNDCLASSEXA (80 bajtów) ---
        sub     rsp, 120                ; 32 bajty shadow space + 80 bajtów struktury + wyrównanie
        lea     rdi, [rsp + 32]
        xor     al, al
        mov     ecx, 80
        rep     stosb
        lea     rdi, [rsp + 32]

        mov     dword [rdi + 0], 80     ; cbSize = 80
        mov     dword [rdi + 4], 023h   ; CS_HREDRAW | CS_VREDRAW | CS_OWNDC
        mov     qword [rdi + 8], WndProc; lpfnWndProc
        mov     qword [rdi + 24], rsi   ; hInstance
        mov     qword [rdi + 64], _className ; lpszClassName

        mov     rcx, rdi                ; wskaźnik na strukturę
        call    [RegisterClassExA]
        add     rsp, 120                ; zwolnienie pamięci struktury

        ; --- TWORZENIE OKNA (CreateWindowExA) ---
        ; CreateWindowExA przyjmuje 12 argumentów:
        ; 1-4 w rcx, rdx, r8, r9
        ; 5-12 na stosie: 32 bajty shadow space + 64 bajty argumentów + 8 bajtów wyrównania
        sub     rsp, 104
        
        mov     rcx, 0                  ; dwExStyle
        mov     rdx, _className         ; lpClassName
        mov     r8,  _windowName        ; lpWindowName
        mov     r9,  010CF0000h         ; WS_OVERLAPPEDWINDOW

        mov     rax, 080000000h         ; CW_USEDEFAULT
        mov     qword [rsp + 32], rax   ; x
        mov     qword [rsp + 40], rax   ; y
        mov     qword [rsp + 48], 640   ; nWidth
        mov     qword [rsp + 56], 480   ; nHeight
        mov     qword [rsp + 64], 0     ; hWndParent
        mov     qword [rsp + 72], 0     ; hMenu
        mov     qword [rsp + 80], rsi   ; hInstance
        mov     qword [rsp + 88], 0     ; lpParam

        call    [CreateWindowExA]
        add     rsp, 104

        mov     rdi, rax                ; zachowaj hWnd przed wywołaniem printf
        mov     rax, rdi

        test    rax, rax
        jz      exit
        mov     rdi, rax                ; rdi = hWnd

        mov     rcx, rdi
        sub     rsp, 40
        call    [GetDC]
        add     rsp, 40
        mov     [windowDC], rax
        test    rax, rax
        jz      exit

        mov     rcx, rax
        lea     rdx, [pfdHeader]
        sub     rsp, 40
        call    [ChoosePixelFormat]
        add     rsp, 40
        test    eax, eax
        jz      exit
        mov     esi, eax

        mov     rcx, [windowDC]
        mov     edx, esi
        lea     r8, [pfdHeader]
        sub     rsp, 40
        call    [SetPixelFormat]
        add     rsp, 40
        test    eax, eax
        jz      exit

        mov     rcx, [windowDC]
        sub     rsp, 40
        call    [wglCreateContext]
        add     rsp, 40
        mov     [glContext], rax
        test    rax, rax
        jz      exit

        mov     rcx, [windowDC]
        mov     rdx, rax
        sub     rsp, 40
        call    [wglMakeCurrent]
        add     rsp, 40
        test    eax, eax
        jz      exit

        ; --- POKAZANIE OKNA ---
        sub     rsp, 40
        mov     rcx, rdi
        mov     rdx, 1                  ; SW_SHOWNORMAL
        call    [ShowWindow]
        add     rsp, 40

        sub     rsp, 40
        mov     rcx, rdi
        call    [UpdateWindow]
        add     rsp, 40

        ; --- PĘTLA KOMUNIKATÓW (MSG ma 48 bajtów na x64) ---
msg_loop:
        sub     rsp, 88                 ; 32 bajty shadow space + 48 bajtów na strukturę MSG + wyrównanie
        lea     rcx, [rsp + 32]         ; wskaźnik na bufor MSG
        xor     rdx, rdx
        xor     r8,  r8
        xor     r9,  r9
        call    [GetMessageA]

        test    eax, eax
        jz      loop_exit
        cmp     eax, -1
        je      loop_exit

        lea     rcx, [rsp + 32]
        call    [TranslateMessage]

        lea     rcx, [rsp + 32]
        call    [DispatchMessageA]

        add     rsp, 88
        jmp     msg_loop

loop_exit:
        add     rsp, 88
        jmp     exit

exit:
        sub     rsp, 40
        xor     rcx, rcx
        call    [ExitProcess]


; --- PROCEDURA OKNA (WndProc) ---
WndProc:
        sub     rsp, 40                 ; shadow space i wyrównanie stosu
        cmp     rdx, 15                 ; WM_PAINT
        je      .wm_paint
        cmp     rdx, 2                  ; WM_DESTROY = 2
        je      .wm_destroy

        call    [DefWindowProcA]
        add     rsp, 40
        ret

.wm_paint:
        sub     rsp, 112                ; 32 bajty shadow space + 72 bajty PAINTSTRUCT + wyrównanie
        mov     qword [rsp + 104], rcx
        lea     rdx, [rsp + 32]
        call    [BeginPaint]

        mov     rcx, [windowDC]
        mov     rdx, [glContext]
        call    [wglMakeCurrent]

        mov     ecx, 04000h             ; GL_COLOR_BUFFER_BIT
        call    [glClear]
        mov     ecx, 4                  ; GL_TRIANGLES
        call    [glBegin]

        lea     rcx, [redColor]
        call    [glColor3fv]
        lea     rcx, [topVertex]
        call    [glVertex3fv]

        lea     rcx, [greenColor]
        call    [glColor3fv]
        lea     rcx, [leftVertex]
        call    [glVertex3fv]

        lea     rcx, [blueColor]
        call    [glColor3fv]
        lea     rcx, [rightVertex]
        call    [glVertex3fv]

        call    [glEnd]
        mov     rcx, [windowDC]
        call    [SwapBuffers]

        mov     rcx, [rsp + 104]
        lea     rdx, [rsp + 32]
        call    [EndPaint]
        xor     eax, eax
        add     rsp, 112
        add     rsp, 40
        ret

.wm_destroy:
        xor     rcx, rcx
        call    [PostQuitMessage]
        xor     eax, eax                ; zwracamy 0
        add     rsp, 40
        ret

.data
    _className  db 'MinimalClass64', 0
    _windowName db 'Fasmg Win64 Okno Bez Struktur', 0
    windowDC dq 0
    glContext dq 0

    pfdHeader dw 40, 1
    pfdFlags dd 025h
    pfdPixelFormat db 0, 32, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 8, 0, 0, 0
    pfdLayerMasks dd 0, 0, 0

    redColor dd 1.0f, 0.0f, 0.0f
    greenColor dd 0.0f, 1.0f, 0.0f
    blueColor dd 0.0f, 0.0f, 1.0f
    topVertex dd 0.0f, 0.7f, 0.0f
    leftVertex dd -0.7f, -0.7f, 0.0f
    rightVertex dd 0.7f, -0.7f, 0.0f

.import
    import 'kernel32.dll',\
        GetModuleHandleA, 'GetModuleHandleA',\
        ExitProcess,'ExitProcess'
    import 'msvcrt.dll',\
        printf,'printf',\
        malloc,'malloc'
    import 'user32.dll',\
        RegisterClassExA, 'RegisterClassExA',\
        CreateWindowExA, 'CreateWindowExA',\
        GetDC, 'GetDC',\
        BeginPaint, 'BeginPaint',\
        EndPaint, 'EndPaint',\
        ShowWindow, 'ShowWindow',\
        UpdateWindow, 'UpdateWindow',\
        GetMessageA, 'GetMessageA',\
        TranslateMessage, 'TranslateMessage',\
        DispatchMessageA, 'DispatchMessageA',\
        DefWindowProcA, 'DefWindowProcA',\
        PostQuitMessage, 'PostQuitMessage'
    import 'gdi32.dll',\
        ChoosePixelFormat, 'ChoosePixelFormat',\
        SetPixelFormat, 'SetPixelFormat',\
        SwapBuffers, 'SwapBuffers'
    import 'opengl32.dll',\
        wglCreateContext, 'wglCreateContext',\
        wglMakeCurrent, 'wglMakeCurrent',\
        glClear, 'glClear',\
        glBegin, 'glBegin',\
        glColor3fv, 'glColor3fv',\
        glVertex3fv, 'glVertex3fv',\
        glEnd, 'glEnd'
