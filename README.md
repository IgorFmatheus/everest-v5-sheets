# Everest — V5 Sheets

Uma ficha alternativa para personagens **vampiro**, com foco no uso durante a sessão: rolagens salvas,
busca de atributos/habilidades/disciplinas/poderes e evolução com cálculo e débito de XP.

Compatibilidade inicial: **FoundryVTT 13 + World of Darkness 5e (`wod5e`) 5.3.15**.

## Instalar e escolher a ficha

Em **Add-on Modules → Install Module**, use:

```text
https://github.com/IgorFmatheus/everest-v5-sheets/releases/latest/download/module.json
```

Ative **Everest — V5 Sheets** no mundo. Na ficha de um vampiro, abra o menu do cabeçalho,
escolha **Configure Sheet / Configurar ficha**, selecione **Everest — V5 • Sessão e Evolução**
e salve. O módulo registra uma alternativa; não troca a ficha padrão da mesa automaticamente.
Para voltar, escolha a ficha original na mesma configuração.

## Em sessão

- Vitalidade, Força de Vontade, Fome e Humanidade ficam no cabeçalho em todas as abas.
- A busca ignora acentos e filtra rolagens salvas, poderes e características.
- Clique em até três características para compor uma rolagem. A prévia separa dados comuns e de Fome.
- Informe um nome e um modificador, se necessário. **Rolar agora** abre o diálogo do próprio sistema;
  **Salvar rolagem** cria um Item `customRoll` nativo. A combinação acompanha os valores atuais da ficha.
- As rolagens salvas existentes aparecem na mesma lista e continuam disponíveis na ficha original.
- Os poderes exibem atalhos para rolar, abrir o Item e mostrar no chat. Rolagens, custos de poderes,
  modificadores, falhas bestiais e críticos continuam a cargo do motor do `wod5e`.

A prévia de pool é a soma das características e do modificador digitado. Modificadores de situação e
demais ajustes são resolvidos pelo diálogo nativo, e podem alterar o pool final.

## Evolução e XP

Na aba **Evolução**, selecione a característica e o nível desejado. Para disciplinas, escolha a categoria
de custo adequada: de clã, fora de clã ou Caitiff. Essa escolha é explícita porque o Item de clã do
sistema não armazena uma lista de disciplinas de clã. O nome do clã não é usado para adivinhar a categoria.

O módulo soma cada nível intermediário. Exemplo: um atributo de 2 para 4 custa `3 × 5 + 4 × 5 = 35 XP`.
Ele usa o valor base do documento, sem efeitos temporários, e calcula o saldo usando tanto o campo
legado de XP quanto os lançamentos de experiência do sistema.

Após confirmação, uma única atualização aumenta a característica e acrescenta um débito ao histórico
nativo de XP, com nome, níveis e custo. Saldo insuficiente, nível inválido, falta de permissão ou mudança
da ficha durante a confirmação bloqueiam a operação. A confirmação fica protegida contra clique duplo.

O cálculo segue a tabela **Trait Costs: Experience** do livro básico V5, também publicada no
[Vampire Nexus — Experience Introduction](https://app.demiplane.com/nexus/vampire/rules/experience-introduction):

| Característica         | Custo de cada nível |
| ---------------------- | ------------------- |
| Atributo               | Novo nível × 5      |
| Habilidade             | Novo nível × 3      |
| Disciplina de clã      | Novo nível × 5      |
| Disciplina fora de clã | Novo nível × 7      |
| Disciplina de Caitiff  | Novo nível × 6      |

A primeira versão automatiza aumentos de 1 a 5 pontos dessas características. Não compra poderes,
rituais, cerimônias, fórmulas de Alquimia, especializações ou Potência de Sangue. Pré-requisitos
narrativos e a escolha de poderes continuam com a mesa. Edições manuais nas abas originais continuam
disponíveis para criação e correções e **não gastam XP automaticamente**; use a aba Evolução para compras.

As abas nativas continuam disponíveis, incluindo Disciplinas, Experiência, Equipamento e Notas.
O modo de acesso limitado permanece o do sistema e não renderiza as novas abas com dados privados.
O módulo não contém textos de poderes, compêndios de livros ou código do Tidy.

## Desenvolvimento e publicação

Sem bibliotecas de interface ou build de frontend. A ficha estende `VampireActorSheet` da versão
instalada e reaproveita seus dados, ações, parciais e permissões. Os arquivos CSS são limitados à classe
da ficha alternativa.

```sh
npm test
npm run check
python scripts/package.py
```

Os testes verificam fórmulas, níveis intermediários, saldo, lançamentos legados, leitura do valor base,
cancelamento, mudanças na ficha durante a confirmação e clique duplo. As verificações de interface
usam uma prévia com dados fictícios; não substituem o teste final dentro de uma mesa real do Foundry.

A GitHub Action executa os testes e empacota `dist/everest-v5-sheets.zip`. Enviar uma tag `vX.Y.Z`
correspondente a `module.json` publica manifesto, ZIP e checksums. Antes de uma nova tag, atualize
`version` e o segmento de versão em `download` no manifesto, além da versão de `package.json`.

## Créditos e licença

Implementação independente, inspirada na organização e na ergonomia do
[Tidy 5e Sheets](https://github.com/kgar/foundry-vtt-tidy-5e-sheets). Não é uma adaptação de suas regras de D&D.
Integra-se ao [World of Darkness 5e](https://github.com/WoD5E-Developers/wod5e), de seus desenvolvedores.

Código disponibilizado sob GPL-3.0; consulte `LICENSE.md`. Vampire: The Masquerade e World of Darkness
são marcas de seus respectivos titulares. Projeto não oficial, sem vínculo ou endosso dos titulares.
