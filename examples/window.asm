.code
    ; Wyrównanie stosu i alokacja shadow space (40 bajtów: 32 shadow + 8 wyrównanie)
        sub     rsp, 40

        ; GetModuleHandleA(NULL)
        xor     rcx, rcx
        call    [GetModuleHandleA]
        mov     rsi, rax                ; rsi = hInstance

        ; --- WYPEŁNIENIE I REJESTRACJA WNDCLASSEXA (80 bajtów) ---
        sub     rsp, 80                 ; 80 jest wielokrotnością 16
        mov     rdi, rsp
        xor     al, al
        mov     ecx, 80
        rep     stosb

        mov     dword [rsp + 0], 80     ; cbSize = 80
        mov     dword [rsp + 4], 3      ; style = CS_HREDRAW | CS_VREDRAW
        mov     qword [rsp + 8], WndProc; lpfnWndProc
        mov     qword [rsp + 24], rsi   ; hInstance
        mov     qword [rsp + 64], _className ; lpszClassName

        mov     rcx, rsp                ; wskaźnik na strukturę
        call    [RegisterClassExA]
        add     rsp, 80                 ; zwolnienie pamięci struktury

        ; --- TWORZENIE OKNA (CreateWindowExA) ---
        ; CreateWindowExA przyjmuje 12 argumentów:
        ; 1-4 w rcx, rdx, r8, r9
        ; 5-12 na stosie (wymaga 32 bajtów shadow space + 64 bajtów dla 8 argumentów = 96 bajtów)
        sub     rsp, 96
        
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
        add     rsp, 96

        test    rax, rax
        jz      exit
        mov     rdi, rax                ; rdi = hWnd

        ; --- POKAZANIE OKNA ---
        sub     rsp, 32
        mov     rcx, rdi
        mov     rdx, 1                  ; SW_SHOWNORMAL
        call    [ShowWindow]

        mov     rcx, rdi
        call    [UpdateWindow]
        add     rsp, 32

        ; --- PĘTLA KOMUNIKATÓW (MSG ma 48 bajtów na x64) ---
msg_loop:
        sub     rsp, 80                 ; 32 bajty shadow space + 48 bajtów na strukturę MSG
        lea     rcx, [rsp + 32]         ; wskaźnik na bufor MSG
        xor     rdx, rdx
        xor     r8,  r8
        xor     r9,  r9
        call    [GetMessageA]

        test    eax, eax
        jz      exit
        cmp     eax, -1
        je      exit

        lea     rcx, [rsp + 32]
        call    [TranslateMessage]

        lea     rcx, [rsp + 32]
        call    [DispatchMessageA]

        add     rsp, 80
        jmp     msg_loop

exit:
        sub     rsp, 32
        xor     rcx, rcx
        call    [ExitProcess]


; --- PROCEDURA OKNA (WndProc) ---
WndProc:
        sub     rsp, 32                 ; shadow space dla wywołań wewnątrz
        cmp     rdx, 2                  ; WM_DESTROY = 2
        je      .wm_destroy

        call    [DefWindowProcA]
        add     rsp, 32
        ret

.wm_destroy:
        xor     rcx, rcx
        call    [PostQuitMessage]
        xor     eax, eax                ; zwracamy 0
        add     rsp, 32
        ret

.data
    _className  db 'MinimalClass64', 0
    _windowName db 'Fasmg Win64 Okno Bez Struktur', 0

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
        ShowWindow, 'ShowWindow',\
        UpdateWindow, 'UpdateWindow',\
        GetMessageA, 'GetMessageA',\
        TranslateMessage, 'TranslateMessage',\
        DispatchMessageA, 'DispatchMessageA',\
        DefWindowProcA, 'DefWindowProcA',\
        PostQuitMessage, 'PostQuitMessage'
