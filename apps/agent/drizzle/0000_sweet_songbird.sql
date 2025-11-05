CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`role` text NOT NULL,
	`timestamp` integer NOT NULL
);
