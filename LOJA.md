# Ficha da Chrome Web Store — textos prontos para colar

Os campos curtos (nome e descrição breve) **não se escrevem aqui**: eles saem de
`_locales/*/messages.json`, nos três idiomas, e `npm run audit` reprova se algum
estourar o limite da loja. O que está neste arquivo é o que o painel pede e o
código não tem como guardar.

Estado: **v0.1.0, não publicada.** Nada foi enviado.

---

## Aba "Informações da loja"

### Descrição detalhada (pt-BR)

```
Selecione um texto em qualquer página, clique com o botão direito e salve a
seleção como arquivo — já formatado e com a extensão certa.

Exportar seleção ▸ Automático / .json / .xml / .txt

O modo Automático decide pelo conteúdo: JSON válido vira .json indentado, XML
bem formado vira .xml indentado, e o resto vira .txt limpo. Se você escolher um
tipo à força e o conteúdo não couber, o arquivo sai como .txt e o ícone avisa —
sem notificação do sistema.

Atalho: Alt+Shift+E faz o modo Automático direto, sem passar pelo menu. Você
pode trocar a combinação em chrome://extensions/shortcuts.

O QUE ELA NÃO FAZ COM SEU TEXTO

A formatação é feita reindentando o texto original, caractere a caractere. A
extensão nunca reconstrói o conteúdo a partir de um parser, porque isso corrompe
dado em silêncio:

  {"id": 9007199254740993}   vira 9007199254740992   (precisão)
  {"a": 1, "a": 2}           perde a chave repetida
  {"v": 1e3}                 vira 1000
  <a xmlns:x="u"><x:b/></a>  tem o prefixo reescrito
  &apos; num XML             vira '

Nada disso acontece aqui. Em XML, elemento com conteúdo misto sai literal, byte
a byte, porque ali o espaço em branco é conteúdo e indentar mudaria o que o
documento diz.

A seleção costuma ser a única cópia que você tem daquele dado. O formatador pode
recusar o trabalho; não pode devolver outro conteúdo.

100% LOCAL

Nenhuma chamada de rede. Nenhuma biblioteca externa. Nenhuma telemetria. Nenhum
servidor envolvido. A política de segurança de conteúdo declarada no manifest
bloqueia conexões de saída (connect-src 'none'), e o repositório tem uma
auditoria automática que reprova a compilação se alguém escrever um fetch.

A extensão não pede acesso a nenhum site. Ela usa activeTab, que concede acesso
à aba apenas no instante em que você aciona a exportação, e esse acesso termina
junto com o gesto.
```

### Descrição curta

Sai de `_locales/*/messages.json`, chave `extDescription`. Limite de 132
caracteres, conferido pela auditoria.

### Idiomas da listagem

`pt_BR` (padrão), `en`, `es`. Os três já têm nome e descrição curta traduzidos.
A descrição detalhada acima está em português; traduzir as outras duas é
opcional e pode esperar a primeira versão publicada.

---

## Aba "Práticas de privacidade"

### Finalidade única (single purpose)

```
Exportar o texto selecionado na página como arquivo formatado, nos formatos
JSON, XML ou texto puro.
```

É uma frase e descreve uma ação só. A política de 2026 exige finalidade
"estreita e fácil de entender", e é por esse campo que o revisor julga se cada
permissão se justifica.

### Justificativa de cada permissão

O painel pede uma por uma. Cada resposta abaixo diz **o que a permissão faz** e
**por que nada mais barato resolveria** — é a segunda parte que costuma faltar.

**contextMenus**
```
Cria o item "Exportar seleção" no menu do botão direito, que só aparece quando
há texto selecionado. É a forma como o usuário aciona a extensão.
```

**activeTab**
```
Concede acesso à aba apenas no instante em que o usuário aciona a exportação,
para ler o texto que ele mesmo selecionou. A extensão não declara
host_permissions nem optional_host_permissions, e não tem acesso a nenhuma
página fora desse gesto. O acesso termina junto com ele.
```

**scripting**
```
Injeta uma função curta na aba, no gesto do usuário, para ler o texto
selecionado. É necessária porque info.selectionText, oferecido pela API de
menus, normaliza o espaçamento: as quebras de linha somem e um JSON indentado
chega como uma linha só. O arquivo exportado sairia com o conteúdo alterado.
A função injetada apenas lê a seleção e o título da página; não altera a página.
```

