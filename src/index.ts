import { createBot } from "./bot.js";

const bot = createBot();

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

bot.start({
  allowed_updates: ["message", "callback_query", "my_chat_member"],
  onStart: (info) => console.log(`Bot @${info.username} is running.`),
});
