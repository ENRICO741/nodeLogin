const { pool, transacao } = require('./pool');
const logger = require('../lib/logger');

// As aulas vêm de conteudo/aulas (ver src/modulos/aulas/importador.js). Aqui ficam trivia e badges.
const TRIVIA_QUESTOES = [
  {
    dificuldade: 'media',
    enunciado:
      'Um suposto técnico de TI liga pedindo sua senha para uma manutenção de emergência. A atitude correta é:',
    alternativa_a: 'Passar uma senha antiga para evitar bloqueio.',
    alternativa_b: 'Fornecer a senha, pois é uma emergência técnica.',
    alternativa_c: 'Pedir para o técnico anotar a senha em um papel.',
    alternativa_d: 'Recusar, pois senhas são pessoais, e confirmar o pedido pelos canais oficiais.',
    resposta_correta: 'd',
    explicacao:
      'A equipe de TI legítima jamais solicita a senha pessoal de um colaborador por telefone ou mensagem.',
    pontos: 10,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um único notebook comprometido pode afetar outros serviços da empresa. Qual interpretação explica melhor esse risco?',
    alternativa_a:
      'Equipamentos, contas e serviços conectados podem abrir caminhos para atingir outros recursos.',
    alternativa_b: 'Computadores pessoais jamais interagem com informações corporativas.',
    alternativa_c: 'Os serviços em nuvem estão sempre isolados de qualquer conta usada no computador.',
    alternativa_d: 'Somente servidores da sede podem oferecer riscos à organização.',
    resposta_correta: 'a',
    explicacao:
      'A aula apresenta computadores, celulares e contas como partes do ambiente conectado: uma falha em um ponto pode afetar dados e sistemas da empresa.',
    pontos: 10,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'media',
    enunciado: 'Qual o objetivo principal de consolidar uma Cultura de Segurança da Informação?',
    alternativa_a: 'Transferir a culpa de vazamentos para os funcionários.',
    alternativa_b: 'Transformar cada colaborador em uma linha proativa de defesa.',
    alternativa_c: 'Proibir o uso de e-mail corporativo.',
    alternativa_d: 'Eliminar a necessidade de firewall e antivírus.',
    resposta_correta: 'b',
    explicacao:
      'Uma cultura forte capacita os colaboradores para identificar e prevenir incidentes diariamente.',
    pontos: 10,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'media',
    enunciado: "O termo 'Fator Humano' na segurança da informação destaca que:",
    alternativa_a: 'Os hackers atacam apenas softwares sem interação humana.',
    alternativa_b: 'A tecnologia é capaz de prever 100% dos erros humanos.',
    alternativa_c: 'As pessoas nunca cometem erros no ambiente digital.',
    alternativa_d:
      'O comportamento das pessoas pode ser explorado para obter acessos ou informações indevidas.',
    resposta_correta: 'd',
    explicacao:
      'Ataques podem usar urgência, engano e distração para explorar decisões humanas; isso não significa que a maioria dos incidentes tenha uma causa única.',
    pontos: 10,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma empresa possui antivírus e firewall, mas recebe pedidos fraudulentos que tentam convencer funcionários a divulgar senhas. Qual abordagem responde melhor a esse risco?',
    alternativa_a: 'Substituir treinamento por um único produto de segurança mais caro.',
    alternativa_b: 'Tratar qualquer pedido feito por telefone como automaticamente legítimo.',
    alternativa_c: 'Combinar controles tecnológicos, orientação das pessoas e verificação de solicitações.',
    alternativa_d: 'Permitir que cada funcionário compartilhe senhas quando achar urgente.',
    resposta_correta: 'c',
    explicacao:
      'Ferramentas técnicas ajudam, mas decisões humanas e validação de solicitações também fazem parte da proteção da organização.',
    pontos: 15,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'dificil',
    enunciado: 'Por que orientar funcionários sobre proteção de dados faz parte da segurança corporativa?',
    alternativa_a: 'Porque a tecnologia não deve ser utilizada na proteção de dados pessoais.',
    alternativa_b:
      'Porque boas práticas ajudam a prevenir exposições e proteger informações de clientes e da empresa.',
    alternativa_c: 'Porque esse cuidado só é exigido quando a empresa sofreu um vazamento.',
    alternativa_d:
      'Porque boas práticas podem substituir por completo todas as permissões e regras de acesso.',
    resposta_correta: 'b',
    explicacao:
      'A aula destaca o papel de todos na proteção de informações corporativas. Treinamento e comportamento cuidadoso complementam as ferramentas técnicas.',
    pontos: 15,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Além das perdas financeiras diretas, qual é uma das piores consequências de um vazamento massivo de dados?',
    alternativa_a: 'Eliminação do risco de futuras fiscalizações.',
    alternativa_b: 'Aumento de acessos ao site da empresa.',
    alternativa_c: 'Dano à reputação e perda de confiança de clientes e parceiros, às vezes duradouros.',
    alternativa_d: 'Isenção de taxas bancárias institucionais.',
    resposta_correta: 'c',
    explicacao:
      'Um vazamento pode prejudicar relações comerciais e reputação além de gerar custos diretos; gravidade e duração variam conforme o caso.',
    pontos: 10,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Uma pasta contém documentos públicos e outra contém informações financeiras internas. Qual prática deve orientar seu compartilhamento?',
    alternativa_a: 'Aplicar o mesmo acesso irrestrito a ambas as pastas.',
    alternativa_b: 'Enviar todas as informações para contas pessoais para facilitar a consulta.',
    alternativa_c: 'Definir quem precisa de cada informação e usar proteção compatível com a sensibilidade.',
    alternativa_d: 'Excluir sempre os documentos internos, mesmo quando necessários ao trabalho.',
    resposta_correta: 'c',
    explicacao:
      'Informações com maior sensibilidade demandam cuidados e permissões compatíveis com os riscos de exposição.',
    pontos: 10,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'media',
    enunciado: 'Prontuários médicos de funcionários e registros de avaliação de desempenho devem ter acesso:',
    alternativa_a: 'Restrito estritamente aos profissionais autorizados do setor de RH e saúde ocupacional.',
    alternativa_b: 'Aberto para consulta pública no mural da empresa.',
    alternativa_c: 'Enviado mensalmente a todos os fornecedores da empresa.',
    alternativa_d: 'Liberado para todos os estagiários da empresa.',
    resposta_correta: 'a',
    explicacao:
      'Aplica-se o princípio da necessidade de conhecer para proteger a privacidade de dados sensíveis.',
    pontos: 10,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Caso um colaborador necessite enviar dados confidenciais a um parceiro externo autorizado, ele deve:',
    alternativa_a: 'Usar sua conta de e-mail pessoal não corporativa.',
    alternativa_b: 'Utilizar canais homologados pela empresa com criptografia e proteção de transferência.',
    alternativa_c: 'Publicar os dados em um fórum público e mandar o link.',
    alternativa_d: 'Gravar os dados em um pen drive sem senha e mandar pelo correio sem rastreio.',
    resposta_correta: 'b',
    explicacao: 'Transferências externas exigem canais corporativos protegidos e homologados pela segurança.',
    pontos: 10,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma planilha reúne contratos internos e dados pessoais de clientes. Antes de conceder acesso a outro setor, qual análise melhor protege esses ativos?',
    alternativa_a: 'Confirmar a necessidade de acesso e usar ferramentas e permissões autorizadas.',
    alternativa_b: 'Enviar por e-mail homologado sem confirmar se o outro setor precisa de todos os dados.',
    alternativa_c: 'Liberar a pasta para todos do departamento e solicitar que não a encaminhem.',
    alternativa_d: 'Conceder acesso permanente ao gestor solicitante, sem revisar sua necessidade.',
    resposta_correta: 'a',
    explicacao:
      'A aula mostra que dados e documentos são ativos valiosos: o compartilhamento deve levar em conta necessidade, autorização e armazenamento corporativo.',
    pontos: 15,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma pessoa exporta um cadastro de clientes para sua conta de nuvem pessoal a fim de trabalhar em casa. Qual é o risco principal descrito na aula?',
    alternativa_a:
      'Usar uma conta pessoal com senha forte elimina a necessidade de avaliar as regras da empresa.',
    alternativa_b:
      'A transferência deixa de ter riscos porque ocorreu a partir de um computador corporativo.',
    alternativa_c: 'Apenas o envio público por rede social poderia expor esse cadastro.',
    alternativa_d:
      'A organização perde controle sobre armazenamento, acesso e possível redistribuição dos dados.',
    resposta_correta: 'd',
    explicacao:
      'A utilização de serviços pessoais não homologados amplia a exposição e reduz o controle da empresa sobre informações corporativas.',
    pontos: 15,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um vazamento acidental de planilhas de salários corporativos para um grupo externo violou o pilar da:',
    alternativa_a: 'Desempenho.',
    alternativa_b: 'Disponibilidade.',
    alternativa_c: 'Confidencialidade.',
    alternativa_d: 'Integridade.',
    resposta_correta: 'c',
    explicacao: 'A divulgação inadvertida de dados sigilosos fere diretamente a confidencialidade.',
    pontos: 10,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Após uma falha, documentos essenciais ficam indisponíveis e o atendimento é interrompido. Qual pilar deve orientar a recuperação do acesso?',
    alternativa_a: 'Confidencialidade, porque todos já conhecem o conteúdo dos documentos.',
    alternativa_b: 'Integridade, mesmo que os dados permaneçam corretos.',
    alternativa_c:
      'Disponibilidade, porque pessoas autorizadas precisam acessar os documentos no momento necessário.',
    alternativa_d: 'Somente privacidade, independentemente do funcionamento do sistema.',
    resposta_correta: 'c',
    explicacao:
      'Disponibilidade significa manter os recursos acessíveis quando necessários para o trabalho. A falha interrompeu o uso pelos usuários autorizados.',
    pontos: 10,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Qual das opções a seguir é uma técnica cujo foco primário é proteger a Confidencialidade dos dados?',
    alternativa_a: 'Criptografia de disco e de canais de comunicação.',
    alternativa_b: 'Balanceamento de carga em servidores de internet.',
    alternativa_c: 'Geradores de energia e no-breaks.',
    alternativa_d: 'Fontes de alimentação redundantes em computadores.',
    resposta_correta: 'a',
    explicacao: 'A criptografia transforma o texto legível em cifrado, mantendo o segredo do conteúdo.',
    pontos: 10,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Se um cibercriminoso altera sutilmente os dados bancários de um fornecedor em um cadastro, o maior risco é a quebra da:',
    alternativa_a: 'Disponibilidade do link de e-mail corporativo.',
    alternativa_b: 'Velocidade de transferência de arquivos em rede.',
    alternativa_c: 'Integridade das informações, que causará pagamentos em contas erradas.',
    alternativa_d: 'Confidencialidade das senhas da TI.',
    resposta_correta: 'c',
    explicacao: 'A alteração de dados bancários corrompe a integridade cadastral e gera prejuízos imediatos.',
    pontos: 10,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Durante o fechamento mensal, um sistema fica fora do ar, mas nenhuma informação foi visualizada ou alterada indevidamente. Qual diagnóstico é mais preciso?',
    alternativa_a: 'Houve quebra comprovada de confidencialidade porque o sistema ficou indisponível.',
    alternativa_b:
      'A disponibilidade foi afetada; não há indicação, no cenário, de quebra de sigilo ou integridade.',
    alternativa_c: 'A integridade foi necessariamente comprometida porque o sistema parou.',
    alternativa_d: 'Não houve impacto de segurança porque ninguém acessou os arquivos.',
    resposta_correta: 'b',
    explicacao:
      'A inacessibilidade no momento necessário caracteriza problema de disponibilidade; não se deve presumir alteração ou divulgação de dados sem evidências.',
    pontos: 15,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma equipe consegue consultar um relatório, mas uma pessoa sem autorização altera seu conteúdo sem impedir o acesso. Qual avaliação dos pilares está correta?',
    alternativa_a: 'A integridade foi comprometida, mesmo que a disponibilidade tenha sido mantida.',
    alternativa_b: 'A confidencialidade necessariamente falhou, pois houve uma alteração nos dados.',
    alternativa_c:
      'A disponibilidade também foi comprometida obrigatoriamente, embora o arquivo esteja acessível.',
    alternativa_d: 'Nenhum pilar foi afetado porque a equipe conseguiu abrir o relatório.',
    resposta_correta: 'a',
    explicacao:
      'Integridade diz respeito à correção e à proteção contra alterações não autorizadas; um arquivo acessível pode estar adulterado.',
    pontos: 15,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Qual diferença ajuda a identificar os objetivos possíveis de quem tenta comprometer um sistema corporativo?',
    alternativa_a:
      'Um atacante pode buscar fraude financeira, roubo de informações ou interrupção de serviços.',
    alternativa_b: 'Qualquer invasão tem exclusivamente a finalidade de testar a velocidade da rede.',
    alternativa_c: 'Somente pessoas de fora podem causar incidentes de segurança.',
    alternativa_d: 'Todas as tentativas de ataque acontecem sempre pelo mesmo vetor.',
    resposta_correta: 'a',
    explicacao:
      'A aula apresenta diferentes motivações dos agentes maliciosos e vários caminhos de entrada, como mensagens falsas, credenciais roubadas e serviços expostos.',
    pontos: 10,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um acesso legítimo é usado indevidamente para consultar dados que não deveriam ser vistos. Qual afirmação está correta?',
    alternativa_a: 'É seguro porque toda credencial válida autoriza qualquer finalidade.',
    alternativa_b: 'O incidente só pode ter ocorrido se houve dano físico ao computador.',
    alternativa_c: 'Nenhuma falha existe quando o acesso acontece em horário comercial.',
    alternativa_d:
      'O uso indevido de credenciais ou acessos pode representar uma ameaça, mesmo sem mensagem falsa.',
    resposta_correta: 'd',
    explicacao:
      'A aula ressalta que ameaças podem explorar acessos legítimos de maneira indevida; autorização e finalidade importam.',
    pontos: 10,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Uma mensagem imita o nome de um fornecedor conhecido, mas contém um link inesperado. Qual característica a torna suspeita?',
    alternativa_a: 'A urgência da mensagem comprova que o remetente é legítimo.',
    alternativa_b: 'A aparência familiar pode esconder um vetor de ataque que deve ser verificado.',
    alternativa_c: 'A utilização de um logotipo elimina a possibilidade de fraude.',
    alternativa_d: 'Qualquer mensagem com o nome do fornecedor está automaticamente validada.',
    resposta_correta: 'b',
    explicacao:
      'A aula explica que identidade visual e nomes conhecidos podem ser imitados; o link e o remetente precisam de verificação.',
    pontos: 10,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um falso diretor solicita uma transferência urgente e pede sigilo. O que indica possível tentativa de ataque?',
    alternativa_a: 'A combinação de autoridade, urgência e pedido fora do procedimento usual.',
    alternativa_b: 'A menção ao nome do diretor torna dispensável a validação.',
    alternativa_c: 'A existência de um prazo sempre confirma que a solicitação é verdadeira.',
    alternativa_d: 'O pedido de sigilo impede qualquer tipo de verificação.',
    resposta_correta: 'a',
    explicacao:
      'Pedidos urgentes e fora do processo normal são sinais típicos de manipulação; confirme pelo canal oficial independente.',
    pontos: 10,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'O financeiro recebe e-mail de um diretor, com endereço muito semelhante ao verdadeiro, pedindo pagamento imediato. Qual sequência é a mais segura?',
    alternativa_a: 'Conferir somente o nome do diretor exibido na mensagem e guardar o comprovante.',
    alternativa_b: 'Responder ao próprio e-mail solicitando uma segunda confirmação do suposto diretor.',
    alternativa_c: 'Validar o valor da fatura, mas dispensar confirmação independente da solicitação.',
    alternativa_d:
      'Conferir o endereço completo e validar a solicitação por outro canal oficial antes de agir.',
    resposta_correta: 'd',
    explicacao:
      'A aparência do remetente é insuficiente: endereço, contexto e confirmação por canal independente ajudam a interromper o golpe.',
    pontos: 15,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um criminoso usa credenciais roubadas de um funcionário para consultar dados internos. Nesse cenário, o que representa o vetor de ataque?',
    alternativa_a: 'As credenciais comprometidas usadas como caminho de entrada para os sistemas.',
    alternativa_b: 'O objetivo financeiro do criminoso, que define por onde ele entra.',
    alternativa_c: 'O setor que descobre o incidente depois da consulta não autorizada.',
    alternativa_d: 'O impacto reputacional da exposição, independentemente da forma de entrada.',
    resposta_correta: 'a',
    explicacao:
      'Vetor de ataque é o meio de entrada; uma credencial roubada pode permitir acesso não autorizado, conforme explicado na aula.',
    pontos: 15,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'media',
    enunciado:
      "A modalidade de ataque conhecida como 'Spear Phishing' diferencia-se do phishing tradicional por ser:",
    alternativa_a: 'Disparada para milhões de pessoas aleatórias ao mesmo tempo.',
    alternativa_b: 'Realizada apenas por meio de chamadas telefônicas sem uso de e-mail.',
    alternativa_c:
      'Altamente personalizada e direcionada a um indivíduo ou empresa específica após prévia pesquisa.',
    alternativa_d: 'Um ataque que afeta apenas impressoras de rede.',
    resposta_correta: 'c',
    explicacao:
      'Spear Phishing pesquisa a vítima previamente para criar uma mensagem sob medida e muito convincente.',
    pontos: 10,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'media',
    enunciado:
      "Um e-mail do banco pede que você clique em um link para 'Recadastrar suas Chaves PIX Urgente sob pena de multa'. O procedimento seguro é:",
    alternativa_a: 'Digitar suas senhas na página que abrir para testar se é real.',
    alternativa_b: 'Encaminhar o e-mail para seus familiares para que eles também recadastrem.',
    alternativa_c: 'Clicar no link imediatamente para evitar pagar a multa bancária.',
    alternativa_d:
      'Ignorar o link do e-mail, acessar a conta pelo aplicativo oficial do banco ou ligar para o gerente.',
    resposta_correta: 'd',
    explicacao:
      'Bancos não pedem recadastramento de senhas ou chaves por links de e-mail; acesse sempre pelos canais oficiais.',
    pontos: 10,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Uma mensagem falsa cita o nome do funcionário, seu setor e um projeto em andamento. Por que isso exige atenção?',
    alternativa_a: 'Porque dados pessoais no texto confirmam a autenticidade do remetente.',
    alternativa_b: 'Porque toda mensagem personalizada já foi verificada pela segurança.',
    alternativa_c: 'Porque esse tipo de mensagem não pode conter links maliciosos.',
    alternativa_d:
      'Porque o golpe pode ter sido personalizado para parecer legítimo e induzir uma ação precipitada.',
    resposta_correta: 'd',
    explicacao:
      'A aula explica que phishing direcionado usa informações do alvo para dar credibilidade à isca; a personalização não comprova autenticidade.',
    pontos: 10,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Caso você perceba que digitou suas credenciais corporativas em um site falso de phishing por engano, sua primeira ação imediata deve ser:',
    alternativa_a: 'Desligar o computador e fingir que nada aconteceu.',
    alternativa_b: 'Apagar o histórico do navegador para apagar os rastros.',
    alternativa_c: 'Esperar o final do mês para ver se alguém usou sua conta.',
    alternativa_d:
      'Alterar sua senha imediatamente no sistema legítimo e notificar imediatamente o time de TI/Segurança.',
    resposta_correta: 'd',
    explicacao:
      'Trocar a senha afetada na hora e avisar a TI permite cortar o acesso dos atacantes antes do uso malicioso.',
    pontos: 10,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Você recebe uma mensagem que afirma ser do portal corporativo, mas o domínio tem uma letra trocada. Qual é a avaliação mais adequada?',
    alternativa_a: 'Confiar no link porque a página usa conexão HTTPS.',
    alternativa_b:
      'O domínio semelhante pode ser uma tentativa de direcioná-lo a uma página falsa; confirme o endereço por um canal conhecido.',
    alternativa_c: 'O domínio semelhante pode ser legítimo quando o pedido contém o nome do funcionário.',
    alternativa_d: 'Abrir o link e verificar a página antes de confirmar a origem da solicitação.',
    resposta_correta: 'b',
    explicacao:
      'O endereço real do link ou domínio precisa ser verificado: criminosos podem imitar a aparência do serviço para capturar credenciais.',
    pontos: 15,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um golpista liga se passando pelo banco e diz que você deve informar um código recebido por SMS para impedir uma fraude. Qual é a ação segura?',
    alternativa_a: 'Conferir os quatro últimos dígitos do telefone exibido no identificador da chamada.',
    alternativa_b: 'Encerrar a conversa e contatar o banco por canal oficial iniciado por você.',
    alternativa_c: 'Compartilhar o código caso a pessoa informe dados reais sobre o correntista.',
    alternativa_d: 'Solicitar que o próprio interlocutor envie um e-mail confirmando sua identidade.',
    resposta_correta: 'b',
    explicacao:
      'Assim como em mensagens falsas, a engenharia social explora urgência e autoridade. A verificação precisa ocorrer fora do contato suspeito.',
    pontos: 15,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'media',
    enunciado: "O golpe da 'Falsa Autoridade' ocorre quando o engenheiro social se passa por:",
    alternativa_a: 'Um cliente elogiando o atendimento da empresa.',
    alternativa_b: 'Um colega estagiário pedindo ajuda com o almoço.',
    alternativa_c: 'Um entregador de pizza pedindo avaliação do serviço.',
    alternativa_d:
      'Um diretor, auditor, autoridade policial ou técnico de TI exigindo acesso imediato sob pena de demissão ou processo.',
    resposta_correta: 'd',
    explicacao:
      'Usar posições de poder intimida a vítima, fazendo-a burlar processos de segurança sem questionar.',
    pontos: 10,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Uma mensagem promete um benefício exclusivo caso você confirme rapidamente seus dados de acesso. Qual gatilho psicológico está sendo explorado?',
    alternativa_a: 'A oportunidade de ganho combinada com pressão para agir antes de verificar.',
    alternativa_b: 'Um processo formal de autorização por canal independente.',
    alternativa_c: 'Uma obrigação que torna desnecessária a verificação de identidade.',
    alternativa_d: 'Uma confirmação técnica de que o site pertence à empresa.',
    resposta_correta: 'a',
    explicacao:
      'Engenharia social pode explorar oportunidade, curiosidade e urgência para levar alguém a fornecer informações que não deveria compartilhar.',
    pontos: 10,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Alguém telefona afirmando ser da auditoria e apresenta uma história detalhada para solicitar dados de clientes. Qual é a conduta mais segura?',
    alternativa_a: 'Fornecer os dados porque a pessoa sabe os nomes dos gestores.',
    alternativa_b: 'Atender porque uma história extensa comprova legitimidade.',
    alternativa_c: 'Validar identidade, necessidade e autorização pelo canal oficial antes de compartilhar.',
    alternativa_d: 'Enviar inicialmente parte dos dados como prova de confiança.',
    resposta_correta: 'c',
    explicacao:
      'Na engenharia social, histórias convincentes e apelos de autoridade podem ser usados para manipular; detalhes internos não substituem a verificação.',
    pontos: 10,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'media',
    enunciado:
      "Como a política corporativa de 'Confirmação por Segundo Canal' ajuda a neutralizar golpes de engenharia social?",
    alternativa_a: 'Proibindo conversas por telefone entre funcionários.',
    alternativa_b: 'Exigindo que toda mensagem seja impressa antes de ser lida.',
    alternativa_c: 'Obrigando a compra de dois computadores para cada funcionário.',
    alternativa_d:
      'Exigindo que pedidos atípicos de transferências ou dados sejam confirmados por um meio de comunicação diferente e independente do recebido.',
    resposta_correta: 'd',
    explicacao:
      'Confirmar por um segundo canal independente valida se a solicitação extraordinária é autêntica.',
    pontos: 10,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um atacante vê em redes sociais os nomes dos gestores e usa essa informação para criar uma mensagem de cobrança convincente. Qual defesa melhor reduz o risco?',
    alternativa_a: 'Confiar no pedido se ele citar um projeto interno real.',
    alternativa_b: 'Confirmar pelo mesmo endereço que enviou a mensagem, sem buscar outro contato.',
    alternativa_c: 'Analisar apenas a assinatura visual da mensagem, sem confirmar autorização.',
    alternativa_d: 'Confirmar pedidos incomuns em canal independente e seguir as regras de autorização.',
    resposta_correta: 'd',
    explicacao:
      'Dados públicos podem tornar um pretexto convincente, mas conhecer informações reais não prova identidade nem autorização.',
    pontos: 15,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Alguém se apresenta como suporte técnico e oferece resolver uma falha em troca da senha do usuário. Qual interpretação é mais adequada?',
    alternativa_a: 'Informar a senha após o suposto suporte confirmar o nome do gestor.',
    alternativa_b: 'Trocar a senha por uma temporária e compartilhá-la para facilitar o reparo.',
    alternativa_c: 'Aceitar o pedido se o funcionário estiver fora do horário de expediente.',
    alternativa_d: 'É uma tentativa de manipulação que deve ser recusada e verificada com o suporte oficial.',
    resposta_correta: 'd',
    explicacao:
      'A engenharia social explora confiança e oportunidade. Senhas não devem ser entregues em troca de assistência oferecida por contato não validado.',
    pontos: 15,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'media',
    enunciado: "Qual o principal benefício de utilizar um 'Gerenciador de Senhas' corporativo?",
    alternativa_a:
      'Armazena e gera senhas fortes, únicas e complexas para cada sistema de forma criptografada.',
    alternativa_b: 'Envia todas as senhas para um arquivo de texto aberto no e-mail.',
    alternativa_c: 'Elimina a necessidade de ter qualquer tipo de senha para entrar nos sistemas.',
    alternativa_d: 'Permite compartilhar a mesma senha com todos os colegas da empresa.',
    resposta_correta: 'a',
    explicacao:
      'Gerenciadores de senha armazenam com segurança credenciais complexas sem exigir memorização individual.',
    pontos: 10,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'media',
    enunciado: "O ataque cibernético do tipo 'Força Bruta' (Brute Force) consiste em:",
    alternativa_a:
      'Utilizar softwares automáticos para testar milhares de combinações de senhas até encontrar a correta.',
    alternativa_b: 'Roubar o celular corporativo na rua.',
    alternativa_c: 'Quebrar o computador da vítima fisicamente.',
    alternativa_d: 'Enviar e-mails falsos se passando pelo suporte técnico.',
    resposta_correta: 'a',
    explicacao: 'Força bruta testa exaustivamente senhas até adivinhar a credencial de acesso.',
    pontos: 10,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Qual é a principal vantagem de usar uma senha longa e exclusiva, sem informações pessoais previsíveis?',
    alternativa_a: 'Ela elimina totalmente a necessidade de outro fator de autenticação.',
    alternativa_b: 'Ela pode ser compartilhada com a equipe sem aumentar o risco.',
    alternativa_c: 'Dificulta adivinhação e testes de combinações e evita reutilização entre serviços.',
    alternativa_d: 'Ela se torna segura mesmo quando anotada em local visível.',
    resposta_correta: 'c',
    explicacao:
      'A aula recomenda senhas longas, únicas e não previsíveis para reduzir riscos de descoberta e aproveitamento em outros serviços.',
    pontos: 10,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Ao receber uma notificação de confirmação do aplicativo MFA sem que você esteja tentando fazer login naquele momento, você deve:',
    alternativa_a: 'Emprestar o celular para um colega aprovar.',
    alternativa_b: 'Aguardar 1 hora e depois aprovar.',
    alternativa_c:
      'Recusar a solicitação imediatamente e avisar o time de TI sobre a tentativa de acesso indevida.',
    alternativa_d: 'Aprovar o acesso para sumir com a notificação da tela.',
    resposta_correta: 'c',
    explicacao:
      'Aprovação não solicitada de MFA indica que alguém possui sua senha e está tentando invadir a conta (MFA Fatigue).',
    pontos: 10,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um colaborador percebe que uma senha antiga foi exposta em um vazamento externo. Qual conjunto de medidas oferece a melhor proteção para as contas corporativas?',
    alternativa_a: 'Manter senhas iguais e pedir apenas que a empresa bloqueie o site externo.',
    alternativa_b: 'Mudar somente o nome de usuário e continuar com a senha antiga.',
    alternativa_c: 'Desativar MFA para evitar bloqueios enquanto investiga o caso.',
    alternativa_d:
      'Trocar credenciais reutilizadas, usar senhas exclusivas e reforçar o MFA, comunicando a ocorrência.',
    resposta_correta: 'd',
    explicacao:
      'Uma credencial comprometida exige medidas que reduzam reutilização e acesso indevido: trocar senhas expostas, adotar exclusividade, MFA e seguir o reporte oficial.',
    pontos: 15,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma senha corporativa foi reutilizada em um serviço pessoal que sofreu vazamento. Qual risco decorre diretamente disso?',
    alternativa_a: 'Trocar a senha apenas no serviço pessoal e manter a corporativa igual.',
    alternativa_b: 'Esperar que os administradores do serviço pessoal impeçam testes em outros sistemas.',
    alternativa_c: 'Confiar no MFA como substituto completo para mudar uma senha exposta.',
    alternativa_d: 'Criminosos podem testar a credencial exposta para tentar entrar na conta corporativa.',
    resposta_correta: 'd',
    explicacao:
      'A reutilização permite que credenciais de outros serviços sejam testadas contra a empresa; use senhas exclusivas e MFA.',
    pontos: 15,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'media',
    enunciado:
      "Cibercriminosos utilizam a técnica de 'Dupla Extensão' em arquivos anexos (ex: documento.pdf.exe) com o objetivo de:",
    alternativa_a: 'Garantir que o arquivo possa ser impresso em qualquer impressora.',
    alternativa_b: 'Disfarçar um programa executável malicioso como se fosse um documento inofensivo em PDF.',
    alternativa_c: 'Fazer o arquivo abrir duas vezes mais rápido.',
    alternativa_d: 'Aumentar a resolução das imagens contidas no texto.',
    resposta_correta: 'b',
    explicacao:
      'A dupla extensão engana o usuário fazendo um arquivo executável (.exe) parecer um PDF ou imagem.',
    pontos: 10,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um arquivo baixado de um site desconhecido parece legítimo, mas solicita execução de um programa. Qual cuidado é o mais adequado?',
    alternativa_a: 'Ignorar qualquer alerta porque o nome do arquivo parece normal.',
    alternativa_b: 'Desativar as proteções do sistema antes de abri-lo.',
    alternativa_c: 'Evitar executá-lo e confirmar a procedência por fonte confiável.',
    alternativa_d: 'Executá-lo em todos os computadores para verificar se funciona.',
    resposta_correta: 'c',
    explicacao:
      'A aula alerta que arquivos e programas aparentemente normais podem carregar código malicioso.',
    pontos: 10,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'media',
    enunciado: 'Após um ataque de ransomware, qual postura é mais segura quanto ao pedido de pagamento?',
    alternativa_a:
      'Acionar a equipe de resposta e seguir o plano da empresa; pagar não garante recuperar os dados.',
    alternativa_b: 'Negociar a compra de ações da empresa do hacker.',
    alternativa_c: 'Pagar imediatamente o valor solicitado para resolver o problema no mesmo dia.',
    alternativa_d: 'Oferecer o dobro do valor exigido para acelerar o processo.',
    resposta_correta: 'a',
    explicacao:
      'O pagamento não garante a recuperação e pode ampliar riscos. A decisão e eventual comunicação devem seguir os procedimentos corporativos e orientações competentes.',
    pontos: 10,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um anexo diz que, para abrir uma nota fiscal, é obrigatório desativar a proteção do computador. Qual reação é mais segura?',
    alternativa_a: 'Desativar apenas por alguns minutos, pois o arquivo foi recebido por e-mail.',
    alternativa_b: 'Não reduzir as proteções; verificar a origem do arquivo e acionar a equipe responsável.',
    alternativa_c: 'Encaminhar o arquivo para colegas tentarem abrir primeiro.',
    alternativa_d: 'Confiar no documento caso tenha imagem de uma nota fiscal.',
    resposta_correta: 'b',
    explicacao:
      'A aula orienta a tratar pedidos de desligar proteções e habilitar conteúdos ativos como sinais de alerta de arquivos maliciosos.',
    pontos: 10,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um funcionário abre um arquivo inesperado e os documentos da equipe passam a ficar inacessíveis, com pedido de pagamento. Qual ameaça é mais provável?',
    alternativa_a: 'Um spyware que necessariamente torna todo arquivo indisponível por criptografia.',
    alternativa_b: 'Ransomware, que pode bloquear dados e exigir resgate.',
    alternativa_c: 'Uma atualização legítima que cobra para liberar documentos corporativos.',
    alternativa_d: 'Uma falha de permissão sem relação possível com execução de código malicioso.',
    resposta_correta: 'b',
    explicacao:
      'Ransomware é um tipo de malware que pode criptografar dados, prejudicar a disponibilidade e exigir pagamento.',
    pontos: 15,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um e-mail contém planilha aparentemente corporativa que solicita habilitar macros. Qual sequência de ações reduz melhor o risco?',
    alternativa_a: 'Abrir a planilha em outros dispositivos antes de verificar o remetente.',
    alternativa_b: 'Desabilitar temporariamente o antivírus e somente depois confirmar a procedência.',
    alternativa_c: 'Habilitar o conteúdo ativo quando o documento usa um logotipo familiar.',
    alternativa_d: 'Não habilitar macros, verificar a origem por canal confiável e comunicar a suspeita.',
    resposta_correta: 'd',
    explicacao:
      'Conteúdos ativos de arquivos podem executar código perigoso; a aparência institucional não comprova legitimidade.',
    pontos: 15,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'media',
    enunciado:
      'A tecnologia VPN (Virtual Private Network) é utilizada no trabalho remoto com a finalidade de:',
    alternativa_a: 'Substituir a necessidade de ter uma senha para ligar o computador.',
    alternativa_b:
      'Criar um túnel de comunicação criptografado e seguro entre o computador do funcionário e a rede da empresa.',
    alternativa_c: 'Permitir o download ilimitado de filmes e músicas pessoais.',
    alternativa_d: 'Aumentar o brilho e a resolução do monitor do notebook.',
    resposta_correta: 'b',
    explicacao: 'VPNs estabelecem um canal cifrado que protege o tráfego de dados em redes não confiáveis.',
    pontos: 10,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Ao acessar uma página de trabalho, o navegador informa que a conexão não é segura. Qual atitude é mais indicada?',
    alternativa_a: 'Inserir a senha para testar se o aviso desaparece.',
    alternativa_b: 'Desabilitar as verificações do navegador temporariamente.',
    alternativa_c: 'Interromper a operação e confirmar o endereço e a autenticidade do serviço.',
    alternativa_d: 'Continuar porque o cadeado é dispensável em sites de trabalho.',
    resposta_correta: 'c',
    explicacao:
      'Avisos de certificado ou conexão precisam ser investigados antes do envio de credenciais ou dados corporativos.',
    pontos: 10,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Você recebe um endereço de site com aparência parecida com o portal corporativo. O que deve verificar antes de digitar credenciais?',
    alternativa_a: 'O domínio completo e se o acesso foi iniciado por um canal confiável.',
    alternativa_b: 'Somente a presença de um campo para senha.',
    alternativa_c: 'Se o site tem uma imagem do logotipo da empresa.',
    alternativa_d: 'Apenas as cores da página, que confirmam a autoria.',
    resposta_correta: 'a',
    explicacao:
      'A aula enfatiza que HTTPS e aparência não bastam; é essencial conferir o endereço e o contexto da navegação.',
    pontos: 10,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um programa necessário ao trabalho está disponível em diversos sites. Qual escolha reduz o risco de instalação?',
    alternativa_a: 'Aceitar qualquer arquivo que tenha nome parecido com o original.',
    alternativa_b: 'Ignorar alertas do sistema se a instalação for urgente.',
    alternativa_c: 'Usar a fonte oficial ou homologada pela organização.',
    alternativa_d: 'Baixar da página com maior número de anúncios.',
    resposta_correta: 'c',
    explicacao:
      'Instalações e downloads devem vir de fontes autorizadas e confiáveis, pois sites desconhecidos podem oferecer arquivos adulterados.',
    pontos: 10,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Em uma rede Wi-Fi pública, surge uma página pedindo que você faça login com a senha corporativa. Qual análise é mais segura?',
    alternativa_a: 'Aceitar se o nome da rede Wi-Fi coincidir com o do estabelecimento.',
    alternativa_b: 'Usar a senha corporativa apenas uma vez e alterá-la quando chegar ao escritório.',
    alternativa_c:
      'Não inserir credenciais antes de validar o serviço por canal confiável e aplicar a política corporativa.',
    alternativa_d: 'Confiar no formulário porque surgiu automaticamente após a conexão.',
    resposta_correta: 'c',
    explicacao:
      'Redes desconhecidas e páginas de autenticação inesperadas podem expor credenciais; a conexão deve ser verificada.',
    pontos: 15,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'dificil',
    enunciado: 'A presença do protocolo HTTPS e do ícone de cadeado em um site garante que:',
    alternativa_a: 'A identidade comercial da empresa responsável pelo site foi validada completamente.',
    alternativa_b: 'Todos os arquivos disponíveis no endereço são livres de malware.',
    alternativa_c:
      'A comunicação entre o seu navegador e o servidor é criptografada, mas o site ainda pode ser falso ou malicioso.',
    alternativa_d: 'O conteúdo publicado foi verificado pela equipe de segurança da organização.',
    resposta_correta: 'c',
    explicacao:
      'HTTPS garante criptografia no transporte, mas golpistas também podem obter certificados SSL válidos para sites falsos.',
    pontos: 15,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'media',
    enunciado: 'Ao instalar um novo aplicativo no celular, o usuário deve ter atenção especial em relação a:',
    alternativa_a: 'A cor do ícone do aplicativo.',
    alternativa_b: 'O tamanho do arquivo ser menor que 1 Megabyte.',
    alternativa_c:
      'As permissões solicitadas pelo app (ex: acesso injustificado à câmera, microfone, contatos e localização).',
    alternativa_d: 'O nome do desenvolvedor estar escrito em letras maiúsculas.',
    resposta_correta: 'c',
    explicacao:
      'Permissões excessivas e incompatíveis com a função do app indicam risco à privacidade e à segurança.',
    pontos: 10,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um colaborador quer utilizar o celular pessoal para acessar e-mails de trabalho. O que deve verificar primeiro?',
    alternativa_a: 'Se o fabricante permite usar o brilho máximo.',
    alternativa_b: 'Se esse uso é permitido e quais controles de segurança a empresa exige.',
    alternativa_c: 'Se o aparelho tem espaço disponível para jogos.',
    alternativa_d: 'Se a rede social favorita está instalada.',
    resposta_correta: 'b',
    explicacao:
      'Dispositivos que acessam dados corporativos precisam respeitar políticas e controles de segurança, sejam pessoais ou fornecidos pela empresa.',
    pontos: 10,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um celular corporativo é perdido durante uma viagem. Qual recurso, quando previsto pela empresa, pode ajudar a proteger os dados?',
    alternativa_a: 'Compartilhar publicamente a senha do dispositivo para que outras pessoas o localizem.',
    alternativa_b: 'Recurso de bloqueio remoto e, quando adequado, remoção de dados pela equipe autorizada.',
    alternativa_c: 'Desativar o bloqueio automático nos demais celulares da equipe.',
    alternativa_d: 'Permitir acesso permanente a qualquer pessoa que encontre o aparelho.',
    resposta_correta: 'b',
    explicacao:
      'A aula cita recursos de localização, bloqueio remoto e remoção de dados, dentro das políticas da organização.',
    pontos: 10,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Por que instalar aplicativos desconhecidos ou conceder permissões excessivas ao celular corporativo aumenta o risco?',
    alternativa_a: 'Porque qualquer aplicativo altera automaticamente o preço do aparelho.',
    alternativa_b: 'Porque essas escolhas podem expor documentos, mensagens e acessos profissionais.',
    alternativa_c: 'Porque aplicativos instalados fora do expediente deixam de representar risco.',
    alternativa_d: 'Porque o bloqueio de tela impede por completo o acesso de qualquer aplicativo aos dados.',
    resposta_correta: 'b',
    explicacao:
      'Aplicativos de origem não autorizada ou com permissões desnecessárias podem ampliar o acesso indevido a informações e recursos do aparelho.',
    pontos: 10,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um celular usado para autenticar contas corporativas foi roubado. Qual medida reduz mais rapidamente a janela de exposição?',
    alternativa_a: 'Esperar alguns minutos para procurar o aparelho antes de avisar o time responsável.',
    alternativa_b:
      'Trocar apenas a senha do e-mail pessoal, sem reportar a perda do dispositivo corporativo.',
    alternativa_c: 'Avisar somente ao fim do expediente para reunir mais detalhes.',
    alternativa_d:
      'Comunicar imediatamente a equipe responsável para bloquear acessos e aplicar os procedimentos de proteção.',
    resposta_correta: 'd',
    explicacao:
      'A rapidez do reporte permite revogação de acessos, bloqueio remoto ou outras ações previstas na política da organização.',
    pontos: 15,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um aplicativo de notas pede acesso constante à localização, câmera e lista de contatos sem necessidade aparente. O que deve orientar a decisão?',
    alternativa_a: 'Revisar a legitimidade do aplicativo e negar permissões que não sejam necessárias.',
    alternativa_b: 'Permitir tudo caso o aplicativo esteja na loja oficial, sem avaliar a necessidade.',
    alternativa_c: 'Aceitar permissões e tentar revogá-las somente se ocorrer vazamento.',
    alternativa_d: 'Bloquear a tela e considerar o risco resolvido, mesmo com permissões excessivas.',
    resposta_correta: 'a',
    explicacao:
      'Permissões excessivas ampliam a exposição; a aula recomenda conceder apenas os acessos compatíveis com a função do aplicativo.',
    pontos: 15,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Ao enviar documentos com dados sensíveis de clientes a destinatários externos autorizados, qual é a melhor prática?',
    alternativa_a: 'Enviar também uma cópia para endereços de e-mail aleatórios.',
    alternativa_b: "Colocar todos os endereços no campo 'Para:' de forma visível.",
    alternativa_c:
      'Usar canal aprovado pela empresa, conferir destinatários e limitar as permissões de acesso.',
    alternativa_d: 'Publicar a lista de e-mails nas redes sociais da empresa.',
    resposta_correta: 'c',
    explicacao:
      'Cco pode ocultar a lista de destinatários, mas não protege o conteúdo de anexos. O controle principal é restringir acesso e usar o canal autorizado.',
    pontos: 10,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Uma pessoa atua em dois projetos, mas solicita acesso a todas as pastas do departamento. Qual critério orienta a concessão?',
    alternativa_a: 'Liberar tudo, pois qualquer funcionário é confiável.',
    alternativa_b: 'Rejeitar todo e qualquer compartilhamento, inclusive o autorizado.',
    alternativa_c:
      'Conceder acesso somente à pasta mais antiga do departamento, independentemente da função.',
    alternativa_d: 'Autorizar apenas os arquivos e recursos necessários às atividades dessa pessoa.',
    resposta_correta: 'd',
    explicacao:
      'O princípio do menor privilégio exige que o acesso corresponda à necessidade de trabalho, e não apenas à condição de funcionário.',
    pontos: 10,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Uma pasta corporativa é compartilhada por link configurado como "qualquer pessoa com o link". Qual risco decorre disso?',
    alternativa_a: 'A pasta passa a exigir senha exclusiva de cada colaborador.',
    alternativa_b: 'O link pode permitir que pessoas sem autorização consultem informações reservadas.',
    alternativa_c: 'A configuração garante automaticamente a integridade dos documentos.',
    alternativa_d: 'O serviço impede por padrão que o link seja encaminhado a terceiros.',
    resposta_correta: 'b',
    explicacao:
      'Compartilhamentos públicos ampliam a exposição porque o acesso deixa de ser restrito aos destinatários necessários.',
    pontos: 10,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'media',
    enunciado:
      "Qual o perigo da funcionalidade de 'Compartilhamento por Link Público Sem Senha' em pastas de armazenamento na nuvem (ex: Google Drive, OneDrive)?",
    alternativa_a:
      'Quem obtiver o link poderá acessar os documentos e, dependendo das permissões, até modificá-los.',
    alternativa_b: 'O sistema operacional do computador ser formatado.',
    alternativa_c: 'O link expirar após 5 minutos.',
    alternativa_d: 'A pasta ficar trancada para o próprio criador do arquivo.',
    resposta_correta: 'a',
    explicacao:
      'Links públicos podem expor dados a quem receber ou descobrir o endereço. Ações como edição dependem da configuração de permissões; acesso restrito é mais seguro.',
    pontos: 10,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma pasta de currículos deve ser acessada apenas pelo RH, mas o link funciona para qualquer pessoa que o receba. Qual controle corrige o problema?',
    alternativa_a: 'Manter o link público e pedir que o RH não o encaminhe por e-mail.',
    alternativa_b: 'Restringir o compartilhamento a destinatários específicos com permissão necessária.',
    alternativa_c: 'Proteger o nome do arquivo, mas conservar a opção qualquer pessoa com o link.',
    alternativa_d: 'Colocar uma orientação de confidencialidade na pasta sem alterar o acesso.',
    resposta_correta: 'b',
    explicacao:
      'Links públicos tornam o acesso amplo; o princípio de menor privilégio exige permissões específicas e revisadas.',
    pontos: 15,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um funcionário mudou de função, mas continua com acesso a relatórios confidenciais da antiga equipe. Qual ação atende melhor ao menor privilégio?',
    alternativa_a: 'Revisar e revogar as permissões que deixaram de ser necessárias.',
    alternativa_b: 'Manter acesso até que o funcionário solicite por escrito sua revogação.',
    alternativa_c: 'Preservar acesso anterior por conveniência, desde que não haja downloads.',
    alternativa_d: 'Ampliar o compartilhamento para a equipe toda, reduzindo solicitações futuras.',
    resposta_correta: 'a',
    explicacao:
      'O controle de acesso deve refletir a necessidade atual; permissões antigas e excessivas aumentam o risco de exposição.',
    pontos: 15,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Uma pessoa consegue observar uma planilha confidencial em uma tela deixada aberta na área de circulação. Qual medida evitaria essa exposição?',
    alternativa_a: 'Permitir visualização livre se a pessoa estiver na empresa.',
    alternativa_b:
      'Bloquear a sessão ao se afastar e posicionar informações sensíveis longe de olhares não autorizados.',
    alternativa_c: 'Deixar a tela aberta porque o acesso exige senha ao iniciar o computador.',
    alternativa_d: 'Aumentar apenas a resolução do monitor.',
    resposta_correta: 'b',
    explicacao:
      'A aula recomenda bloquear a tela ao sair da estação e reduzir a exposição física de dados confidenciais.',
    pontos: 10,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'media',
    enunciado: "O que é a prática indesejada de 'Tailgating' ou 'Piggybacking' no acesso físico à empresa?",
    alternativa_a: 'Usar o elevador de serviço para transportar computadores.',
    alternativa_b:
      'Seguir uma pessoa autorizada de perto para passar por portas controladas ou catracas sem validar a própria credencial.',
    alternativa_c: 'Deixar a janela do escritório aberta em dias de chuva.',
    alternativa_d: 'Estacionar o carro em vaga reservada para a diretoria.',
    resposta_correta: 'b',
    explicacao:
      "Tailgating ocorre quando uma pessoa não autorizada pega 'carona' no acesso de um funcionário credenciado.",
    pontos: 10,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um visitante afirma precisar acessar uma sala restrita para entregar um equipamento. Qual procedimento é o mais seguro?',
    alternativa_a: 'Liberar a entrada se ele souber o nome de um gestor.',
    alternativa_b: 'Abrir a porta e confiar que a pessoa sairá rapidamente.',
    alternativa_c: 'Emprestar o crachá de outro funcionário por alguns minutos.',
    alternativa_d: 'Solicitar identificação e seguir o processo oficial de autorização e acompanhamento.',
    resposta_correta: 'd',
    explicacao:
      'Aula 12 explica que pessoas não identificadas não devem passar pelos controles de acesso sem seguir o processo estabelecido.',
    pontos: 10,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Papéis com dados de clientes foram deixados na lixeira comum. Qual prática reduz a chance de exposição dessas informações?',
    alternativa_a: 'Descartar os documentos pelo processo seguro adotado pela empresa.',
    alternativa_b: 'Deixar o saco de lixo aberto para facilitar a fiscalização informal.',
    alternativa_c: 'Retirar apenas as páginas que apresentam o nome da empresa.',
    alternativa_d: 'Fotografar os documentos antes de colocá-los no lixo comum.',
    resposta_correta: 'a',
    explicacao:
      'Documentos físicos precisam de proteção também no descarte, conforme procedimentos corporativos para informações sensíveis.',
    pontos: 10,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um visitante sem crachá acompanha um funcionário por uma porta de acesso restrito e observa dados em uma mesa. Que conjunto de falhas explica o risco?',
    alternativa_a:
      'Validar a identidade do visitante, mas deixar documentos visíveis para facilitar o atendimento.',
    alternativa_b: 'Restringir as mesas com dados, mas permitir entrada sem credencial em horário comercial.',
    alternativa_c: 'Entrada sem validação de identidade e exposição física de informações.',
    alternativa_d: 'Tratar o incidente como apenas físico, sem possibilidade de exposição de informações.',
    resposta_correta: 'c',
    explicacao:
      'A aula aborda tailgating, identificação e mesa limpa: tanto a entrada indevida quanto documentos expostos comprometem a proteção.',
    pontos: 15,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Ao encerrar o expediente, um funcionário vê um computador desbloqueado ao lado de contratos confidenciais sobre a mesa. Qual medida combinada é mais apropriada?',
    alternativa_a: 'Fechar apenas a porta da sala, sem tocar nos documentos nem avisar ninguém.',
    alternativa_b: 'Desligar todos os equipamentos do prédio, mesmo sem autorização.',
    alternativa_c: 'Colocar os contratos na lixeira comum e deixar a sessão aberta.',
    alternativa_d:
      'Proteger os documentos e a estação conforme o procedimento da empresa e comunicar o responsável pela exposição.',
    resposta_correta: 'd',
    explicacao:
      'A aula associa a proteção física ao bloqueio de tela e ao armazenamento adequado de documentos; ambos devem ser tratados conforme os procedimentos internos.',
    pontos: 15,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Se arquivos começarem a ser criptografados e surgir uma mensagem de resgate, qual é a atitude inicial mais adequada?',
    alternativa_a:
      'Avisar imediatamente a equipe de segurança e seguir o plano de contenção, incluindo isolamento quando orientado.',
    alternativa_b: 'Enviar um e-mail para todos os clientes avisando do resgate.',
    alternativa_c: 'Conectar um pen drive corporativo para copiar os arquivos restantes.',
    alternativa_d: 'Reiniciar o computador 10 vezes seguidas.',
    resposta_correta: 'a',
    explicacao:
      'Um possível ransomware exige reporte e contenção rápidos. O isolamento de rede pode ser recomendado, mas deve seguir o plano oficial para preservar evidências e reduzir impactos.',
    pontos: 10,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Quando um evento pode ser considerado um incidente de segurança da informação, mesmo antes de haver certeza sobre todos os fatos?',
    alternativa_a: 'Somente quando existe confirmação judicial de um ataque.',
    alternativa_b:
      'Quando há evento confirmado ou suspeito capaz de comprometer informações, contas, sistemas ou operações.',
    alternativa_c: 'Apenas quando o computador para definitivamente de funcionar.',
    alternativa_d: 'Somente após a divulgação pública de dados de clientes.',
    resposta_correta: 'b',
    explicacao:
      'A aula esclarece que uma suspeita com potencial de impacto já deve ser comunicada pelo canal oficial, sem esperar a confirmação completa.',
    pontos: 10,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Um funcionário observa arquivos alterados inesperadamente e programas desconhecidos no computador. Qual é a primeira providência adequada?',
    alternativa_a: 'Registrar os sinais e comunicar rapidamente ao canal oficial de incidentes.',
    alternativa_b: 'Reiniciar repetidas vezes até os arquivos voltarem ao normal.',
    alternativa_c: 'Ignorar os sintomas enquanto ainda conseguir trabalhar.',
    alternativa_d: 'Apagar os programas e evitar contar à equipe de segurança.',
    resposta_correta: 'a',
    explicacao:
      'A aula orienta reportar suspeitas rapidamente e registrar detalhes úteis à investigação, sem tentar resolver sozinho.',
    pontos: 10,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'media',
    enunciado:
      "Durante o processo de contenção de um incidente, por que o colaborador NÃO deve tentar 'formatar' ou 'limpar' o computador por conta própria?",
    alternativa_a: 'Porque a TI prefere formatar computadores apenas no final do ano.',
    alternativa_b: 'Porque o sistema operacional é proprietário do funcionário.',
    alternativa_c: 'Porque a formatação deixa o computador inutilizável para sempre.',
    alternativa_d:
      'Porque a alteração precipitada destrói evidências e rastros forense digitais essenciais para investigar a origem do ataque.',
    resposta_correta: 'd',
    explicacao:
      'A preservação do estado do sistema é fundamental para a análise forense e identificação da causa raiz.',
    pontos: 10,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Depois de um incidente, a equipe identifica que uma mensagem suspeita passou despercebida por vários funcionários. O que mais ajuda a reduzir a chance de repetição?',
    alternativa_a: 'Aguardar outro incidente semelhante antes de revisar os procedimentos.',
    alternativa_b:
      'Analisar o ocorrido, orientar a equipe e aprimorar os controles de identificação e reporte.',
    alternativa_c: 'Permitir que os funcionários apaguem evidências para reduzir o tempo da investigação.',
    alternativa_d: 'Substituir os canais de reporte por conversas informais sem registro.',
    resposta_correta: 'b',
    explicacao:
      'A cultura de reporte e a análise dos sinais permitem melhorar os procedimentos, limitar danos e prevenir situações semelhantes.',
    pontos: 15,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Após enviar por engano uma planilha com dados pessoais a destinatário indevido, qual deve ser a conduta inicial do colaborador?',
    alternativa_a: 'Excluir a cópia enviada antes de comunicar, ainda que isso altere evidências.',
    alternativa_b:
      'Comunicar imediatamente o incidente pelo canal oficial e fornecer detalhes para avaliação.',
    alternativa_c: 'Avisar somente o destinatário externo e considerar o caso encerrado.',
    alternativa_d: 'Esperar confirmar o uso indevido dos dados antes de registrar a ocorrência.',
    resposta_correta: 'b',
    explicacao:
      'Cabe às áreas responsáveis avaliar contenção, impactos e eventuais obrigações legais; o colaborador precisa comunicar prontamente.',
    pontos: 15,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'media',
    enunciado:
      'O curso mostra que um ataque pode começar por uma mensagem falsa e avançar até os sistemas internos. Qual conclusão decorre dessa sequência?',
    alternativa_a: 'Identificar e interromper etapas pode impedir o avanço daquela tentativa de ataque.',
    alternativa_b: 'O roubo inicial de uma senha prova que todos os servidores já foram comprometidos.',
    alternativa_c: 'A primeira etapa não importa quando a empresa possui antivírus.',
    alternativa_d: 'Todo ataque segue exatamente a mesma ordem de etapas.',
    resposta_correta: 'a',
    explicacao:
      'A aula descreve ataques em cadeia, com progressão por credenciais, sistemas e dados; diferentes controles podem dificultar o avanço.',
    pontos: 10,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Após obter a senha de um usuário, um invasor tenta acessar outras contas, computadores e pastas internas. Que risco esse comportamento representa?',
    alternativa_a: 'Apenas indisponibilidade de internet pública, sem relação com sistemas internos.',
    alternativa_b: 'Verificação legítima de todos os sistemas pelo próprio colaborador.',
    alternativa_c: 'Proteção automática das contas restantes após o primeiro acesso.',
    alternativa_d: 'Ampliação do comprometimento para outros recursos da organização.',
    resposta_correta: 'd',
    explicacao:
      'O conteúdo descreve que, após o acesso inicial, criminosos podem procurar outras contas e sistemas até atingir dados mais sensíveis.',
    pontos: 10,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'media',
    enunciado: "O que é a 'Exfiltração de Dados' durante um ataque cibernético avançado?",
    alternativa_a: 'O apagamento automático do histórico de conversas do suporte técnico.',
    alternativa_b:
      'A cópia e transferência não autorizada de dados sigilosos para servidores externos sob controle do atacante.',
    alternativa_c: 'A recuperação dos arquivos a partir do backup corporativo.',
    alternativa_d: 'A atualização de segurança promovida pelo fabricante do sistema.',
    resposta_correta: 'b',
    explicacao:
      'Exfiltração é a extração e roubo silencioso das informações confidenciais para o ambiente externo do invasor.',
    pontos: 10,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Se uma medida de segurança interrompe uma etapa de um ataque em cadeia, qual é a conclusão mais correta?',
    alternativa_a: 'Todos os ataques futuros ficam automaticamente impossibilitados.',
    alternativa_b: 'A empresa pode dispensar o restante dos controles de segurança.',
    alternativa_c:
      'Essa medida pode barrar a progressão daquela tentativa, mas outros caminhos ainda podem existir.',
    alternativa_d: 'Apenas a última etapa da cadeia importa para a defesa.',
    resposta_correta: 'c',
    explicacao:
      'Ações como validar pedidos, usar MFA e reportar anomalias podem interromper etapas sem garantir proteção absoluta contra qualquer nova tentativa.',
    pontos: 10,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma empresa descobre que uma conta de fornecedor foi comprometida e passou a enviar pedidos inesperados de arquivos internos. Qual conduta interrompe melhor essa possível cadeia de ataque?',
    alternativa_a: 'Aceitar o pedido se o e-mail vier de uma caixa já utilizada em projetos anteriores.',
    alternativa_b: 'Disponibilizar uma cópia parcial por um link público para agilizar a análise.',
    alternativa_c:
      'Verificar o pedido por contato independente e limitar o acesso a informações autorizadas.',
    alternativa_d: 'Solicitar confirmação pelo mesmo endereço possivelmente comprometido.',
    resposta_correta: 'c',
    explicacao:
      'Contatos conhecidos podem ser usados como porta de entrada. A validação independente e o controle de acesso interrompem tentativas de exploração da confiança.',
    pontos: 15,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um funcionário recebe uma solicitação de acesso aparentemente interna e urgente, mas fora de seu procedimento habitual. Qual combinação de controles é mais consistente?',
    alternativa_a: 'Confiar no pedido porque a conta usa domínio interno, sem confirmar a operação.',
    alternativa_b: 'Autorizar temporariamente todos os recursos solicitados e revisar na próxima semana.',
    alternativa_c: 'Aceitar após o remetente repetir a solicitação com assinatura de e-mail.',
    alternativa_d:
      'Confirmar identidade e autorização, aplicar menor privilégio e comunicar a anomalia quando necessário.',
    resposta_correta: 'd',
    explicacao:
      'A aula mostra que MFA, validação de solicitações, permissões restritas e reporte podem interromper diferentes etapas de uma cadeia de ataque.',
    pontos: 15,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'media',
    enunciado: 'Uma empresa com os softwares de segurança mais caros do mundo ainda estará vulnerável se:',
    alternativa_a:
      'Os colaboradores não forem treinados e caírem em golpes simples de engenharia social e phishing.',
    alternativa_b: 'Os monitores forem de tamanho pequeno.',
    alternativa_c: 'Os computadores forem atualizados semanalmente.',
    alternativa_d: 'A velocidade da internet corporativa for muito alta.',
    resposta_correta: 'a',
    explicacao: 'Ferramentas tecnológicas não impedem erros humanos resultantes de falta de conscientização.',
    pontos: 10,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'media',
    enunciado:
      "O que significa dizer que a segurança da informação é um 'Processo Contínuo' e não um 'Produto'?",
    alternativa_a: 'Que a empresa deve comprar novos softwares a cada hora.',
    alternativa_b: 'Que a empresa não pode vender produtos aos seus clientes.',
    alternativa_c: 'Que os computadores devem ficar ligados 24 horas sem parar.',
    alternativa_d:
      'Que a proteção exige monitoramento, atualização de hábitos, revisão de políticas e aprendizado constante diante de novas ameaças.',
    resposta_correta: 'd',
    explicacao: 'Ameaças evoluem constantemente; logo, a segurança exige adaptação e melhoria contínuas.',
    pontos: 10,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Como a atitude individual de um colaborador impacta a segurança dos seus próprios colegas de trabalho?',
    alternativa_a: 'Não causa nenhum impacto, pois as contas de e-mail são isoladas.',
    alternativa_b:
      'Se um computador for infectado por negligência, a rede interna e os dados dos colegas podem ser comprometidos.',
    alternativa_c: 'Melhora o salário de todos os colegas da equipe.',
    alternativa_d: 'Impede que os colegas recebam mensagens de e-mail pessoais.',
    resposta_correta: 'b',
    explicacao:
      'No ambiente de rede conectada, a segurança de um indivíduo protege ou expõe todo o coletivo.',
    pontos: 10,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'media',
    enunciado:
      'Participar ativamente dos treinamentos e campanhas de conscientização de segurança promovidos pela empresa é:',
    alternativa_a: 'Algo necessário apenas para os funcionários novos em período de experiência.',
    alternativa_b: 'Uma perda de tempo que atrapalha o trabalho produtivo.',
    alternativa_c: 'Uma obrigação exclusiva do setor de compras da empresa.',
    alternativa_d:
      'Uma boa prática de atualização contínua, frequentemente prevista nas políticas internas da empresa.',
    resposta_correta: 'd',
    explicacao:
      'Treinamentos e campanhas reforçam hábitos de prevenção e resposta. O caráter obrigatório depende das políticas aplicáveis à organização.',
    pontos: 10,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um colaborador recebe uma mensagem urgente pedindo acesso a documentos confidenciais, mas identifica inconsistências no remetente. O que mostra a aplicação madura do treinamento?',
    alternativa_a: 'Abrir o documento antes de validar a solicitação para agilizar a resposta.',
    alternativa_b: 'Considerar a mensagem segura sempre que o antivírus não apresentar alerta.',
    alternativa_c:
      'Verificar o pedido por canal confiável, não compartilhar os dados sem autorização e reportar a suspeita.',
    alternativa_d: 'Encaminhar os dados após confirmação do próprio e-mail suspeito.',
    resposta_correta: 'c',
    explicacao:
      'O objetivo final do curso é transformar reconhecimento de sinais de fraude em decisões práticas antes que haja exposição de dados.',
    pontos: 15,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma empresa pretende reduzir riscos apenas comprando novas ferramentas. Qual decisão aplica melhor a mensagem central da jornada?',
    alternativa_a:
      'Comprar ferramentas e dispensar capacitação, pois a tecnologia sempre reconhece pedidos fraudulentos.',
    alternativa_b:
      'Combinar controles técnicos, processos de verificação e hábitos seguros dos colaboradores.',
    alternativa_c: 'Concentrar toda a responsabilidade apenas no departamento de TI.',
    alternativa_d: 'Exigir que funcionários resolvam isoladamente incidentes antes de reportá-los.',
    resposta_correta: 'b',
    explicacao:
      'A jornada destaca que tecnologia, comportamento cotidiano e processos de reporte e verificação são complementares e precisam funcionar juntos.',
    pontos: 15,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual comportamento fortalece a segurança de toda a equipe?',
    alternativa_a: 'Ignorar alertas de segurança',
    alternativa_b: 'Compartilhar senhas entre colegas',
    alternativa_c: 'Usar contas de outras pessoas',
    alternativa_d: 'Comunicar situações suspeitas pelos canais oficiais',
    resposta_correta: 'd',
    explicacao:
      'A comunicação por canal oficial permite que a equipe responsável avalie a suspeita antes que ela cause danos.',
    pontos: 5,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Ao perceber um computador corporativo desbloqueado e sem usuário, o que é mais adequado?',
    alternativa_a: 'Enviar mensagens pela conta aberta',
    alternativa_b: 'Informar o responsável e evitar acessar informações',
    alternativa_c: 'Copiar os arquivos para protegê-los',
    alternativa_d: 'Usá-lo para consultar documentos',
    resposta_correta: 'b',
    explicacao:
      'Usar a sessão de outra pessoa pode expor dados e comprometer a rastreabilidade; procure o responsável sem acessar os arquivos.',
    pontos: 5,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Quem deve seguir as orientações de segurança da empresa?',
    alternativa_a: 'Somente os gestores',
    alternativa_b: 'Somente o suporte técnico',
    alternativa_c: 'Todos os colaboradores',
    alternativa_d: 'Apenas quem trabalha remotamente',
    resposta_correta: 'c',
    explicacao:
      'Uma falha de qualquer colaborador pode afetar a organização, por isso os cuidados são responsabilidade coletiva.',
    pontos: 5,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Por que participar dos treinamentos de segurança?',
    alternativa_a: 'Para dispensar o antivírus',
    alternativa_b: 'Para reconhecer riscos e agir preventivamente',
    alternativa_c: 'Para obter acesso irrestrito',
    alternativa_d: 'Para eliminar todas as ameaças',
    resposta_correta: 'b',
    explicacao:
      'Treinamentos ajudam a reconhecer tentativas de fraude e a seguir procedimentos seguros no cotidiano.',
    pontos: 5,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual destes exemplos é um ativo de informação?',
    alternativa_a: 'Uma planilha com dados de clientes',
    alternativa_b: 'O horário do almoço',
    alternativa_c: 'A marca da cadeira',
    alternativa_d: 'A cor da parede',
    resposta_correta: 'a',
    explicacao:
      'Uma planilha de clientes possui valor operacional e pode expor informações se for acessada sem autorização.',
    pontos: 5,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Como tratar uma lista interna de clientes?',
    alternativa_a: 'Publicar nas redes sociais',
    alternativa_b: 'Enviar para qualquer contato',
    alternativa_c: 'Salvar em dispositivo desconhecido',
    alternativa_d: 'Seguir a classificação e as regras de acesso',
    resposta_correta: 'd',
    explicacao:
      'Listas internas podem conter dados pessoais; classificação e permissões orientam seu tratamento seguro.',
    pontos: 5,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer com um documento confidencial impresso que não será mais usado?',
    alternativa_a: 'Descartá-lo pelo procedimento seguro da empresa',
    alternativa_b: 'Colocá-lo no lixo comum',
    alternativa_c: 'Deixá-lo na mesa',
    alternativa_d: 'Fotografá-lo',
    resposta_correta: 'a',
    explicacao:
      'Documentos físicos também são ativos de informação e exigem eliminação conforme o procedimento corporativo.',
    pontos: 5,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual cuidado é importante ao compartilhar arquivos de trabalho?',
    alternativa_a: 'Liberar acesso público',
    alternativa_b: 'Usar sempre contas pessoais',
    alternativa_c: 'Ignorar o destinatário',
    alternativa_d: 'Conferir destinatário e permissão',
    resposta_correta: 'd',
    explicacao:
      'Uma permissão incorreta ou um destinatário equivocado pode transformar compartilhamento rotineiro em vazamento.',
    pontos: 5,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual pilar protege dados contra alterações não autorizadas?',
    alternativa_a: 'Integridade',
    alternativa_b: 'Disponibilidade',
    alternativa_c: 'Publicidade',
    alternativa_d: 'Portabilidade',
    resposta_correta: 'a',
    explicacao:
      'Alterações não autorizadas ferem a exatidão dos dados mesmo quando o arquivo continua acessível.',
    pontos: 5,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que representa disponibilidade da informação?',
    alternativa_a: 'Apagar arquivos antigos automaticamente',
    alternativa_b: 'Permitir acesso a qualquer pessoa',
    alternativa_c: 'Manter todas as senhas iguais',
    alternativa_d: 'Garantir acesso a pessoas autorizadas quando necessário',
    resposta_correta: 'd',
    explicacao:
      'O dado deve estar acessível quando necessário a quem tem autorização; bloqueios indevidos afetam operações.',
    pontos: 5,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual medida ajuda a preservar a confidencialidade?',
    alternativa_a: 'Compartilhar logins',
    alternativa_b: 'Deixar arquivos abertos',
    alternativa_c: 'Desativar bloqueio de tela',
    alternativa_d: 'Restringir o acesso a quem precisa',
    resposta_correta: 'd',
    explicacao:
      'Confidencialidade significa limitar a visualização de informações às pessoas e aos sistemas autorizados.',
    pontos: 5,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Se um relatório foi modificado sem autorização, qual pilar foi afetado diretamente?',
    alternativa_a: 'Publicidade',
    alternativa_b: 'Disponibilidade',
    alternativa_c: 'Continuidade',
    alternativa_d: 'Integridade',
    resposta_correta: 'd',
    explicacao: 'A integridade pode ser quebrada sem apagar o arquivo ou impedir sua leitura.',
    pontos: 5,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual atitude é segura diante de um programa desconhecido recebido por mensagem?',
    alternativa_a: 'Executar para descobrir a função',
    alternativa_b: 'Compartilhar com a equipe',
    alternativa_c: 'Não executar e verificar com a TI',
    alternativa_d: 'Desativar a proteção do sistema',
    resposta_correta: 'c',
    explicacao:
      'Um programa recebido sem contexto confiável pode representar ameaça; a origem deve ser confirmada antes da execução.',
    pontos: 5,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual verificação é importante quando um e-mail usa o nome de uma empresa conhecida?',
    alternativa_a: 'Abrir o link sem verificar porque o nome é conhecido.',
    alternativa_b: 'Conferir o endereço real do remetente e o contexto do pedido.',
    alternativa_c: 'Responder com a senha para confirmar a identidade.',
    alternativa_d: 'Confiar apenas na marca e no logotipo exibidos.',
    resposta_correta: 'b',
    explicacao:
      'Criminosos podem imitar marcas e nomes. A conferência do endereço completo e da solicitação reduz o risco.',
    pontos: 5,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual sinal aumenta a suspeita de uma mensagem que parece ter vindo de um gestor?',
    alternativa_a: 'Presença do nome do gestor no texto.',
    alternativa_b: 'Mensagem enviada durante o expediente.',
    alternativa_c: 'Assinatura com nome do setor da empresa.',
    alternativa_d: 'Pedido urgente para ignorar os procedimentos normais.',
    resposta_correta: 'd',
    explicacao:
      'Pressão por urgência e desrespeito ao procedimento são sinais de alerta, mesmo quando a identidade parece familiar.',
    pontos: 5,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que ajuda a reduzir riscos de programas maliciosos?',
    alternativa_a: 'Manter programas e proteções atualizados',
    alternativa_b: 'Baixar de sites desconhecidos',
    alternativa_c: 'Abrir anexos inesperados',
    alternativa_d: 'Ignorar atualizações',
    resposta_correta: 'a',
    explicacao:
      'Atualizações e controles ajudam a reduzir riscos, mas não substituem a verificação de solicitações suspeitas.',
    pontos: 5,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual detalhe pode indicar um e-mail de phishing?',
    alternativa_a: 'Comunicado pelo portal interno',
    alternativa_b: 'Aviso confirmado pela TI',
    alternativa_c: 'Mensagem esperada de contato verificado',
    alternativa_d: 'Pedido urgente para clicar em link suspeito',
    resposta_correta: 'd',
    explicacao: 'Phishing frequentemente combina urgência e links para conduzir a pessoa a páginas falsas.',
    pontos: 5,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Ao receber um pedido de senha por e-mail, o que fazer?',
    alternativa_a: 'Enviar a senha por mensagem',
    alternativa_b: 'Responder com a senha',
    alternativa_c: 'Clicar para confirmar',
    alternativa_d: 'Não fornecer e reportar a tentativa',
    resposta_correta: 'd',
    explicacao:
      'Um pedido de senha por mensagem não deve ser atendido; a verificação deve ocorrer pelos canais oficiais.',
    pontos: 5,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual atitude é correta antes de abrir um link inesperado?',
    alternativa_a: 'Ignorar o endereço',
    alternativa_b: 'Confiar apenas no logotipo',
    alternativa_c: 'Verificar remetente e endereço do link',
    alternativa_d: 'Abrir rapidamente',
    resposta_correta: 'c',
    explicacao: 'O texto exibido no link pode esconder um endereço diferente; confira antes de abrir.',
    pontos: 5,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer com um e-mail de cobrança suspeito?',
    alternativa_a: 'Pagar imediatamente',
    alternativa_b: 'Encaminhar para todos',
    alternativa_c: 'Baixar o anexo',
    alternativa_d: 'Confirmar a cobrança em canal oficial',
    resposta_correta: 'd',
    explicacao:
      'Cobranças inesperadas podem imitar parceiros legítimos; consulte o fornecedor por contato já conhecido.',
    pontos: 5,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que caracteriza engenharia social?',
    alternativa_a: 'Manipular pessoas para obter informações ou acesso',
    alternativa_b: 'Criptografar arquivos',
    alternativa_c: 'Atualizar sistemas automaticamente',
    alternativa_d: 'Organizar pastas',
    resposta_correta: 'a',
    explicacao:
      'Golpes de engenharia social exploram confiança e emoções para levar alguém a quebrar um procedimento.',
    pontos: 5,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Se alguém se passar por um gestor e pedir dados urgentes, o que fazer?',
    alternativa_a: 'Publicar os dados',
    alternativa_b: 'Confirmar a identidade em canal conhecido',
    alternativa_c: 'Enviar para um número novo',
    alternativa_d: 'Atender sem verificar',
    resposta_correta: 'b',
    explicacao:
      'O título profissional alegado não comprova identidade; confirmar por meio conhecido evita fraudes.',
    pontos: 5,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual informação não deve ser fornecida a um suposto suporte por telefone?',
    alternativa_a: 'Ramal público',
    alternativa_b: 'Nome do setor',
    alternativa_c: 'Senha pessoal',
    alternativa_d: 'Horário de atendimento',
    resposta_correta: 'c',
    explicacao: 'Uma equipe de suporte não precisa conhecer sua senha para realizar atividades legítimas.',
    pontos: 5,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual é a melhor defesa diante de uma solicitação inesperada?',
    alternativa_a: 'Verificar identidade e autorização',
    alternativa_b: 'Confiar na urgência',
    alternativa_c: 'Compartilhar dados para ajudar',
    alternativa_d: 'Ignorar as regras',
    resposta_correta: 'a',
    explicacao:
      'Pedidos atípicos devem ser checados quanto à identidade de quem pede e à autorização da ação.',
    pontos: 5,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual recurso acrescenta uma etapa de proteção ao login?',
    alternativa_a: 'Compartilhar códigos',
    alternativa_b: 'Reutilizar senhas',
    alternativa_c: 'Autenticação multifator',
    alternativa_d: 'Anotar senha na tela',
    resposta_correta: 'c',
    explicacao: 'Um segundo fator dificulta o acesso de quem tenha descoberto apenas a senha.',
    pontos: 5,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual hábito ajuda a manter senhas protegidas?',
    alternativa_a: 'Usar um gerenciador de senhas aprovado',
    alternativa_b: 'Repetir a mesma senha',
    alternativa_c: 'Usar o nome da empresa',
    alternativa_d: 'Enviar por e-mail',
    resposta_correta: 'a',
    explicacao: 'Gerenciadores autorizados ajudam a manter credenciais longas e diferentes entre sistemas.',
    pontos: 5,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer ao receber um código de autenticação não solicitado?',
    alternativa_a: 'Informar ao solicitante',
    alternativa_b: 'Publicar no grupo',
    alternativa_c: 'Não compartilhar e verificar a conta',
    alternativa_d: 'Usar em outro site',
    resposta_correta: 'c',
    explicacao: 'Códigos não solicitados podem indicar uma tentativa de autenticação que você não iniciou.',
    pontos: 5,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Como agir se houver suspeita de vazamento de senha?',
    alternativa_a: 'Enviar a senha ao colega',
    alternativa_b: 'Alterar a senha e comunicar a TI',
    alternativa_c: 'Esperar semanas',
    alternativa_d: 'Usar a mesma senha',
    resposta_correta: 'b',
    explicacao: 'Revogar credenciais comprometidas e comunicar o incidente limita o uso indevido da conta.',
    pontos: 5,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer com um anexo inesperado de origem desconhecida?',
    alternativa_a: 'Abrir para testar',
    alternativa_b: 'Não abrir e verificar a origem',
    alternativa_c: 'Desativar o antivírus',
    alternativa_d: 'Encaminhar sem verificar',
    resposta_correta: 'b',
    explicacao: 'Anexos inesperados podem conter código malicioso mesmo que o remetente pareça conhecido.',
    pontos: 5,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual arquivo exige cuidado mesmo quando parece um documento comum?',
    alternativa_a: 'Documento obtido no sistema interno',
    alternativa_b: 'Arquivo validado pela TI',
    alternativa_c: 'Arquivo que solicita habilitar macros sem justificativa',
    alternativa_d: 'Arquivo aprovado e esperado',
    resposta_correta: 'c',
    explicacao:
      'Macros podem executar automações; se o pedido for inesperado, não as habilite sem validação.',
    pontos: 5,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Por que conferir o remetente antes de baixar anexos?',
    alternativa_a: 'Para remover a senha',
    alternativa_b: 'Para identificar possíveis fraudes',
    alternativa_c: 'Para reduzir tamanho do arquivo',
    alternativa_d: 'Para melhorar a velocidade',
    resposta_correta: 'b',
    explicacao:
      'Atacantes podem falsificar remetentes ou comprometer contas para distribuir arquivos perigosos.',
    pontos: 5,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual é a conduta adequada diante de alerta de segurança sobre anexo?',
    alternativa_a: 'Ignorar',
    alternativa_b: 'Interromper a abertura e avisar a TI',
    alternativa_c: 'Forçar a abertura',
    alternativa_d: 'Desligar a proteção',
    resposta_correta: 'b',
    explicacao: 'Avisos de proteção devem interromper o processo até que a equipe avalie o arquivo.',
    pontos: 5,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que é recomendável ao usar uma rede Wi-Fi pública?',
    alternativa_a: 'Evitar acessar informações corporativas sensíveis sem proteção aprovada',
    alternativa_b: 'Ignorar avisos do navegador',
    alternativa_c: 'Desativar a VPN exigida',
    alternativa_d: 'Compartilhar senhas',
    resposta_correta: 'a',
    explicacao:
      'Redes compartilhadas podem ampliar riscos; siga a política corporativa antes de acessar recursos sensíveis.',
    pontos: 5,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer se o navegador alertar sobre certificado inválido?',
    alternativa_a: 'Prosseguir sempre',
    alternativa_b: 'Desativar avisos',
    alternativa_c: 'Interromper e verificar a legitimidade do site',
    alternativa_d: 'Informar credenciais',
    resposta_correta: 'c',
    explicacao:
      'Avisos de certificado podem sinalizar falha de configuração ou interceptação; valide o destino antes de prosseguir.',
    pontos: 5,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual prática ajuda na navegação segura?',
    alternativa_a: 'Instalar extensões aleatórias',
    alternativa_b: 'Clicar em anúncios desconhecidos',
    alternativa_c: 'Conferir o endereço dos sites',
    alternativa_d: 'Ignorar atualizações',
    resposta_correta: 'c',
    explicacao:
      'HTTPS protege a conexão, mas a grafia e o domínio precisam ser confirmados para evitar sites falsos.',
    pontos: 5,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Onde é mais seguro obter um programa de trabalho?',
    alternativa_a: 'Em fonte oficial ou homologada',
    alternativa_b: 'Em pop-ups aleatórios',
    alternativa_c: 'Em links enviados por desconhecidos',
    alternativa_d: 'Em sites de arquivos piratas',
    resposta_correta: 'a',
    explicacao:
      'Fontes autorizadas reduzem o risco de instalar versões modificadas ou maliciosas de programas.',
    pontos: 5,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual medida protege o celular usado para trabalho?',
    alternativa_a: 'Bloqueio de tela com autenticação',
    alternativa_b: 'Compartilhar o PIN',
    alternativa_c: 'Desativar atualizações',
    alternativa_d: 'Deixar sem senha',
    resposta_correta: 'a',
    explicacao:
      'O bloqueio de tela diminui o risco de terceiros lerem mensagens e acessarem aplicativos sem autorização.',
    pontos: 5,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer ao perder um aparelho corporativo?',
    alternativa_a: 'Comunicar imediatamente pelos canais oficiais',
    alternativa_b: 'Publicar dados do aparelho',
    alternativa_c: 'Ignorar o ocorrido',
    alternativa_d: 'Esperar aparecer',
    resposta_correta: 'a',
    explicacao:
      'O reporte rápido permite bloqueio do aparelho ou dos acessos enquanto ainda há tempo de reduzir exposição.',
    pontos: 5,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Como instalar aplicativos com mais segurança?',
    alternativa_a: 'Por links desconhecidos',
    alternativa_b: 'Por arquivos recebidos em grupos',
    alternativa_c: 'Desativando permissões de segurança',
    alternativa_d: 'Por lojas e fontes autorizadas',
    resposta_correta: 'd',
    explicacao: 'Fontes autorizadas tornam mais fácil verificar a procedência e a segurança dos aplicativos.',
    pontos: 5,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual cuidado tomar com permissões de aplicativos?',
    alternativa_a: 'Conceder apenas as necessárias',
    alternativa_b: 'Aceitar todas automaticamente',
    alternativa_c: 'Dar acesso irrestrito',
    alternativa_d: 'Ignorar solicitações',
    resposta_correta: 'a',
    explicacao:
      'Permissões além das necessárias ampliam o acesso do aplicativo a informações e recursos do telefone.',
    pontos: 5,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual é a ideia do menor privilégio?',
    alternativa_a: 'Manter acesso após desligamento',
    alternativa_b: 'Dar somente o acesso necessário à função',
    alternativa_c: 'Usar conta compartilhada',
    alternativa_d: 'Liberar acesso total a todos',
    resposta_correta: 'b',
    explicacao: 'Privilégio mínimo limita o acesso ao necessário e diminui o impacto de erros e vazamentos.',
    pontos: 5,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer ao receber um arquivo confidencial por engano?',
    alternativa_a: 'Não divulgar e informar o responsável',
    alternativa_b: 'Compartilhar com colegas',
    alternativa_c: 'Publicar no grupo',
    alternativa_d: 'Salvar em nuvem pessoal',
    resposta_correta: 'a',
    explicacao:
      'Um arquivo recebido por engano não autoriza sua divulgação; o fato deve ser comunicado para correção.',
    pontos: 5,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Quem deve acessar informações restritas?',
    alternativa_a: 'Qualquer colaborador',
    alternativa_b: 'Visitantes',
    alternativa_c: 'Pessoas autorizadas com necessidade de acesso',
    alternativa_d: 'Todos os fornecedores',
    resposta_correta: 'c',
    explicacao:
      'Necessidade de acesso e autorização devem ser avaliadas juntas antes de liberar informações restritas.',
    pontos: 5,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer ao identificar uma permissão indevida?',
    alternativa_a: 'Compartilhar a credencial',
    alternativa_b: 'Utilizar o acesso',
    alternativa_c: 'Ignorar',
    alternativa_d: 'Reportar para correção',
    resposta_correta: 'd',
    explicacao:
      'Reportar permissões excessivas ajuda a impedir que dados sejam vistos por pessoas indevidas.',
    pontos: 5,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual prática protege documentos físicos confidenciais?',
    alternativa_a: 'Descartá-los no lixo comum',
    alternativa_b: 'Deixá-los na impressora',
    alternativa_c: 'Exibi-los na recepção',
    alternativa_d: 'Guardá-los em local com acesso controlado',
    resposta_correta: 'd',
    explicacao: 'Documentos impressos podem conter informação sigilosa e precisam de guarda controlada.',
    pontos: 5,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Como agir com visitante em área restrita?',
    alternativa_a: 'Emprestar o crachá',
    alternativa_b: 'Abrir todas as portas',
    alternativa_c: 'Seguir o procedimento de identificação e acompanhamento',
    alternativa_d: 'Deixar circular sozinho',
    resposta_correta: 'c',
    explicacao:
      'Crachá e acompanhamento dificultam a entrada de pessoas não identificadas em áreas restritas.',
    pontos: 5,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer ao encontrar um crachá desconhecido?',
    alternativa_a: 'Usá-lo para testar',
    alternativa_b: 'Entregá-lo a qualquer pessoa',
    alternativa_c: 'Encaminhar à segurança ou responsável',
    alternativa_d: 'Guardar sem avisar',
    resposta_correta: 'c',
    explicacao: 'Credenciais físicas encontradas devem ser entregues à equipe responsável, não utilizadas.',
    pontos: 5,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual medida ajuda a evitar visualização indevida de dados?',
    alternativa_a: 'Anotar senhas na mesa',
    alternativa_b: 'Deixar monitor virado para visitantes',
    alternativa_c: 'Manter relatórios abertos',
    alternativa_d: 'Bloquear a tela ao se ausentar',
    resposta_correta: 'd',
    explicacao: 'Uma sessão aberta pode revelar dados mesmo quando o usuário se afasta por pouco tempo.',
    pontos: 5,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual é o primeiro passo ao suspeitar de um incidente?',
    alternativa_a: 'Publicar nas redes sociais',
    alternativa_b: 'Apagar todas as evidências',
    alternativa_c: 'Comunicar rapidamente pelo canal definido',
    alternativa_d: 'Esconder o ocorrido',
    resposta_correta: 'c',
    explicacao: 'Suspeitas não precisam ser comprovadas pelo colaborador antes de serem comunicadas.',
    pontos: 5,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Por que relatar incidentes rapidamente?',
    alternativa_a: 'Para evitar registros',
    alternativa_b: 'Para permitir contenção e resposta mais rápidas',
    alternativa_c: 'Para dispensar a TI',
    alternativa_d: 'Para garantir que nada será investigado',
    resposta_correta: 'b',
    explicacao:
      'Quanto menor o intervalo até o reporte, maior a chance de conter o problema e preservar evidências.',
    pontos: 5,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Ao notar um comportamento anormal no sistema, o que fazer?',
    alternativa_a: 'Compartilhar senhas',
    alternativa_b: 'Tentar invadir para investigar',
    alternativa_c: 'Ignorar por dias',
    alternativa_d: 'Seguir o procedimento de reporte',
    resposta_correta: 'd',
    explicacao: 'Anomalias de sistema devem ser avaliadas por quem executa o processo oficial de resposta.',
    pontos: 5,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Como tratar possíveis evidências de incidente?',
    alternativa_a: 'Editar os arquivos',
    alternativa_b: 'Preservar e seguir orientações da equipe responsável',
    alternativa_c: 'Enviar a contatos externos',
    alternativa_d: 'Apagar tudo',
    resposta_correta: 'b',
    explicacao: 'Apagar ou alterar evidências por conta própria pode impedir a reconstrução do ocorrido.',
    pontos: 5,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Em um ataque com e-mail suspeito e pedido de senha, qual é a melhor reação?',
    alternativa_a: 'Compartilhar a mensagem com clientes',
    alternativa_b: 'Não fornecer dados e reportar a tentativa',
    alternativa_c: 'Atender à urgência',
    alternativa_d: 'Clicar para confirmar',
    resposta_correta: 'b',
    explicacao:
      'Fraudes com pedido de senha podem fornecer a primeira credencial usada em uma cadeia de ataque.',
    pontos: 5,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Se uma conta apresentar acessos não reconhecidos, o que fazer?',
    alternativa_a: 'Desativar registros',
    alternativa_b: 'Comunicar a TI e seguir as medidas de proteção',
    alternativa_c: 'Ignorar',
    alternativa_d: 'Compartilhar o login',
    resposta_correta: 'b',
    explicacao:
      'Acessos não reconhecidos podem indicar roubo de credenciais e precisam de resposta coordenada.',
    pontos: 5,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual atitude ajuda a reduzir impactos de ataques combinados?',
    alternativa_a: 'Aplicar várias medidas de proteção e atenção',
    alternativa_b: 'Depender só de uma senha',
    alternativa_c: 'Abrir qualquer arquivo',
    alternativa_d: 'Ignorar alertas',
    resposta_correta: 'a',
    explicacao:
      'Proteções complementares ajudam a barrar ataques em etapas diferentes, não apenas na entrada.',
    pontos: 5,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Ao receber instruções suspeitas por vários canais, o que fazer?',
    alternativa_a: 'Responder a todas',
    alternativa_b: 'Confirmar por canais oficiais independentes',
    alternativa_c: 'Instalar o aplicativo pedido',
    alternativa_d: 'Confiar porque são várias mensagens',
    resposta_correta: 'b',
    explicacao:
      'A repetição do pedido por diversos canais não elimina o risco de fraude; valide por contatos independentes.',
    pontos: 5,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual atitude mostra uma cultura preventiva de segurança?',
    alternativa_a: 'Desativar proteções',
    alternativa_b: 'Relatar riscos antes que causem danos',
    alternativa_c: 'Compartilhar senhas para agilizar',
    alternativa_d: 'Ignorar pequenos incidentes',
    resposta_correta: 'b',
    explicacao: 'Reportar riscos precocemente dá à equipe a oportunidade de agir antes do incidente.',
    pontos: 5,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Como aplicar o aprendizado do curso no trabalho?',
    alternativa_a: 'Adotar boas práticas diariamente',
    alternativa_b: 'Apenas quando a TI solicitar',
    alternativa_c: 'Somente durante avaliações',
    alternativa_d: 'Somente fora do expediente',
    resposta_correta: 'a',
    explicacao: 'Hábitos cotidianos tornam as medidas de segurança efetivas além do momento do treinamento.',
    pontos: 5,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'facil',
    enunciado: 'O que fazer ao perceber uma prática insegura recorrente?',
    alternativa_a: 'Ignorar para evitar conflito',
    alternativa_b: 'Divulgar dados do colega',
    alternativa_c: 'Orientar e comunicar pelos canais adequados',
    alternativa_d: 'Repetir a prática',
    resposta_correta: 'c',
    explicacao:
      'Orientação e reporte permitem corrigir práticas inseguras antes que causem exposição ou prejuízo.',
    pontos: 5,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'facil',
    enunciado: 'Qual é o objetivo de manter atenção contínua à segurança?',
    alternativa_a: 'Substituir todas as ferramentas',
    alternativa_b: 'Impedir o uso de tecnologia',
    alternativa_c: 'Reduzir riscos e proteger pessoas e informações',
    alternativa_d: 'Eliminar a necessidade de políticas',
    resposta_correta: 'c',
    explicacao: 'A atenção contínua ajuda a antecipar riscos e proteger pessoas, informações e processos.',
    pontos: 5,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma equipe recebe uma solicitação urgente de exportação de dados enviada de uma conta aparentemente interna. Qual controle reduz melhor o risco de fraude?',
    alternativa_a: 'Pedir apenas o nome do solicitante',
    alternativa_b: 'Enviar os dados porque o domínio parece interno',
    alternativa_c: 'Confirmar a solicitação por canal independente e verificar autorização',
    alternativa_d: 'Ignorar os registros da solicitação',
    resposta_correta: 'c',
    explicacao:
      'A aparência de uma conta interna não comprova a autorização para exportar dados; confirme o pedido de modo independente.',
    pontos: 15,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Após um incidente causado por erro humano, qual abordagem contribui mais para a prevenção de recorrências?',
    alternativa_a: 'Punir sem investigar causas',
    alternativa_b: 'Eliminar todos os acessos',
    alternativa_c: 'Evitar registrar o incidente',
    alternativa_d: 'Analisar causas, ajustar controles e orientar a equipe',
    resposta_correta: 'd',
    explicacao:
      'Investigar o contexto do erro e fortalecer controles costuma prevenir recorrências melhor do que apenas culpar a pessoa.',
    pontos: 15,
    aula_slug: 'introducao-lgpd',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma base contém nomes, CPFs e dados de pagamento. Qual decisão é mais apropriada antes de compartilhá-la com um fornecedor?',
    alternativa_a: 'Verificar finalidade, autorização, minimização e canal seguro',
    alternativa_b: 'Trocar o nome do arquivo',
    alternativa_c: 'Publicar um link aberto',
    alternativa_d: 'Enviar integralmente por e-mail',
    resposta_correta: 'a',
    explicacao:
      'Antes de repassar dados de clientes, é preciso confirmar necessidade, destinatário autorizado e canal de proteção.',
    pontos: 15,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um colaborador precisa analisar dados sensíveis apenas por dois dias. Qual controle é mais adequado?',
    alternativa_a: 'Conceder acesso mínimo e temporário, com revogação posterior',
    alternativa_b: 'Compartilhar a senha do gestor',
    alternativa_c: 'Enviar uma cópia para conta pessoal',
    alternativa_d: 'Conceder acesso permanente à pasta inteira',
    resposta_correta: 'a',
    explicacao:
      'A autorização deve acompanhar a duração da atividade; manter acesso após o término amplia a exposição.',
    pontos: 15,
    aula_slug: 'o-que-estamos-protegendo',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um sistema mantém os dados secretos e íntegros, mas fica indisponível durante uma emergência. Qual pilar da tríade CIA falhou?',
    alternativa_a: 'Autenticidade',
    alternativa_b: 'Integridade',
    alternativa_c: 'Disponibilidade',
    alternativa_d: 'Confidencialidade',
    resposta_correta: 'c',
    explicacao:
      'Um sistema pode preservar sigilo e exatidão e ainda falhar se não estiver acessível na hora necessária.',
    pontos: 15,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um atacante altera silenciosamente o valor de uma transferência sem impedir o acesso ao sistema. Qual propriedade foi comprometida principalmente?',
    alternativa_a: 'Integridade',
    alternativa_b: 'Confidencialidade',
    alternativa_c: 'Não repúdio',
    alternativa_d: 'Disponibilidade',
    resposta_correta: 'a',
    explicacao:
      'Mudar valores de uma transferência altera a informação; a questão central é integridade, não disponibilidade.',
    pontos: 15,
    aula_slug: 'pilares-da-seguranca',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma estação começa a executar processos desconhecidos após instalar um aplicativo não autorizado. Qual é a ação inicial mais segura?',
    alternativa_a: 'Desativar o antivírus',
    alternativa_b: 'Continuar usando para coletar provas por conta própria',
    alternativa_c: 'Acionar a resposta a incidentes e seguir orientação de isolamento',
    alternativa_d: 'Compartilhar o instalador com colegas',
    resposta_correta: 'c',
    explicacao:
      'Processos desconhecidos após software não autorizado exigem comunicação e avaliação da equipe responsável.',
    pontos: 15,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma organização quer reduzir o impacto de malware que explora falhas conhecidas. Qual combinação é mais eficaz?',
    alternativa_a: 'Permitir instalação irrestrita',
    alternativa_b: 'Correções de segurança, menor privilégio e proteção de endpoint',
    alternativa_c: 'Somente troca periódica de monitor',
    alternativa_d: 'Desativar atualizações automáticas',
    resposta_correta: 'b',
    explicacao:
      'Correções e permissões restritas reduzem o espaço de ação de programas maliciosos, sem eliminar totalmente o risco.',
    pontos: 15,
    aula_slug: 'inimigo-disfarcado',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um e-mail usa domínio visualmente parecido com o oficial e solicita redefinição de senha. Qual verificação é mais confiável?',
    alternativa_a: 'Responder pedindo confirmação',
    alternativa_b: 'Acessar o serviço pelo endereço conhecido, sem usar o link recebido',
    alternativa_c: 'Abrir o anexo para validar',
    alternativa_d: 'Confiar no logotipo',
    resposta_correta: 'b',
    explicacao:
      'Um domínio parecido com o verdadeiro é insuficiente para validar um pedido de redefinição de senha.',
    pontos: 15,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma mensagem fraudulenta aparece em uma conversa legítima após comprometimento da conta de um fornecedor. O que fazer?',
    alternativa_a: 'Desativar filtros de e-mail',
    alternativa_b: 'Confiar no histórico da conversa',
    alternativa_c: 'Validar a solicitação por canal independente e reportar a suspeita',
    alternativa_d: 'Enviar os dados porque o contato é conhecido',
    resposta_correta: 'c',
    explicacao:
      'Até contas legítimas podem ser comprometidas; a solicitação fora do padrão precisa de confirmação independente.',
    pontos: 15,
    aula_slug: 'phishing',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um suposto diretor pede transferência urgente e proíbe ligações de confirmação. Qual sinal exige maior atenção?',
    alternativa_a: 'Pressão para ignorar procedimentos de verificação',
    alternativa_b: 'Uso de linguagem formal',
    alternativa_c: 'Referência a um projeto real',
    alternativa_d: 'Mensagem enviada em horário comercial',
    resposta_correta: 'a',
    explicacao:
      'A pressão para não validar um pedido é um sinal de manipulação e tentativa de contornar controles.',
    pontos: 15,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um atacante reúne cargos e projetos públicos antes de abordar funcionários com pedidos personalizados. Qual é a principal defesa organizacional?',
    alternativa_a: 'Treinamento aliado à verificação independente e controles de autorização',
    alternativa_b: 'Aceitar pedidos com dados internos corretos',
    alternativa_c: 'Proibir todas as redes sociais sem outras medidas',
    alternativa_d: 'Confiar no cargo informado',
    resposta_correta: 'a',
    explicacao:
      'Dados públicos podem tornar o pretexto convincente, mas verificações independentes continuam necessárias.',
    pontos: 15,
    aula_slug: 'engenharia-social',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma conta protegida por MFA recebe dezenas de pedidos de aprovação inesperados. Qual reação é adequada?',
    alternativa_a: 'Desativar MFA',
    alternativa_b: 'Aprovar para encerrar notificações',
    alternativa_c: 'Recusar, comunicar a TI e revisar a segurança da conta',
    alternativa_d: 'Compartilhar o código com o suporte não verificado',
    resposta_correta: 'c',
    explicacao:
      'Notificações repetidas de MFA podem ser tentativa de forçar uma aprovação; recuse e informe a segurança.',
    pontos: 15,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um colega perdeu o acesso à conta e pede sua senha pessoal para concluir uma tarefa urgente. Qual solução mantém a segurança?',
    alternativa_a: 'Enviar sua senha por mensagem que desaparece após a leitura.',
    alternativa_b: 'Solicitar que o suporte restabeleça o acesso individual do colega pelos canais oficiais.',
    alternativa_c: 'Desativar o MFA para facilitar o acesso à conta.',
    alternativa_d: 'Compartilhar sua senha apenas até o fim do expediente.',
    resposta_correta: 'b',
    explicacao:
      'Credenciais são individuais. A recuperação de acesso deve seguir o processo autorizado, sem compartilhamento de senhas.',
    pontos: 15,
    aula_slug: 'senhas',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um arquivo de planilha solicita habilitar macros para visualizar um relatório inesperado. Qual conduta é correta?',
    alternativa_a: 'Encaminhar a todos para comparar',
    alternativa_b: 'Não habilitar macros e verificar a origem pelo canal oficial',
    alternativa_c: 'Habilitar macros e conferir depois',
    alternativa_d: 'Desativar o antivírus',
    resposta_correta: 'b',
    explicacao:
      'Um arquivo que exige macros sem justificativa pode executar código além de exibir uma planilha.',
    pontos: 15,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um arquivo com nome de relatório instala, após ser executado, um programa que monitora atividades do usuário. Qual interpretação e resposta são mais adequadas?',
    alternativa_a:
      'O disfarce é compatível com malware; interromper o uso inseguro e comunicar a suspeita conforme o procedimento oficial.',
    alternativa_b: 'Como o relatório abriu normalmente, não há risco de coleta de dados.',
    alternativa_c: 'Se a extensão não for exibida no explorador, o arquivo é necessariamente confiável.',
    alternativa_d: 'A prioridade é encaminhar o instalador para outros colegas compararem o comportamento.',
    resposta_correta: 'a',
    explicacao:
      'Trojans podem aparentar legitimidade e spywares podem monitorar atividades. A aula recomenda evitar arquivos suspeitos e acionar a equipe responsável.',
    pontos: 15,
    aula_slug: 'arquivos-maliciosos',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Ao acessar um portal corporativo, o navegador apresenta alerta de certificado e endereço inesperado. Qual é a melhor ação?',
    alternativa_a: 'Inserir apenas a senha',
    alternativa_b: 'Ignorar o aviso por estar em HTTPS',
    alternativa_c: 'Interromper o acesso e confirmar o endereço por canal confiável',
    alternativa_d: 'Desativar a verificação de certificados',
    resposta_correta: 'c',
    explicacao:
      'Quando endereço e certificado apresentam inconsistências, não envie credenciais até confirmar o serviço.',
    pontos: 15,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'dificil',
    enunciado: 'Em Wi-Fi público, qual risco uma VPN corporativa aprovada ajuda a mitigar principalmente?',
    alternativa_a: 'Phishing em qualquer site',
    alternativa_b: 'Roubo físico do notebook',
    alternativa_c: 'Interceptação de tráfego entre o dispositivo e o ponto de saída protegido',
    alternativa_d: 'Instalação automática de atualizações',
    resposta_correta: 'c',
    explicacao:
      'Uma VPN corporativa pode proteger o tráfego no trecho tunelado, mas não torna confiável qualquer site acessado.',
    pontos: 15,
    aula_slug: 'navegacao-segura',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um colaborador descobre um aplicativo desconhecido no celular corporativo, com acesso a mensagens e contatos. Qual resposta combina prevenção e contenção?',
    alternativa_a:
      'Reportar a suspeita imediatamente, não conceder novos acessos e seguir orientação da TI para avaliar e remover o aplicativo com segurança.',
    alternativa_b:
      'Ignorar a instalação porque dispositivos móveis não fazem parte da infraestrutura corporativa.',
    alternativa_c: 'Compartilhar os dados de acesso com colegas para que testem o mesmo aplicativo.',
    alternativa_d: 'Desativar o bloqueio de tela para que o aplicativo consiga concluir as atualizações.',
    resposta_correta: 'a',
    explicacao:
      'Um aplicativo não autorizado com permissões sensíveis pode expor informações. A equipe responsável deve avaliar e orientar a contenção do risco.',
    pontos: 15,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um aplicativo móvel solicita acesso permanente a contatos, câmera e localização sem necessidade aparente. Qual princípio aplicar?',
    alternativa_a: 'Aceitar tudo para evitar falhas',
    alternativa_b: 'Desativar a proteção do sistema',
    alternativa_c: 'Conceder apenas permissões necessárias e revisar a legitimidade',
    alternativa_d: 'Compartilhar dados com o desenvolvedor',
    resposta_correta: 'c',
    explicacao: 'Conceder permissões mínimas é uma forma de reduzir o impacto de aplicativos suspeitos.',
    pontos: 15,
    aula_slug: 'seguranca-no-celular',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um analista muda de área, mas mantém acesso aos dados do setor anterior. Qual falha de controle isso exemplifica?',
    alternativa_a: 'Disponibilidade excessiva',
    alternativa_b: 'Autenticação multifator',
    alternativa_c: 'Criptografia de dados em repouso',
    alternativa_d: 'Ausência de revisão e revogação de privilégios',
    resposta_correta: 'd',
    explicacao:
      'Quando alguém muda de função, acessos antigos devem ser reavaliados para evitar privilégios desnecessários.',
    pontos: 15,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma aplicação utiliza a mesma conta administrativa para todas as tarefas rotineiras. Qual melhoria é mais adequada?',
    alternativa_a: 'Separar contas privilegiadas e aplicar menor privilégio',
    alternativa_b: 'Remover exigência de autenticação',
    alternativa_c: 'Compartilhar a senha com toda a equipe',
    alternativa_d: 'Desabilitar auditoria',
    resposta_correta: 'a',
    explicacao: 'Contas administrativas devem ficar restritas a tarefas que realmente exigem esses poderes.',
    pontos: 15,
    aula_slug: 'vazamento-de-dados',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um visitante entra atrás de um funcionário em uma área restrita sem apresentar credencial. Como é conhecido esse risco?',
    alternativa_a: 'Tailgating ou entrada por acompanhamento indevido',
    alternativa_b: 'Backup incremental',
    alternativa_c: 'Phishing por e-mail',
    alternativa_d: 'Criptografia',
    resposta_correta: 'a',
    explicacao:
      'Sem identificação, uma pessoa pode entrar atrás de um funcionário; esse risco é conhecido como tailgating.',
    pontos: 15,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Documentos confidenciais são encontrados na bandeja da impressora compartilhada. Qual controle é mais eficaz?',
    alternativa_a: 'Permitir acesso de visitantes à impressora',
    alternativa_b: 'Impressão segura com liberação por autenticação e recolhimento imediato',
    alternativa_c: 'Fotografar os documentos para controle',
    alternativa_d: 'Deixar documentos para retirada posterior',
    resposta_correta: 'b',
    explicacao:
      'Impressões esquecidas podem ser vistas por terceiros; autenticação para liberação reduz a exposição.',
    pontos: 15,
    aula_slug: 'seguranca-na-empresa',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Após identificar atividade suspeita em um computador, por que evitar apagar arquivos e logs por iniciativa própria?',
    alternativa_a: 'Porque os logs nunca contêm dados relevantes',
    alternativa_b: 'Porque isso acelera o malware',
    alternativa_c: 'Porque somente o usuário pode restaurá-los',
    alternativa_d: 'Porque pode destruir evidências úteis à investigação',
    resposta_correta: 'd',
    explicacao:
      'Arquivos e registros podem ajudar a equipe a determinar como o incidente começou e se propagou.',
    pontos: 15,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'dificil',
    enunciado: 'Um incidente pode envolver vazamento de dados pessoais. Qual resposta é mais adequada?',
    alternativa_a:
      'Acionar o plano de resposta e as áreas responsáveis para avaliar contenção e obrigações legais',
    alternativa_b: 'Ignorar até haver reclamações',
    alternativa_c: 'Divulgar detalhes publicamente de imediato',
    alternativa_d: 'Formatar todos os equipamentos sem análise',
    resposta_correta: 'a',
    explicacao:
      'Possíveis vazamentos de dados exigem avaliação de áreas responsáveis, inclusive quanto às obrigações legais.',
    pontos: 15,
    aula_slug: 'resposta-a-incidentes',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um invasor usa credenciais obtidas por phishing para acessar arquivos e enviar novas mensagens internas. Qual medida combinada limita melhor o avanço?',
    alternativa_a: 'Confiar em mensagens internas',
    alternativa_b: 'Apenas trocar o papel de parede',
    alternativa_c: 'Desativar monitoramento',
    alternativa_d: 'Revogar sessões, redefinir credenciais, investigar acessos e reforçar MFA',
    resposta_correta: 'd',
    explicacao:
      'Revogar sessões comprometidas e investigar atividades limita a continuidade de uma cadeia de ataque.',
    pontos: 15,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Um ataque combina ligação falsa de suporte com instalação de software remoto. Qual controle preventivo é mais abrangente?',
    alternativa_a: 'Permitir ferramentas remotas sem aprovação',
    alternativa_b: 'Compartilhar códigos de autenticação',
    alternativa_c: 'Verificação de identidade, restrição de instalação e conscientização',
    alternativa_d: 'Confiar em qualquer chamada com número local',
    resposta_correta: 'c',
    explicacao:
      'Controlar instalações e validar o suporte ajuda a bloquear tanto a manipulação da pessoa quanto o acesso remoto indevido.',
    pontos: 15,
    aula_slug: 'empresa-sob-ataque',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Uma empresa registra muitos quase-incidentes, mas poucos relatos formais. Qual iniciativa fortalece a cultura preventiva?',
    alternativa_a: 'Responsabilizar automaticamente quem reporta',
    alternativa_b: 'Eliminar canais de reporte',
    alternativa_c: 'Ocultar indicadores de segurança',
    alternativa_d: 'Facilitar reporte sem retaliação e divulgar aprendizados',
    resposta_correta: 'd',
    explicacao: 'Uma cultura que acolhe relatos facilita descobrir falhas e aprender com quase-incidentes.',
    pontos: 15,
    aula_slug: 'missao-final',
  },
  {
    dificuldade: 'dificil',
    enunciado:
      'Após o treinamento, a organização deseja verificar mudança real de comportamento. Qual indicador é mais útil?',
    alternativa_a: 'Somente número de slides apresentados',
    alternativa_b: 'Tendência de reporte oportuno e adesão a controles em simulações e auditorias',
    alternativa_c: 'Apenas taxa de presença',
    alternativa_d: 'Quantidade de e-mails enviados pela TI',
    resposta_correta: 'b',
    explicacao:
      'Medidas de comportamento, como rapidez de reporte e adesão a controles, ajudam a avaliar o resultado da capacitação.',
    pontos: 15,
    aula_slug: 'missao-final',
  },
];

