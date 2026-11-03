CREATE TABLE `agentes` (
	`id` text PRIMARY KEY NOT NULL,
	`nome` text NOT NULL,
	`descricao` text DEFAULT '' NOT NULL,
	`categoria` text DEFAULT '' NOT NULL,
	`prompt` text NOT NULL,
	`modelo` text,
	`embutido` integer DEFAULT false NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	`criado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `configuracoes` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL,
	`atualizado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `falas` (
	`id` text PRIMARY KEY NOT NULL,
	`sessao_id` text NOT NULL,
	`canal` text NOT NULL,
	`falante` text,
	`texto` text NOT NULL,
	`inicio_ms` integer NOT NULL,
	`fim_ms` integer NOT NULL,
	FOREIGN KEY (`sessao_id`) REFERENCES `sessoes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `falas_sessao_idx` ON `falas` (`sessao_id`,`inicio_ms`);--> statement-breakpoint
CREATE TABLE `sessoes` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text DEFAULT 'Sessão sem título' NOT NULL,
	`agente_id` text NOT NULL,
	`iniciada_em` integer NOT NULL,
	`encerrada_em` integer,
	`resumo` text
);
--> statement-breakpoint
CREATE TABLE `uso_ia` (
	`id` text PRIMARY KEY NOT NULL,
	`criado_em` integer NOT NULL,
	`sessao_id` text,
	`provedor` text NOT NULL,
	`modelo` text NOT NULL,
	`origem` text NOT NULL,
	`tokens_entrada` integer DEFAULT 0 NOT NULL,
	`tokens_saida` integer DEFAULT 0 NOT NULL,
	`tokens_cache` integer DEFAULT 0 NOT NULL,
	`custo_usd` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `uso_criado_idx` ON `uso_ia` (`criado_em`);