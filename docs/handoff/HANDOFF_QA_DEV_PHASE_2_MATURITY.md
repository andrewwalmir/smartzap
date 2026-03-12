# Handoff para DEV: Fase 2 - Maturidade Arquitetural (Webhook)

Data: 2026-03-12
Origem: QA (@Quinn) / Product Owner
Destino: DEV & DevOps

A arquitetura base do Webhook (Catch & Queue + Idempotência Hierárquica) implementada na rodada anterior blindou o HangarZap contra timeouts da Meta e concorrência no banco. O sistema agora é sólido.

Para o próximo passo evolutivo, onde o foco é **Escalabilidade Enterprise e Tolerância a Falhas**, definimos 3 frentes táticas a serem implementadas. 

## 1. Dead Letter Queue (DLQ) e Retries Seguros no Worker
**Problema a resolver:** Se o Supabase apresentar downtime ou a API da OpenAI/Bot oscilar violentamente durante o processamento do Worker (que consome o QStash), a mensagem será perdida ou processada em excesso e descartada sem visibilidade.
**Escopo para Execução:**
- Configurar uma Fila Secundária (DLQ) no Painel do Upstash/QStash para capturar mensagens que excedam o `max_retries` (Ex: 3 a 5 tentativas).
- Melhorar o tratamento de erro no Worker (arquivo `app/api/webhook/route.ts` - fluxo assíncrono). Quando um erro crítico de parse ou infraestrutura ocorrer (ex: exceção não tratada na gravação de DB), lançar HTTP 500 no Worker indica ao QStash para realizar Retry usando backoff exponencial.
- Retornar HTTP 200 no Worker se for um "erro de negócio esperado" (Ex: Usuário mandou mídia não suportada), evitando gastar Retries na infra e poluindo log.

## 2. Observabilidade (Correlation ID Ponta-a-Ponta)
**Problema a resolver:** Falta de rastreabilidade rápida. Quando ocorrer um problema com um contato específico, será difícil cruzar os logs de borda (recebimento do Webhook) com os logs internos (execução do Worker Assíncrono / Trigger do Workflow).
**Escopo para Execução:**
- Na entrada síncrona do Webhook (`app/api/webhook/route.ts`), gerar ou extrair um Identificador Único Universal: `const correlationId = crypto.randomUUID()`.
- Anexar esse `correlationId` nos Headers ou no Corpo Wrapper publicado no Upstash via `client.publish()`.
- O Worker ao receber a mensagem, extrai o ID e prefixa todos os `console.log` / rastreamento de erro, ex: `[REQ-1234] Processando contato X`.
- Bônus: Gravar esse `correlationId` nos "Workflow Traces" persistidos no Banco de Dados para debugging futuro pela tela do administrador.

## 3. Segurança de Borda: Rate Limiting & Prevenção Contra Abuso DDoS
**Problema a resolver:** Como o endpoint `/api/webhook` precisa estar aberto para a Internet, a cada requisição maliciosa que chega validamos a assinatura `X-Hub-Signature-256`. Um atacante disparando milhares de requests com assinaturas falsas esgotaria a CPU/Vercel e o banco rotacionando lógicas em vão.
**Escopo para Execução:**
- Integrar o `@upstash/ratelimit` nativamente no topo do arquivo da Rota Síncrona.
- Usar o IP do requisitante como chave local de *Rate Limiting*.
- Limite flexível: Ex: Configurar para permitir um limite estrito SE a requisição for negada por "Assinatura Inválida". (Ex: Máximo de 15 assinaturas falsas por IP por minuto. Caso invada o limite, retornar estático HTTP 429 Too Many Requests antes de sequer comparar os hashes).
- Não bloquear os Ranges IP oficiais da infraestrutura da Meta (Whitelisting caso aplicável, se identificados via DNS/Header verificado).

---
**Prioridade Sugerida de Entrega:**
Começamos pelo **Item 1 (DLQ & Retries)**, pois afeta diretamente a conversão de *leads* e impede perda de dados fidedignos sob estresse pesado na base atual de produção.