const COLUNAS_QUESTAO = [
  'enunciado',
  'alternativa_a',
  'alternativa_b',
  'alternativa_c',
  'alternativa_d',
  'resposta_correta',
  'explicacao',
  'pontos',
];

// [nome, descricao, tipo_criterio, quantidade, dificuldade]
const BADGES = [
  ['Aprendiz Dedicado', 'Concluiu 5 aulas.', 'aulas_concluidas', 5, null],
  ['Sentinela', 'Concluiu 10 aulas.', 'aulas_concluidas', 10, null],
  ['Graduado', 'Concluiu 15 aulas.', 'aulas_concluidas', 15, null],
  ['Aluno Nota 10', 'Acertou todas as perguntas de todas as aulas.', 'aulas_gabaritadas', null, null],
  ['Curioso da Trivia', 'Terminou sua primeira rodada de trivia.', 'primeira_trivia', null, null],
  ['Frequentador da Trivia', 'Terminou 10 rodadas de trivia.', 'trivia_rodadas', 10, null],
  ['Recruta da Trivia', 'Acertou todas as questões fáceis da trivia.', 'trivia_completa', null, 'facil'],
  ['Agente da Trivia', 'Acertou todas as questões médias da trivia.', 'trivia_completa', null, 'media'],
  ['Elite da Trivia', 'Acertou todas as questões difíceis da trivia.', 'trivia_completa', null, 'dificil'],
  [
    'Mestre da Trivia',
    'Acertou todas as questões da trivia, nos três níveis.',
    'trivia_completa',
    null,
    null,
  ],
  ['Rodada Perfeita', 'Acertou todas as questões de uma rodada de trivia.', 'rodada_perfeita', null, null],
  ['Centena', 'Chegou a 100 pontos.', 'pontos', 100, null],
  ['Pontuação de Elite', 'Chegou a 300 pontos.', 'pontos', 300, null],
];

