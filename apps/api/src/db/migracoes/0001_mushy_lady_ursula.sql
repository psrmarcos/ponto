CREATE TABLE `mensagens_chat` (
	`id` text PRIMARY KEY NOT NULL,
	`sessao_id` text,
	`conversa_id` text NOT NULL,
	`papel` text NOT NULL,
	`texto` text NOT NULL,
	`automatica` integer DEFAULT false NOT NULL,
	`modelo` text,
	`custo_usd` real,
	`criado_em` integer NOT NULL,
	FOREIGN KEY (`sessao_id`) REFERENCES `sessoes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mensagens_sessao_idx` ON `mensagens_chat` (`sessao_id`,`criado_em`);