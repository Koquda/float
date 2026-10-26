CREATE TABLE `float_ledgers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`state_json` text NOT NULL
);