const LOCK_SEED = 4_242_001;

// Questões do seed como linhas SQL (um parâmetro só, em vez de uma query por questão).
const TRIVIA_SQL = `jsonb_to_recordset($1::jsonb) AS s (dificuldade text, enunciado text, alternativa_a text,
  alternativa_b text, alternativa_c text, alternativa_d text, resposta_correta text, explicacao text,
  pontos int, aula_slug text)`;

async function semear() {
  await transacao(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK_SEED]);
    const trivia = JSON.stringify(TRIVIA_QUESTOES);

    // Insere só as questões que faltam (pelo enunciado): banco já semeado recebe as novas, e o que o admin
    // editou ou desativou fica como está. Cada questão vai para a aula do seu slug.
    const { rowCount: inseridas } = await c.query(
      `INSERT INTO questoes_trivia (dificuldade, ${COLUNAS_QUESTAO.join(', ')}, aula_referencia_id)
       SELECT s.dificuldade, ${COLUNAS_QUESTAO.map((coluna) => `s.${coluna}`).join(', ')}, a.id
       FROM ${TRIVIA_SQL} LEFT JOIN aulas a ON a.slug = s.aula_slug
       WHERE NOT EXISTS (SELECT 1 FROM questoes_trivia q WHERE q.enunciado = s.enunciado)`,
      [trivia],
    );
    if (inseridas) logger.info('seed aplicado', { trivia: inseridas });

    // Questão sem aula fica fora do sorteio. Se o seed rodou antes de a aula ser importada (conteúdo
    // inválido na subida, `npm run seed` sozinho), liga a cada subida, assim que ela existir.
    const { rowCount: religadas } = await c.query(
      `UPDATE questoes_trivia q SET aula_referencia_id = a.id
       FROM ${TRIVIA_SQL} JOIN aulas a ON a.slug = s.aula_slug
       WHERE q.enunciado = s.enunciado AND q.aula_referencia_id IS NULL`,
      [trivia],
    );
    if (religadas) logger.info('questões da trivia ligadas às aulas', { religadas });

    // Nome único (badges_nome_uk, migration 007): a conquista que já existe fica como está.
    await c.query(
      `INSERT INTO badges (nome, descricao, tipo_criterio, aula_id)
       SELECT 'Primeiros Passos', 'Concluiu a primeira aula.', 'aula_concluida', id FROM aulas
       ORDER BY ordem LIMIT 1
       ON CONFLICT (nome) DO NOTHING`,
    );
    for (const badge of BADGES) {
      await c.query(
        `INSERT INTO badges (nome, descricao, tipo_criterio, quantidade, dificuldade)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nome) DO NOTHING`,
        badge,
      );
    }
  });
}

module.exports = { semear };

if (require.main === module) {
  semear()
    .then(() => pool.end())
    .catch((erro) => {
      logger.error('falha no seed', { erro });
      process.exit(1);
    });
}