**downloads**
```
Salva no disco o arquivo gerado a partir da seleção. É o resultado final da
extensão.
```

**offscreen**
```
O service worker do Manifest V3 não tem DOM, e portanto não tem DOMParser nem
URL.createObjectURL. O documento offscreen fornece os dois: o DOMParser confirma
que um XML é bem formado antes de o arquivo ser salvo como .xml, e o
createObjectURL gera o arquivo. O documento não tem interface, não carrega
conteúdo remoto, e o resultado do DOMParser nunca é inserido em DOM vivo.

A alternativa seria injetar os formatadores na página do usuário. Preferiu-se
não: quanto menos código a extensão roda em site alheio, melhor.
```

### Declaração de uso de dados

No painel, todas as caixas de coleta ficam **desmarcadas**. O texto de apoio:

```
A extensão não coleta, não armazena e não transmite dado algum. O texto
selecionado é lido na memória, formatado na própria máquina e gravado como
arquivo na pasta de downloads do usuário. Não há servidor, não há telemetria,
não há analytics e não há armazenamento persistente — a extensão sequer declara
a permissão "storage".
```

As três declarações obrigatórias, todas marcáveis com sinceridade:

- não vendo nem transfiro dados a terceiros
- não uso nem transfiro dados para fins alheios à finalidade única
- não uso nem transfiro dados para avaliar crédito ou conceder empréstimo

### URL da política de privacidade

```
https://mastercarlosbr01.github.io/recorte-privacidade/
```

O campo veio **obrigatório** no painel, com asterisco, mesmo com todas as caixas
de coleta desmarcadas. As fontes de terceiros divergiam sobre isso; o formulário
não.

Publicada em repositório próprio
([recorte-privacidade](https://github.com/mastercarlosbr01/recorte-privacidade)),
separado do código de propósito: a página precisa continuar no ar enquanto a
extensão estiver publicada, independentemente do que aconteça com o repositório
da extensão, e o histórico de alterações de uma política deve ser verificável
por quem a leu antes.

Ela aponta para o código-fonte como forma de conferir a declaração — o que só
funciona com o repositório público. Foi por isso que o `recorte` foi aberto.

---

## Aba "Distribuição"

- Visibilidade: **pública**
- Regiões: todas
- Categoria: **Ferramentas para desenvolvedores**
- Preço: gratuita

---

## Antes de enviar

- [x] Ícone definitivo — página com linha destacada, aprovado em 19/11/2026
- [ ] `npm run check` verde
- [ ] `npm run empacotar` — ele roda a verificação antes e se recusa a empacotar se algo falhar
- [ ] Os doze casos de `tests/pagina-de-teste.html` rodados na versão empacotada, não só na descompactada
- [x] Capturas de tela, blocos promocionais e ícone da loja
- [x] Política de privacidade publicada e no ar — resolvido pelo formulário, que a exige
- [ ] Conferir se a política de 2026 muda algo para a **Ficta**, que já está publicada

## Capturas de tela

1280×800 ou 640×400, até cinco. Ordem sugerida, da mais convincente para a menos:

1. O menu do botão direito aberto sobre um JSON de API selecionado
2. O arquivo baixado, aberto e indentado, ao lado da página de origem
3. O caso do inteiro grande e da chave repetida saindo intactos — é o argumento
   que nenhuma concorrente consegue copiar sem reescrever o formatador
4. A tela de opções, mostrando o atalho
5. O selo "TXT" no ícone, quando o tipo forçado não cabe

## Limites que a loja impõe

| campo | limite | onde vive |
| --- | --- | --- |
| nome | 75 caracteres | `_locales/*/messages.json` → `extName` |
| descrição curta | 132 caracteres | `_locales/*/messages.json` → `extDescription` |
| descrição detalhada | 16.000 caracteres | este arquivo |
| captura | 1280×800 ou 640×400 | — |
| ícone da loja | 128×128 | `assets/icone-128.png` |

Os dois primeiros são conferidos por `npm run audit` a cada mudança.
